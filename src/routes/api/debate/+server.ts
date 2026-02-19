import type { RequestHandler } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { jurorPersonas } from '$lib/data/jurors';
import { judgePersona } from '$lib/data/judge';
import type { LibraryDocument } from '$lib/data/library';
import { libraryDocuments } from '$lib/data/library';
import { generateDebateAnalysis, generateBenchTrialAnalysis } from '$lib/server/llm';
import type { StagedCase } from '$lib/types';

const normalizeSources = (payloadSources: unknown, fallbackIds: string[]): LibraryDocument[] => {
	if (Array.isArray(payloadSources) && payloadSources.length) {
		const inlineDocs = payloadSources.filter((entry) => typeof entry === 'object' && entry !== null) as LibraryDocument[];
		if (inlineDocs.every((doc) => doc?.id && doc?.title)) {
			return inlineDocs;
		}

		const ids = new Set(
			payloadSources
				.map((entry) => (typeof entry === 'string' ? entry : (entry as { id?: string }).id))
				.filter(Boolean) as string[]
		);
		return libraryDocuments.filter((doc) => ids.has(doc.id));
	}

	const fallback = new Set(fallbackIds);
	return libraryDocuments.filter((doc) => fallback.has(doc.id));
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.json();
	const prompt = String(payload.prompt ?? '').trim();
	const stagedCase = payload.case as StagedCase | undefined;
	const language = String(payload.language ?? 'en');

	if (!prompt) {
		throw error(400, 'A prompt is required.');
	}

	if (!stagedCase) {
		throw error(400, 'No staged case supplied.');
	}

	const sources = normalizeSources(payload.sources, stagedCase.sources);
	const isBenchTrial = stagedCase.courtType === 'bench';

	try {
		if (isBenchTrial) {
			// Bench Trial: 1 Judge who scores + may interject
			const { reply, judgeInterjection, judgeMind } = await generateBenchTrialAnalysis({
				prompt,
				stagedCase,
				sources,
				language
			});

			return json({
				reply: {
					role: 'judge',
					speaker: judgePersona.name,
					message: reply.message,
					citations: reply.citations,
					timestamp: new Date().toISOString()
				},
				judgeInterjection: judgeInterjection
					? {
							role: 'judge',
							speaker: judgePersona.name,
							message: judgeInterjection.message,
							type: judgeInterjection.type,
							timestamp: new Date().toISOString()
						}
					: null,
				judgeMind,
				courtType: 'bench'
			});
		}

		// Jury Trial: 5 Jurors score
		const selected = Array.isArray(payload.selectedJurors) && payload.selectedJurors.length
			? payload.selectedJurors
			: jurorPersonas.map((juror) => juror.id);

		const jurors = jurorPersonas.filter((juror) => selected.includes(juror.id));

		const { reply, jurorScores } = await generateDebateAnalysis({
			prompt,
			stagedCase,
			sources,
			jurors: jurors.length ? jurors : jurorPersonas,
			language
		});

		return json({
			reply: {
				role: 'ai',
				speaker: 'Advocate AI',
				message: reply.message,
				citations: reply.citations,
				timestamp: new Date().toISOString()
			},
			jurorScores,
			courtType: 'jury'
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		console.error('Debate endpoint failed', err);

		// Provide clearer messages for common errors
		if (errorMessage.includes('invalid_api_key') || errorMessage.includes('Incorrect API key')) {
			throw error(401, 'Invalid OpenAI API key. Please check your LLM_API_KEY in .env');
		}
		if (errorMessage.includes('LLM_API_KEY is not configured')) {
			throw error(500, 'LLM_API_KEY is not configured in .env');
		}
		if (errorMessage.includes('rate_limit') || errorMessage.includes('429')) {
			throw error(429, 'OpenAI rate limit reached. Please wait a moment and try again.');
		}
		if (errorMessage.includes('insufficient_quota')) {
			throw error(402, 'OpenAI quota exceeded. Please check your billing at platform.openai.com');
		}

		throw error(500, 'Debate service is currently unavailable. Check server logs for details.');
	}
};
