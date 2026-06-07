import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { backfillEmbeddings } from '$lib/server/rag';
import { semanticRetrievalEnabled } from '$lib/server/verdict/embeddings';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';

/**
 * POST — Backfill embeddings for the signed-in user's stored chunks.
 *
 * Embeds rows that have no embedding yet (documents ingested before semantic
 * retrieval was enabled). Idempotent and best-effort; call repeatedly until
 * `remaining` reaches 0 for large libraries.
 *
 * Body (optional): { sourceId?, maxChunks? }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	if (!semanticRetrievalEnabled()) {
		throw error(409, 'Semantic retrieval is disabled (set ENABLE_SEMANTIC_RETRIEVAL).');
	}

	const payload = await request.json().catch(() => ({}));
	const sourceId = payload?.sourceId ? String(payload.sourceId) : undefined;
	const maxChunks =
		typeof payload?.maxChunks === 'number' && payload.maxChunks > 0 ? payload.maxChunks : undefined;

	try {
		const result = await backfillEmbeddings({
			supabase: assertSupabaseAdmin(),
			userId: session.user.id,
			sourceId,
			maxChunks
		});
		return json(result);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(500, `Backfill failed: ${msg}`);
	}
};
