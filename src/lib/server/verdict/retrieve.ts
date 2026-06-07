/**
 * Verdict v2 — Source retrieval.
 *
 * Loads the user's selected/pack sources and distils them into a
 * `SourcePacket`: the verified slice of authority the rest of the engine is
 * allowed to reason over. Reuses the existing full-context loader and the
 * relevance ranker — we do NOT reinvent retrieval.
 *
 * Three source-bound mechanisms work together:
 *   1. The AI planner (Gemini Flash) guides WHAT to search for — exact article
 *      numbers when specific, concepts when vague. It never states law.
 *   2. The deterministic ranker pulls the matching passages.
 *   3. A 1-hop cross-reference pass follows references INSIDE those passages
 *      ("nonobstant l'article 1474") and pulls the exact text of the referenced
 *      articles — catching the article "200 pages later" that limits or
 *      enforces the one the user asked about.
 *
 * Any MANDATORY target the user named (e.g. "article 1457") is checked against
 * the retrieved passages. If it is not actually present it goes into
 * `missingTargets` and is reported honestly — the engine never pretends to have
 * an authority it could not find.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LibraryDocument } from '$lib/data/library';
import type {
	IntentPlan,
	RetrievalPlan,
	SourcePacket,
	SourcePassage,
	VerdictLanguage
} from '$lib/verdict/contracts';
import { loadFullSources, loadPackSourceIds } from '../sources';
import { buildRelevantSourceBundle } from '../sourcePackets';
import { parseSources, renderSourceMap, extractLegalRefs, resolveCrossReferences } from './sourceMap';
import { planRetrieval } from './planner';
import { semanticPassages } from './semanticRetrieve';
import { semanticRetrievalEnabled } from './embeddings';

export type RetrieveArgs = {
	supabase: SupabaseClient;
	userId: string;
	intent: IntentPlan;
	/** Explicitly selected source ids (optional when a pack is given). */
	sourceIds?: string[];
	packId?: string;
	maxExcerpts?: number;
	/** AI retrieval plan guiding what to search for (optional hints, never law). */
	plan?: RetrievalPlan;
	/** Pre-loaded sources, to avoid a second DB round-trip when the orchestrator already loaded them. */
	preloadedSources?: LibraryDocument[];
	/** Pre-resolved source ids (explicit ∪ pack), paired with preloadedSources. */
	resolvedSourceIds?: string[];
	/** Follow 1-hop cross-references inside retrieved passages. Default true. */
	crossReference?: boolean;
};

const EMPTY_PLAN: RetrievalPlan = { citations: [], concepts: [], rationale: '' };

/**
 * Determine the language of the SOURCES themselves (not the user's request).
 * Every case — and the Judge — must speak the language of the uploaded
 * materials. Uses the ingestion audit when available, else a content heuristic.
 */
export const detectSourcesLanguage = (sources: LibraryDocument[]): VerdictLanguage => {
	let fr = 0;
	let en = 0;
	for (const src of sources) {
		const audited = src.ingestionAudit?.language;
		if (audited === 'fr') { fr += 2; continue; }
		if (audited === 'en') { en += 2; continue; }
		// Fall back to a content heuristic on a sample.
		const sample = (src.content ?? '').slice(0, 20_000).toLowerCase();
		if (!sample) continue;
		const accents = (sample.match(/[àâäéèêëïîôöùûüçœ]/g) ?? []).length;
		const frWords = (sample.match(/\b(?:le|la|les|des|une?|et|ou|dans|pour|sur|article|loi|droit|obligation|responsabilit[ée])\b/g) ?? []).length;
		const enWords = (sample.match(/\b(?:the|of|and|or|in|for|on|section|act|law|right|liability|shall)\b/g) ?? []).length;
		if (accents > 10 || frWords > enWords) fr += 1;
		else en += 1;
	}
	return fr > en ? 'fr' : 'en';
};

/** Does a passage actually contain the cited identifier (e.g. "1457")? */
const passageMentionsCitation = (passage: SourcePassage, value: string): boolean => {
	const needle = value.replace(/\s+/g, '').toLowerCase();
	if (!needle) return false;
	const numeric = needle.replace(/[a-z]+$/, '');
	const haystack = `${passage.citation ?? ''} ${passage.heading ?? ''} ${passage.text}`.toLowerCase();
	// Word-boundary match on the article/section number, tolerant of "1457"/"1457.1".
	const escaped = numeric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`(?:^|[^\\d])${escaped}(?![\\d])`);
	return re.test(haystack);
};

/** Normalize an article/section value to its bare numeric token. */
const numericOf = (value: string): string => {
	const m = value.match(/\d+(?:\.\d+)*/);
	return m ? m[0] : value.replace(/\s+/g, '').toLowerCase();
};

const buildQuery = (intent: IntentPlan, plan: RetrievalPlan): string => {
	const parts: string[] = [];
	for (const t of intent.targets) {
		if (t.kind === 'citation') parts.push(`article ${t.value}`);
		else parts.push(t.value);
	}
	for (const c of plan.citations) parts.push(`article ${c}`);
	for (const concept of plan.concepts) parts.push(concept);
	if (!parts.length) parts.push(intent.rawRequest);
	return Array.from(new Set(parts)).join(' ').slice(0, 600);
};

/** Resolve which source ids to load (explicit selection ∪ pack contents). */
export const resolveSourceIds = async (args: {
	supabase: SupabaseClient;
	userId: string;
	sourceIds?: string[];
	packId?: string;
}): Promise<string[]> => {
	let sourceIds = Array.from(new Set((args.sourceIds ?? []).filter(Boolean)));
	const packId = String(args.packId ?? '').trim() || undefined;
	if (packId) {
		const packSourceIds = await loadPackSourceIds({ supabase: args.supabase, userId: args.userId, packId });
		sourceIds = Array.from(new Set([...sourceIds, ...packSourceIds]));
	}
	return sourceIds;
};

const emptyPacket = (query: string, mandatory: string[]): SourcePacket => ({
	version: 'verdict-packet-v1',
	createdAt: new Date().toISOString(),
	query,
	passages: [],
	satisfiedTargets: [],
	missingTargets: mandatory,
	coverage: 'empty'
});

export const retrieveSourcePacket = async (args: RetrieveArgs): Promise<SourcePacket> => {
	const { supabase, userId, intent } = args;
	const plan = args.plan ?? EMPTY_PLAN;
	const packId = String(args.packId ?? '').trim() || undefined;
	const crossReference = args.crossReference !== false;

	const query = buildQuery(intent, plan);
	const mandatory = intent.targets.filter((t) => t.mandatory);
	const mandatoryValues = mandatory.map((t) => t.value);

	// Resolve ids + load sources (reuse caller's work when provided).
	const sourceIds = args.resolvedSourceIds
		? args.resolvedSourceIds
		: await resolveSourceIds({ supabase, userId, sourceIds: args.sourceIds, packId });
	if (!sourceIds.length) return emptyPacket(query, mandatoryValues);

	const sources = args.preloadedSources ?? (await loadFullSources({ supabase, userId, sourceIds, packId }));
	if (!sources.length) return emptyPacket(query, mandatoryValues);

	const bundle = buildRelevantSourceBundle({
		cacheKey: `${userId}:${packId ?? 'sel'}:${sourceIds.slice().sort().join(',')}`,
		sources,
		query,
		maxExcerpts: args.maxExcerpts ?? 10,
		hints: {
			citations: Array.from(new Set([...intent.citations, ...plan.citations])),
			terms: Array.from(new Set([...intent.concepts, ...plan.concepts]))
		},
		fallbackMode: 'first-chunks'
	});

	let passages: SourcePassage[] = bundle.excerpts.map((e) => ({
		sourceId: e.sourceId,
		sourceTitle: e.sourceTitle,
		citation: e.citation,
		heading: e.heading,
		text: e.excerpt
	}));

	// ── Hybrid: augment lexical hits with semantic (vector) matches ──────────
	// Source-bound + additive: the lexical bundle above is always the floor.
	// Semantic search only surfaces ADDITIONAL passages from the user's own
	// stored chunks that the lexical ranker may have missed (paraphrases,
	// concept matches). Fails open to lexical-only when disabled/unavailable.
	if (semanticRetrievalEnabled()) {
		const titleBySource = new Map<string, string>();
		for (const s of sources) titleBySource.set(s.id, s.title);
		const semantic = await semanticPassages({
			supabase,
			userId,
			query,
			sourceIds,
			packId,
			titleBySource,
			limit: Math.max(args.maxExcerpts ?? 10, 8)
		});
		if (semantic.length) {
			const seen = new Set(passages.map(passageKey));
			for (const p of semantic) {
				const key = passageKey(p);
				if (seen.has(key)) continue;
				seen.add(key);
				passages.push(p);
			}
		}
	}

	// ── 1-hop cross-reference expansion ──────────────────────
	// Scan the retrieved passages for references to OTHER articles and pull
	// their exact text, so the engine sees law that modifies / enforces the
	// retrieved articles even when it lives far away in the source.
	if (crossReference && passages.length) {
		const parsed = parseSources(sources);
		const referenced = Array.from(
			new Set(passages.flatMap((p) => extractLegalRefs(`${p.citation ?? ''} ${p.text}`)))
		);
		// Exclude numbers already covered by a retrieved passage or already targeted.
		const exclude = new Set<string>();
		for (const value of [...intent.citations, ...plan.citations]) exclude.add(numericOf(value));
		for (const num of referenced) {
			if (passages.some((p) => passageMentionsCitation(p, num))) exclude.add(num);
		}
		const crossPassages = resolveCrossReferences(parsed, referenced, exclude);
		if (crossPassages.length) passages = [...passages, ...crossPassages];
	}

	// Honestly classify each mandatory target as satisfied or missing.
	const satisfiedTargets: string[] = [];
	const missingTargets: string[] = [];
	for (const t of mandatory) {
		if (t.kind === 'citation') {
			const found = passages.some((p) => passageMentionsCitation(p, t.value));
			(found ? satisfiedTargets : missingTargets).push(t.value);
		} else {
			satisfiedTargets.push(t.value);
		}
	}

	let coverage: SourcePacket['coverage'] = 'empty';
	if (passages.length) {
		if (mandatory.length) coverage = missingTargets.length === 0 ? 'high' : satisfiedTargets.length ? 'medium' : 'low';
		else coverage = bundle.coverage;
	}

	return {
		version: 'verdict-packet-v1',
		createdAt: new Date().toISOString(),
		query,
		passages,
		satisfiedTargets,
		missingTargets,
		coverage
	};
};

// ─────────────────────────────────────────────────────────
// Orchestrator: plan (AI) → retrieve (deterministic) → cross-ref
// ─────────────────────────────────────────────────────────

export type AssembleArgs = {
	supabase: SupabaseClient;
	userId: string;
	intent: IntentPlan;
	/** The user's request text used to seed the planner. */
	request: string;
	/** Optional recent conversation for planner context (chat mode). */
	conversation?: string;
	sourceIds?: string[];
	packId?: string;
	maxExcerpts?: number;
	language?: VerdictLanguage;
};

/**
 * Full source-bound retrieval: ask the AI planner what to look for, then run
 * the deterministic retriever (with 1-hop cross-references). Returns the packet
 * plus the plan for transparency/logging.
 */
export const assembleSourcePacket = async (
	args: AssembleArgs
): Promise<{ packet: SourcePacket; plan: RetrievalPlan; sourcesLanguage: VerdictLanguage }> => {
	const packId = String(args.packId ?? '').trim() || undefined;
	const language = args.language ?? args.intent.language;

	const sourceIds = await resolveSourceIds({
		supabase: args.supabase,
		userId: args.userId,
		sourceIds: args.sourceIds,
		packId
	});
	if (!sourceIds.length) {
		const mandatory = args.intent.targets.filter((t) => t.mandatory).map((t) => t.value);
		return { packet: emptyPacket(args.request, mandatory), plan: EMPTY_PLAN, sourcesLanguage: language };
	}

	const sources = await loadFullSources({ supabase: args.supabase, userId: args.userId, sourceIds, packId });
	const sourcesLanguage = sources.length ? detectSourcesLanguage(sources) : language;

	let plan: RetrievalPlan = EMPTY_PLAN;
	if (sources.length) {
		const sourceMapText = renderSourceMap(parseSources(sources));
		plan = await planRetrieval({
			request: args.request,
			conversation: args.conversation,
			sourceMapText,
			language: sourcesLanguage
		});
	}

	const packet = await retrieveSourcePacket({
		supabase: args.supabase,
		userId: args.userId,
		intent: args.intent,
		resolvedSourceIds: sourceIds,
		preloadedSources: sources,
		packId,
		maxExcerpts: args.maxExcerpts,
		plan
	});

	return { packet, plan, sourcesLanguage };
};

// ─────────────────────────────────────────────────────────
// Packet merge — combine a dossier's base packet with a fresh one
// ─────────────────────────────────────────────────────────

const passageKey = (p: SourcePassage): string =>
	`${p.sourceId}|${(p.citation ?? '').toLowerCase()}|${p.text.slice(0, 80).toLowerCase()}`;

const coverageRank: Record<SourcePacket['coverage'], number> = { empty: 0, low: 1, medium: 2, high: 3 };

/** Union two packets, de-duplicating passages. Used to give the Judge the dossier's base authority plus law freshly relevant to the current submission. */
export const mergePackets = (base: SourcePacket, live: SourcePacket): SourcePacket => {
	const seen = new Set<string>();
	const passages: SourcePassage[] = [];
	for (const p of [...base.passages, ...live.passages]) {
		const key = passageKey(p);
		if (seen.has(key)) continue;
		seen.add(key);
		passages.push(p);
	}
	const bestCoverage =
		coverageRank[live.coverage] >= coverageRank[base.coverage] ? live.coverage : base.coverage;
	return {
		version: 'verdict-packet-v1',
		createdAt: new Date().toISOString(),
		query: live.query || base.query,
		passages,
		satisfiedTargets: Array.from(new Set([...base.satisfiedTargets, ...live.satisfiedTargets])),
		missingTargets: Array.from(new Set([...base.missingTargets, ...live.missingTargets])),
		coverage: passages.length ? bestCoverage : 'empty'
	};
};
