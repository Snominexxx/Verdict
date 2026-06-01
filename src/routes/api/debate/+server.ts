import type { RequestHandler } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { getJudgePersona } from '$lib/data/judge';
import type { LibraryDocument } from '$lib/data/library';
import { libraryDocuments } from '$lib/data/library';
import { generateBenchTrialAnalysis } from '$lib/server/llm';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { mapRowToStagedCase } from '$lib/server/caseMapper';
import {
	loadFullSources,
	assertWithinBudget,
	SourcesOverBudgetError,
	sumTokens,
	buildSourceContextReport
} from '$lib/server/sources';
import { validateCitations } from '$lib/server/citationValidator';
import { checkCredits, recordUsage, isCaseCharged, refundUsage } from '$lib/server/credits';
import { rateLimit } from '$lib/server/rateLimit';
import type { PackContext, PackLanguage, StagedCase } from '$lib/types';
import {
	buildRelevantSourceBundle,
	materializeSourceBundleSources,
	sourceBundleCoversQuery
} from '$lib/server/sourcePackets';
import { buildEvidenceSufficiency } from '$lib/server/packMemory';

const MAX_PROMPT_LENGTH = 10_000;

type TranscriptEntry = { role: string; speaker: string; message: string };

const normalizePackLanguage = (value: unknown): PackLanguage => (value === 'fr' ? 'fr' : 'en');

const isTransientCaseId = (caseId: string): boolean =>
	caseId.startsWith('local-') || caseId.startsWith('shared-');

const hasServerJudgeEvidencePacket = (record: StagedCase | null | undefined): boolean => {
	const snapshot = record?.judgePacket?.paper ?? record?.paperSnapshot;
	const sourcePacket = record?.judgePacket?.sourcePacket ?? snapshot?.sourceBundle;
	return Boolean(
		snapshot
		&& Array.isArray(sourcePacket?.excerpts)
		&& sourcePacket.excerpts.length
		&& snapshot.judgeBrief
		&& snapshot.groundingAudit
		&& typeof snapshot.evidenceSufficiency?.canProceed === 'boolean'
	);
};

const hasJudgePacketExcerpts = (record: StagedCase | null | undefined): boolean =>
	Boolean(
		Array.isArray(record?.judgePacket?.sourcePacket?.excerpts)
		&& record.judgePacket.sourcePacket.excerpts.length
	) || Boolean(Array.isArray(record?.paperSnapshot?.sourceBundle?.excerpts) && record.paperSnapshot.sourceBundle.excerpts.length);

const getJudgeSourcePacket = (record: StagedCase | null | undefined) =>
	record?.judgePacket?.sourcePacket ?? record?.paperSnapshot?.sourceBundle ?? null;

const loadAuthoritativeStagedCase = async (args: {
	userId: string;
	caseId: string;
}): Promise<StagedCase | null> => {
	try {
		const admin = assertSupabaseAdmin();
		const { data, error } = await admin
			.from('staged_cases')
			.select('*')
			.eq('id', args.caseId)
			.eq('user_id', args.userId)
			.single();

		if (error || !data) {
			console.warn('[debate] staged case reload failed', error);
			return null;
		}

		return mapRowToStagedCase(data);
	} catch (err) {
		console.error('[debate] could not reload authoritative staged case', err);
		return null;
	}
};

const normalizePackContext = (value: unknown): PackContext | undefined => {
	if (!value || typeof value !== 'object') return undefined;
	const raw = value as Record<string, unknown>;
	return {
		id: typeof raw.id === 'string' ? raw.id.slice(0, 100) : undefined,
		name: typeof raw.name === 'string' ? raw.name.slice(0, 200) : undefined,
		jurisdiction: typeof raw.jurisdiction === 'string' ? raw.jurisdiction.slice(0, 200) : undefined,
		domain: typeof raw.domain === 'string' ? raw.domain.slice(0, 200) : undefined,
		language: raw.language === 'fr' ? 'fr' : raw.language === 'en' ? 'en' : undefined,
		sourceLanguage: raw.sourceLanguage === 'fr' ? 'fr' : raw.sourceLanguage === 'en' ? 'en' : undefined,
		draftLanguage: raw.draftLanguage === 'fr' ? 'fr' : raw.draftLanguage === 'en' ? 'en' : undefined,
		hearingLanguage: raw.hearingLanguage === 'fr' ? 'fr' : raw.hearingLanguage === 'en' ? 'en' : undefined
	};
};

const resolveRequestedSourceIds = (payloadSources: unknown, fallbackIds: string[]): string[] => {
	const ids = new Set<string>();
	const addId = (value: unknown) => {
		const sourceId = typeof value === 'string' ? value.trim() : '';
		if (sourceId) ids.add(sourceId);
	};

	if (Array.isArray(payloadSources)) {
		for (const entry of payloadSources) {
			if (typeof entry === 'string') {
				addId(entry);
				continue;
			}
			if (!entry || typeof entry !== 'object') continue;
			addId((entry as { id?: unknown }).id);
		}
	}

	for (const fallbackId of fallbackIds) addId(fallbackId);

	return Array.from(ids);
};

const buildStoredSourceStub = (sourceId: string): LibraryDocument => ({
	id: sourceId,
	title: 'Uploaded document',
	jurisdiction: 'Other',
	description: 'Stored legal source pending server hydration.',
	lastUpdated: new Date().toISOString().slice(0, 10),
	sourceUrl: `uploaded://${sourceId}`,
	content: '',
	docType: 'secondary',
	trustLevel: 'unverified',
	isCustom: true,
	note: 'The judge server will reload the full stored text before analysis.'
});

const normalizeInlineSource = (entry: Record<string, unknown>): LibraryDocument | null => {
	const sourceId = typeof entry.id === 'string' ? entry.id.trim() : '';
	if (!sourceId) return null;
	const fallback = libraryDocuments.find((doc) => doc.id === sourceId);
	const title = typeof entry.title === 'string' && entry.title.trim()
		? entry.title.trim()
		: fallback?.title ?? 'Uploaded document';

	return {
		...fallback,
		id: sourceId,
		title,
		jurisdiction: typeof entry.jurisdiction === 'string' && entry.jurisdiction.trim()
			? entry.jurisdiction.trim()
			: fallback?.jurisdiction ?? 'Other',
		description: typeof entry.description === 'string'
			? entry.description
			: fallback?.description ?? '',
		filePath: typeof entry.filePath === 'string' ? entry.filePath : fallback?.filePath,
		storagePath: typeof entry.storagePath === 'string' ? entry.storagePath : fallback?.storagePath,
		originalFileName: typeof entry.originalFileName === 'string' ? entry.originalFileName : fallback?.originalFileName,
		mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : fallback?.mimeType,
		fileSize: typeof entry.fileSize === 'number' ? entry.fileSize : fallback?.fileSize,
		lastUpdated: typeof entry.lastUpdated === 'string' && entry.lastUpdated.trim()
			? entry.lastUpdated.trim()
			: fallback?.lastUpdated ?? new Date().toISOString().slice(0, 10),
		sourceUrl: typeof entry.sourceUrl === 'string' && entry.sourceUrl.trim()
			? entry.sourceUrl.trim()
			: fallback?.sourceUrl ?? `uploaded://${sourceId}`,
		content: typeof entry.content === 'string' ? entry.content : fallback?.content,
		docType: entry.docType as LibraryDocument['docType'] ?? fallback?.docType ?? 'secondary',
		trustLevel: entry.trustLevel as LibraryDocument['trustLevel'] ?? fallback?.trustLevel ?? 'unverified',
		isCustom: typeof entry.isCustom === 'boolean' ? entry.isCustom : fallback?.isCustom ?? true,
		note: typeof entry.note === 'string' ? entry.note : fallback?.note,
		ingestionAudit: typeof entry.ingestionAudit === 'object' && entry.ingestionAudit !== null
			? entry.ingestionAudit as LibraryDocument['ingestionAudit']
			: fallback?.ingestionAudit
	};
};

const normalizeSources = (payloadSources: unknown, requestedIds: string[]): LibraryDocument[] => {
	const resolved = new Map<string, LibraryDocument>();

	if (Array.isArray(payloadSources)) {
		for (const entry of payloadSources) {
			if (typeof entry === 'string') {
				const fallback = libraryDocuments.find((doc) => doc.id === entry);
				if (fallback) resolved.set(fallback.id, fallback);
				continue;
			}
			if (!entry || typeof entry !== 'object') continue;
			const normalized = normalizeInlineSource(entry as Record<string, unknown>);
			if (normalized) resolved.set(normalized.id, normalized);
		}
	}

	for (const sourceId of requestedIds) {
		if (resolved.has(sourceId)) continue;
		resolved.set(sourceId, libraryDocuments.find((doc) => doc.id === sourceId) ?? buildStoredSourceStub(sourceId));
	}

	return Array.from(resolved.values());
};

const uniqueStrings = (values: Array<string | undefined>): string[] =>
	Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));

const buildDebateSourceQuery = (stagedCase: StagedCase, prompt: string, transcript: TranscriptEntry[]): string =>
	{
		const paper = stagedCase.judgePacket?.paper ?? stagedCase.paperSnapshot;
		return [
		prompt,
		stagedCase.title,
		stagedCase.synopsis,
		stagedCase.issues,
		stagedCase.remedy,
		stagedCase.objective,
		stagedCase.targetSkill,
		stagedCase.practicePoints?.join('; '),
		paper?.issues,
		paper?.plaintiffPosition,
		paper?.defendantPosition,
		paper?.practicePoints?.join('; '),
		paper?.packMemory?.topics.map((topic) => `${topic.topic}: ${topic.relatedTerms.join(', ')}`).join('\n'),
		paper?.packMemory?.authorities.map((authority) => `${authority.citation ?? authority.authorityId}: ${authority.topic}`).join('\n'),
		transcript.slice(-4).map((entry) => entry.message).join('\n')
		]
			.filter(Boolean)
			.join('\n\n');
	};

const buildDebateSourceHints = (stagedCase: StagedCase) => {
	const paper = stagedCase.judgePacket?.paper ?? stagedCase.paperSnapshot;
	const sourceUses = paper?.sourcesUsed ?? [];
	return {
		titles: uniqueStrings(sourceUses.map((source) => source.title)),
		citations: uniqueStrings(sourceUses.map((source) => source.citation))
	};
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	const payload = await request.json();
	let stagedCase = payload.case as StagedCase | undefined;
	const isPublicSharedCase = !session
		&& Boolean(stagedCase?.id?.startsWith('shared-'))
		&& hasJudgePacketExcerpts(stagedCase);
	if (!session && !isPublicSharedCase) throw error(401, 'Authentication required.');
	const actorKey = session?.user.id ?? `guest:${stagedCase?.id ?? 'shared-case'}`;
	const actorUserId = session?.user.id ?? null;

	// Rate limit: 10 requests per 60 seconds per user
	const rl = rateLimit(actorKey, 'debate', 10, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many requests. Please wait a moment and try again.');
	}

	const prompt = String(payload.prompt ?? '').trim();
	let packContext = normalizePackContext(payload.packContext ?? stagedCase?.packContext);
	let language = normalizePackLanguage(
		stagedCase?.judgePacket?.paper.hearingLanguage ??
			stagedCase?.paperSnapshot?.hearingLanguage ??
			packContext?.hearingLanguage ??
			packContext?.sourceLanguage ??
			packContext?.language ??
			payload.language
	);

	// Prior-exchange transcript (sanitised). We accept at most the last 12
	// entries from the client and strip everything except role / speaker /
	// message to keep the prompt lean.
	type TranscriptEntry = { role: string; speaker: string; message: string };
	const rawTranscript = Array.isArray(payload.transcript) ? payload.transcript : [];
	const transcript: TranscriptEntry[] = rawTranscript
		.slice(-12)
		.map((t: unknown) => {
			if (!t || typeof t !== 'object') return null;
			const obj = t as Record<string, unknown>;
			const role = typeof obj.role === 'string' ? obj.role : '';
			const speaker = typeof obj.speaker === 'string' ? obj.speaker : '';
			const message = typeof obj.message === 'string' ? obj.message : '';
			if (!role || !message) return null;
			return {
				role,
				speaker,
				message: message.length > 4000 ? message.slice(0, 4000) + '…' : message
			};
		})
		.filter((t: TranscriptEntry | null): t is TranscriptEntry => t !== null);

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
	const clientHasEvidencePacket = hasServerJudgeEvidencePacket(stagedCase);
	const requiresAuthoritativeServerPacket = Boolean(session?.user.id && !isTransientCaseId(caseId) && !clientHasEvidencePacket);
	const serverStagedCase = requiresAuthoritativeServerPacket && session
		? await loadAuthoritativeStagedCase({ userId: session.user.id, caseId })
		: null;

	if (requiresAuthoritativeServerPacket && !serverStagedCase) {
		throw error(422, 'This case could not be reloaded from the server with its official Judge-mode evidence packet. Return to Create and relaunch Judge mode.');
	}

	if (serverStagedCase) {
		stagedCase = {
			...stagedCase,
			...serverStagedCase,
			judgeBrief: serverStagedCase.judgeBrief ?? stagedCase.judgeBrief,
			groundingAudit: serverStagedCase.groundingAudit ?? stagedCase.groundingAudit,
			paperSnapshot: serverStagedCase.paperSnapshot ?? stagedCase.paperSnapshot,
			judgePacket: serverStagedCase.judgePacket ?? stagedCase.judgePacket,
			packContext: packContext ?? serverStagedCase.packContext ?? stagedCase.packContext
		};
	}

	packContext = normalizePackContext(payload.packContext ?? stagedCase.packContext);
	language = normalizePackLanguage(
		stagedCase.judgePacket?.paper.hearingLanguage ??
			stagedCase.paperSnapshot?.hearingLanguage ??
			packContext?.hearingLanguage ??
			packContext?.sourceLanguage ??
			packContext?.language ??
			payload.language
	);

	if (stagedCase.groundingAudit?.status === 'insufficient-sources') {
		throw error(422, stagedCase.groundingAudit.summary || 'This exercise does not have enough source support for judge mode.');
	}
	if (requiresAuthoritativeServerPacket && !hasServerJudgeEvidencePacket(stagedCase)) {
		throw error(422, 'This case is missing a complete server-side evidence packet for Judge mode. Reopen it in Create and launch Judge mode again.');
	}
	stagedCase.courtType = 'bench';
	if (packContext) stagedCase.packContext = packContext;
	const alreadyCharged = session ? await isCaseCharged(session.user.id, caseId) : true;
	let chargedThisRequest = false;
	if (session && !alreadyCharged) {
		const credits = await checkCredits(session.user.id);
		if (!credits.allowed) {
			throw error(403, `Monthly debate limit reached (${credits.used}/${credits.limit}). Upgrade your plan for more.`);
		}
		// Charge now (upsert ignores duplicates from concurrent requests)
		try { await recordUsage(session.user.id, caseId); chargedThisRequest = true; } catch (e) {
			console.error('Failed to record usage:', e);
		}
	}

	const requestedSourceIds = resolveRequestedSourceIds(payload.sources, stagedCase.sources);
	const sources = normalizeSources(payload.sources, requestedSourceIds);
	const task = 'bench';
	const useAuthoritativeServerPacket = hasJudgePacketExcerpts(stagedCase);

	// RIGOR GUARD #1 — Refuse the debate up-front if the user has not selected
	// any sources. Without sources the AI would have no legal text to ground
	// its arguments in and would fall back on training memory (= hallucination).
	// Better to block here than to let the model fabricate citations.
	if (!requestedSourceIds.length) {
		// Refund the credit charged above so the user is not penalised.
		if (chargedThisRequest && actorUserId) {
			try { await refundUsage(actorUserId, caseId); } catch (e) {
				console.error('Failed to refund usage after no-sources block:', e);
			}
		}
		throw error(
			422,
			'No legal sources attached to this case. Import the statutes, articles, or documents you want the AI to reason with before starting the debate.'
		);
	}

	let hydratedSources: LibraryDocument[] = sources;
	let sourceBundle = getJudgeSourcePacket(stagedCase);
	let promptSources: LibraryDocument[] = useAuthoritativeServerPacket
		? materializeSourceBundleSources(sourceBundle ?? { excerpts: [] } as never)
		: sources;
	const debateSourceQuery = buildDebateSourceQuery(stagedCase, prompt, transcript);
	const effectivePackId = stagedCase.packId ?? packContext?.id;
	const sourcePacketCacheKey = `${actorKey}:${effectivePackId ?? 'no-pack'}:${requestedSourceIds.slice().sort().join('|')}`;
	let evidenceSufficiency = stagedCase.judgePacket?.paper.evidenceSufficiency ?? stagedCase.paperSnapshot?.evidenceSufficiency ?? null;
	const canHydrateSourcesFromDb = Boolean(actorUserId && requestedSourceIds.length);

	const hydrateStoredSources = async (currentSources: LibraryDocument[]): Promise<LibraryDocument[]> => {
		if (!actorUserId || !requestedSourceIds.length) return currentSources;
		const loaded = await loadFullSources({
			supabase: locals.supabase,
			userId: actorUserId,
			sourceIds: requestedSourceIds,
			packId: effectivePackId
		});
		if (!loaded.length) return currentSources;
		const currentById = new Map(currentSources.map((source) => [source.id, source]));
		const loadedById = new Map(loaded.map((source) => [source.id, source]));
		return requestedSourceIds
			.map((sourceId) => loadedById.get(sourceId) ?? currentById.get(sourceId))
			.filter((source): source is LibraryDocument => Boolean(source));
	};

	if (useAuthoritativeServerPacket) {
		hydratedSources = promptSources;
	} else if (sourceBundle && sourceBundleCoversQuery(sourceBundle, debateSourceQuery)) {
		promptSources = materializeSourceBundleSources(sourceBundle);
	} else {
		try {
			if (canHydrateSourcesFromDb) hydratedSources = await hydrateStoredSources(sources);

			sourceBundle = buildRelevantSourceBundle({
				cacheKey: sourcePacketCacheKey,
				sources: hydratedSources,
				query: debateSourceQuery,
				hints: buildDebateSourceHints(stagedCase)
			});
			const bundledSources = materializeSourceBundleSources(sourceBundle);
			promptSources = bundledSources.length ? bundledSources : hydratedSources;
			if (!bundledSources.length) sourceBundle = null;
		} catch (err) {
			console.error('Failed to load full sources:', err);
			throw error(500, 'Could not load legal sources for this debate.');
		}
	}

	if (!promptSources.length) {
		if (useAuthoritativeServerPacket) {
			throw error(422, 'This case has no exact retrieved passages in its official Judge-mode evidence packet. Reopen it in Create and relaunch Judge mode.');
		}
		promptSources = hydratedSources;
		sourceBundle = null;
	}

	const activePaper = stagedCase.judgePacket?.paper ?? stagedCase.paperSnapshot;
	if (!useAuthoritativeServerPacket && sourceBundle && activePaper?.packMemory) {
		evidenceSufficiency = buildEvidenceSufficiency({
			bundle: sourceBundle,
			memory: activePaper.packMemory,
			query: debateSourceQuery
		});

		if (!evidenceSufficiency.canProceed) {
			try {
				if (canHydrateSourcesFromDb) hydratedSources = await hydrateStoredSources(hydratedSources);
				const missingAuthorityNotes = activePaper.packMemory.authorities
					.filter((authority) => evidenceSufficiency?.fetchMore.includes(authority.authorityId))
					.map((authority) => `${authority.authorityId}: ${authority.sourceTitle} ${authority.citation ?? ''} | ${authority.retrievalNotes}`)
					.join('\n');
				const expandedQuery = `${debateSourceQuery}

JUDGE PACK MEMORY EXPANSION REQUEST
Missing concepts: ${evidenceSufficiency.missingConcepts.join('; ') || 'none listed'}
Fetch authority IDs:
${missingAuthorityNotes || evidenceSufficiency.fetchMore.join('\n') || 'none listed'}

Retrieve broader exact evidence for main rules, related exceptions, defences, definitions, counter-arguments, neighboring provisions, and limits before the judge answers.`;
				sourceBundle = buildRelevantSourceBundle({
					cacheKey: sourcePacketCacheKey,
					sources: hydratedSources,
					query: expandedQuery,
					hints: {
						titles: buildDebateSourceHints(stagedCase).titles,
						citations: evidenceSufficiency.missingConcepts
					}
				});
				const expandedSources = materializeSourceBundleSources(sourceBundle);
				promptSources = expandedSources.length ? expandedSources : hydratedSources;
				evidenceSufficiency = buildEvidenceSufficiency({
					bundle: sourceBundle,
					memory: activePaper.packMemory,
					query: expandedQuery
				});
			} catch (err) {
				console.error('Failed to expand debate sources from Pack Memory:', err);
			}
		}

		activePaper.evidenceSufficiency = evidenceSufficiency ?? undefined;
		activePaper.sourceBundle = sourceBundle;
	}

	try {
		assertWithinBudget(promptSources, task);
	} catch (err) {
		if (err instanceof SourcesOverBudgetError) {
			throw error(413, err.message);
		}
		throw err;
	}

	if (!sourceBundle) {
		if (useAuthoritativeServerPacket) {
			throw error(422, 'This case is missing its official Judge-mode evidence packet. Return to Create and relaunch Judge mode.');
		}
		const totalContentChars = hydratedSources.reduce(
			(sum, doc) => sum + (typeof doc.content === 'string' ? doc.content.trim().length : 0),
			0
		);
		if (totalContentChars < 200) {
			if (chargedThisRequest && actorUserId) {
				try { await refundUsage(actorUserId, caseId); } catch (e) {
					console.error('Failed to refund usage after empty-sources block:', e);
				}
			}
			throw error(
				422,
				'The selected sources contain no legal text. Re-import the documents (or upload the full text of the statutes/articles you want the AI to use) before starting the debate.'
			);
		}
	}

	const sourcesUsed = promptSources.length;
	const sourceTokens = sourceBundle?.tokenCount ?? sumTokens(promptSources);
	const contextReport = buildSourceContextReport(promptSources, task);

	if (evidenceSufficiency && !evidenceSufficiency.canProceed) {
		if (chargedThisRequest && actorUserId) {
			try { await refundUsage(actorUserId, caseId); } catch (e) {
				console.error('Failed to refund usage after incomplete-evidence block:', e);
			}
		}
		const judgePersona = getJudgePersona(language);
		return json({
			reply: {
				role: 'judge',
				speaker: judgePersona.name,
				message: language === 'fr'
					? `Je ne peux pas entendre ce point de facon fiable avec le paquet de sources actuel. Il manque encore: ${evidenceSufficiency.missingConcepts.join('; ') || 'des passages juridiques connexes'}. Restreignez l argument aux passages recuperes ou ajoutez les sources pertinentes.`
					: `I cannot hear this point reliably from the current source packet. Still missing: ${evidenceSufficiency.missingConcepts.join('; ') || 'related legal passages'}. Narrow the argument to the retrieved passages or add the relevant sources.`,
				citations: [],
				verifiedCitations: [],
				timestamp: new Date().toISOString()
			},
			judgeMind: {
				assessment: language === 'fr'
					? 'Le dossier de sources ne suffit pas encore pour une reponse judiciaire fiable.'
					: 'The source packet is not yet sufficient for a reliable judicial response.',
				concerns: evidenceSufficiency.reason,
				leaning: language === 'fr' ? 'Aucune conclusion sans autorites verifiables.' : 'No conclusion without verifiable authority.'
			},
			courtType: 'bench',
			sourcesUsed,
			sourceTokens,
			contextReport,
			sourceBundle,
			citationAudit: { verified: 0, unverified: 0 },
			evidenceSufficiency
		});
	}

	try {
		const { reply, judgeMind } = await generateBenchTrialAnalysis({
			prompt,
			stagedCase,
			sources: promptSources,
			packContext,
			transcript,
			language
		});

		const judgePersona = getJudgePersona(language);

		const verification = validateCitations({
			message: reply.message,
			declaredCitations: reply.citations,
			sources: promptSources
		});

		if (verification.unverifiedCount > 0) {
			return json({
				reply: {
					role: 'judge',
					speaker: judgePersona.name,
					message: language === 'fr'
						? 'Je ne vais pas rendre cette reponse: une ou plusieurs citations proposees ne sont pas verifiables dans les sources fournies. Reformulez avec les passages exacts du dossier, ou ajoutez la source pertinente.'
						: 'I will not issue that answer: one or more proposed citations were not verifiable in the provided sources. Reframe the point with exact passages from the record, or add the relevant source.',
					citations: [],
					verifiedCitations: verification.citations,
					timestamp: new Date().toISOString()
				},
				judgeMind: {
					assessment: language === 'fr'
						? 'La reponse du juge a ete bloquee par la verification des citations.'
						: 'The judge response was blocked by citation verification.',
					concerns: language === 'fr'
						? 'Au moins une autorite declaree ne correspond pas textuellement aux sources en vue.'
						: 'At least one declared authority did not match the source text in view.',
					leaning: language === 'fr' ? 'Aucune conclusion sans citation verifiee.' : 'No conclusion without verified citation support.'
				},
				courtType: 'bench',
				sourcesUsed,
				sourceTokens,
				contextReport,
				sourceBundle,
				citationAudit: {
					verified: verification.verifiedCount,
					unverified: verification.unverifiedCount
				},
				evidenceSufficiency
			});
		}

		return json({
			reply: {
				role: 'judge',
				speaker: judgePersona.name,
				message: reply.message,
				citations: reply.citations,
				verifiedCitations: verification.citations,
				timestamp: new Date().toISOString()
			},
			judgeMind,
			courtType: 'bench',
			sourcesUsed,
			sourceTokens,
			contextReport,
			sourceBundle,
			citationAudit: {
				verified: verification.verifiedCount,
				unverified: verification.unverifiedCount
			},
			evidenceSufficiency
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		console.error('Debate endpoint failed', err);

		// Refund credit if this was the first charge and LLM failed
		if (chargedThisRequest && actorUserId) {
			try { await refundUsage(actorUserId, caseId); } catch (refundErr) {
				console.error('Failed to refund credit:', refundErr);
			}
		}

		// Provide clearer messages for common errors
		if (errorMessage.includes('invalid_api_key') || errorMessage.includes('Incorrect API key')) {
			throw error(503, 'AI service configuration error. Please contact support.');
		}
		if (errorMessage.includes('LLM_API_KEY is not configured')) {
			throw error(503, 'AI service is not configured. Please contact support.');
		}
		if (errorMessage.includes('rate_limit') || errorMessage.includes('429')) {
			throw error(429, 'AI service is temporarily busy. Please wait a moment and try again.');
		}
		if (errorMessage.includes('insufficient_quota')) {
			throw error(402, 'AI service quota reached. Please contact support.');
		}

		throw error(500, 'Debate service is temporarily unavailable. Please try again shortly.');
	}
};
