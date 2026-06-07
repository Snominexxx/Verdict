import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import type { Assignment } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
	const token = params.token?.trim();
	if (!token) throw error(404, 'Assignment not found.');

	const admin = assertSupabaseAdmin();
	const { data, error: dbError } = await admin
		.from('assignments')
		.select('token, title, instructions, dossier_snapshot, language, created_at, expires_at, status')
		.eq('token', token)
		.eq('status', 'active')
		.maybeSingle();

	if (dbError) {
		console.error('[assignment] fetch failed', dbError);
		throw error(500, 'Unable to load this assignment.');
	}
	if (!data) throw error(404, 'Assignment not found.');
	if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
		throw error(410, 'This assignment has closed.');
	}

	return {
		assignment: {
			token: data.token,
			title: data.title,
			instructions: data.instructions ?? '',
			language: data.language === 'fr' ? 'fr' : 'en',
			dossier: data.dossier_snapshot,
			createdAt: data.created_at,
			expiresAt: data.expires_at
		} satisfies Assignment
	};
};
