import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { embedChunkBatch } from '$lib/server/rag';

/**
 * POST — Embed a batch of un-embedded chunks for a source document.
 * Body: { sourceId: string }
 * Returns: { embedded: number, remaining: number }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const payload = await request.json().catch(() => null);
	if (!payload?.sourceId) {
		throw error(400, 'sourceId is required.');
	}

	try {
		const result = await embedChunkBatch({
			supabase: locals.supabase,
			userId: session.user.id,
			sourceId: String(payload.sourceId),
			limit: 50
		});

		return json(result);
	} catch (err) {
		console.error('Embed batch failed:', err);
		const msg = err instanceof Error ? err.message : 'Embedding failed';
		throw error(500, msg);
	}
};
