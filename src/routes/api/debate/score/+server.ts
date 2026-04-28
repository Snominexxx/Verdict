import type { RequestHandler } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import type { DebateTurn, StagedCase } from '$lib/types';
import type { LibraryDocument } from '$lib/data/library';
import { generatePerformanceEvaluation } from '$lib/server/llm';
import { rateLimit } from '$lib/server/rateLimit';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	// Rate limit: 5 score requests per 60 seconds per user
	const rl = rateLimit(session.user.id, 'score', 5, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many score requests. Please wait a moment and try again.');
	}

	const payload = await request.json();
	const stagedCase = payload.case as StagedCase | undefined;
	const transcript = (payload.transcript as DebateTurn[] | undefined) ?? [];
	const sources = (payload.sources as LibraryDocument[] | undefined) ?? [];
	const deterministic = payload.deterministic as
		| {
				persuasion?: number;
				lawCited?: number;
				structure?: number;
				responsiveness?: number;
				factFidelity?: number;
		  }
		| undefined;
	const language = String(payload.language ?? 'en');

	if (!stagedCase) {
		throw error(400, 'No staged case supplied.');
	}

	if (!Array.isArray(transcript) || transcript.length === 0) {
		throw error(400, 'Transcript is required for scoring.');
	}

	const ai = await generatePerformanceEvaluation({
		stagedCase,
		sources,
		transcript: transcript.map((turn) => ({
			role: turn.role,
			speaker: turn.speaker,
			message: turn.message,
			citations: turn.citations
		})),
		language
	});

	const blended = {
		persuasion: Math.round(clamp((deterministic?.persuasion ?? 55) * 0.50 + ai.scores.persuasion * 0.50, 0, 100)),
		lawCited: Math.round(clamp((deterministic?.lawCited ?? 50) * 0.45 + ai.scores.lawCited * 0.55, 0, 100)),
		structure: Math.round(clamp((deterministic?.structure ?? 50) * 0.45 + ai.scores.structure * 0.55, 0, 100)),
		responsiveness: Math.round(clamp((deterministic?.responsiveness ?? 50) * 0.40 + ai.scores.responsiveness * 0.60, 0, 100)),
		factFidelity: Math.round(clamp((deterministic?.factFidelity ?? 55) * 0.45 + ai.scores.factFidelity * 0.55, 0, 100))
	};

	const average = Math.round(
		(blended.persuasion + blended.lawCited + blended.structure + blended.responsiveness + blended.factFidelity) / 5
	);

	return json({
		summary: ai.summary,
		strengths: ai.strengths ?? [],
		weaknesses: ai.weaknesses ?? [],
		nextTime: ai.nextTime ?? [],
		scores: { ...blended, average }
	});
};
