import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';

/**
 * GET — Return source IDs that have un-embedded chunks (indexing incomplete).
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const admin = assertSupabaseAdmin();
	const { data, error: dbErr } = await admin
		.from('document_chunks')
		.select('source_id')
		.eq('user_id', session.user.id)
		.is('embedding', null)
		.limit(200);

	if (dbErr) throw error(500, 'Failed to check pending chunks.');

	// Deduplicate source IDs
	const sourceIds = [...new Set((data ?? []).map((r) => r.source_id))];
	return json({ sourceIds });
};
