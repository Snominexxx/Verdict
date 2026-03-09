import type { PageServerLoad } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { mapRowToStagedCase } from '$lib/server/caseMapper';

const CASE_COOKIE = 'verdict_case_id';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const caseId = cookies.get(CASE_COOKIE);

	if (!caseId) {
		return { stagedCase: null };
	}

	const { session } = await locals.safeGetSession();
	if (!session) {
		return { stagedCase: null };
	}

	try {
		const admin = assertSupabaseAdmin();
		const { data, error } = await admin
			.from('staged_cases')
			.select('*')
			.eq('id', caseId)
			.eq('user_id', session.user.id)
			.single();

		if (error || !data) {
			console.error('[staged_cases] fetch failed', error);
			return { stagedCase: null };
		}

		return { stagedCase: mapRowToStagedCase(data) };
	} catch (err) {
		console.error('Unable to hydrate staged case', err);
		return { stagedCase: null };
	}
};
