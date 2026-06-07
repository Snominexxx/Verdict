import { randomBytes } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';
import type { AssignmentSummary } from '$lib/types';

const TOKEN_BYTES = 6;
const makeToken = (): string => randomBytes(TOKEN_BYTES).toString('hex');

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const cleanText = (value: unknown, fallback = ''): string => {
	const text = String(value ?? '').trim();
	return text || fallback;
};

/**
 * POST — a teacher freezes a built CaseDossier into an immutable assignment.
 * Every student who opens the returned link argues the byte-identical case, so
 * exercises are uniform across groups.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'assignment_create', 20, 60_000);
	if (!rl.allowed) throw error(429, 'Too many assignments created. Please wait a moment.');

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') throw error(400, 'Invalid assignment payload.');

	const body = payload as Record<string, unknown>;
	const dossier = asRecord(body.dossier);
	const title = cleanText(dossier.title);
	const grounded = dossier.grounded === true;
	const packet = asRecord(dossier.sourcePacket);
	const passages = Array.isArray(packet.passages) ? packet.passages : [];

	if (!title) throw error(400, 'A built case is required before it can be assigned.');
	if (!grounded || !passages.length) {
		throw error(400, 'This case must be grounded in verified sources before it can be assigned.');
	}

	const instructions = cleanText(body.instructions);
	const language = dossier.language === 'fr' ? 'fr' : 'en';
	const admin = assertSupabaseAdmin();

	let token = makeToken();
	let insertError: unknown = null;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const { error: dbError } = await admin.from('assignments').insert({
			teacher_id: session.user.id,
			token,
			title,
			instructions,
			dossier_snapshot: dossier,
			language,
			status: 'active'
		});
		if (!dbError) {
			return json({ token, url: `${url.origin}/assignment/${token}` }, { status: 201 });
		}
		insertError = dbError;
		if (!/duplicate|unique/i.test(dbError.message)) break;
		token = makeToken();
	}

	console.error('[assignments] insert failed', insertError);
	throw error(500, 'Failed to create the assignment. Make sure the assignments migration has been applied.');
};

/** GET — the teacher's roster of assignments with submission counts. */
export const GET: RequestHandler = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const admin = assertSupabaseAdmin();
	const { data, error: dbError } = await admin
		.from('assignments')
		.select('token, title, instructions, language, status, created_at, exercise_submissions(count)')
		.eq('teacher_id', session.user.id)
		.order('created_at', { ascending: false });

	if (dbError) {
		console.error('[assignments] list failed', dbError);
		throw error(500, 'Unable to load your assignments.');
	}

	const assignments: AssignmentSummary[] = (data ?? []).map((row) => {
		const counts = (row as { exercise_submissions?: { count: number }[] }).exercise_submissions;
		const submissionCount = Array.isArray(counts) && counts.length ? Number(counts[0].count) || 0 : 0;
		return {
			token: row.token as string,
			title: (row.title as string) ?? '',
			instructions: (row.instructions as string) ?? '',
			language: row.language === 'fr' ? 'fr' : 'en',
			status: (row.status as string) ?? 'active',
			submissionCount,
			createdAt: row.created_at as string
		};
	});

	return json({ assignments });
};
