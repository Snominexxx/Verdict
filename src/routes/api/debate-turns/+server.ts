import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET — load debate turns for a case
export const GET: RequestHandler = async ({ url, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const caseId = url.searchParams.get('caseId');
	if (!caseId) throw error(400, 'caseId is required.');

	const { data, error: dbError } = await locals.supabase
		.from('debate_turns')
		.select('role, speaker, message, citations, created_at')
		.eq('case_id', caseId)
		.eq('user_id', session.user.id)
		.order('created_at', { ascending: true });

	if (dbError) {
		console.error('[debate-turns] load failed', dbError);
		throw error(500, 'Failed to load debate turns.');
	}

	const turns = (data ?? []).map((row) => ({
		role: row.role,
		speaker: row.speaker,
		message: row.message,
		timestamp: row.created_at,
		citations: row.citations ?? []
	}));

	return json({ turns });
};

// POST — save new debate turns for a case
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const body = await request.json();
	const caseId = body.caseId;
	const turns = body.turns;

	if (!caseId || typeof caseId !== 'string') throw error(400, 'caseId is required.');
	if (!Array.isArray(turns) || turns.length === 0) throw error(400, 'turns array is required.');

	const rows = turns.map((t: { role: string; speaker: string; message: string; citations?: string[] }) => ({
		case_id: caseId,
		user_id: session.user.id,
		role: String(t.role),
		speaker: String(t.speaker),
		message: String(t.message),
		citations: t.citations ?? []
	}));

	const { error: dbError } = await locals.supabase.from('debate_turns').insert(rows);

	if (dbError) {
		console.error('[debate-turns] save failed', dbError);
		throw error(500, 'Failed to save debate turns.');
	}

	return json({ ok: true });
};

// DELETE — clear all turns for a case (used on restart)
export const DELETE: RequestHandler = async ({ url, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const caseId = url.searchParams.get('caseId');
	if (!caseId) throw error(400, 'caseId is required.');

	const { error: dbError } = await locals.supabase
		.from('debate_turns')
		.delete()
		.eq('case_id', caseId)
		.eq('user_id', session.user.id);

	if (dbError) {
		console.error('[debate-turns] delete failed', dbError);
		throw error(500, 'Failed to clear debate turns.');
	}

	return json({ ok: true });
};
