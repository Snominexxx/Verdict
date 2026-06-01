import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/server/rateLimit';
import { runJudgeTurn } from '$lib/server/verdict/judge';
import { parseIntent } from '$lib/verdict/intent';
import { assembleSourcePacket, mergePackets } from '$lib/server/verdict/retrieve';
import type { CaseDossier, JudgeSession, JudgeTranscriptEntry } from '$lib/verdict/contracts';

/**
 * Verdict v2 — Judge endpoint.
 *
 * Thin route: accepts a JudgeSession (the CaseDossier + transcript + the
 * litigant's current submission) and returns one JudgeTurn. The Judge can only
 * cite authority present in the dossier's SourcePacket; everything else is
 * stripped and the reply is flagged.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'verdict-judge', 12, 60_000);
	if (!rl.allowed) throw error(429, 'Too many requests. Please wait a moment and try again.');

	const payload = await request.json().catch(() => ({}));
	const dossier = payload.dossier as CaseDossier | undefined;
	if (!dossier || dossier.version !== 'verdict-dossier-v1') {
		throw error(400, 'A valid CaseDossier is required.');
	}

	const userTurn = String(payload.userTurn ?? '').trim();
	if (!userTurn) throw error(400, 'A submission is required.');

	const transcript: JudgeTranscriptEntry[] = Array.isArray(payload.transcript)
		? payload.transcript
				.map((t: unknown) => {
					const entry = t as Partial<JudgeTranscriptEntry>;
					return {
						role: entry.role === 'judge' ? 'judge' : 'litigant',
						speaker: String(entry.speaker ?? ''),
						message: String(entry.message ?? '')
					} as JudgeTranscriptEntry;
				})
				.filter((t: JudgeTranscriptEntry) => t.message)
		: [];

	// Live, source-bound retrieval for THIS submission: the Judge should see the
	// dossier's base authority PLUS any law (and its cross-references) freshly
	// relevant to what the litigant is now arguing. Best-effort — if retrieval
	// fails we fall back to the dossier's stored packet.
	let activeDossier = dossier;
	if (Array.isArray(dossier.sourceIds) && dossier.sourceIds.length) {
		try {
			const intent = parseIntent(userTurn);
			const { packet: livePacket } = await assembleSourcePacket({
				supabase: locals.supabase,
				userId: session.user.id,
				intent,
				request: userTurn,
				conversation: transcript.slice(-4).map((t) => `${t.speaker}: ${t.message}`).join('\n'),
				sourceIds: dossier.sourceIds,
				packId: dossier.packId,
				maxExcerpts: 6,
				language: dossier.language
			});
			if (livePacket.passages.length) {
				activeDossier = {
					...dossier,
					sourcePacket: mergePackets(dossier.sourcePacket, livePacket)
				};
			}
		} catch (err) {
			console.error('Judge live retrieval failed, using dossier packet:', err);
		}
	}

	const judgeSession: JudgeSession = { dossier: activeDossier, transcript, userTurn };
	const turn = await runJudgeTurn(judgeSession);

	return json({ turn });
};
