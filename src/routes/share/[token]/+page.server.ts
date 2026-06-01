import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import type { SharedCase } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
	const token = params.token?.trim();
	if (!token) throw error(404, 'Shared case not found.');

	const admin = assertSupabaseAdmin();
	const { data, error: dbError } = await admin
		.from('shared_cases')
		.select('token, title, paper_snapshot, pack_context, created_at, expires_at, status')
		.eq('token', token)
		.eq('status', 'active')
		.maybeSingle();

	if (dbError) {
		console.error('[shared_cases] fetch failed', dbError);
		throw error(500, 'Unable to load this shared case.');
	}
	if (!data) throw error(404, 'Shared case not found.');
	if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
		throw error(410, 'This shared case link has expired.');
	}

	return {
		sharedCase: {
			token: data.token,
			title: data.title,
			paperSnapshot: data.paper_snapshot,
			packContext: data.pack_context ?? undefined,
			createdAt: data.created_at,
			expiresAt: data.expires_at
		} satisfies SharedCase
	};
};