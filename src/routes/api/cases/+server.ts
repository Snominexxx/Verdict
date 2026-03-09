import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { dev } from '$app/environment';
import { mapRowToStagedCase } from '$lib/server/caseMapper';

const CASE_COOKIE = 'verdict_case_id';

const normalizePayload = (payload: Record<string, unknown>) => {
	const title = String(payload.title ?? '').trim();
	const synopsis = String(payload.synopsis ?? '').trim();
	const issues = String(payload.issues ?? '').trim();
	const remedy = String(payload.remedy ?? '').trim();
	const role = payload.role === 'plaintiff' || payload.role === 'defendant' ? payload.role : null;
	const sources = Array.isArray(payload.sources) ? payload.sources.map(String) : [];
	const courtType = payload.courtType === 'bench' ? 'bench' : 'jury';

	if (!title) {
		throw error(400, 'Case title is required.');
	}

	if (!synopsis) {
		throw error(400, 'Synopsis is required.');
	}

	if (!role) {
		throw error(400, 'A valid side (plaintiff or defendant) is required.');
	}

	return { title, synopsis, issues, remedy, role, sources, courtType };
};

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const body = await request.json();
	const payload = normalizePayload(body);

	const admin = assertSupabaseAdmin();

	const { data, error: dbError } = await admin
		.from('staged_cases')
		.insert({
			user_id: session.user.id,
			title: payload.title,
			synopsis: payload.synopsis,
			issues: payload.issues,
			remedy: payload.remedy,
			role: payload.role,
			sources: payload.sources,
			court_type: payload.courtType
		})
		.select('*')
		.single();

	if (dbError || !data) {
		console.error('[staged_cases] insert failed', dbError);
		throw error(500, 'Failed to persist staged case.');
	}

	const stagedCase = mapRowToStagedCase(data);

	cookies.set(CASE_COOKIE, stagedCase.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 60 * 60 * 6 // 6 hours
	});

	return json(stagedCase, { status: 201 });
};
