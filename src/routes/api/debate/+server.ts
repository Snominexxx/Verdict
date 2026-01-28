import type { RequestHandler } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { jurorPersonas } from '$lib/data/jurors';
import type { LibraryDocument } from '$lib/data/library';
import { libraryDocuments } from '$lib/data/library';
import { generateDebateAnalysis } from '$lib/server/llm';
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

	if (!prompt) {
		throw error(400, 'A prompt is required.');
	}

	if (!stagedCase) {
		throw error(400, 'No staged case supplied.');
	}

	const selected = Array.isArray(payload.selectedJurors) && payload.selectedJurors.length
		? payload.selectedJurors
		: jurorPersonas.map((juror) => juror.id);

	const jurors = jurorPersonas.filter((juror) => selected.includes(juror.id));
	const sources = normalizeSources(payload.sources, stagedCase.sources);

	try {
		const { reply, jurorScores } = await generateDebateAnalysis({
			prompt,
			stagedCase,
			sources,
			jurors: jurors.length ? jurors : jurorPersonas
		});

		return json({
			reply: {
				role: 'ai',
				speaker: 'Advocate AI',
				message: reply.message,
				citations: reply.citations,
				timestamp: new Date().toISOString()
			},
			jurorScores
		});
	} catch (err) {
		console.error('Debate endpoint failed', err);
		throw error(500, 'Debate service is currently unavailable.');
	}
};
