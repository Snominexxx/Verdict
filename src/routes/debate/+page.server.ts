import type { PageServerLoad } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { mapRowToStagedCase } from '$lib/server/caseMapper';

const CASE_COOKIE = 'verdict_case_id';
const HYDRATE_TIMEOUT_MS = 4000;

const withTimeout = async <T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			Promise.resolve(promise),
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
			})
		]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
};

export const load: PageServerLoad = async ({ url, cookies, locals }) => {
	if (url.searchParams.get('local') === '1') {
		return { stagedCase: null };
	}

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
		const result = await withTimeout(
			admin
				.from('staged_cases')
				.select('*')
				.eq('id', caseId)
				.eq('user_id', session.user.id)
				.single(),
			HYDRATE_TIMEOUT_MS,
			'debate staged case hydration'
		);

		const { data, error } = result;

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
