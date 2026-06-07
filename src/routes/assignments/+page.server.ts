import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import type { AssignmentSummary } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw redirect(303, '/login');

	const admin = assertSupabaseAdmin();
	const { data, error: dbError } = await admin
		.from('assignments')
		.select('token, title, instructions, language, status, created_at, exercise_submissions(count)')
		.eq('teacher_id', session.user.id)
		.order('created_at', { ascending: false });

	if (dbError) {
		console.error('[assignments] roster load failed', dbError);
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

	return { assignments };
};
