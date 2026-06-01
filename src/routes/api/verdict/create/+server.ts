import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/server/rateLimit';
import { parseIntent } from '$lib/verdict/intent';
import { assembleSourcePacket } from '$lib/server/verdict/retrieve';
import { buildDossier } from '$lib/server/verdict/dossier';

/**
 * Verdict v2 — Create endpoint.
 *
 * Thin route: parse the user's request → retrieve a verified source packet →
 * build ONE CaseDossier. All legal reasoning is bound to the user's uploaded
 * sources. Returns the dossier as the single source of truth for the hearing.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'verdict-create', 8, 60_000);
	if (!rl.allowed) throw error(429, 'Too many requests. Please wait a moment and try again.');

	const payload = await request.json().catch(() => ({}));
	const userRequest = String(payload.request ?? '').trim();
	if (!userRequest) throw error(400, 'A request is required.');

	const sourceIds: string[] = Array.isArray(payload.sourceIds)
		? payload.sourceIds.map((x: unknown) => String(x)).filter(Boolean)
		: [];
	const packId = payload.packId ? String(payload.packId) : undefined;

	const intent = parseIntent(userRequest);

	const { packet, sourcesLanguage } = await assembleSourcePacket({
		supabase: locals.supabase,
		userId: session.user.id,
		intent,
		request: userRequest,
		sourceIds,
		packId
	});

	// The case must speak the language of the uploaded sources, not the request.
	intent.language = sourcesLanguage;

	const dossier = await buildDossier({
		intent,
		packet,
		sourceIds,
		packId
	});

	return json({ dossier, intent });
};
