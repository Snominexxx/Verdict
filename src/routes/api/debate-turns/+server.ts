import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/server/rateLimit';

const MAX_TURNS_PER_SAVE = 50;
const MAX_MESSAGE_LENGTH = 50_000;

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

	// Rate limit: 10 saves per 60 seconds
	const rl = rateLimit(session.user.id, 'save_turns', 10, 60_000);
	if (!rl.allowed) throw error(429, 'Too many requests.');

	const body = await request.json();
	const caseId = body.caseId;
	const turns = body.turns;

	if (!caseId || typeof caseId !== 'string') throw error(400, 'caseId is required.');
	if (!Array.isArray(turns) || turns.length === 0) throw error(400, 'turns array is required.');
	if (turns.length > MAX_TURNS_PER_SAVE) throw error(400, `Too many turns (max ${MAX_TURNS_PER_SAVE}).`);

	const rows = turns.map((t: { role: string; speaker: string; message: string; citations?: string[] }) => ({
		case_id: caseId,
		user_id: session.user.id,
		role: String(t.role).slice(0, 50),
		speaker: String(t.speaker).slice(0, 200),
		message: String(t.message).slice(0, MAX_MESSAGE_LENGTH),
		citations: Array.isArray(t.citations) ? t.citations.slice(0, 20) : []
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
