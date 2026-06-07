import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import type { ExerciseSubmission } from '$lib/types';

/** GET — the recorded student submissions for one of the teacher's assignments. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const token = params.token?.trim();
	if (!token) throw error(404, 'Assignment not found.');

	const admin = assertSupabaseAdmin();

	// Ownership check: the assignment must belong to the requesting teacher.
	const { data: assignment, error: lookupError } = await admin
		.from('assignments')
		.select('id, teacher_id, title')
		.eq('token', token)
		.maybeSingle();

	if (lookupError) {
		console.error('[submissions] lookup failed', lookupError);
		throw error(500, 'Unable to load submissions.');
	}
	if (!assignment || assignment.teacher_id !== session.user.id) {
		throw error(404, 'Assignment not found.');
	}

	const { data, error: dbError } = await admin
		.from('exercise_submissions')
		.select('id, token, student_name, student_email, role, transcript, final_mind, turn_count, started_at, submitted_at')
		.eq('assignment_id', assignment.id)
		.order('submitted_at', { ascending: false });

	if (dbError) {
		console.error('[submissions] fetch failed', dbError);
		throw error(500, 'Unable to load submissions.');
	}

	const submissions: ExerciseSubmission[] = (data ?? []).map((row) => ({
		id: row.id as string,
		token: row.token as string,
		studentName: (row.student_name as string) ?? '',
		studentEmail: (row.student_email as string) ?? '',
		role: row.role === 'defendant' ? 'defendant' : 'plaintiff',
		transcript: Array.isArray(row.transcript) ? row.transcript : [],
		finalMind: row.final_mind ?? null,
		turnCount: Number(row.turn_count) || 0,
		startedAt: (row.started_at as string) ?? null,
		submittedAt: row.submitted_at as string
	}));

	return json({ title: assignment.title, submissions });
};
