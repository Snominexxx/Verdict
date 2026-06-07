/**
 * Verdict v2 — Semantic (vector) retrieval (Workstream 2).
 *
 * Embeds the query and asks the `match_chunks` pgvector RPC for the user's most
 * semantically similar passages, scoped to the resolved sources. Returns
 * `SourcePassage[]` to slot straight into the hybrid retriever.
 *
 * Source-bound + fail-open: this only RANKS the user's own stored chunks; it
 * never produces text the user did not upload. Any failure (disabled flag,
 * missing key, RPC error, no embeddings indexed yet) returns an empty array so
 * the caller falls back to the deterministic lexical retriever.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourcePassage } from '$lib/verdict/contracts';
import { embedQuery, semanticRetrievalEnabled } from './embeddings';

export type SemanticRetrieveArgs = {
	supabase: SupabaseClient;
	userId: string;
	query: string;
	/** Restrict results to these source ids (the resolved selection ∪ pack). */
	sourceIds: string[];
	/** Optional pack filter passed to the RPC. */
	packId?: string;
	/** Map of sourceId → human title, to label passages. */
	titleBySource?: Map<string, string>;
	/** Max passages to return. */
	limit?: number;
	/** Drop matches below this cosine similarity (0–1). Default 0.2. */
	minSimilarity?: number;
};

type MatchChunkRow = {
	source_id: string;
	heading: string | null;
	content: string;
	metadata: Record<string, unknown> | null;
	similarity: number;
};

/**
 * Run vector similarity search. Returns [] on any failure or when disabled.
 */
export const semanticPassages = async (args: SemanticRetrieveArgs): Promise<SourcePassage[]> => {
	if (!semanticRetrievalEnabled()) return [];
	if (!args.sourceIds.length) return [];

	const queryEmbedding = await embedQuery(args.query);
	if (!queryEmbedding) return [];

	const limit = Math.min(Math.max(args.limit ?? 12, 1), 40);
	const minSimilarity = args.minSimilarity ?? 0.2;

	try {
		const { data, error } = await args.supabase.rpc('match_chunks', {
			query_embedding: queryEmbedding,
			match_user_id: args.userId,
			// Over-fetch, then filter to the resolved sources client-side.
			match_count: limit * 3,
			match_pack_id: args.packId ?? null
		});
		if (error) {
			console.warn('Semantic match_chunks failed (non-fatal):', error.message);
			return [];
		}

		const allowed = new Set(args.sourceIds);
		const rows = (data ?? []) as MatchChunkRow[];
		const passages: SourcePassage[] = [];
		for (const row of rows) {
			if (!allowed.has(row.source_id)) continue;
			if (typeof row.similarity === 'number' && row.similarity < minSimilarity) continue;
			const metaCitation =
				typeof row.metadata?.citation === 'string' ? (row.metadata.citation as string) : undefined;
			passages.push({
				sourceId: row.source_id,
				sourceTitle:
					args.titleBySource?.get(row.source_id) ??
					(typeof row.metadata?.title === 'string' ? (row.metadata.title as string) : row.source_id),
				citation: metaCitation,
				heading: row.heading ?? undefined,
				text: row.content
			});
			if (passages.length >= limit) break;
		}
		return passages;
	} catch (err) {
		console.warn('Semantic retrieval errored (non-fatal):', err instanceof Error ? err.message : err);
		return [];
	}
};
