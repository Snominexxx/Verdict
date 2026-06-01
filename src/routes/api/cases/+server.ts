import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { dev } from '$app/environment';
import { mapRowToStagedCase } from '$lib/server/caseMapper';
import { rateLimit } from '$lib/server/rateLimit';
import { validateCasePayload, CaseValidationError } from '$lib/server/caseInputValidator';

const CASE_COOKIE = 'verdict_case_id';
const STAGED_CASE_TIMEOUT_MS = 8000;
const CASE_SYNC_TIMEOUT_MS = 4000;

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

const extractMissingColumn = (message: string): string | null => {
	const schemaCacheMatch = message.match(/Could not find the '([^']+)' column of '[^']+' in the schema cache/i);
	if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
	const relationMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of relation/i);
	if (relationMatch?.[1]) return relationMatch[1];
	return null;
};

const omitColumn = <T extends Record<string, unknown>>(row: T, column: string): T => {
	const next = { ...row };
	delete next[column as keyof T];
	return next;
};

const insertWithLegacyColumnFallback = async <T extends Record<string, unknown>>(
	execute: (row: T) => PromiseLike<{ data: Record<string, any> | null; error: { message: string } | null }>,
	row: T
) => {
	let workingRow = { ...row };
	let result = await execute(workingRow);

	for (let attempt = 0; result.error && attempt < 12; attempt += 1) {
		const missingColumn = extractMissingColumn(result.error.message);
		if (!missingColumn || !(missingColumn in workingRow)) break;
		workingRow = omitColumn(workingRow, missingColumn);
		result = await execute(workingRow);
	}

	return result;
};

const upsertWithLegacyColumnFallback = async <T extends Record<string, unknown>>(
	execute: (row: T) => PromiseLike<{ error: { message: string } | null }>,
	row: T
) => {
	let workingRow = { ...row };
	let result = await execute(workingRow);

	for (let attempt = 0; result.error && attempt < 12; attempt += 1) {
		const missingColumn = extractMissingColumn(result.error.message);
		if (!missingColumn || !(missingColumn in workingRow)) break;
		workingRow = omitColumn(workingRow, missingColumn);
		result = await execute(workingRow);
	}

	return result;
};

const normalizePayload = (payload: Record<string, unknown>) => {
	const role = payload.role === 'plaintiff' || payload.role === 'defendant' ? payload.role : null;
	const sources = Array.isArray(payload.sources) ? payload.sources.map(String) : [];
	const packId = typeof payload.packId === 'string' ? payload.packId.trim() : '';
	const courtType = 'bench';
	const objective = typeof payload.objective === 'string' ? payload.objective.trim().slice(0, 1000) : '';
	const targetSkill = typeof payload.targetSkill === 'string' ? payload.targetSkill.trim().slice(0, 160) : '';
	const practicePoints = Array.isArray(payload.practicePoints)
		? payload.practicePoints.map((entry) => String(entry ?? '').trim()).filter(Boolean).slice(0, 8)
		: [];
	const judgeBrief = payload.judgeBrief && typeof payload.judgeBrief === 'object' ? payload.judgeBrief : null;
	const groundingAudit = payload.groundingAudit && typeof payload.groundingAudit === 'object' ? payload.groundingAudit : null;
	const paperSnapshot = payload.paperSnapshot && typeof payload.paperSnapshot === 'object' ? payload.paperSnapshot : null;
	const judgePacket = payload.judgePacket && typeof payload.judgePacket === 'object' ? payload.judgePacket : null;

	if (!role) {
		throw error(400, 'A valid side (plaintiff or defendant) is required.');
	}

	let validated;
	try {
		validated = validateCasePayload({
			title: payload.title,
			synopsis: payload.synopsis,
			issues: payload.issues,
			remedy: payload.remedy
		});
	} catch (err) {
		if (err instanceof CaseValidationError) throw error(400, err.message);
		throw err;
	}

	return { ...validated, role, sources, packId, courtType, objective, targetSkill, practicePoints, judgeBrief, groundingAudit, paperSnapshot, judgePacket };
};

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'create_case', 10, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many requests. Please wait a moment.');
	}

	const body = await request.json();
	const payload = normalizePayload(body);

	const admin = assertSupabaseAdmin();

	const insertRow = {
		user_id: session.user.id,
		title: payload.title,
		synopsis: payload.synopsis,
		issues: payload.issues,
		remedy: payload.remedy,
		objective: payload.objective,
		target_skill: payload.targetSkill,
		practice_points: payload.practicePoints,
		judge_brief: payload.judgeBrief,
		grounding_audit: payload.groundingAudit,
		paper_snapshot: payload.paperSnapshot,
		judge_packet: payload.judgePacket,
		role: payload.role,
		sources: payload.sources,
		pack_id: payload.packId || null,
		court_type: payload.courtType
	};

	let result;
	try {
		result = await withTimeout(
			insertWithLegacyColumnFallback(
				(row) => admin
					.from('staged_cases')
					.insert(row)
					.select('*')
					.single(),
				insertRow
			),
			STAGED_CASE_TIMEOUT_MS,
			'staged_cases insert'
		);
	} catch (err) {
		console.error('[staged_cases] insert timed out or failed unexpectedly', err);
		throw error(504, 'Timed out while persisting staged case.');
	}

	const { data, error: dbError } = result;

	if (dbError || !data) {
		console.error('[staged_cases] insert failed', dbError);
		throw error(500, 'Failed to persist staged case.');
	}

	const stagedCase = mapRowToStagedCase(data);
	const caseRow = {
		id: stagedCase.id,
		user_id: session.user.id,
		title: stagedCase.title,
		synopsis: stagedCase.synopsis,
		issues: stagedCase.issues,
		remedy: stagedCase.remedy,
		objective: payload.objective,
		target_skill: payload.targetSkill,
		practice_points: payload.practicePoints,
		judge_brief: payload.judgeBrief,
		grounding_audit: payload.groundingAudit,
		paper_snapshot: payload.paperSnapshot,
		judge_packet: payload.judgePacket,
		role: stagedCase.role,
		sources: stagedCase.sources,
		pack_id: payload.packId || null,
		court_type: payload.courtType,
		status: 'ongoing',
		started_at: stagedCase.createdAt,
		updated_at: stagedCase.createdAt,
		performance: null,
		created_at: stagedCase.createdAt
	};
	try {
		const caseSync = await withTimeout(
			upsertWithLegacyColumnFallback(
				(row) => admin.from('cases').upsert(row, { onConflict: 'id' }),
				caseRow
			),
			CASE_SYNC_TIMEOUT_MS,
			'cases history upsert'
		);
		if (caseSync.error) {
			console.warn('[cases] history upsert failed after staging:', caseSync.error);
		}
	} catch (err) {
		console.warn('[cases] history upsert timed out after staging:', err);
	}

	cookies.set(CASE_COOKIE, stagedCase.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 60 * 60 * 6 // 6 hours
	});

	return json(stagedCase, { status: 201 });
};
