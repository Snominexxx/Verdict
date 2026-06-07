import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const cleanText = (value: unknown, max = 200): string => String(value ?? '').trim().slice(0, max);

const normalizeTranscript = (
	value: unknown
): { role: 'litigant' | 'judge'; speaker: string; message: string }[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => {
			const raw = asRecord(entry);
			const role = raw.role === 'judge' ? 'judge' : 'litigant';
			return {
				role: role as 'litigant' | 'judge',
				speaker: cleanText(raw.speaker, 120),
				message: String(raw.message ?? '').trim().slice(0, 20_000)
			};
		})
		.filter((entry) => entry.message.length > 0)
		.slice(0, 400);
};

/**
 * POST — a student submits their recorded hearing for an assignment.
 * Public (students have no account): we identify the assignment by token,
 * write through the service-role key, and rely on the immutable assignment for
 * provenance. The teacher reads submissions through ownership-checked code.
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const token = params.token?.trim();
	if (!token) throw error(404, 'Assignment not found.');

	const rl = rateLimit(getClientAddress(), 'assignment_submit', 10, 60_000);
	if (!rl.allowed) throw error(429, 'Too many submissions. Please wait a moment.');

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') throw error(400, 'Invalid submission payload.');
	const body = payload as Record<string, unknown>;

	const studentName = cleanText(body.studentName, 120);
	const studentEmail = cleanText(body.studentEmail, 160);
	if (!studentName) throw error(400, 'A student name is required.');

	const transcript = normalizeTranscript(body.transcript);
	if (!transcript.length) throw error(400, 'There is nothing to submit yet.');

	const role = body.role === 'defendant' ? 'defendant' : 'plaintiff';
	const turnCount = transcript.filter((entry) => entry.role === 'litigant').length;

	const admin = assertSupabaseAdmin();

	const { data: assignment, error: lookupError } = await admin
		.from('assignments')
		.select('id, status, expires_at')
		.eq('token', token)
		.maybeSingle();

	if (lookupError) {
		console.error('[assignment_submit] lookup failed', lookupError);
		throw error(500, 'Unable to record this submission.');
	}
	if (!assignment || assignment.status !== 'active') throw error(404, 'Assignment not found.');
	if (assignment.expires_at && Date.parse(assignment.expires_at) <= Date.now()) {
		throw error(410, 'This assignment has closed.');
	}

	const { error: insertError } = await admin.from('exercise_submissions').insert({
		assignment_id: assignment.id,
		token,
		student_name: studentName,
		student_email: studentEmail,
		role,
		transcript,
		final_mind: asRecord(body.finalMind),
		turn_count: turnCount,
		started_at: cleanText(body.startedAt, 40) || null
	});

	if (insertError) {
		console.error('[assignment_submit] insert failed', insertError);
		throw error(500, 'Failed to record this submission.');
	}

	return json({ ok: true }, { status: 201 });
};
