/**
 * Verdict — Full-context source loader.
 *
 * Loads complete legal source texts (statutes, jurisprudence, uploads) and
 * concatenates them for direct injection into the LLM prompt. No semantic
 * search, no chunk selection — the model receives the full, unfiltered
 * authority and reasons over it directly.
 *
 * Token budgets track the provider actually used per task:
 *   - Claude Sonnet 4.5 → 200k tokens   (chat / coaching and any legacy debate paths)
 *   - Gemini 2.5 Pro    → 1M tokens     (judge hearings, case generation, large packs)
 *
 * If the selected sources exceed the budget for the task, we throw a
 * structured `SourcesOverBudgetError` so callers can surface a clear
 * "reduce your selection" message to the user — never silently truncate.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LibraryDocument } from '$lib/data/library';
import { libraryDocuments } from '$lib/data/library';

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

/** Per-source raw cap. Anything larger is almost certainly a parse anomaly. */
const MAX_SOURCE_CHARS = 4_000_000;

/** Token budgets per task (input only — leaves headroom for system prompt + output). */
export const TOKEN_BUDGETS = {
	/** Claude Sonnet 4.5 has a 200k context window. Reserve ~50k for prompts/output. */
	debate: 150_000,
	/** Judge hearings now run on Gemini 2.5 Pro. Reserve ~200k for prompt/output. */
	bench: 800_000,
	/** Coaching uses transcript only, sources are minimal. */
	coaching: 100_000,
	/** Gemini 2.5 Pro has 1M context. Reserve ~200k for prompt/output. */
	'generate-case': 800_000
} as const;

export type SourceTask = keyof typeof TOKEN_BUDGETS;

// ─────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────

export class SourcesOverBudgetError extends Error {
	readonly code = 'SOURCES_OVER_BUDGET';
	readonly task: SourceTask;
	readonly tokenCount: number;
	readonly tokenBudget: number;
	readonly sourceCount: number;

	constructor(args: { task: SourceTask; tokenCount: number; tokenBudget: number; sourceCount: number }) {
		super(
			`Selected sources (${args.sourceCount} docs, ~${args.tokenCount.toLocaleString()} tokens) ` +
				`exceed the ${args.task} budget (~${args.tokenBudget.toLocaleString()} tokens). ` +
				`Reduce the source selection.`
		);
		this.name = 'SourcesOverBudgetError';
		this.task = args.task;
		this.tokenCount = args.tokenCount;
		this.tokenBudget = args.tokenBudget;
		this.sourceCount = args.sourceCount;
	}
}

// ─────────────────────────────────────────────────────────
// Token estimation
// ─────────────────────────────────────────────────────────

/**
 * Conservative token estimate (~4 chars per token for English/French legal text).
 * We err on the high side so we never silently overflow the model context.
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const sumTokens = (sources: { content?: string }[]): number =>
	sources.reduce((total, src) => total + estimateTokens(src.content ?? ''), 0);

// ─────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────

type LoadOptions = {
	supabase: SupabaseClient;
	userId: string;
	sourceIds: string[];
	/** Optional pack scope used to filter user-uploaded chunks when rebuilding text. */
	packId?: string;
};

type LoadPackSourceIdsOptions = {
	supabase: SupabaseClient;
	userId: string;
	packId?: string;
};

export const loadPackSourceIds = async (opts: LoadPackSourceIdsOptions): Promise<string[]> => {
	const packId = String(opts.packId ?? '').trim();
	if (!packId) return [];

	const resolved: string[] = [];
	const seen = new Set<string>();
	const pushId = (value: unknown) => {
		const sourceId = String(value ?? '').trim();
		if (!sourceId || seen.has(sourceId)) return;
		seen.add(sourceId);
		resolved.push(sourceId);
	};

	const { data: packRows, error: packError } = await opts.supabase
		.from('pack_sources')
		.select('id')
		.eq('user_id', opts.userId)
		.eq('pack_id', packId);

	if (packError) {
		console.error('Failed to load pack sources:', packError);
		throw new Error(`Failed to load pack sources: ${packError.message}`);
	}

	for (const row of packRows ?? []) {
		pushId((row as { id?: unknown }).id);
	}

	if (resolved.length) return resolved;

	const { data: chunkRows, error: chunkError } = await opts.supabase
		.from('document_chunks')
		.select('source_id')
		.eq('user_id', opts.userId)
		.eq('pack_id', packId);

	if (chunkError) {
		console.error('Failed to load pack chunks:', chunkError);
		throw new Error(`Failed to load pack chunks: ${chunkError.message}`);
	}

	for (const row of chunkRows ?? []) {
		pushId((row as { source_id?: unknown }).source_id);
	}

	return resolved;
};

/**
 * Resolve a list of source IDs to their full text payloads.
 *
 * Priority order:
 *   1. Static curated `libraryDocuments` (shipped with the app).
 *   2. User-uploaded documents reconstructed from `document_chunks`.
 *
 * Returns one `LibraryDocument` per resolved id, with `content` populated.
 * Unknown ids are silently dropped (caller validates as needed).
 */
export const loadFullSources = async (opts: LoadOptions): Promise<LibraryDocument[]> => {
	const { supabase, userId, sourceIds } = opts;
	const requested = Array.from(new Set(sourceIds.filter(Boolean)));
	if (!requested.length) return [];

	const resolved = new Map<string, LibraryDocument>();

	// 1. Static library (curated, shipped as code) — instant lookup, no DB call.
	for (const id of requested) {
		const staticDoc = libraryDocuments.find((d) => d.id === id);
		if (staticDoc) resolved.set(id, staticDoc);
	}

	// 2. User uploads — reconstruct full text from document_chunks ordered by chunk_index.
	const remaining = requested.filter((id) => !resolved.has(id));
	if (remaining.length) {
		const pageSize = 1000;
		let from = 0;
		const rows: Array<{
			source_id: string;
			chunk_index: number | null;
			heading: string | null;
			content: string | null;
			metadata: Record<string, unknown> | null;
		}> = [];

		while (true) {
			let query = supabase
				.from('document_chunks')
				.select('source_id, chunk_index, heading, content, metadata')
				.eq('user_id', userId)
				.in('source_id', remaining)
				.order('source_id', { ascending: true })
				.order('chunk_index', { ascending: true })
				.range(from, from + pageSize - 1);

			const packId = String(opts.packId ?? '').trim();
			if (packId) {
				query = query.eq('pack_id', packId);
			}

			const { data, error } = await query;
			if (error) {
				console.error('Failed to load source chunks:', error);
				throw new Error(`Failed to load uploaded sources: ${error.message}`);
			}

			const batch = (data ?? []) as typeof rows;
			if (!batch.length) break;

			rows.push(...batch);
			if (batch.length < pageSize) break;
			from += pageSize;
		}

		const grouped = new Map<string, typeof rows>();
		for (const row of rows) {
			const list = grouped.get(row.source_id) ?? [];
			list.push(row);
			grouped.set(row.source_id, list);
		}

		for (const [sourceId, rows] of grouped) {
			if (!rows.length) continue;
			const sorted = rows.slice().sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
			const reconstructed = sorted.map((r) => r.content ?? '').join('\n\n').trim();
			if (!reconstructed) continue;

			const meta = (sorted[0].metadata ?? {}) as Record<string, unknown>;
			const wasTruncated = reconstructed.length > MAX_SOURCE_CHARS;
			const content = wasTruncated ? reconstructed.slice(0, MAX_SOURCE_CHARS) : reconstructed;

			resolved.set(sourceId, {
				id: sourceId,
				title: String(meta.title ?? 'Uploaded document'),
				jurisdiction: String(meta.jurisdiction ?? 'Other'),
				description: content.slice(0, 320),
				lastUpdated: new Date().toISOString().slice(0, 10),
				sourceUrl: String(meta.sourceUrl ?? `uploaded://${sourceId}`),
				content,
				docType: (meta.docType as LibraryDocument['docType']) ?? 'secondary',
				trustLevel: (meta.trustLevel as LibraryDocument['trustLevel']) ?? 'unverified',
				isCustom: true,
				note: wasTruncated
					? `⚠ Source truncated to ${(MAX_SOURCE_CHARS / 1_000_000).toFixed(1)}M characters (original was longer). The AI does not see content past this point.`
					: undefined
			});
		}
	}

	// Preserve caller's order so prompts read deterministically.
	return requested.map((id) => resolved.get(id)).filter((d): d is LibraryDocument => Boolean(d));
};

// ─────────────────────────────────────────────────────────
// Budget assertion
// ─────────────────────────────────────────────────────────

/**
 * Throws `SourcesOverBudgetError` when the combined source content exceeds
 * the per-task token budget. Call this immediately after `loadFullSources`.
 */
export const assertWithinBudget = (sources: LibraryDocument[], task: SourceTask): void => {
	const budget = TOKEN_BUDGETS[task];
	const tokenCount = sumTokens(sources);
	if (tokenCount > budget) {
		throw new SourcesOverBudgetError({
			task,
			tokenCount,
			tokenBudget: budget,
			sourceCount: sources.length
		});
	}
};

/**
 * Convenience: load + budget-check in one call.
 */
export const loadSourcesForTask = async (
	opts: LoadOptions & { task: SourceTask }
): Promise<LibraryDocument[]> => {
	const sources = await loadFullSources(opts);
	assertWithinBudget(sources, opts.task);
	return sources;
};

// ─────────────────────────────────────────────────────────
// Context report — visibility into what the AI actually sees
// ─────────────────────────────────────────────────────────

export type SourceContextReport = {
	/** Total estimated tokens across all hydrated sources. */
	tokenCount: number;
	/** Configured budget for this task. */
	tokenBudget: number;
	/** tokenCount / tokenBudget, rounded to 2 decimals. */
	utilization: number;
	/** True when utilization ≥ 0.80 — front end should display a warning. */
	nearLimit: boolean;
	/** Sources whose stored content was capped at MAX_SOURCE_CHARS. */
	truncatedSources: Array<{ id: string; title: string }>;
};

/**
 * Build a transparent report describing what the AI actually receives. Surface
 * this in API responses so the UI can warn the user when:
 *   - a source was truncated and the model cannot see the tail;
 *   - the combined sources are close to the budget ceiling (>= 80%) and the
 *     next big source might push them over.
 */
export const buildSourceContextReport = (
	sources: LibraryDocument[],
	task: SourceTask
): SourceContextReport => {
	const tokenCount = sumTokens(sources);
	const tokenBudget = TOKEN_BUDGETS[task];
	const utilization = tokenBudget > 0 ? Math.round((tokenCount / tokenBudget) * 100) / 100 : 0;
	const truncatedSources = sources
		.filter((doc) => typeof doc.note === 'string' && doc.note.includes('truncated'))
		.map((doc) => ({ id: doc.id, title: doc.title }));
	return {
		tokenCount,
		tokenBudget,
		utilization,
		nearLimit: utilization >= 0.8,
		truncatedSources
	};
};
