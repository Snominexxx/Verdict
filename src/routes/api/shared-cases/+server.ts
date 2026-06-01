import { randomBytes } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';
import type { ExercisePaperSnapshot, PackContext } from '$lib/types';

const TOKEN_BYTES = 6;

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const cleanText = (value: unknown, fallback = ''): string => {
	const text = String(value ?? '').trim();
	return text || fallback;
};

const makeToken = (): string => randomBytes(TOKEN_BYTES).toString('hex');

const normalizePackContext = (value: unknown): PackContext | null => {
	const raw = asRecord(value);
	if (!Object.keys(raw).length) return null;
	return {
		id: cleanText(raw.id) || undefined,
		name: cleanText(raw.name) || undefined,
		jurisdiction: cleanText(raw.jurisdiction) || undefined,
		domain: cleanText(raw.domain) || undefined,
		language: raw.language === 'fr' ? 'fr' : raw.language === 'en' ? 'en' : undefined,
		sourceLanguage: raw.sourceLanguage === 'fr' ? 'fr' : raw.sourceLanguage === 'en' ? 'en' : undefined,
		draftLanguage: raw.draftLanguage === 'fr' ? 'fr' : raw.draftLanguage === 'en' ? 'en' : undefined,
		hearingLanguage: raw.hearingLanguage === 'fr' ? 'fr' : raw.hearingLanguage === 'en' ? 'en' : undefined
	};
};

const normalizePaperSnapshot = (value: unknown): ExercisePaperSnapshot => {
	const raw = asRecord(value);
	const title = cleanText(raw.title);
	const synopsis = cleanText(raw.synopsis);
	const issues = cleanText(raw.issues);
	const plaintiffPosition = cleanText(raw.plaintiffPosition);
	const defendantPosition = cleanText(raw.defendantPosition);
	if (!title || !synopsis || !issues || !plaintiffPosition || !defendantPosition) {
		throw error(400, 'A complete case capsule is required before sharing.');
	}
	const sourceBundle = asRecord(raw.sourceBundle);
	const bundleExcerpts = Array.isArray(sourceBundle.excerpts) ? sourceBundle.excerpts : [];
	if (!bundleExcerpts.length) {
		throw error(400, 'This case needs a verified source packet before it can be shared. Rebuild it from sources first.');
	}
	const level = raw.level === 'advanced' || raw.level === 'intermediate' ? raw.level : 'introductory';
	const selectedRole = raw.selectedRole === 'defendant' ? 'defendant' : 'plaintiff';
	const recommendedRole = raw.recommendedRole === 'defendant' ? 'defendant' : 'plaintiff';
	return {
		...raw,
		title,
		level,
		sourceLanguage: raw.sourceLanguage === 'fr' ? 'fr' : raw.sourceLanguage === 'en' ? 'en' : undefined,
		draftLanguage: raw.draftLanguage === 'fr' ? 'fr' : raw.draftLanguage === 'en' ? 'en' : undefined,
		hearingLanguage: raw.hearingLanguage === 'fr' ? 'fr' : raw.hearingLanguage === 'en' ? 'en' : undefined,
		objective: cleanText(raw.objective),
		targetSkill: cleanText(raw.targetSkill),
		synopsis,
		issues,
		plaintiffPosition,
		defendantPosition,
		practicePoints: Array.isArray(raw.practicePoints) ? raw.practicePoints.map(String).filter(Boolean).slice(0, 12) : [],
		recommendedRole,
		selectedRole,
		sourcesUsed: Array.isArray(raw.sourcesUsed) ? raw.sourcesUsed : [],
		// A shared case should expose only the activity capsule and exact packet,
		// not the teacher's broader pack navigation map.
		packMemory: undefined
	} as ExercisePaperSnapshot;
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'share_case', 20, 60_000);
	if (!rl.allowed) throw error(429, 'Too many share links created. Please wait a moment.');

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') throw error(400, 'Invalid share payload.');

	const paperSnapshot = normalizePaperSnapshot((payload as Record<string, unknown>).paperSnapshot);
	const packContext = normalizePackContext((payload as Record<string, unknown>).packContext);
	const language = paperSnapshot.hearingLanguage ?? paperSnapshot.sourceLanguage ?? packContext?.language ?? 'en';
	const admin = assertSupabaseAdmin();

	let token = makeToken();
	let insertError: unknown = null;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const { error: dbError } = await admin.from('shared_cases').insert({
			teacher_id: session.user.id,
			token,
			title: paperSnapshot.title,
			paper_snapshot: paperSnapshot,
			pack_context: packContext,
			language,
			status: 'active'
		});
		if (!dbError) {
			return json({
				token,
				url: `${url.origin}/share/${token}`
			}, { status: 201 });
		}
		insertError = dbError;
		if (!/duplicate|unique/i.test(dbError.message)) break;
		token = makeToken();
	}

	console.error('[shared_cases] insert failed', insertError);
	throw error(500, 'Failed to create the share link. Make sure the shared_cases migration has been applied.');
};