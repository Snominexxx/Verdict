import type { RequestHandler } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { jurorPersonas } from '$lib/data/jurors';
import { judgePersona } from '$lib/data/judge';
import type { LibraryDocument } from '$lib/data/library';
import { libraryDocuments } from '$lib/data/library';
import { generateDebateAnalysis, generateBenchTrialAnalysis } from '$lib/server/llm';
import { searchChunks, formatChunksForPrompt } from '$lib/server/rag';
import { checkCredits, recordUsage, isCaseCharged } from '$lib/server/credits';
import { rateLimit } from '$lib/server/rateLimit';
import type { StagedCase } from '$lib/types';

const MAX_PROMPT_LENGTH = 10_000;

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

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	// Rate limit: 10 requests per 60 seconds per user
	const rl = rateLimit(session.user.id, 'debate', 10, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many requests. Please wait a moment and try again.');
	}

	const payload = await request.json();
	const prompt = String(payload.prompt ?? '').trim();
	const stagedCase = payload.case as StagedCase | undefined;
	const language = String(payload.language ?? 'en');

	if (!prompt) {
		throw error(400, 'A prompt is required.');
	}

	if (prompt.length > MAX_PROMPT_LENGTH) {
		throw error(400, `Prompt too long (max ${MAX_PROMPT_LENGTH} characters).`);
	}

	if (!stagedCase) {
		throw error(400, 'No staged case supplied.');
	}

	if (stagedCase.role !== 'plaintiff' && stagedCase.role !== 'defendant') {
		throw error(400, 'Invalid staged case role.');
	}

	// Credit check: 1 credit per case, only on first message.
	// We record usage BEFORE the LLM call to prevent race-condition abuse.
	// The unique(user_id, case_id) constraint ensures only 1 credit per case.
	const caseId = stagedCase.id;
	if (!caseId) {
		throw error(400, 'Case ID is required.');
	}
	const alreadyCharged = await isCaseCharged(session.user.id, caseId);
	if (!alreadyCharged) {
		const credits = await checkCredits(session.user.id);
		if (!credits.allowed) {
			throw error(403, `Monthly debate limit reached (${credits.used}/${credits.limit}). Upgrade your plan for more.`);
		}
		// Charge now (upsert ignores duplicates from concurrent requests)
		try { await recordUsage(session.user.id, caseId); } catch (e) {
			console.error('Failed to record usage:', e);
		}
	}

	const sources = normalizeSources(payload.sources, stagedCase.sources);
	const isBenchTrial = stagedCase.courtType === 'bench';

	// RAG: try semantic search for relevant chunks from the user's indexed documents
	let ragContext: string | undefined;
	try {
		const ragQuery = `${stagedCase.synopsis} ${stagedCase.issues || ''} ${prompt}`;
		const chunks = await searchChunks({
			supabase: locals.supabase,
			userId: session.user.id,
			query: ragQuery,
			packId: stagedCase.packId,
			maxChunks: 15,
			maxTokens: 12000
		});
		if (chunks.length > 0) {
			ragContext = formatChunksForPrompt(chunks);
		}
	} catch (ragErr) {
		// RAG is optional — if it fails (e.g. no pgvector, no chunks), fall back to direct sources
		console.warn('RAG search skipped:', ragErr instanceof Error ? ragErr.message : ragErr);
	}

	try {
		if (isBenchTrial) {
			// Bench Trial: 1 Judge who scores + may interject
			const { reply, judgeInterjection, judgeMind } = await generateBenchTrialAnalysis({
				prompt,
				stagedCase,
				sources,
				language,
				ragContext
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
			language,
			ragContext
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
