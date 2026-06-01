import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/server/rateLimit';
import { runCreateChat } from '$lib/server/verdict/chat';
import type { CreateChatMessage, VerdictLanguage } from '$lib/verdict/contracts';

/**
 * Verdict v2 — Create studio chat endpoint.
 *
 * Thin route: free conversation with the source-bound assistant. Returns the
 * assistant's reply plus a readiness signal and a distilled build request the
 * client can pass to /api/verdict/create when the user is ready.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'verdict-chat', 20, 60_000);
	if (!rl.allowed) throw error(429, 'Too many requests. Please wait a moment and try again.');

	const payload = await request.json().catch(() => ({}));

	const messages: CreateChatMessage[] = Array.isArray(payload.messages)
		? payload.messages
				.map((m: unknown) => {
					const entry = m as Partial<CreateChatMessage>;
					return {
						role: entry.role === 'assistant' ? 'assistant' : 'user',
						content: String(entry.content ?? '')
					} as CreateChatMessage;
				})
				.filter((m: CreateChatMessage) => m.content.trim())
		: [];
	if (!messages.length) throw error(400, 'A message is required.');

	const sourceIds: string[] = Array.isArray(payload.sourceIds)
		? payload.sourceIds.map((x: unknown) => String(x)).filter(Boolean)
		: [];
	const packId = payload.packId ? String(payload.packId) : undefined;
	const sourceTitles: string[] = Array.isArray(payload.sourceTitles)
		? payload.sourceTitles.map((x: unknown) => String(x)).filter(Boolean)
		: [];
	const language: VerdictLanguage = payload.language === 'fr' ? 'fr' : 'en';

	const result = await runCreateChat({
		supabase: locals.supabase,
		userId: session.user.id,
		messages,
		sourceIds,
		packId,
		sourceTitles,
		language
	});

	return json({ result });
};
