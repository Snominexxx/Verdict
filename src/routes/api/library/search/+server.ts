import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { searchChunks, formatChunksForPrompt } from '$lib/server/rag';

/**
 * POST — Semantic search across user's indexed documents
 * Body: { query, packId?, maxChunks?, maxTokens? }
 * Returns: { chunks: MatchedChunk[], formatted: string }
 */

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const payload = await request.json().catch(() => null);
	const query = String(payload?.query ?? '').trim();
	if (!query) throw error(400, 'query is required.');

	try {
		const chunks = await searchChunks({
			supabase: locals.supabase,
			userId: session.user.id,
			query,
			packId: payload?.packId ? String(payload.packId) : undefined,
			maxChunks: payload?.maxChunks ? Number(payload.maxChunks) : undefined,
			maxTokens: payload?.maxTokens ? Number(payload.maxTokens) : undefined
		});

		return json({
			chunks,
			formatted: formatChunksForPrompt(chunks),
			totalChunks: chunks.length,
			totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0)
		});
	} catch (err) {
		console.error('Semantic search failed:', err);
		const msg = err instanceof Error ? err.message : 'Search failed';
		throw error(500, msg);
	}
};
