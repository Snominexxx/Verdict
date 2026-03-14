import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { embedChunkBatch } from '$lib/server/rag';
import { rateLimit } from '$lib/server/rateLimit';

/**
 * POST — Embed a batch of un-embedded chunks for a source document.
 * Body: { sourceId: string }
 * Returns: { embedded: number, remaining: number }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	// Rate limit: 30 batch calls per 60 seconds (supports large docs but blocks abuse)
	const rl = rateLimit(session.user.id, 'embed_batch', 30, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many embedding requests. Please wait a moment.');
	}

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
