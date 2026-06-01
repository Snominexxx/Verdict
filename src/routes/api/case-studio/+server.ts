import { createHash } from 'node:crypto';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type {
	CaseStudioAnalysis,
	CaseStudioGroundingAudit,
	CaseStudioGroundingMapItem,
	CaseStudioOption,
	CaseStudioResponse,
	CaseStudioSourceDossier,
	EvidenceSufficiency,
	PackMemory,
	SourceBundle,
	SourceBundleExcerpt
} from '$lib/types';
import { rateLimit } from '$lib/server/rateLimit';
import {
	assertWithinBudget,
	estimateTokens,
	loadPackSourceIds,
	loadFullSources,
	SourcesOverBudgetError,
	sumTokens,
	TOKEN_BUDGETS
} from '$lib/server/sources';
import { callLLM, isNewStackEnabled } from '$lib/server/providers';
import { auditCaseStudioOption, formatGroundingBlockMessage } from '$lib/server/exerciseGroundingAudit';
import { classifyCaseStudioIntent, type CaseStudioMode } from '$lib/caseStudioIntent';
import {
	buildRelevantSourceBundle,
	materializeSourceBundleSources,
	renderSourcePacketBlock
} from '$lib/server/sourcePackets';
import {
	buildEvidenceSufficiency,
	ensurePackMemory,
	renderGeminiCacheBlock,
	renderPackMemoryBlock,
	renderPackSourceMapBlock
} from '$lib/server/packMemory';
import {
	buildCaseStudioRetrievalJob,
	renderCaseStudioRetrievalJobBlock,
	retrievalJobSearchHints
} from '$lib/server/caseStudioRetrievalJob';

type PackPayload = {
	packId?: string;
	packName?: string;
	jurisdiction?: string;
	language?: 'en' | 'fr';
	domain?: string;
	jurisdictions?: string[];
	sourceTitles?: string[];
	sourceIds?: string[];
};

type StudioHistoryEntry = {
	role?: string;
	content?: string;
};

type StudioMode = CaseStudioMode;

type CachedDossierEntry = {
	dossier: CaseStudioSourceDossier;
	expiresAt: number;
};

type SourceMaterial = Awaited<ReturnType<typeof loadFullSources>>[number];

const MAX_MESSAGE_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_SOURCE_CHARS_IN_PROMPT = 4_000_000;
const MAX_BUNDLE_EXCERPTS = 12;
const MAX_FORCED_CITATION_EXCERPTS = 8;
const DOSSIER_CACHE_TTL_MS = 30 * 60_000;
const DOSSIER_CACHE_LIMIT = 64;
const dossierCache = new Map<string, CachedDossierEntry>();
const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const cleanText = (value: unknown, fallback = ''): string => {
	const text = String(value ?? '').trim();
	return text || fallback;
};

const stringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8)
		: [];

const mergeStringArrays = (...values: unknown[]): string[] => {
	const merged: string[] = [];
	for (const value of values) {
		for (const item of stringArray(value)) {
			if (!merged.includes(item)) merged.push(item);
			if (merged.length >= 8) return merged;
		}
	}
	return merged;
};

const stringSchema = { type: 'string' } as const;
const stringArraySchema = (maxItems = 8) => ({
	type: 'array',
	items: stringSchema,
	maxItems
});

const assistantEnvelopeJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['assistantMessage', 'nextStep'],
	properties: {
		assistantMessage: stringSchema,
		nextStep: stringSchema
	}
};

const caseStudioDossierJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: [
		'jurisdiction',
		'sourceSummary',
		'strengths',
		'limits',
		'missingCoverage',
		'supportedSkills',
		'exerciseDirections',
		'judgeModeFit',
		'judgeModeRationale'
	],
	properties: {
		jurisdiction: stringSchema,
		sourceSummary: stringSchema,
		strengths: stringArraySchema(8),
		limits: stringArraySchema(8),
		missingCoverage: stringArraySchema(8),
		supportedSkills: stringArraySchema(8),
		exerciseDirections: stringArraySchema(8),
		judgeModeFit: { type: 'string', enum: ['high', 'medium', 'low'] },
		judgeModeRationale: stringSchema
	}
};

const judgeBriefJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: [
		'goal',
		'studentTask',
		'hearingFocus',
		'primarySkill',
		'issuesToProbe',
		'pressurePoints',
		'sourceBoundaries',
		'successCriteria'
	],
	properties: {
		goal: stringSchema,
		studentTask: stringSchema,
		hearingFocus: stringSchema,
		primarySkill: stringSchema,
		issuesToProbe: stringArraySchema(6),
		pressurePoints: stringArraySchema(6),
		sourceBoundaries: stringArraySchema(6),
		successCriteria: stringArraySchema(6)
	}
};

const caseStudioOptionJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: [
		'id',
		'title',
		'level',
		'objective',
		'targetSkill',
		'synopsis',
		'issues',
		'plaintiffPosition',
		'defendantPosition',
		'recommendedRole',
		'sourcesUsed',
		'practicePoints',
		'difficultyTrap',
		'sourceWarnings',
		'judgeBrief',
		'groundingMap'
	],
	properties: {
		id: stringSchema,
		title: stringSchema,
		level: { type: 'string', enum: ['introductory', 'intermediate', 'advanced'] },
		objective: stringSchema,
		targetSkill: stringSchema,
		synopsis: stringSchema,
		issues: stringSchema,
		plaintiffPosition: stringSchema,
		defendantPosition: stringSchema,
		recommendedRole: { type: 'string', enum: ['plaintiff', 'defendant'] },
		sourcesUsed: {
			type: 'array',
			maxItems: 6,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['title', 'citation', 'reason'],
				properties: {
					title: stringSchema,
					citation: stringSchema,
					reason: stringSchema
				}
			}
		},
		practicePoints: stringArraySchema(6),
		difficultyTrap: stringSchema,
		sourceWarnings: stringArraySchema(6),
		judgeBrief: judgeBriefJsonSchema,
		groundingMap: {
			type: 'array',
			minItems: 3,
			maxItems: 6,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['area', 'claim', 'sourceTitle', 'citation', 'excerpt', 'note'],
				properties: {
					area: {
						type: 'string',
						enum: ['mainIssue', 'plaintiffTheory', 'defendantTheory', 'judgePressurePoint', 'successCriteria', 'sourceBoundary', 'other']
					},
					claim: stringSchema,
					sourceTitle: stringSchema,
					citation: stringSchema,
					excerpt: stringSchema,
					note: stringSchema
				}
			}
		}
	}
};

const caseStudioBuildJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['assistantMessage', 'analysis', 'options'],
	properties: {
		assistantMessage: stringSchema,
		analysis: {
			type: 'object',
			additionalProperties: false,
			required: [
				'understoodGoal',
				'jurisdiction',
				'sourceSummary',
				'missingSources',
				'limits',
				'judgeModeFit',
				'judgeModeRationale',
				'canGenerate',
				'confidence'
			],
			properties: {
				understoodGoal: stringSchema,
				jurisdiction: stringSchema,
				sourceSummary: stringSchema,
				missingSources: stringArraySchema(8),
				limits: stringArraySchema(8),
				judgeModeFit: { type: 'string', enum: ['high', 'medium', 'low'] },
				judgeModeRationale: stringSchema,
				canGenerate: { type: 'boolean' },
				confidence: { type: 'string', enum: ['low', 'medium', 'high'] }
			}
		},
		options: {
			type: 'array',
			maxItems: 1,
			items: caseStudioOptionJsonSchema
		}
	}
};

const sourceNavigationPlanJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['action', 'expandedQuery', 'citations', 'rationale', 'stopReason'],
	properties: {
		action: { type: 'string', enum: ['retrieve', 'stop'] },
		expandedQuery: stringSchema,
		citations: stringArraySchema(8),
		rationale: stringSchema,
		stopReason: stringSchema
	}
};

const sourceGroundedIntentPlanJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['understoodGoal', 'explicitCitations', 'requestedConcepts', 'prioritySourceTitles', 'priorityUnits', 'searchQueries', 'refusalSignals', 'rationale'],
	properties: {
		understoodGoal: stringSchema,
		explicitCitations: stringArraySchema(8),
		requestedConcepts: stringArraySchema(8),
		prioritySourceTitles: stringArraySchema(8),
		priorityUnits: stringArraySchema(10),
		searchQueries: stringArraySchema(4),
		refusalSignals: stringArraySchema(6),
		rationale: stringSchema
	}
};

type SourceNavigationPlan = {
	action: 'retrieve' | 'stop';
	expandedQuery: string;
	citations: string[];
	rationale: string;
	stopReason: string;
};

type SourceGroundedIntentPlan = {
	understoodGoal: string;
	explicitCitations: string[];
	requestedConcepts: string[];
	prioritySourceTitles: string[];
	priorityUnits: string[];
	searchQueries: string[];
	refusalSignals: string[];
	rationale: string;
};

type RetrievalAttempt = {
	pass: number;
	query: string;
	bundleCoverage: SourceBundle['coverage'];
	evidenceCoverage: EvidenceSufficiency['coverage'];
	canProceed: boolean;
	excerptCount: number;
	sourceCount: number;
	missingConcepts: string[];
	plannerRationale?: string;
	stopReason?: string;
};

const repairCommonJsonBreaks = (value: string): string =>
	value
		.replace(/,\s*([}\]])/g, '$1')
		.replace(/([}\]"]|\b(?:true|false|null)\b|\d)\s*(?=\n\s*["{\[])/g, '$1,');

const extractJsonObject = (raw: string): string => {
	let cleaned = raw.trim();
	if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
	}

	const start = cleaned.indexOf('{');
	if (start === -1) {
		throw new Error('Model returned no JSON object.');
	}

	let depth = 0;
	let inString = false;
	let escape = false;
	for (let index = start; index < cleaned.length; index += 1) {
		const char = cleaned[index];
		if (escape) {
			escape = false;
			continue;
		}
		if (char === '\\' && inString) {
			escape = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === '{') depth += 1;
		else if (char === '}') {
			depth -= 1;
			if (depth === 0) return cleaned.slice(start, index + 1);
		}
	}

	const end = cleaned.lastIndexOf('}');
	if (end === -1 || end <= start) {
		throw new Error('Model returned no JSON object.');
	}
	return cleaned.slice(start, end + 1);
};

const parseJsonObject = (raw: string): Record<string, unknown> => {
	const jsonText = extractJsonObject(raw);
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText) as unknown;
	} catch (err) {
		const repaired = repairCommonJsonBreaks(jsonText);
		if (repaired !== jsonText) {
			try {
				parsed = JSON.parse(repaired) as unknown;
			} catch {
				throw err;
			}
		} else {
			throw err;
		}
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Model returned a JSON value, but not an object.');
	}
	return parsed as Record<string, unknown>;
};

const isStructuredOutputError = (err: unknown): boolean =>
	err instanceof Error && /JSON|object/i.test(err.message);

const detectOutputLanguage = (message: string, fallback: 'en' | 'fr'): 'en' | 'fr' => {
	const text = message.toLowerCase();
	if (/\b(en anglais|in english|write in english|answer in english|anglais)\b/.test(text)) return 'en';
	if (/\b(en francais|en français|in french|write in french|answer in french|francais|français)\b/.test(text)) return 'fr';
	if (/[àâçéèêëîïôûùüÿœ]/i.test(message)) return 'fr';
	if (/\b(le|la|les|des|du|de|un|une|je|tu|vous|nous|faire|pratiquer|exercice|cas|source|sources|article|juge|droit)\b/i.test(message)) return 'fr';
	return fallback;
};

const normaliseSourceNavigationAction = (value: unknown): SourceNavigationPlan['action'] =>
	String(value ?? '').trim().toLowerCase() === 'stop' ? 'stop' : 'retrieve';

const previewText = (value: unknown, limit = 280): string =>
	cleanText(value).replace(/\s+/g, ' ').slice(0, limit);

const renderRetrievedSourcePacketBlock = (bundle: SourceBundle): string => {
	const excerptLines = bundle.excerpts.slice(0, 8).map((excerpt, index) => {
		const label = [
			cleanText(excerpt.sourceTitle, 'Untitled source'),
			cleanText(excerpt.citation),
			cleanText(excerpt.heading)
		].filter(Boolean).join(' | ');
		return `${index + 1}. ${label || 'Untitled source'}
Reason: ${previewText(excerpt.reason, 160) || 'Retrieved from the active legal pack.'}
Preview: ${previewText(excerpt.excerpt, 320) || 'No excerpt preview available.'}`;
	}).join('\n\n');

	return `CURRENT RETRIEVED SOURCE PACKET
Query: ${cleanText(bundle.query, 'n/a')}
Coverage: ${bundle.coverage}
Excerpt count: ${bundle.excerptCount}
Source count: ${bundle.sourceCount}

${excerptLines || 'No excerpts retrieved.'}`;
};

const captureRetrievalAttempt = (args: {
	pass: number;
	query: string;
	bundle: SourceBundle;
	evidence: EvidenceSufficiency;
	plannerRationale?: string;
	stopReason?: string;
}): RetrievalAttempt => ({
	pass: args.pass,
	query: previewText(args.query, 900),
	bundleCoverage: args.bundle.coverage,
	evidenceCoverage: args.evidence.coverage,
	canProceed: args.evidence.canProceed,
	excerptCount: args.bundle.excerptCount,
	sourceCount: args.bundle.sourceCount,
	missingConcepts: args.evidence.missingConcepts.slice(0, 8),
	plannerRationale: previewText(args.plannerRationale, 240) || undefined,
	stopReason: previewText(args.stopReason, 240) || undefined
});

const renderRetrievalAttemptHistoryBlock = (attempts: RetrievalAttempt[]): string => {
	const lines = attempts.slice(-4).map((attempt) => {
		const heading = attempt.pass === 0 ? 'Pass 0 (initial packet)' : `Pass ${attempt.pass}`;
		return [
			heading,
			`Query: ${attempt.query || 'n/a'}`,
			`Bundle coverage: ${attempt.bundleCoverage} | Evidence coverage: ${attempt.evidenceCoverage} | canProceed=${attempt.canProceed}`,
			`Excerpts: ${attempt.excerptCount} | Sources: ${attempt.sourceCount}`,
			`Missing concepts: ${attempt.missingConcepts.join('; ') || 'none'}`,
			attempt.plannerRationale ? `Planner: ${attempt.plannerRationale}` : '',
			attempt.stopReason ? `Stop note: ${attempt.stopReason}` : ''
		].filter(Boolean).join('\n');
	}).join('\n\n');

	return `RETRIEVAL LOOP HISTORY
${lines || 'No retrieval attempts recorded yet.'}`;
};

const normaliseRetrievalFingerprint = (value: unknown): string =>
	cleanText(value).toLowerCase().replace(/\s+/g, ' ').trim();

const fingerprintRetrievalIntent = (query: string, citations: string[]): string => JSON.stringify({
	query: normaliseRetrievalFingerprint(query).slice(0, 1800),
	citations: Array.from(new Set(citations.map((citation) => normaliseRetrievalFingerprint(citation)).filter(Boolean))).sort()
});

const normaliseSourceNavigationPlan = (raw: string, fallbackQuery: string): SourceNavigationPlan => {
	const parsed = parseJsonObject(raw);
	const action = normaliseSourceNavigationAction(parsed.action);
	return {
		action,
		expandedQuery: cleanText(parsed.expandedQuery, fallbackQuery).slice(0, 2500),
		citations: stringArray(parsed.citations),
		rationale: cleanText(
			parsed.rationale,
			action === 'stop'
				? 'Further pack retrieval is unlikely to improve exact evidence.'
				: 'Pack Memory navigation requested broader exact evidence.'
		),
		stopReason: cleanText(
			parsed.stopReason,
			action === 'stop' ? 'The current pack retrieval appears to have plateaued.' : ''
		)
	};
};

const requestSourceNavigationPlan = async (args: {
	language: 'en' | 'fr';
	teacherRequest: string;
	currentQuery: string;
	currentBundle: SourceBundle;
	attempts: RetrievalAttempt[];
	retrievalBudget: number;
	remainingBudget: number;
	dossier: CaseStudioSourceDossier;
	evidenceSufficiency: EvidenceSufficiency;
	packMemory: PackMemory;
	geminiCache?: CaseStudioSourceDossier['geminiCache'];
}): Promise<SourceNavigationPlan | null> => {
	const systemPrompt = args.language === 'fr'
		? `Vous etes le planificateur cache de recuperation de Verdict. Vous ne redigez pas le cas. Vous decidez si une autre passe de recuperation dans le meme pack juridique actif vaut encore le cout; si oui, vous produisez une requete materiellement meilleure pour obtenir des passages exacts. N inventez jamais de droit, citation ou fait. Repondez uniquement en JSON valide et uniquement en francais canadien.`
		: `You are Verdict's hidden retrieval planner. You do not draft the case. You decide whether another retrieval pass inside the same active legal pack is worth the cost, and if so you produce one materially better query for exact passages. Never invent law, citations, or facts. Respond only with valid JSON and only in English.`;
	const userPrompt = `TEACHER REQUEST
${args.teacherRequest}

CURRENT RETRIEVAL QUERY
${args.currentQuery}

${renderRetrievedSourcePacketBlock(args.currentBundle)}

SOURCE DOSSIER SUMMARY
${args.dossier.sourceSummary}

SUPPORTED EXERCISE DIRECTIONS
${args.dossier.exerciseDirections.join('\n')}

EVIDENCE SUFFICIENCY RESULT
${JSON.stringify(args.evidenceSufficiency, null, 2)}

${renderPackMemoryBlock(args.packMemory)}

${renderPackSourceMapBlock(args.packMemory, { maxSources: 4, maxUnitsPerSource: 8 })}

${renderRetrievalAttemptHistoryBlock(args.attempts)}

RETRIEVAL BUDGET
Planned loop budget for this build: ${args.retrievalBudget}
Remaining passes after this decision: ${args.remainingBudget}

TASK
Decide whether another retrieval pass inside the same active legal pack is justified.
- Choose "retrieve" only if you can propose a materially different query that should improve exact evidence.
- Choose "stop" if the current packet has plateaued, if likely missing law is outside the visible pack map, or if the next query would mostly repeat prior passes.
- Stay inside the same active legal pack. Never ask for browsing, outside law, or new uploads.
- Use Pack Memory and the current packet only as navigation context. Final authority remains exact retrieved passages.

Return JSON with this exact shape:
{
  "action": "retrieve or stop",
  "expandedQuery": "One dense retrieval query, max 1200 characters.",
  "citations": ["Exact citations or authority IDs from Pack Memory that should be prioritized, if any."],
  "rationale": "Why this decision is the best next move for pack retrieval.",
  "stopReason": "Why the loop should stop if action=stop; otherwise an empty string."
}`;

	try {
		const content = await callLLM({
			task: 'create-dossier',
			systemPrompt,
			userPrompt,
			temperature: 0.2,
			maxTokens: 1200,
			jsonMode: true,
			schema: sourceNavigationPlanJsonSchema,
			cachedContent: args.geminiCache?.name
		});
		return normaliseSourceNavigationPlan(content, args.currentQuery);
	} catch (err) {
		console.warn('[case-studio retrieval planner] Planner unavailable; using deterministic Pack Memory expansion.', {
			detail: err instanceof Error ? err.message : String(err)
		});
		return null;
	}
};

const normaliseSourceGroundedIntentPlan = (raw: string, fallback: SourceGroundedRequestIntent): SourceGroundedIntentPlan => {
	const parsed = parseJsonObject(raw);
	return {
		understoodGoal: cleanText(parsed.understoodGoal, fallback.understoodGoal || fallback.rawText).slice(0, 500),
		explicitCitations: mergeStringArrays(fallback.explicitCitations, parsed.explicitCitations),
		requestedConcepts: mergeStringArrays(fallback.requestedConcepts, parsed.requestedConcepts),
		prioritySourceTitles: stringArray(parsed.prioritySourceTitles),
		priorityUnits: stringArray(parsed.priorityUnits).slice(0, 10),
		searchQueries: stringArray(parsed.searchQueries).slice(0, 4),
		refusalSignals: stringArray(parsed.refusalSignals).slice(0, 6),
		rationale: cleanText(parsed.rationale, fallback.rawText).slice(0, 320)
	};
};

const requestSourceGroundedIntentPlan = async (args: {
	language: 'en' | 'fr';
	teacherRequest: string;
	historyBlock: string;
	retrievalDraftBlock: string;
	fallbackIntent: SourceGroundedRequestIntent;
	dossier: CaseStudioSourceDossier;
	packMemory: PackMemory;
	geminiCache?: CaseStudioSourceDossier['geminiCache'];
}): Promise<SourceGroundedIntentPlan | null> => {
	const systemPrompt = args.language === 'fr'
		? `Vous etes l interprete cache de demande et le planificateur initial de recuperation de Verdict. Vous ne redigez pas le cas. Vous clarifiez ce que l enseignant veut vraiment, puis vous proposez ou chercher dans le pack actif avant la premiere recuperation. N inventez jamais d autorite, de citation, ni de fait. La carte du pack sert seulement a guider la recherche; les passages exacts restent l autorite finale. Repondez uniquement en JSON valide et uniquement en francais canadien.`
		: `You are Verdict's hidden request interpreter and initial retrieval planner. You do not draft the case. You clarify what the teacher actually wants, then propose where to search inside the active pack before the first retrieval pass. Never invent authorities, citations, or facts. The pack map is navigation only; exact passages remain the final authority. Respond only with valid JSON and only in English.`;
	const userPrompt = `TEACHER REQUEST
${args.teacherRequest}

${args.historyBlock ? `USER HISTORY\n${args.historyBlock}\n\n` : ''}${args.retrievalDraftBlock ? `CURRENT WORKING DRAFT\n${args.retrievalDraftBlock}\n\n` : ''}HEURISTIC REQUEST SIGNALS
${JSON.stringify({
	understoodGoal: args.fallbackIntent.understoodGoal,
	explicitCitations: args.fallbackIntent.explicitCitations,
	requestedConcepts: args.fallbackIntent.requestedConcepts,
	coreTerms: args.fallbackIntent.coreTerms,
	expandedTerms: args.fallbackIntent.expandedTerms
}, null, 2)}

SOURCE DOSSIER SUMMARY
${args.dossier.sourceSummary}

${renderPackMemoryBlock(args.packMemory)}

${renderPackSourceMapBlock(args.packMemory, { maxSources: 6, maxUnitsPerSource: 10 })}

TASK
- Infer the teacher's real training goal in plain language.
- Keep explicitCitations limited to citations the teacher asked for or exact citations already visible in the pack map that clearly match the same request.
- Use prioritySourceTitles and priorityUnits to name where the app should search first inside this pack.
- searchQueries should be dense retrieval queries for the app, not final prose.
- refusalSignals should describe when Verdict must refuse instead of pivoting to another topic.
- Stay inside the active pack. Do not request browsing, outside law, or new uploads.

Return JSON with this exact shape:
{
  "understoodGoal": "Plain-language statement of what the teacher wants students to practice.",
  "explicitCitations": ["Exact citation strings already asked for or clearly visible in the pack map."],
  "requestedConcepts": ["Main legal concepts the retrieval must cover."],
  "prioritySourceTitles": ["Exact source titles to search first."],
  "priorityUnits": ["Exact articles, sections, headings, or legal units from the pack map to search first."],
  "searchQueries": ["1 to 4 dense retrieval queries for the app."],
  "refusalSignals": ["When Verdict must refuse if evidence stays missing."],
  "rationale": "Why this is the best source-grounded retrieval plan."
}`;

	try {
		const content = await callLLM({
			task: 'create-dossier',
			systemPrompt,
			userPrompt,
			temperature: 0.2,
			maxTokens: 1600,
			jsonMode: true,
			schema: sourceGroundedIntentPlanJsonSchema,
			cachedContent: args.geminiCache?.name
		});
		return normaliseSourceGroundedIntentPlan(content, args.fallbackIntent);
	} catch (err) {
		console.warn('[case-studio intent planner] Planner unavailable; keeping deterministic request intent.', {
			detail: err instanceof Error ? err.message : String(err)
		});
		return null;
	}
};

const genericBuildTerms = new Set([
	'build', 'create', 'generate', 'draft', 'exercise', 'case', 'paper', 'judge', 'mode', 'idea', 'help',
	'cas', 'exercice', 'creer', 'créer', 'generer', 'générer', 'idee', 'idée', 'aide', 'mode', 'juge'
]);

type SourceGroundedRequestIntent = {
	rawText: string;
	understoodGoal: string;
	explicitCitations: string[];
	requestedConcepts: string[];
	coreTerms: string[];
	expandedTerms: string[];
	prioritySourceTitles: string[];
	priorityUnits: string[];
	plannerQueries: string[];
	refusalSignals: string[];
	plannerRationale?: string;
};

type SourceGroundedIntentCoverage = {
	missingExplicitCitations: string[];
	matchedConcepts: string[];
	matchedCoreTerms: string[];
	matchedExpandedTerms: string[];
	supported: boolean;
	missingTargets: string[];
	reason: string;
};

type RetrievalSearchState = 'not-found-yet' | 'exhausted';

const retrievalNoiseTerms = new Set([
	...genericBuildTerms,
	'article', 'articles', 'art', 'section', 'sections', 'sec', 'using', 'use', 'utilise', 'utiliser', 'veux', 'want',
	'please', 'svp', 'stp', 'fais', 'faire', 'fais-moi', 'build', 'construire', 'construis', 'judge', 'mode', 'sur',
	'avec', 'pour', 'dans', 'from', 'that', 'this', 'these', 'those', 'code', 'ccq', 'c', 'q'
]);

const requestCitationGroupPattern = /\b(?:article|articles|art[a-z]{0,6}\.?|section|sections|sec[a-z]{0,4}\.?|s\.?|ss\.?|§)\s+([0-9][A-Za-z0-9()./-]*(?:\s*(?:,|;|et|and|ou|or|-)\s*[0-9][A-Za-z0-9()./-]*)*)/gi;
const requestCodeCitationPattern = /\b([0-9]{1,5}(?:\.[0-9]+)?[A-Za-z]?)\s*(?:c\.?\s*c\.?\s*q\.?|ccq|code civil du quebec|code civil du québec|c\.?\s*cr\.?|code criminel|criminal code)\b/gi;
const requestStandaloneCitationPattern = /\b(?:article|articles|art[a-z]{0,6}\.?|section|sections|sec[a-z]{0,4}\.?|s\.?|ss\.?|§)\s*([0-9]{1,5}(?:\.[0-9]+)?[A-Za-z]?)/gi;
const directCitationSignalPattern = /(?:\b(?:article|articles|art[a-z]{0,6}\.?|section|sections|sec[a-z]{0,4}\.?|§)\s*[0-9]{1,5}(?:\.[0-9]+)?[a-z]?\b)|(?:\b[0-9]{1,5}(?:\.[0-9]+)?[a-z]?\s*(?:c\.?\s*c\.?\s*q\.?|ccq|code civil du quebec|c\.?\s*cr\.?|code criminel|criminal code)\b)/i;

const normalizeIntentText = (value: string): string =>
	value
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim();

const uniqueTrimmedStrings = (values: string[]): string[] =>
	Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const conceptSearchLexicon = [
	{
		phrase: 'responsabilite civile',
		pattern: /responsabilit[a-z]*\s+civil[a-z]*/,
		expansions: ['faute', 'prejudice', 'dommage', 'causalite', 'reparation', 'reparer', 'obligation', 'responsable']
	},
	{
		phrase: 'responsabilite contractuelle',
		pattern: /responsabilit[a-z]*\s+contractu[a-z]*/,
		expansions: ['contrat', 'inexecution', 'obligation', 'faute', 'prejudice', 'dommage', 'causalite', 'reparation']
	},
	{
		phrase: 'responsabilite extracontractuelle',
		pattern: /responsabilit[a-z]*\s+extra[- ]?contractu[a-z]*/,
		expansions: ['faute', 'prejudice', 'dommage', 'causalite', 'reparation', 'atteinte', 'blessure', 'responsable']
	},
	{
		phrase: 'bagarre',
		pattern: /\bbagarr[a-z]*\b|\baltercation\b|\bfight\b|\bassault\b/,
		expansions: ['violence', 'coup', 'blessure', 'faute', 'prejudice', 'dommage', 'causalite', 'reparation']
	},
	{
		phrase: 'divorce',
		pattern: /\bdivorc[a-z]*\b/,
		expansions: ['separation', 'mariage', 'epoux', 'conjoints', 'garde', 'pension', 'familial']
	},
	{
		phrase: 'harcelement',
		pattern: /harcel[a-z]*/,
		expansions: ['atteinte', 'dignite', 'prejudice', 'dommage', 'conduite', 'repetition', 'reparation']
	},
	{
		phrase: 'patrimoine familial',
		pattern: /patrimoin[a-z]*\s+familial[a-z]*/,
		expansions: ['partage', 'epoux', 'conjoints', 'residence', 'chalet', 'familial', 'mariage']
	}
] as const;

const splitCitationGroup = (raw: string): string[] =>
	raw
		.split(/\s*(?:,|;|et|and|ou|or|-)\s*/i)
		.map((part) => part.trim())
		.filter(Boolean);

const extractRequestedCitations = (text: string): string[] => {
	const citations: string[] = [];
	for (const match of text.matchAll(requestCitationGroupPattern)) {
		const group = match[1];
		if (!group) continue;
		citations.push(...splitCitationGroup(group));
	}
	for (const match of text.matchAll(requestCodeCitationPattern)) {
		if (!match[1]) continue;
		citations.push(match[1]);
	}
	for (const match of text.matchAll(requestStandaloneCitationPattern)) {
		if (!match[1]) continue;
		citations.push(match[1]);
	}
	return uniqueTrimmedStrings(citations).slice(0, 8);
};

const tokenizeRequestTerms = (text: string): string[] =>
	normalizeIntentText(text)
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 4 && !retrievalNoiseTerms.has(token) && !/^\d+$/.test(token));

const buildSourceGroundedRequestIntent = (args: {
	message: string;
	history: StudioHistoryEntry[];
}): SourceGroundedRequestIntent => {
	const rawText = [
		...args.history
			.filter((entry) => entry.role === 'user')
			.map((entry) => cleanText(entry.content)),
		cleanText(args.message)
	]
		.filter(Boolean)
		.join('\n\n');
	const normalizedText = normalizeIntentText(rawText);
	const matchedConceptEntries = conceptSearchLexicon.filter((entry) => entry.pattern.test(normalizedText));
	const requestedConcepts = matchedConceptEntries.map((entry) => entry.phrase);
	const expandedTerms = matchedConceptEntries.flatMap((entry) => entry.expansions);
	const coreTerms = tokenizeRequestTerms(rawText).filter((term) =>
		!requestedConcepts.some((phrase) => normalizeIntentText(phrase).includes(term))
	);

	return {
		rawText,
		understoodGoal: cleanText(args.message, rawText),
		explicitCitations: extractRequestedCitations(rawText),
		requestedConcepts: uniqueTrimmedStrings(requestedConcepts).slice(0, 6),
		coreTerms: uniqueTrimmedStrings(coreTerms).slice(0, 12),
		expandedTerms: uniqueTrimmedStrings(expandedTerms).slice(0, 16),
		prioritySourceTitles: [],
		priorityUnits: [],
		plannerQueries: [],
		refusalSignals: []
	};
};

const mergeSourceGroundedRequestIntent = (
	base: SourceGroundedRequestIntent,
	plan: SourceGroundedIntentPlan
): SourceGroundedRequestIntent => ({
	...base,
	understoodGoal: cleanText(plan.understoodGoal, base.understoodGoal || base.rawText),
	explicitCitations: mergeStringArrays(base.explicitCitations, plan.explicitCitations),
	requestedConcepts: mergeStringArrays(base.requestedConcepts, plan.requestedConcepts),
	coreTerms: uniqueTrimmedStrings([
		...base.coreTerms,
		...tokenizeRequestTerms(plan.understoodGoal),
		...tokenizeRequestTerms(plan.searchQueries.join(' '))
	]).slice(0, 12),
	expandedTerms: mergeStringArrays(base.expandedTerms, plan.requestedConcepts, plan.priorityUnits),
	prioritySourceTitles: mergeStringArrays(base.prioritySourceTitles, plan.prioritySourceTitles),
	priorityUnits: mergeStringArrays(base.priorityUnits, plan.priorityUnits),
	plannerQueries: mergeStringArrays(base.plannerQueries, plan.searchQueries),
	refusalSignals: mergeStringArrays(base.refusalSignals, plan.refusalSignals),
	plannerRationale: cleanText(plan.rationale) || base.plannerRationale
});

const renderSourceGroundedIntentBlock = (intent: SourceGroundedRequestIntent): string => {
	const blocks: string[] = [];
	if (intent.understoodGoal) {
		blocks.push(`UNDERSTOOD GOAL\n${intent.understoodGoal}`);
	}
	if (intent.explicitCitations.length) {
		blocks.push(`REQUESTED CITATIONS\n${intent.explicitCitations.join('\n')}`);
	}
	if (intent.requestedConcepts.length) {
		blocks.push(`REQUESTED CONCEPTS\n${intent.requestedConcepts.join('\n')}`);
	}
	if (intent.prioritySourceTitles.length) {
		blocks.push(`PRIORITY SOURCES\n${intent.prioritySourceTitles.join('\n')}`);
	}
	if (intent.priorityUnits.length) {
		blocks.push(`PRIORITY LEGAL UNITS\n${intent.priorityUnits.join('\n')}`);
	}
	if (intent.plannerQueries.length) {
		blocks.push(`PLANNED RETRIEVAL QUERIES\n${intent.plannerQueries.join('\n\n')}`);
	}
	if (intent.expandedTerms.length) {
		blocks.push(`CONTROLLED SEARCH TERMS\n${intent.expandedTerms.join('; ')}`);
	}
	if (intent.refusalSignals.length) {
		blocks.push(`REFUSAL SIGNALS\n${intent.refusalSignals.join('\n')}`);
	}
	if (intent.plannerRationale) {
		blocks.push(`PLANNER RATIONALE\n${intent.plannerRationale}`);
	}
	return blocks.join('\n\n');
};

const buildCitationPriorityLookupBlock = (intent: SourceGroundedRequestIntent, language: 'en' | 'fr'): string => {
	const citationTargets = mergeStringArrays(intent.explicitCitations, intent.priorityUnits).slice(0, 10);
	if (!citationTargets.length) return '';
	return language === 'fr'
		? `CITATION-FIRST LOOKUP\nAvant toute conclusion, recuperer d abord les passages exacts pour: ${citationTargets.join('; ')}. Puis inclure les dispositions voisines, exceptions, limites et defenses reliees dans le meme pack actif.`
		: `CITATION-FIRST LOOKUP\nBefore any conclusion, retrieve exact passages first for: ${citationTargets.join('; ')}. Then include neighboring provisions, exceptions, limits, and related defences inside the same active pack.`;
};

const extractNumericCitationToken = (value: string): string => {
	const normalized = normalizeIntentText(value);
	const match = normalized.match(/[0-9]{1,5}(?:\.[0-9]+)?[a-z]?/);
	return match?.[0] ?? '';
};

const extractCitationTokensFromText = (text: string): string[] => {
	const tokens: string[] = [];
	const pushToken = (raw: string | undefined) => {
		if (!raw) return;
		const token = extractNumericCitationToken(raw);
		if (!token || !/^[0-9]{1,5}(?:\.[0-9]+)?[a-z]?$/.test(token)) return;
		tokens.push(token);
	};

	const citationGroupRegex = new RegExp(requestCitationGroupPattern.source, 'gi');
	for (const match of text.matchAll(citationGroupRegex)) {
		const group = match[1];
		if (!group) continue;
		for (const part of splitCitationGroup(group)) pushToken(part);
	}

	const codeCitationRegex = new RegExp(requestCodeCitationPattern.source, 'gi');
	for (const match of text.matchAll(codeCitationRegex)) {
		pushToken(match[1]);
	}

	const standaloneCitationRegex = new RegExp(requestStandaloneCitationPattern.source, 'gi');
	for (const match of text.matchAll(standaloneCitationRegex)) {
		pushToken(match[1]);
	}

	return uniqueTrimmedStrings(tokens).slice(0, 10);
};

const extractLooseNumericCitationTokens = (text: string): string[] =>
	uniqueTrimmedStrings(normalizeIntentText(text).match(/\b[0-9]{3,5}(?:\.[0-9]+)?[a-z]?\b/g) ?? []).slice(0, 10);

const extractIntentCitationTokens = (intent: SourceGroundedRequestIntent): string[] =>
	uniqueTrimmedStrings([
		...mergeStringArrays(intent.explicitCitations, intent.priorityUnits)
			.map((value) => extractNumericCitationToken(value))
			.filter((value) => /^[0-9]{1,5}(?:\.[0-9]+)?[a-z]?$/.test(value)),
		...extractCitationTokensFromText(intent.rawText),
		...extractLooseNumericCitationTokens(intent.rawText)
	]).slice(0, 10);

const citationTokenInText = (haystack: string, token: string): boolean => {
	if (!haystack || !token) return false;
	const normalizedHaystack = normalizeIntentText(haystack);
	const normalizedToken = normalizeIntentText(token);
	if (!normalizedToken) return false;
	if (normalizedHaystack.includes(normalizedToken)) return true;

	const escaped = normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`(?:^|\\b|\\n)${escaped}(?:\\b|\\s*[.)])`, 'i');
	return pattern.test(normalizedHaystack);
};

type CitationVerificationStatus = {
	token: string;
	inCorpus: boolean;
	inPacket: boolean;
};

const collectCitationVerificationStatus = (args: {
	intent: SourceGroundedRequestIntent;
	bundle: SourceBundle;
	sources: SourceMaterial[];
	}): CitationVerificationStatus[] => {
	const citationTokens = extractIntentCitationTokens(args.intent);
	if (!citationTokens.length) return [];

	const packetText = buildBundleMatchText(args.bundle);
	const corpusText = normalizeIntentText(
		args.sources
			.map((source) => `${source.title}\n${cleanText(source.content, source.description)}`)
			.join('\n\n')
	);

	return citationTokens.map((token) => ({
		token,
		inCorpus: citationTokenInText(corpusText, token),
		inPacket: citationTokenInText(packetText, token)
	}));
};

const findCitationExcerptInText = (text: string, token: string): string | null => {
	if (!text || !token) return null;
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`(?:^|\\b|\\n)${escaped}(?:\\b|\\s*[.)])`, 'i');
	const match = pattern.exec(text);
	if (!match) return null;
	const start = Math.max(0, match.index - 320);
	const end = Math.min(text.length, match.index + match[0].length + 620);
	const excerpt = text.slice(start, end).trim();
	return excerpt || null;
};

const buildForcedCitationExcerptForToken = (args: {
	token: string;
	sources: SourceMaterial[];
	language: 'en' | 'fr';
}): SourceBundleExcerpt | null => {
	for (const source of args.sources) {
		const body = cleanText(source.content, source.description);
		const excerpt = findCitationExcerptInText(body, args.token)
			?? (() => {
				const directIndex = body.indexOf(args.token);
				if (directIndex < 0) return null;
				const start = Math.max(0, directIndex - 320);
				const end = Math.min(body.length, directIndex + args.token.length + 620);
				const fallbackExcerpt = body.slice(start, end).trim();
				return fallbackExcerpt || null;
			})();
		if (!excerpt) continue;

		return {
			sourceId: source.id,
			sourceTitle: cleanText(source.title, args.language === 'fr' ? 'Source selectionnee' : 'Selected source'),
			jurisdiction: source.jurisdiction,
			docType: source.docType,
			citation: `article ${args.token}`,
			heading: args.language === 'fr' ? `Article ${args.token} (cible utilisateur)` : `Article ${args.token} (user target)`,
			legalUnitKind: 'article',
			excerpt,
			reason: args.language === 'fr'
				? `Recherche obligatoire de la citation demandee (${args.token}) dans le pack actif.`
				: `Mandatory lookup of the requested citation (${args.token}) in the active pack.`
		};
	}

	return null;
};

const mergeForcedCitationExcerpts = (bundle: SourceBundle, forcedExcerpts: SourceBundleExcerpt[]): SourceBundle => {
	if (!forcedExcerpts.length) return bundle;

	const unique: SourceBundleExcerpt[] = [];
	const seen = new Set<string>();
	for (const excerpt of [...forcedExcerpts.slice(0, MAX_FORCED_CITATION_EXCERPTS), ...bundle.excerpts]) {
		const key = `${excerpt.sourceId}|${normalizeIntentText(excerpt.citation ?? '')}|${normalizeIntentText(excerpt.excerpt.slice(0, 220))}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(excerpt);
		if (unique.length >= MAX_BUNDLE_EXCERPTS) break;
	}

	const tokenCount = estimateTokens(
		unique.map((excerpt) => `${excerpt.sourceTitle}\n${excerpt.citation ?? ''}\n${excerpt.excerpt}`).join('\n\n')
	);

	return {
		...bundle,
		coverage: bundle.coverage === 'low' ? 'medium' : bundle.coverage,
		excerpts: unique,
		excerptCount: unique.length,
		sourceCount: new Set(unique.map((excerpt) => excerpt.sourceId)).size,
		tokenCount
	};
};

type MandatoryCitationLookupResult = {
	bundle: SourceBundle;
	checks: CitationVerificationStatus[];
	forcedTokens: string[];
};

const enforceMandatoryCitationLookup = (args: {
	intent: SourceGroundedRequestIntent;
	bundle: SourceBundle;
	sources: SourceMaterial[];
	language: 'en' | 'fr';
}): MandatoryCitationLookupResult => {
	const initialChecks = collectCitationVerificationStatus({
		intent: args.intent,
		bundle: args.bundle,
		sources: args.sources
	});
	const requestedTokens = extractIntentCitationTokens(args.intent);
	const packetTokenSet = new Set(initialChecks.filter((check) => check.inPacket).map((check) => check.token));
	const tokensToForce = requestedTokens
		.filter((token) => !packetTokenSet.has(token))
		.slice(0, MAX_FORCED_CITATION_EXCERPTS);

	if (!tokensToForce.length) {
		return {
			bundle: args.bundle,
			checks: initialChecks,
			forcedTokens: []
		};
	}

	const forcedExcerpts = tokensToForce
		.map((token) => buildForcedCitationExcerptForToken({ token, sources: args.sources, language: args.language }))
		.filter((excerpt): excerpt is SourceBundleExcerpt => Boolean(excerpt));
	const forcedBundle = mergeForcedCitationExcerpts(args.bundle, forcedExcerpts);
	const checks = collectCitationVerificationStatus({
		intent: args.intent,
		bundle: forcedBundle,
		sources: args.sources
	});

	if (shouldLogCaseStudioIntent() && forcedExcerpts.length) {
		console.info('[case-studio] Mandatory citation lookup injected packet excerpts', {
			requestedTokens: tokensToForce,
			injectedExcerpts: forcedExcerpts.length,
			sourceCount: forcedBundle.sourceCount,
			excerptCount: forcedBundle.excerptCount
		});
	}

	return {
		bundle: forcedBundle,
		checks,
		forcedTokens: tokensToForce
	};
};

const buildChatCitationVerificationBlock = (args: {
	checks: CitationVerificationStatus[];
	evidence: EvidenceSufficiency;
	language: 'en' | 'fr';
}): string => {
	if (!args.checks.length) return '';

	const statusLines = args.checks.map((status) => {
		return `${status.token}: source-corpus=${status.inCorpus ? 'yes' : 'no'}, retrieved-packet=${status.inPacket ? 'yes' : 'no'}`;
	});

	const caution = args.language === 'fr'
		? 'Regle: si source-corpus=yes pour une citation demandee, ne jamais affirmer que cette citation est absente du pack. Si retrieved-packet=no mais source-corpus=yes, dire que la passe courante n a pas encore cible le bon passage et proposer une recherche plus ciblee.'
		: 'Rule: if source-corpus=yes for a requested citation, never claim that citation is absent from the pack. If retrieved-packet=no while source-corpus=yes, explain that this pass has not targeted the right passage yet and propose a tighter retrieval.';

	return `EXPLICIT CITATION VERIFICATION\n${statusLines.join('\n')}\nEvidence coverage: ${args.evidence.coverage} (canProceed=${String(args.evidence.canProceed)})\n${caution}`;
};

const responseDeniesCitation = (assistantMessage: string, token: string): boolean => {
	const normalized = normalizeIntentText(assistantMessage).replace(/[’']/g, ' ');
	if (!normalized.includes(token)) return false;
	const index = normalized.indexOf(token);
	if (index < 0) return false;
	const window = normalized.slice(Math.max(0, index - 140), Math.min(normalized.length, index + 220));

	if (/\b(?:absent|introuvable|pas inclus|non inclus|pas disponible|missing|not found|not present|not included)\b/i.test(window)) {
		return true;
	}

	if (/\bne\b[^\n.]{0,60}\bpas\b/i.test(window)) {
		return true;
	}

	if (/\bdoes\s+not\b|\bis\s+not\b/i.test(window)) {
		return true;
	}

	return false;
};

const enforceConversationCitationTruth = (args: {
	response: CaseStudioResponse;
	checks: CitationVerificationStatus[];
	language: 'en' | 'fr';
}): CaseStudioResponse => {
	if (!args.checks.length) return args.response;

	const contradicted = args.checks.filter((check) =>
		check.inCorpus && responseDeniesCitation(args.response.assistantMessage, check.token)
	);
	if (!contradicted.length) return args.response;

	const cited = contradicted.map((check) => check.token).join(', ');
	const correctedMessage = args.language === 'fr'
		? `Correction de fiabilite: la citation ${cited} apparait bien dans le pack actif charge cote serveur. Je retire donc toute affirmation d absence. Je peux maintenant cibler le passage exact et le resumer sans extrapoler.`
		: `Reliability correction: citation ${cited} is present in the active pack loaded on the server. I am withdrawing any absence claim. I can now target the exact passage and summarize it without extrapolation.`;
	const correctedNextStep = args.language === 'fr'
		? `Dites-moi si vous voulez verifier ${cited} d abord, puis je continue avec les articles voisins utiles.`
		: `Tell me if you want ${cited} verified first, then I will continue with useful neighboring provisions.`;

	return {
		...args.response,
		assistantMessage: correctedMessage,
		workflow: {
			...args.response.workflow,
			nextStep: correctedNextStep
		}
	};
};

const buildConversationFallbackEnvelope = (language: 'en' | 'fr', sourceReviewed: boolean): string => {
	if (sourceReviewed) {
		return JSON.stringify({
			assistantMessage: language === 'fr'
				? 'Je peux continuer sans planter. Pour rester exact, je vais confirmer les passages pertinents du pack actif avant de conclure sur un article precis. Dites-moi la citation ou l angle que vous voulez verifier en priorite.'
				: 'I can continue without crashing. To stay accurate, I will confirm the relevant passages in the active pack before concluding on any specific citation. Tell me which citation or angle you want me to verify first.',
			nextStep: language === 'fr'
				? 'Nommez l article, la section, ou le point juridique a verifier (ex.: 1457 C.c.Q).'
				: 'Name the article, section, or legal point you want verified first (for example: 1457 C.c.Q).'
		});
	}

	return JSON.stringify({
		assistantMessage: language === 'fr'
			? 'Je peux continuer. Dites-moi ce que vous voulez pratiquer et je vous aide a le structurer clairement.'
			: 'I can keep going. Tell me what you want students to practice, and I will help structure it clearly.',
		nextStep: language === 'fr'
			? 'Partagez l objectif pedagogique, le niveau, ou le type de cas vise.'
			: 'Share the teaching goal, level, or type of case you want.'
	});
};

const buildBundleMatchText = (bundle: SourceBundle): string =>
	normalizeIntentText(
		bundle.excerpts
			.map((excerpt) => `${excerpt.sourceTitle}\n${excerpt.citation ?? ''}\n${excerpt.heading ?? ''}\n${excerpt.excerpt}`)
			.join('\n\n')
	);

const bundleMatchesIntentTerm = (haystack: string, term: string): boolean =>
	haystack.includes(normalizeIntentText(term));

const assessSourceGroundedIntentCoverage = (args: {
	intent: SourceGroundedRequestIntent;
	bundle: SourceBundle;
	evidence: EvidenceSufficiency;
	language: 'en' | 'fr';
}): SourceGroundedIntentCoverage => {
	const haystack = buildBundleMatchText(args.bundle);
	const missingExplicitCitations = args.intent.explicitCitations.filter((citation) => !bundleMatchesIntentTerm(haystack, citation));
	const matchedConcepts = args.intent.requestedConcepts.filter((concept) => bundleMatchesIntentTerm(haystack, concept));
	const matchedCoreTerms = args.intent.coreTerms.filter((term) => bundleMatchesIntentTerm(haystack, term));
	const matchedExpandedTerms = args.intent.expandedTerms.filter((term) => bundleMatchesIntentTerm(haystack, term));

	if (missingExplicitCitations.length) {
		return {
			missingExplicitCitations,
			matchedConcepts,
			matchedCoreTerms,
			matchedExpandedTerms,
			supported: false,
			missingTargets: missingExplicitCitations,
			reason: args.language === 'fr'
				? `Les citations demandees n ont pas ete recuperees dans les passages exacts du pack actif: ${missingExplicitCitations.join(', ')}.`
				: `The requested citations were not retrieved in the exact passages from the active pack: ${missingExplicitCitations.join(', ')}.`
		};
	}

	const conceptSupportSatisfied = args.intent.requestedConcepts.length === 0
		|| matchedConcepts.length > 0
		|| matchedExpandedTerms.length >= 2
		|| (args.evidence.canProceed && (matchedExpandedTerms.length > 0 || matchedCoreTerms.length > 0));
	if (!conceptSupportSatisfied) {
		return {
			missingExplicitCitations,
			matchedConcepts,
			matchedCoreTerms,
			matchedExpandedTerms,
			supported: false,
			missingTargets: args.intent.requestedConcepts,
			reason: args.language === 'fr'
				? `Je n ai pas recupere assez de passages exacts lies a la demande utilisateur: ${args.intent.requestedConcepts.join(', ')}.`
				: `I did not retrieve enough exact passages tied to the user's requested concept: ${args.intent.requestedConcepts.join(', ')}.`
		};
	}

	const genericTermSupportSatisfied = args.intent.requestedConcepts.length > 0
		|| args.intent.coreTerms.length === 0
		|| matchedCoreTerms.length >= 2
		|| (matchedCoreTerms.length >= 1 && args.bundle.coverage !== 'low' && args.evidence.coverage !== 'low');
	if (!genericTermSupportSatisfied) {
		return {
			missingExplicitCitations,
			matchedConcepts,
			matchedCoreTerms,
			matchedExpandedTerms,
			supported: false,
			missingTargets: args.intent.coreTerms.slice(0, 4),
			reason: args.language === 'fr'
				? 'La recherche n a pas recupere assez de passages directement lies aux termes centraux de la demande.'
				: 'Retrieval did not recover enough passages directly tied to the central terms of the request.'
		};
	}

	return {
		missingExplicitCitations,
		matchedConcepts,
		matchedCoreTerms,
		matchedExpandedTerms,
		supported: true,
		missingTargets: [],
		reason: ''
	};
};

const buildStrictSourceGroundedMissResponse = (args: {
	language: 'en' | 'fr';
	message: string;
	sourceCount: number;
	dossier: CaseStudioSourceDossier;
	intent: SourceGroundedRequestIntent;
	coverage: SourceGroundedIntentCoverage;
 	searchState: RetrievalSearchState;
 	attemptCount: number;
}): CaseStudioResponse => ({
	assistantMessage: args.searchState === 'not-found-yet'
		? (args.language === 'fr'
			? args.intent.explicitCitations.length
				? `Je n ai pas encore pu verifier les citations demandees (${args.coverage.missingTargets.join(', ')}) dans les passages recuperes du pack actif. Recherche obligatoire active: je continue la recherche ciblee dans ce meme pack et je ne vais pas pivoter vers un autre sujet.`
				: `Je n ai pas encore recupere assez de passages exacts lies a votre demande (${args.coverage.missingTargets.join(', ') || cleanText(args.message)}). Je continue la recherche ciblee dans ce meme pack et je ne vais pas pivoter vers un autre sujet.`
			: args.intent.explicitCitations.length
				? `I have not yet verified the requested citations (${args.coverage.missingTargets.join(', ')}) in the retrieved passages from the active pack. I will continue targeted search inside this same pack and will not pivot to another topic.`
				: `I have not yet retrieved enough exact passages tied to your request (${args.coverage.missingTargets.join(', ') || cleanText(args.message)}). I will continue targeted search inside this same pack and will not pivot to another topic.`)
		: (args.language === 'fr'
			? args.intent.explicitCitations.length
				? `Apres ${args.attemptCount} passe(s) de recherche ciblee dans le pack actif, je n ai pas pu verifier les citations demandees (${args.coverage.missingTargets.join(', ')}). Je ne vais pas pivoter vers un autre sujet.`
				: `Apres ${args.attemptCount} passe(s) de recherche ciblee dans le pack actif, je n ai toujours pas recupere assez de passages exacts pour cette demande (${args.coverage.missingTargets.join(', ') || cleanText(args.message)}). Je ne vais pas pivoter vers un autre sujet.`
			: args.intent.explicitCitations.length
				? `After ${args.attemptCount} targeted retrieval pass(es) in the active pack, I still could not verify the requested citations (${args.coverage.missingTargets.join(', ')}). I will not pivot to another topic.`
				: `After ${args.attemptCount} targeted retrieval pass(es) in the active pack, I still did not retrieve enough exact passages for this request (${args.coverage.missingTargets.join(', ') || cleanText(args.message)}). I will not pivot to another topic.`),
	analysis: {
		understoodGoal: cleanText(args.intent.rawText, cleanText(args.message, args.language === 'fr' ? 'Objectif a confirmer.' : 'Goal needs confirmation.')),
		jurisdiction: args.dossier.jurisdiction,
		sourceSummary: args.dossier.sourceSummary,
		missingSources: args.coverage.missingTargets,
		limits: mergeStringArrays(args.dossier.limits, [args.coverage.reason]),
		judgeModeFit: 'low',
		judgeModeRationale: args.language === 'fr'
			? 'Verdict ne doit pas generer ni changer de sujet tant que la demande n est pas couverte par des passages exacts du pack actif.'
			: 'Verdict should not generate or switch topics until the request is covered by exact passages from the active pack.',
		canGenerate: false,
		confidence: 'low'
	},
	dossier: args.dossier,
	draft: null,
	alternatives: [],
	options: [],
	workflow: {
		stage: 'source-reviewed',
		sourceCount: args.sourceCount,
		nextStep: args.searchState === 'not-found-yet'
			? (args.language === 'fr'
				? 'Precisez les articles, sections, ou mots-cles prioritaires et je relance la recherche dans ce meme pack actif.'
				: 'Name the priority articles, sections, or keywords and I will rerun search in this same active pack.')
			: (args.language === 'fr'
				? 'La recherche ciblee dans le pack actif est epuisee pour cette demande. Vous pouvez soit restreindre l objectif, soit ajouter de nouvelles sources si ce point n est pas dans le pack.'
				: 'Targeted retrieval in the active pack is exhausted for this request. You can either narrow the objective or add new sources if this point is not in the pack.')
	}
});

const MIN_PACK_RETRIEVAL_BUDGET = 2;
const MAX_PACK_RETRIEVAL_BUDGET = 8;
const MIN_TARGETED_RETRIEVAL_PASSES = 3;
const MIN_GENERIC_RETRIEVAL_PASSES = 2;

const coverageRank = (coverage: 'low' | 'medium' | 'high'): number => (
	coverage === 'high' ? 2 : coverage === 'medium' ? 1 : 0
);

const computePackRetrievalBudget = (args: {
	sourceCount: number;
	bundle: SourceBundle;
	evidence: EvidenceSufficiency;
	packMemory?: PackMemory | null;
}): number => {
	let budget = MIN_PACK_RETRIEVAL_BUDGET;
	if (args.sourceCount >= 3) budget += 1;
	if (args.sourceCount >= 8) budget += 1;
	if (args.bundle.coverage === 'low') budget += 1;
	if (args.evidence.coverage === 'low') budget += 1;
	if (args.evidence.missingConcepts.length >= 2) budget += 1;
	if (args.evidence.fetchMore.length >= 2) budget += 1;
	if ((args.packMemory?.authorities.length ?? 0) >= 12) budget += 1;
	return Math.min(MAX_PACK_RETRIEVAL_BUDGET, Math.max(MIN_PACK_RETRIEVAL_BUDGET, budget));
};

const evidenceFingerprint = (evidence: EvidenceSufficiency): string => JSON.stringify({
	coverage: evidence.coverage,
	canProceed: evidence.canProceed,
	missingConcepts: [...evidence.missingConcepts].sort(),
	fetchMore: [...evidence.fetchMore].sort()
});

const retrievalImproved = (args: {
	currentBundle: SourceBundle;
	currentEvidence: EvidenceSufficiency;
	nextBundle: SourceBundle;
	nextEvidence: EvidenceSufficiency;
}): boolean => {
	if (args.nextEvidence.canProceed && !args.currentEvidence.canProceed) return true;
	if (coverageRank(args.nextEvidence.coverage) > coverageRank(args.currentEvidence.coverage)) return true;
	if (coverageRank(args.nextBundle.coverage) > coverageRank(args.currentBundle.coverage)) return true;
	if (args.nextBundle.excerptCount > args.currentBundle.excerptCount && args.nextBundle.coverage !== 'low') return true;
	if (args.nextEvidence.missingConcepts.length < args.currentEvidence.missingConcepts.length) return true;
	if (args.nextEvidence.fetchMore.length < args.currentEvidence.fetchMore.length) return true;
	return evidenceFingerprint(args.nextEvidence) !== evidenceFingerprint(args.currentEvidence)
		&& args.nextBundle.sourceCount >= args.currentBundle.sourceCount;
};

const buildDeterministicSourceNavigationPlan = (args: {
	buildEvidenceQuery: string;
	retryPass: number;
	retrievalBudget: number;
	evidenceSufficiency: EvidenceSufficiency;
	packMemory: PackMemory;
}): SourceNavigationPlan => {
	const missingAuthorities = args.packMemory.authorities.filter((authority) =>
		args.evidenceSufficiency.fetchMore.includes(authority.authorityId)
	);
	const missingAuthorityNotes = missingAuthorities
		.map((authority) => `${authority.authorityId}: ${authority.sourceTitle}${authority.citation ? ` ${authority.citation}` : ''} | ${authority.retrievalNotes}`)
		.join('\n');
	const authorityCitations = missingAuthorities.flatMap((authority) => [authority.citation, authority.authorityId]);
	const expandedQuery = `${args.buildEvidenceQuery}

PACK MEMORY EXPANSION REQUEST
Retrieval pass: ${args.retryPass} of ${args.retrievalBudget}
Missing concepts: ${args.evidenceSufficiency.missingConcepts.join('; ') || 'none listed'}
Fetch authority IDs:
${missingAuthorityNotes || args.evidenceSufficiency.fetchMore.join('\n') || 'none listed'}

Retrieve broader exact evidence for the main rule, related exceptions, defences, definitions, counter-arguments, neighboring provisions, and limits before drafting.`;

	return {
		action: 'retrieve',
		expandedQuery,
		citations: mergeStringArrays(args.evidenceSufficiency.missingConcepts, authorityCitations),
		rationale: 'Deterministic Pack Memory expansion requested broader exact evidence inside the same pack.',
		stopReason: ''
	};
};

const buildSpecificityPattern = /\b(article|section|case|fact|facts|issue|issues|level|plaintiff|defendant|skill|source|sources|revise|same|keep|change|add|remove|harder|easier|focus|using|with|contract|damages|harassment|dismissal|charter|preuve|fait|faits|question|niveau|demandeur|defendeur|défendeur|competence|compétence|source|sources|reviser|réviser|garde|change|ajoute|retire|plus difficile|plus facile|focus|avec|contrat|dommages|harcelement|harcèlement|congediement|congédiement|charte)\b/i;

const needsBuildClarification = (message: string, hasCurrentDraft: boolean, hasSelectedSources: boolean): boolean => {
	if (hasCurrentDraft || hasSelectedSources) return false;
	const trimmed = cleanText(message).toLowerCase();
	if (!trimmed) return true;
	if (/\b(random|aleatoire|aléatoire)\b/.test(trimmed)) return false;
	if (buildSpecificityPattern.test(trimmed)) return false;
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length >= 7) return false;
	const genericWordCount = words.filter((word) => genericBuildTerms.has(word)).length;
	return words.length <= 3 || genericWordCount >= Math.max(2, Math.ceil(words.length * 0.6));
};

const buildClarificationResponse = (args: {
	language: 'en' | 'fr';
	sourceCount: number;
	dossier: CaseStudioSourceDossier | null;
}): CaseStudioResponse => {
	const { language, sourceCount, dossier } = args;
	return {
		assistantMessage: language === 'fr'
			? 'Avant de construire le cas, j ai besoin d un angle plus precis: dites-moi la notion a faire pratiquer, le niveau vise, et la question litigieuse ou l article que vous voulez travailler.'
			: 'Before I build the case, I need a sharper angle: tell me the concept to train, the target level, and the dispute or article you want the exercise to test.',
		analysis: {
			understoodGoal: language === 'fr' ? 'Objectif encore trop large pour lancer une redaction fiable.' : 'Goal is still too broad to start a reliable draft.',
			jurisdiction: cleanText(dossier?.jurisdiction, language === 'fr' ? 'A confirmer' : 'To be confirmed'),
			sourceSummary: cleanText(
				dossier?.sourceSummary,
				language === 'fr'
					? 'Precisez d abord le point a travailler; je lirai ensuite les passages utiles seulement.'
					: 'Narrow the target first; I will then pull only the passages needed for the build.'
			),
			missingSources: [],
			limits: [language === 'fr' ? 'Demande initiale trop vague pour un exercice source-fonde honnete.' : 'Initial request is too vague for an honest source-grounded exercise.'],
			judgeModeFit: dossier?.judgeModeFit ?? 'medium',
			judgeModeRationale: cleanText(
				dossier?.judgeModeRationale,
				language === 'fr'
					? 'Le mode juge depend du point exact a faire pratiquer.'
					: 'Judge-mode fit depends on the exact point you want students to practice.'
			),
			canGenerate: false,
			confidence: 'medium'
		},
		dossier,
		draft: null,
		alternatives: [],
		options: [],
		workflow: {
			stage: dossier ? 'source-reviewed' : 'conversation',
			sourceCount,
			nextStep: language === 'fr'
				? 'Repondez avec un angle precis, par exemple: niveau intermediaire, responsabilite contractuelle, focus sur tel article ou sur telle faille argumentative.'
				: 'Reply with a precise angle, for example: intermediate level, contractual liability, focus on a named article or on a specific argumentative gap.'
		}
	};
};

const attachSourceBundleToResponse = (
	response: CaseStudioResponse,
	sourceBundle: SourceBundle,
	packMemory?: PackMemory,
	evidenceSufficiency?: EvidenceSufficiency
): CaseStudioResponse => ({
	...response,
	draft: response.draft ? { ...response.draft, sourceBundle, packMemory, evidenceSufficiency } : null,
	options: response.options.map((option) => ({ ...option, sourceBundle, packMemory, evidenceSufficiency })),
	alternatives: response.alternatives.map((option) => ({ ...option, sourceBundle, packMemory, evidenceSufficiency }))
});

const normaliseLevel = (value: unknown): CaseStudioOption['level'] => {
	const level = String(value ?? '').toLowerCase();
	if (level === 'advanced') return 'advanced';
	if (level === 'introductory') return 'introductory';
	return 'intermediate';
};

const normaliseRole = (value: unknown): CaseStudioOption['recommendedRole'] =>
	value === 'defendant' ? 'defendant' : 'plaintiff';

const normaliseConfidence = (value: unknown): CaseStudioAnalysis['confidence'] => {
	const confidence = String(value ?? '').toLowerCase();
	if (confidence === 'high') return 'high';
	if (confidence === 'low') return 'low';
	return 'medium';
};

const normaliseJudgeModeFit = (value: unknown): CaseStudioAnalysis['judgeModeFit'] => {
	const fit = String(value ?? '').toLowerCase();
	if (fit === 'high') return 'high';
	if (fit === 'low') return 'low';
	return 'medium';
};

const normaliseJudgeBrief = (
	value: unknown,
	language: 'en' | 'fr',
	fallbackSkill: string
): CaseStudioOption['judgeBrief'] => {
	const brief = asRecord(value);
	const primarySkill = cleanText(
		brief.primarySkill,
		fallbackSkill || (language === 'fr' ? 'Raisonnement juridique' : 'Legal reasoning')
	).slice(0, 160);
	const fallbackIssues = language === 'fr'
		? ['Relier chaque argument a la question juridique centrale.']
		: ['Tie each argument back to the central legal issue.'];
	const fallbackPressure = language === 'fr'
		? ['Signaler quand une affirmation depasse ce que les sources permettent.']
		: ['Flag any claim that goes beyond what the sources actually support.'];
	const fallbackBoundaries = language === 'fr'
		? ['Ne pas inventer d autorites ou de faits absents du pack juridique actif.']
		: ['Do not invent authorities or facts absent from the active legal pack.'];
	const fallbackSuccess = language === 'fr'
		? ['Argument structure, fidele aux faits stipules et appuye sur les sources autorisees.']
		: ['Argument is structured, faithful to the stipulated facts, and grounded in the allowed sources.'];

	return {
		goal: cleanText(
			brief.goal,
			language === 'fr'
				? 'Verifier si l etudiant peut soutenir une position de facon honnete a partir du pack juridique actif.'
				: 'Test whether the student can honestly defend a position using the active legal pack.'
		),
		studentTask: cleanText(
			brief.studentTask,
			language === 'fr'
				? 'Plaidez un camp a partir des faits stipules et des sources autorisees.'
				: 'Argue one side using the stipulated facts and the allowed sources.'
		),
		hearingFocus: cleanText(
			brief.hearingFocus,
			language === 'fr'
				? 'Le juge teste le raisonnement, l usage des sources et le lien entre la reparation demandee et le droit.'
				: 'The judge tests reasoning, source use, and whether the requested remedy follows from the law.'
		),
		primarySkill,
		issuesToProbe: stringArray(brief.issuesToProbe).length ? stringArray(brief.issuesToProbe) : fallbackIssues,
		pressurePoints: stringArray(brief.pressurePoints).length ? stringArray(brief.pressurePoints) : fallbackPressure,
		sourceBoundaries: stringArray(brief.sourceBoundaries).length ? stringArray(brief.sourceBoundaries) : fallbackBoundaries,
		successCriteria: stringArray(brief.successCriteria).length ? stringArray(brief.successCriteria) : fallbackSuccess
	};
};

const normaliseGroundingArea = (value: unknown): CaseStudioGroundingMapItem['area'] => {
	const area = String(value ?? '').trim();
	if (
		area === 'mainIssue' ||
		area === 'plaintiffTheory' ||
		area === 'defendantTheory' ||
		area === 'judgePressurePoint' ||
		area === 'successCriteria' ||
		area === 'sourceBoundary'
	) {
		return area;
	}
	return 'other';
};

const normaliseGroundingMap = (value: unknown): CaseStudioGroundingMapItem[] =>
	Array.isArray(value)
		? value.slice(0, 10).map((entry) => {
				const item = asRecord(entry);
				return {
					area: normaliseGroundingArea(item.area),
					claim: cleanText(item.claim, 'Source-supported exercise point.'),
					sourceTitle: cleanText(item.sourceTitle, 'Selected source'),
					citation: cleanText(item.citation) || undefined,
					excerpt: cleanText(item.excerpt) || undefined,
					status: 'needs-review',
					note: cleanText(item.note) || undefined
				};
			})
		: [];

const pendingGroundingAudit = (
	groundingMap: CaseStudioGroundingMapItem[],
	language: 'en' | 'fr'
): CaseStudioGroundingAudit => ({
	status: 'needs-review',
	summary: language === 'fr'
		? 'Audit serveur en attente.'
		: 'Pending server audit.',
	warnings: [],
	blockedReasons: [],
	checks: {
		sourceTitlesVerified: false,
		citationsVerified: false,
		noOutsideProofRequired: false,
		judgeModeAligned: false,
		sourceBoundariesComplete: false,
		groundingMapComplete: false
	},
	groundingMap
});

const buildPackSignature = (pack: PackPayload, sourceIds: string[], language: 'en' | 'fr'): string => {
	const signatureSeed = JSON.stringify({
		packId: cleanText(pack.packId),
		jurisdiction: cleanText(pack.jurisdiction),
		domain: cleanText(pack.domain),
		language,
		sourceIds: [...sourceIds].sort()
	});
	return createHash('sha256').update(signatureSeed).digest('hex');
};

const pruneExpiredDossiers = (): void => {
	const now = Date.now();
	for (const [key, entry] of dossierCache) {
		if (entry.expiresAt <= now) dossierCache.delete(key);
	}
};

const readCachedDossier = (cacheKey: string): CaseStudioSourceDossier | null => {
	pruneExpiredDossiers();
	return dossierCache.get(cacheKey)?.dossier ?? null;
};

const writeCachedDossier = (cacheKey: string, dossier: CaseStudioSourceDossier): void => {
	pruneExpiredDossiers();
	if (dossierCache.size >= DOSSIER_CACHE_LIMIT) {
		const oldestKey = dossierCache.keys().next().value;
		if (oldestKey) dossierCache.delete(oldestKey);
	}
	dossierCache.set(cacheKey, {
		dossier,
		expiresAt: Date.now() + DOSSIER_CACHE_TTL_MS
	});
};

const fallbackSourceLabel = (source: SourceMaterial): string => {
	const title = cleanText(source.title, 'Selected source');
	const descriptor = cleanText(source.description, cleanText(source.content).slice(0, 220));
	return descriptor ? `${title}: ${descriptor.slice(0, 220)}` : title;
};

const buildFallbackDossier = (args: {
	sources: SourceMaterial[];
	language: 'en' | 'fr';
	packSignature: string;
	fallbackJurisdiction: string;
	pack: PackPayload;
}): CaseStudioSourceDossier => {
	const sourceLabels = args.sources.slice(0, 6).map(fallbackSourceLabel);
	const sourceTitles = args.sources
		.map((source) => cleanText(source.title))
		.filter(Boolean)
		.slice(0, 8);
	const domain = cleanText(args.pack.domain, args.language === 'fr' ? 'domaine non precise' : 'unspecified domain');

	return {
		packSignature: args.packSignature,
		generatedAt: new Date().toISOString(),
		jurisdiction: args.fallbackJurisdiction,
		language: args.language,
		sourceSummary: args.language === 'fr'
			? `Verdict a charge ${args.sources.length} source(s) du pack juridique actif pour ${domain}. Le resume analytique automatique n a pas ete produit; la redaction doit donc se limiter au bloc SOURCES brut et aux titres charges: ${sourceTitles.join('; ') || 'sources du pack'}.`
			: `Verdict loaded ${args.sources.length} source(s) from the active legal pack for ${domain}. The automatic analytical dossier was not produced, so drafting must stay limited to the raw SOURCES block and loaded titles: ${sourceTitles.join('; ') || 'pack sources'}.`,
		strengths: sourceLabels.length
			? sourceLabels
			: [args.language === 'fr' ? 'Texte du pack juridique charge cote serveur.' : 'Active legal pack text loaded on the server.'],
		limits: [
			args.language === 'fr'
				? 'Le modele n a pas fourni de cartographie analytique JSON fiable pour ce tour; verifier chaque element contre le bloc SOURCES brut.'
				: 'The model did not provide a reliable JSON analytical map for this turn; verify every exercise element against the raw SOURCES block.'
		],
		missingCoverage: [],
		supportedSkills: args.language === 'fr'
			? ['Raisonnement juridique fonde sur les sources', 'Identification des limites du dossier', 'Argumentation orale structuree']
			: ['Source-grounded legal reasoning', 'Identifying record limits', 'Structured oral argument'],
		exerciseDirections: args.language === 'fr'
			? ['Construire un exercice strictement limite aux sources chargees.', 'Eviter tout article, precedent ou fait absent du bloc SOURCES.']
			: ['Build an exercise strictly limited to the loaded sources.', 'Avoid any statute, precedent, or fact absent from the SOURCES block.'],
		judgeModeFit: 'medium',
		judgeModeRationale: args.language === 'fr'
			? 'Le texte des sources est disponible pour un exercice de mode juge, mais l adequation precise doit etre verifiee pendant la redaction parce que la cartographie automatique a echoue.'
			: 'The source text is available for a Judge-mode exercise, but precise fit must be verified during drafting because the automatic map failed.'
	};
};

const dossierFromPackMemory = (args: {
	memory: NonNullable<CaseStudioSourceDossier['packMemory']>;
	geminiCache?: CaseStudioSourceDossier['geminiCache'];
	language: 'en' | 'fr';
}): CaseStudioSourceDossier => {
	const topicLabels = args.memory.topics.map((topic) => topic.topic).filter(Boolean).slice(0, 6);
	const authorityLabels = args.memory.authorities
		.map((authority) => [authority.sourceTitle, authority.citation].filter(Boolean).join(' — '))
		.filter(Boolean)
		.slice(0, 8);
	const sourceSummary = args.memory.summary || (args.language === 'fr'
		? 'Les sources ont ete indexees en carte de navigation; les passages exacts restent obligatoires.'
		: 'The sources were indexed into a navigation map; exact passages remain mandatory.');

	return {
		packSignature: args.memory.packSignature,
		generatedAt: args.memory.generatedAt,
		jurisdiction: args.memory.jurisdiction,
		language: args.language,
		sourceSummary,
		strengths: topicLabels.length
			? topicLabels
			: (args.language === 'fr'
				? ['Memoire de pack disponible pour orienter la recherche exacte dans les sources.']
				: ['Pack Memory is available to guide exact source retrieval.']),
		limits: args.memory.safetyRules.length
			? args.memory.safetyRules
			: [args.language === 'fr'
				? 'La memoire de pack est une carte; les passages exacts restent obligatoires.'
				: 'Pack Memory is a map; exact passages are still mandatory.'],
		missingCoverage: args.memory.gaps,
		supportedSkills: topicLabels.length
			? topicLabels.map((topic) => args.language === 'fr' ? `Raisonner sur ${topic}` : `Reasoning about ${topic}`)
			: (args.language === 'fr'
				? ['Raisonnement juridique fonde sur les sources']
				: ['Source-grounded legal reasoning']),
		exerciseDirections: authorityLabels.length
			? authorityLabels.map((label) => args.language === 'fr' ? `Construire autour de ${label}` : `Build around ${label}`)
			: topicLabels,
		judgeModeFit: args.memory.authorities.length >= 3 ? 'high' : args.memory.authorities.length ? 'medium' : 'low',
		judgeModeRationale: args.language === 'fr'
			? 'La memoire de pack indique les autorites a recuperer et verifier avant tout exercice de mode juge.'
			: 'Pack Memory identifies the authorities to retrieve and verify before any Judge-mode exercise.',
		packMemory: args.memory,
		geminiCache: args.geminiCache
	};
};

const renderDossierBlock = (dossier: CaseStudioSourceDossier): string =>
	`SOURCE DOSSIER
${JSON.stringify(
		{
			jurisdiction: dossier.jurisdiction,
			sourceSummary: dossier.sourceSummary,
			strengths: dossier.strengths,
			limits: dossier.limits,
			missingCoverage: dossier.missingCoverage,
			supportedSkills: dossier.supportedSkills,
			exerciseDirections: dossier.exerciseDirections,
			judgeModeFit: dossier.judgeModeFit,
			judgeModeRationale: dossier.judgeModeRationale,
			packMemory: dossier.packMemory
				? {
					version: dossier.packMemory.version,
					generatedAt: dossier.packMemory.generatedAt,
					sourceFingerprint: dossier.packMemory.sourceFingerprint,
					topicCount: dossier.packMemory.topics.length,
					authorityCount: dossier.packMemory.authorities.length,
					gaps: dossier.packMemory.gaps,
					safetyRules: dossier.packMemory.safetyRules
				}
				: null,
			geminiCache: dossier.geminiCache ?? null
		},
		null,
		2
	)}`;

const normaliseDossier = (
	raw: string,
	language: 'en' | 'fr',
	packSignature: string,
	fallbackJurisdiction: string
): CaseStudioSourceDossier => {
	const parsed = parseJsonObject(raw);
	return {
		packSignature,
		generatedAt: cleanText(parsed.generatedAt, new Date().toISOString()),
		jurisdiction: cleanText(parsed.jurisdiction, fallbackJurisdiction),
		language,
		sourceSummary: cleanText(
			parsed.sourceSummary,
			language === 'fr' ? 'Sources lues; resume de pack non fourni.' : 'Sources read; no pack summary provided.'
		),
		strengths: stringArray(parsed.strengths),
		limits: stringArray(parsed.limits),
		missingCoverage: mergeStringArrays(parsed.missingCoverage, parsed.missingSources),
		supportedSkills: stringArray(parsed.supportedSkills),
		exerciseDirections: stringArray(parsed.exerciseDirections),
		judgeModeFit: normaliseJudgeModeFit(parsed.judgeModeFit),
		judgeModeRationale: cleanText(
			parsed.judgeModeRationale,
			language === 'fr'
				? 'Le pack doit encore etre evalue en fonction de la demande precise de l enseignant.'
				: 'The pack still needs to be assessed against the teacher s specific request.'
		)
	};
};

const normaliseResponse = (
	raw: string,
	language: 'en' | 'fr',
	sourceCount: number,
	options: {
		dossier?: CaseStudioSourceDossier | null;
		assistantMessage?: string;
		nextStep?: string;
	} = {}
): CaseStudioResponse => {
	const parsed = parseJsonObject(raw);
	const analysisRaw = asRecord(parsed.analysis);
	const optionRows = Array.isArray(parsed.options) ? parsed.options.slice(0, 3) : [];

	const generatedOptions: CaseStudioOption[] = optionRows.map((row, index) => {
		const option = asRecord(row);
		const practicePoints = stringArray(option.practicePoints);
		const groundingMap = normaliseGroundingMap(option.groundingMap);
		const targetSkill = cleanText(
			option.targetSkill,
			practicePoints[0] ?? (language === 'fr' ? 'Raisonnement juridique' : 'Legal reasoning')
		).slice(0, 160);
		const sourcesUsed = Array.isArray(option.sourcesUsed)
			? option.sourcesUsed.slice(0, 8).map((source) => {
					const sourceRecord = asRecord(source);
					return {
						title: cleanText(sourceRecord.title, language === 'fr' ? 'Source selectionnee' : 'Selected source'),
						citation: cleanText(sourceRecord.citation),
						reason: cleanText(sourceRecord.reason, language === 'fr' ? 'Source utilisee pour ce cas.' : 'Source used for this case.')
					};
				})
			: [];

		return {
			id: cleanText(option.id, `option-${index + 1}`),
			title: cleanText(option.title, language === 'fr' ? `Option ${index + 1}` : `Option ${index + 1}`),
			level: normaliseLevel(option.level),
			objective: cleanText(option.objective, language === 'fr' ? 'Objectif pedagogique non precise.' : 'Teaching objective not specified.'),
			targetSkill,
			synopsis: cleanText(option.synopsis, language === 'fr' ? 'Scenario non genere.' : 'No scenario generated.'),
			issues: cleanText(option.issues, language === 'fr' ? 'Question juridique non precisee.' : 'Legal question not specified.'),
			plaintiffPosition: cleanText(option.plaintiffPosition, language === 'fr' ? 'Le demandeur cherche une reparation.' : 'The plaintiff seeks a remedy.'),
			defendantPosition: cleanText(option.defendantPosition, language === 'fr' ? 'Le defendeur conteste la demande.' : 'The defendant contests the claim.'),
			recommendedRole: normaliseRole(option.recommendedRole),
			sourcesUsed,
			practicePoints,
			difficultyTrap: cleanText(option.difficultyTrap, language === 'fr' ? 'Difficulte non precisee.' : 'Difficulty not specified.'),
			sourceWarnings: stringArray(option.sourceWarnings),
			judgeBrief: normaliseJudgeBrief(option.judgeBrief, language, targetSkill),
			groundingAudit: pendingGroundingAudit(groundingMap, language)
		};
	});

	const canGenerate = analysisRaw.canGenerate === false ? false : generatedOptions.length > 0;
	const draft = canGenerate ? generatedOptions[0] : null;
	const alternatives = canGenerate ? generatedOptions.slice(1) : [];
	const dossier = options.dossier ?? null;
	const defaultNextStep = draft
		? (language === 'fr'
			? 'Poursuivez la conversation pour raffiner ce même projet, changer son niveau ou ajuster la position des parties.'
			: 'Continue the conversation to refine this same draft, change its level, or adjust each side s position.')
		: (language === 'fr'
			? 'Precisez les articles, sections, ou points juridiques prioritaires pour que je poursuive la recherche dans le pack actif.'
			: 'Name the priority articles, sections, or legal points so I can continue retrieval in the active pack.');

	return {
		assistantMessage: cleanText(
			options.assistantMessage ?? parsed.assistantMessage,
			language === 'fr'
				? 'J’ai lu les passages pertinents du pack juridique actif. Voici ce qu’ils appuient, ce qui manque encore et le projet que je peux rédiger à partir de ce matériel.'
				: 'I read the relevant passages from the active legal pack. Here is what they support, what is still missing, and the draft I can build from that material.'
		),
		analysis: {
			understoodGoal: cleanText(analysisRaw.understoodGoal, language === 'fr' ? 'Objectif à confirmer.' : 'Goal needs confirmation.'),
			jurisdiction: cleanText(analysisRaw.jurisdiction, dossier?.jurisdiction ?? (language === 'fr' ? 'Non précisée' : 'Not specified')),
			sourceSummary: cleanText(
				analysisRaw.sourceSummary,
				dossier?.sourceSummary ?? (language === 'fr' ? 'Aucun résumé des sources.' : 'No source summary.')
			),
			missingSources: mergeStringArrays(analysisRaw.missingSources, dossier?.missingCoverage ?? []),
			limits: mergeStringArrays(analysisRaw.limits, dossier?.limits ?? []),
			judgeModeFit: normaliseJudgeModeFit(analysisRaw.judgeModeFit ?? dossier?.judgeModeFit),
			judgeModeRationale: cleanText(
				analysisRaw.judgeModeRationale,
				dossier?.judgeModeRationale ??
					(language === 'fr'
						? 'Verdict n’a pas encore expliqué dans quelle mesure ce matériel convient vraiment au mode juge.'
						: 'Verdict has not yet explained how well this material fits Judge mode.')
			),
			canGenerate,
			confidence: normaliseConfidence(analysisRaw.confidence ?? (canGenerate ? 'high' : 'medium'))
		},
		dossier,
		draft,
		alternatives,
		options: canGenerate ? generatedOptions : [],
		workflow: {
			stage: draft ? 'draft-ready' : 'source-reviewed',
			sourceCount,
			nextStep: cleanText(options.nextStep, defaultNextStep)
		}
	};
};

const normaliseConversationResponse = (
	raw: string,
	language: 'en' | 'fr',
	sourceCount: number,
	options: {
		dossier: CaseStudioSourceDossier | null;
		sourceReviewed: boolean;
	}
): CaseStudioResponse => {
	const parsed = parseJsonObject(raw);
	const analysisRaw = asRecord(parsed.analysis);
	const dossier = options.dossier;
	const nextStep = cleanText(
		parsed.nextStep,
		options.sourceReviewed
			? (language === 'fr'
				? 'Continuez la conversation ou demandez-moi de créer le pack d’exercice quand l’orientation est bonne.'
				: 'Keep talking through the idea, or ask me to create the exercise pack when the direction feels right.')
			: (language === 'fr'
				? 'Si vous voulez un exercice fondé sur vos sources, je peux fouiller le pack juridique actif puis construire le cas avec vous.'
				: 'If you want a source-grounded exercise, I can search the active legal pack and then build the case with you.')
	);

	return {
		assistantMessage: cleanText(
			parsed.assistantMessage,
			options.sourceReviewed
				? (language === 'fr'
					? 'J’ai lu les passages pertinents du pack juridique actif. Dites-moi ce que vous voulez faire pratiquer, et je vous guiderai à partir de ce qu’ils appuient réellement.'
					: 'I read the relevant passages from the active legal pack. Tell me what you want students to practice, and I will guide you from what they actually support.')
				: (language === 'fr'
					? 'Je peux vous aider à cadrer votre idée en langage simple. Quand vous voudrez une lecture fondée sur les sources ou un exercice complet, je pourrai fouiller le pack juridique actif et construire à partir de ses passages pertinents.'
					: 'I can help shape your idea in plain language. When you want a source-grounded read or a full exercise, I can search the active legal pack and build from its relevant passages.')
		),
		analysis: {
			understoodGoal: cleanText(analysisRaw.understoodGoal, language === 'fr' ? 'Objectif en cours de clarification.' : 'Goal is still being clarified.'),
			jurisdiction: cleanText(
				analysisRaw.jurisdiction,
				dossier?.jurisdiction ??
					(options.sourceReviewed
						? (language === 'fr' ? 'Selon le pack juridique actif.' : 'From the active legal pack.')
						: (language === 'fr' ? 'Non évaluée sans lecture des sources.' : 'Not assessed without source reading.'))
			),
			sourceSummary: cleanText(
				analysisRaw.sourceSummary,
				dossier?.sourceSummary ??
					(options.sourceReviewed
						? (language === 'fr' ? 'Sources lues; résumé non fourni.' : 'Sources read; no source summary provided.')
						: (language === 'fr' ? 'Aucune lecture des sources dans ce tour.' : 'No source reading performed in this turn.'))
			),
			missingSources: mergeStringArrays(analysisRaw.missingSources, dossier?.missingCoverage ?? []),
			limits: mergeStringArrays(analysisRaw.limits, dossier?.limits ?? []),
			judgeModeFit: normaliseJudgeModeFit(
				analysisRaw.judgeModeFit ?? (options.sourceReviewed ? dossier?.judgeModeFit : 'medium')
			),
			judgeModeRationale: cleanText(
				analysisRaw.judgeModeRationale,
				dossier?.judgeModeRationale ??
					(options.sourceReviewed
						? (language === 'fr'
							? 'Verdict clarifie encore si la demande peut devenir un exercice de mode juge honnête.'
							: 'Verdict is still clarifying whether this request can honestly become a Judge-mode exercise.')
						: (language === 'fr'
							? 'Le mode juge pourra être évalué une fois les sources passées en revue.'
							: 'Judge-mode fit can be assessed once the sources have been reviewed.'))
			),
			canGenerate: false,
			confidence: normaliseConfidence(analysisRaw.confidence ?? 'medium')
		},
		dossier,
		draft: null,
		alternatives: [],
		options: [],
		workflow: {
			stage: options.sourceReviewed ? 'source-reviewed' : 'conversation',
			sourceCount,
			nextStep
		}
	};
};

const structuredBuildFallbackResponse = (args: {
	language: 'en' | 'fr';
	message: string;
	sourceCount: number;
	dossier: CaseStudioSourceDossier;
}): CaseStudioResponse => {
	const outputFailureLimit = args.language === 'fr'
		? 'Le moteur de rédaction n’a pas retourné un document structuré fiable pour ce tour.'
		: 'The drafting engine did not return a reliable structured document for this turn.';
	return {
		assistantMessage: args.language === 'fr'
			? 'J’ai pu charger le pack juridique, mais la rédaction structurée n’a pas abouti de façon fiable. Je ne vais pas fabriquer un papier incertain. Essayez une demande plus étroite, puis relancez la création.'
			: 'I was able to load the active legal pack, but structured drafting did not complete reliably. I will not fabricate an uncertain paper. Try a narrower request, then run Create again.',
		analysis: {
			understoodGoal: cleanText(args.message, args.language === 'fr' ? 'Objectif a confirmer.' : 'Goal needs confirmation.'),
			jurisdiction: args.dossier.jurisdiction,
			sourceSummary: args.dossier.sourceSummary,
			missingSources: args.dossier.missingCoverage,
			limits: mergeStringArrays(args.dossier.limits, [outputFailureLimit]),
			judgeModeFit: args.dossier.judgeModeFit,
			judgeModeRationale: args.dossier.judgeModeRationale,
			canGenerate: false,
			confidence: 'low'
		},
		dossier: args.dossier,
		draft: null,
		alternatives: [],
		options: [],
		workflow: {
			stage: 'source-reviewed',
			sourceCount: args.sourceCount,
			nextStep: args.language === 'fr'
				? 'Reformulez l objectif en une tache plus precise, puis demandez-moi de recreer le papier.'
				: 'Restate the goal as a more precise task, then ask me to recreate the paper.'
		}
	};
};

const renderBundleOverviewBlock = (pack: PackPayload, sourceCount: number): string => {
	const titles = Array.isArray(pack.sourceTitles) ? pack.sourceTitles.filter(Boolean).slice(0, 8) : [];
	const titleLines = titles.length ? titles.map((title) => `- ${title}`).join('\n') : '- No titles provided';
	return `CONNECTED SOURCE SET
Pack: ${cleanText(pack.packName, 'Active legal pack')}
Domain metadata: ${cleanText(pack.domain, 'General')}
Pack sources available: ${sourceCount}
Source titles:
${titleLines}`;
};

const renderLanguageQualityBlock = (language: 'en' | 'fr'): string => language === 'fr'
	? `LANGUAGE QUALITY RULES
- Écrivez dans un français canadien naturel, idiomatique et soigné.
- Relisez chaque phrase visible avant de retourner le JSON final.
- Corrigez systématiquement accents, apostrophes, accords, conjugaisons, ponctuation et espaces.
- N’imitez jamais un style télégraphique, sans accents, ou trop proche du prompt.
- Si une phrase sonne raide ou bancale, réécrivez-la plus simplement mais correctement.`
	: `LANGUAGE QUALITY RULES
- Write in polished, idiomatic English.
- Proofread every visible sentence before returning the final JSON.
- Fix grammar, tense, agreement, punctuation, and spacing.
- Never imitate telegraphic or prompt-like phrasing.
- If a sentence sounds awkward, rewrite it more simply but correctly.`;

const renderNormalChatContextBlock = (language: 'en' | 'fr'): string => language === 'fr'
	? `VERDICT — CONTEXTE PUBLIC
Tu es l assistant visible de Verdict dans cet espace de travail.
Ton role: aider un enseignant ou un etudiant en droit a clarifier ce qu il veut pratiquer, expliquer comment Verdict fonctionne ici, puis basculer vers un travail fonde sur les sources quand l utilisateur demande clairement une analyse documentaire ou un exercice.

ETAT DES SOURCES DANS CE TOUR
- Le moteur de lecture des sources n a PAS ete invoque.
- Tu n as pas acces aux titres, au contenu, au nombre, a la juridiction ni au domaine des documents selectionnes.
- Ne dis jamais "tes sources disent", "dans tes documents", "le pack contient", ou toute phrase qui implique que tu as lu les documents.
- Tu peux parler des sources seulement en termes generaux: "je peux fouiller le pack juridique actif et construire un exercice a partir des passages pertinents".
- Si l utilisateur demande si ses documents supportent quelque chose, dis que tu peux passer en revue les sources avant de conclure.`
	: `VERDICT — PUBLIC CONTEXT
You are Verdict, the visible assistant in this workspace.
Your role: help a teacher or law student clarify what they want to practice, explain how Verdict works here, then move into source-grounded work when the user is clearly asking for document-based analysis or exercise building.

SOURCE STATE IN THIS TURN
- The source-reading engine has NOT been invoked.
- You do not have access to selected document titles, contents, count, jurisdiction, or domain.
- Never say "your sources say", "in your documents", "the pack contains", or anything that implies you have read the documents.
- You may discuss sources only as a general capability: "I can search the active legal pack and build a grounded exercise from the relevant passages".
- If the user asks whether their documents support something, say you can review/check the sources before concluding.`;

const renderHistoryBlock = (history: StudioHistoryEntry[]): string => {
	const rows = history
		.slice(-MAX_HISTORY_MESSAGES)
		.map((entry) => {
			const role = entry.role === 'assistant' ? 'ASSISTANT' : entry.role === 'user' ? 'USER' : 'NOTE';
			const content = cleanText(entry.content).slice(0, 1_200);
			return content ? `[${role}] ${content}` : '';
		})
		.filter(Boolean);
	return rows.length ? `\n\nRECENT CREATE CHAT:\n${rows.join('\n\n')}` : '';
};

const renderRetrievalIntentHistoryBlock = (history: StudioHistoryEntry[]): string => {
	const rows = history
		.filter((entry) => entry.role === 'user')
		.slice(-MAX_HISTORY_MESSAGES)
		.map((entry) => cleanText(entry.content).slice(0, 600))
		.filter(Boolean);
	return rows.length ? rows.join('\n\n') : '';
};

const simpleGreetingPattern = /^(?:hi|hello|hey|hey there|hi there|hello there|good\s+(?:morning|afternoon|evening)|bonjour|salut|coucou|bonsoir)\s*[!.?]*$/i;

const isSimpleGreeting = (message: string): boolean => simpleGreetingPattern.test(cleanText(message));

const hasWorkingDraft = (draft: unknown): boolean => {
	const currentDraft = asRecord(draft);
	return Boolean(
		cleanText(currentDraft.title) ||
		cleanText(currentDraft.synopsis) ||
		cleanText(currentDraft.issues) ||
		cleanText(currentDraft.objective)
	);
};

const renderWorkingDraftBlock = (draft: unknown, others: unknown): string => {
	const currentDraft = asRecord(draft);
	const hasCurrentDraft = hasWorkingDraft(draft);

	const draftBlock = hasCurrentDraft
		? `\n\nCURRENT WORKING DRAFT (revise this draft in place unless the teacher explicitly asks to abandon it):
Title: ${cleanText(currentDraft.title, 'Untitled draft')}
Objective: ${cleanText(currentDraft.objective)}
Target skill: ${cleanText(currentDraft.targetSkill)}
Synopsis: ${cleanText(currentDraft.synopsis)}
Issues: ${cleanText(currentDraft.issues)}
Plaintiff position: ${cleanText(currentDraft.plaintiffPosition)}
Defendant position: ${cleanText(currentDraft.defendantPosition)}
Practice points: ${stringArray(currentDraft.practicePoints).join('; ')}`
		: '';

	if (!Array.isArray(others) || others.length === 0) return draftBlock;

	const rows = others.slice(0, 2).map((item, index) => {
		const option = asRecord(item);
		return `ALTERNATIVE ${index + 1}
Title: ${cleanText(option.title, `Alternative ${index + 1}`)}
Objective: ${cleanText(option.objective)}
Synopsis: ${cleanText(option.synopsis)}`;
	});

	return `${draftBlock}\n\nSECONDARY ALTERNATIVES (keep these secondary unless the user asks to switch):\n${rows.join('\n\n')}`;
};

const renderRetrievalDraftBlock = (draft: unknown): string => {
	const currentDraft = asRecord(draft);
	if (!hasWorkingDraft(draft)) return '';

	return [
		cleanText(currentDraft.title),
		cleanText(currentDraft.objective),
		cleanText(currentDraft.targetSkill),
		cleanText(currentDraft.synopsis),
		cleanText(currentDraft.issues)
	]
		.filter(Boolean)
		.join('\n\n');
};

const repairStructuredJsonWithLLM = async (args: {
	raw: string;
	language: 'en' | 'fr';
	schema: Record<string, unknown>;
	label: string;
	maxTokens: number;
}): Promise<string> => {
	const raw = args.raw.trim();
	if (!raw) throw new Error(`No malformed JSON content available to repair for ${args.label}.`);

	const systemPrompt = args.language === 'fr'
		? `Vous etes un reparateur JSON strict. Votre seule tache: corriger la syntaxe JSON d une reponse deja produite. Ne changez pas le sens, n ajoutez pas de faits, n inventez pas de sources, n expliquez rien. Retournez uniquement un objet JSON valide qui respecte le schema demande.`
		: `You are a strict JSON repair engine. Your only job is to fix the JSON syntax of an already-produced response. Do not change meaning, add facts, invent sources, or explain anything. Return only a valid JSON object matching the requested schema.`;
	const userPrompt = `Repair the malformed JSON below.

Rules:
- Fix missing commas, trailing commas, broken array separators, and unclosed brackets when the intended structure is clear.
- Preserve existing strings and values as much as possible.
- If an optional item is too broken to preserve, drop that item instead of inventing replacement content.
- Return one valid JSON object only.

MALFORMED JSON:
${raw.slice(0, 60_000)}`;

	return callLLM({
		task: 'create-chat',
		systemPrompt,
		userPrompt,
		temperature: 0,
		maxTokens: args.maxTokens,
		jsonMode: true,
		schema: args.schema
	});
};

const ensureCreateProviders = (): void => {
	if (isNewStackEnabled()) {
		if (!env.GOOGLE_API_KEY) throw error(500, 'GOOGLE_API_KEY is not configured.');
		return;
	}
	if (!env.LLM_API_KEY) throw error(500, 'LLM_API_KEY is not configured.');
};

const throwCreateProviderError = (err: unknown, fallbackMessage: string): never => {
	const errorMessage = err instanceof Error ? err.message : String(err);

	if (errorMessage.includes('invalid_api_key') || errorMessage.includes('Incorrect API key')) {
		throw error(503, 'AI service configuration error. Please contact support.');
	}
	if (errorMessage.includes('LLM_API_KEY is not configured') || errorMessage.includes('GOOGLE_API_KEY is not configured')) {
		throw error(503, 'AI service is not configured. Please contact support.');
	}
	if (
		errorMessage.includes('prepayment credits are depleted') ||
		errorMessage.includes('RESOURCE_EXHAUSTED') ||
		errorMessage.includes('insufficient_quota')
	) {
		throw error(503, 'Gemini API credits are depleted. Refill billing in AI Studio or switch the app back to the fallback provider.');
	}
	if (errorMessage.includes('rate_limit') || errorMessage.includes('429')) {
		throw error(429, 'AI service is temporarily busy. Please wait a moment and try again.');
	}

	throw error(500, fallbackMessage);
};

const shouldLogCaseStudioIntent = (): boolean => {
	const flag = (env.CASE_STUDIO_INTENT_LOG ?? '').toLowerCase();
	return dev || flag === '1' || flag === 'true' || flag === 'yes';
};

const logCaseStudioIntent = (args: {
	userId: string;
	message: string;
	requestedMode: StudioMode;
	resolvedMode: StudioMode;
	sourceEngineRequested: boolean;
	sourceCount: number;
	hasCurrentDraft: boolean;
	language: 'en' | 'fr';
	signals: string[];
}): void => {
	if (!shouldLogCaseStudioIntent()) return;

	console.info('[case-studio intent]', {
		user: args.userId.slice(0, 8),
		messageDigest: createHash('sha1').update(args.message).digest('hex').slice(0, 10),
		messageLength: args.message.length,
		requestedMode: args.requestedMode,
		resolvedMode: args.resolvedMode,
		sourceEngineRequested: args.sourceEngineRequested,
		sourceCount: args.sourceCount,
		hasCurrentDraft: args.hasCurrentDraft,
		language: args.language,
		signals: args.signals
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'case_studio', 12, 60_000);
	if (!rl.allowed) throw error(429, 'Too many requests. Please wait a moment and try again.');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') throw error(400, 'Invalid request body.');

	const requestedMode: StudioMode = (body as Record<string, unknown>).mode === 'build' ? 'build' : 'chat';
	const message = cleanText((body as Record<string, unknown>).message).slice(0, MAX_MESSAGE_CHARS);
	if (!message) throw error(400, 'Write a message before continuing in Create.');

	const requestedLanguage = (body as Record<string, unknown>).language === 'fr' ? 'fr' : 'en';
	const pack = asRecord((body as Record<string, unknown>).pack) as PackPayload;
	const requestedSourceIds = Array.isArray(pack.sourceIds) ? Array.from(new Set(pack.sourceIds.map(String).filter(Boolean))) : [];
	let sourceIds = requestedSourceIds;
	const packId = cleanText(pack.packId);
	if (packId) {
		try {
			const packWideSourceIds = Array.from(new Set(await loadPackSourceIds({
				supabase: locals.supabase,
				userId: session.user.id,
				packId
			})));
			if (!sourceIds.length && packWideSourceIds.length) {
				sourceIds = packWideSourceIds;
			} else if (sourceIds.length && packWideSourceIds.length) {
				const packWideSet = new Set(packWideSourceIds);
				const explicitOutsidePack = sourceIds.filter((id) => !packWideSet.has(id));
				if (explicitOutsidePack.length) {
					console.warn('[case-studio] Explicit source selection does not fully match persisted pack mapping; preserving explicit IDs for this request.', {
						requestedCount: sourceIds.length,
						persistedCount: packWideSourceIds.length,
						outsidePersistedCount: explicitOutsidePack.length
					});
				}
			}
		} catch (err) {
			console.error('[case-studio] Failed to resolve active pack sources:', err);
			throw error(500, 'Could not read the active legal pack.');
		}
	}

	const historyEntries = Array.isArray((body as Record<string, unknown>).history)
		? ((body as Record<string, unknown>).history as StudioHistoryEntry[])
		: [];
	const rawCurrentDraftPayload = (body as Record<string, unknown>).currentDraft;
	const rawHasCurrentDraft = hasWorkingDraft(rawCurrentDraftPayload);
	const rawOtherDrafts = (body as Record<string, unknown>).otherDrafts ?? (body as Record<string, unknown>).currentOptions;
	if (requestedMode === 'chat' && historyEntries.length === 0 && !rawHasCurrentDraft && isSimpleGreeting(message)) {
		const greetingEnvelope = requestedLanguage === 'fr'
			? {
				assistantMessage: 'Bonjour. Qu’est-ce que vous voulez construire ou faire pratiquer ?',
				nextStep: 'Donnez-moi le type de cas, le niveau, ou le point juridique que vous visez.'
			}
			: {
				assistantMessage: 'Hi. What would you like to build or have students practice?',
				nextStep: 'Tell me the kind of case, level, or legal point you want to work on.'
			};

		return json(normaliseConversationResponse(JSON.stringify(greetingEnvelope), requestedLanguage, sourceIds.length, {
			dossier: null,
			sourceReviewed: false
		}), {
			headers: { 'Cache-Control': 'no-store, max-age=0' }
		});
	}
	const detectedIntent = classifyCaseStudioIntent(message, {
		hasSelectedSources: sourceIds.length > 0,
		hasGroundedDraft: rawHasCurrentDraft
	});
	const resetBuild = detectedIntent.signals.includes('reset-build');
	const currentDraftPayload = resetBuild ? null : rawCurrentDraftPayload;
	const hasCurrentDraft = resetBuild ? false : rawHasCurrentDraft;
	const historyBlock = renderHistoryBlock(resetBuild ? [] : historyEntries);
	const retrievalIntentHistoryBlock = renderRetrievalIntentHistoryBlock(resetBuild ? [] : historyEntries);
	const workingDraftBlock = renderWorkingDraftBlock(currentDraftPayload, resetBuild ? [] : rawOtherDrafts);
	const retrievalDraftBlock = renderRetrievalDraftBlock(currentDraftPayload);
	let requestIntent = buildSourceGroundedRequestIntent({
		message,
		history: resetBuild ? [] : historyEntries
	});
	const mode: StudioMode = detectedIntent.mode;
	const retrievalJob = buildCaseStudioRetrievalJob({
		userRequest: message,
		history: resetBuild ? [] : historyEntries,
		mode,
		sourceBound: detectedIntent.sourceBound,
		hasSelectedSources: sourceIds.length > 0,
		pack: {
			packId,
			packName: cleanText(pack.packName),
			sourceIds,
			sourceTitles: stringArray(pack.sourceTitles)
		}
	});
	const retrievalJobHints = retrievalJobSearchHints(retrievalJob);
	requestIntent = {
		...requestIntent,
		explicitCitations: mergeStringArrays(requestIntent.explicitCitations, retrievalJobHints.citations),
		requestedConcepts: mergeStringArrays(requestIntent.requestedConcepts, retrievalJob.teacherHints.concepts),
		coreTerms: mergeStringArrays(requestIntent.coreTerms, retrievalJob.teacherHints.concepts),
		expandedTerms: mergeStringArrays(requestIntent.expandedTerms, retrievalJobHints.terms),
		prioritySourceTitles: mergeStringArrays(requestIntent.prioritySourceTitles, retrievalJobHints.titles),
		priorityUnits: mergeStringArrays(requestIntent.priorityUnits, retrievalJob.teacherHints.citations)
	};
	let requestIntentBlock = renderSourceGroundedIntentBlock(requestIntent);
	const hasDirectCitationSignal = directCitationSignalPattern.test(normalizeIntentText(requestIntent.rawText || message));
	const language = detectOutputLanguage(message, requestedLanguage);
	const retrievalJobBlock = renderCaseStudioRetrievalJobBlock(retrievalJob, language);
	const sourceEngineRequested = mode === 'build'
		|| detectedIntent.sourceBound
		|| retrievalJob.mustRetrieve
		|| hasDirectCitationSignal
		|| requestIntent.explicitCitations.length > 0
		|| requestIntent.priorityUnits.length > 0;
	const jurisdiction = cleanText(pack.jurisdiction) || stringArray(pack.jurisdictions).join(' / ') || (language === 'fr' ? 'Non precisee' : 'Not specified');
	const packSignature = buildPackSignature(pack, sourceIds, language);
	const dossierCacheKey = `${session.user.id}:${packSignature}`;
	const sourcePacketCacheKey = `${dossierCacheKey}:packet`;
	let dossier = readCachedDossier(dossierCacheKey);
	let sourceCount = sourceIds.length;
	let sources: Awaited<ReturnType<typeof loadFullSources>> | null = null;
	let sourceBlock = '';

	logCaseStudioIntent({
		userId: session.user.id,
		message,
		requestedMode,
		resolvedMode: mode,
		sourceEngineRequested,
		sourceCount: sourceIds.length,
		hasCurrentDraft,
		language,
		signals: detectedIntent.signals
	});

	if (sourceEngineRequested && !sourceIds.length) {
		throw error(422, language === 'fr'
			? 'Le pack juridique actif ne contient aucune source exploitable pour cette demande.'
			: 'The active legal pack has no usable sources for this request.');
	}

	ensureCreateProviders();

	const ensureSourceMaterials = async () => {
		if (sources) return { sources, sourceBlock, sourceCount };

		try {
			sources = await loadFullSources({
				supabase: locals.supabase,
				userId: session.user.id,
				sourceIds,
				packId: packId || undefined
			});
		} catch (err) {
			console.error('[case-studio] Failed to load sources:', err);
			throw error(500, 'Could not load legal sources for Create.');
		}

		if (!sources.length) {
			throw error(422, language === 'fr'
				? 'Aucun texte de source n a pu etre charge depuis le pack juridique actif.'
				: 'No source text could be loaded from the active legal pack.');
		}

		sourceCount = sources.length;
		sourceBlock = sources
			.map((source, index) => {
				const body = cleanText(source.content, source.description).slice(0, MAX_SOURCE_CHARS_IN_PROMPT);
				const type = source.docType ? ` | Type: ${source.docType}` : '';
				const sourceMeta = source.jurisdiction && source.jurisdiction !== 'Other' ? ` | Source metadata: ${source.jurisdiction}` : '';
				return `SOURCE ${index + 1}: ${source.title}${sourceMeta}${type}\n${body || '(No body text available.)'}`;
			})
			.join('\n\n');

		if (shouldLogCaseStudioIntent()) {
			console.info('[case-studio] Loaded active source set', {
				requestedCount: requestedSourceIds.length,
				resolvedCount: sourceIds.length,
				loadedCount: sources.length,
				loadedTitles: sources.slice(0, 8).map((source) => cleanText(source.title, 'Untitled source'))
			});
		}

		return { sources, sourceBlock, sourceCount };
	};

	const ensureDossier = async (): Promise<CaseStudioSourceDossier> => {
		if (dossier) return dossier;

		const sourceMaterials = await ensureSourceMaterials();
		try {
			const packMemoryRecord = await ensurePackMemory({
				supabase: locals.supabase,
				userId: session.user.id,
				packId: pack.packId ? String(pack.packId) : undefined,
				packSignature,
				language,
				jurisdiction,
				sources: sourceMaterials.sources,
				callLLM: async (llmRequest) => callLLM({
					task: 'create-dossier',
					systemPrompt: llmRequest.systemPrompt,
					userPrompt: llmRequest.userPrompt,
					temperature: 0.2,
					maxTokens: llmRequest.maxTokens,
					jsonMode: true,
					schema: llmRequest.schema
				})
			});
			dossier = dossierFromPackMemory({
				memory: packMemoryRecord.memory,
				geminiCache: packMemoryRecord.geminiCache,
				language
			});
			writeCachedDossier(dossierCacheKey, dossier);
			return dossier;
		} catch (err) {
			console.warn('[case-studio dossier] Durable Pack Memory unavailable; falling back to legacy source dossier.', err);
		}

		const fullSourceTokenCount = sumTokens(sourceMaterials.sources);
		if (fullSourceTokenCount > TOKEN_BUDGETS['generate-case']) {
			console.warn('[case-studio dossier] Full-source dossier skipped because the pack exceeds the dossier budget.', {
				tokenCount: fullSourceTokenCount,
				budget: TOKEN_BUDGETS['generate-case'],
				sourceCount: sourceMaterials.sources.length
			});
			dossier = buildFallbackDossier({
				sources: sourceMaterials.sources,
				language,
				packSignature,
				fallbackJurisdiction: jurisdiction,
				pack
			});
			writeCachedDossier(dossierCacheKey, dossier);
			return dossier;
		}
		const { sourceBlock: dossierSourceBlock } = sourceMaterials;
		const systemPrompt = language === 'fr'
			? `Vous etes le moteur cache d analyse des sources de Verdict. Lisez les documents fournis et cartographiez honnetement ce qu ils peuvent soutenir pour des exercices pedagogiques. Les SOURCES sont la seule autorite juridique. N ajoutez jamais de droit externe, de citations inventees ni de details absents du dossier. Repondez uniquement en JSON valide et uniquement en francais canadien.`
			: `You are Verdict's hidden source-analysis engine. Read the supplied documents and map what they can honestly support for classroom exercises. The SOURCES are the only legal authority. Never add outside law, invented citations, or details absent from the record. Respond only with valid JSON and only in English.`;
		const userPrompt = `${renderBundleOverviewBlock(pack, sourceCount)}

SOURCE MATERIALS
${dossierSourceBlock}

TASK
1. Summarize what these sources actually cover for teaching purposes.
2. List the strongest supported exercise directions.
3. List the most important legal or factual gaps that would block stronger exercises.
4. Name the main skills these sources can train.
5. Assess the pack s overall fit for Verdict s Judge mode in general terms.

Return JSON with this exact shape:
{
  "jurisdiction": "Jurisdiction supported by the source text or metadata.",
  "sourceSummary": "What these sources actually cover for exercises.",
  "strengths": ["What the pack clearly supports."],
  "limits": ["Important limits inside the current pack."],
  "missingCoverage": ["What is missing for broader or stronger exercises."],
  "supportedSkills": ["Skills the sources can train."],
  "exerciseDirections": ["Concrete exercise directions grounded in the pack."],
  "judgeModeFit": "high | medium | low",
  "judgeModeRationale": "Why this pack is or is not generally well suited for Judge mode."
}

RULES
- Stay descriptive and source-bound.
- Do not evaluate a specific student request yet.
- Do not invent statutes, cases, article numbers, or factual details.`;

		const requestDossier = async (promptText: string) => {
			const content = await callLLM({
				task: 'create-dossier',
				systemPrompt,
				userPrompt: promptText,
				temperature: 0.2,
				maxTokens: 2200,
				jsonMode: true,
				schema: caseStudioDossierJsonSchema
			});
			return normaliseDossier(content, language, packSignature, jurisdiction);
		};

		try {
			try {
				dossier = await requestDossier(userPrompt);
			} catch (err) {
				if (!isStructuredOutputError(err)) throw err;
				console.warn('[case-studio dossier] Malformed structured output; retrying once with stricter JSON rules.');
				try {
					dossier = await requestDossier(`${userPrompt}

OUTPUT RETRY RULES
- Return one JSON object only.
- Do not add markdown, code fences, prose, or bullet points.
- The first character must be { and the last character must be }.`);
				} catch (retryErr) {
					if (!isStructuredOutputError(retryErr)) throw retryErr;
					console.warn('[case-studio dossier] Structured output unavailable after retry; using source-material fallback.', {
						detail: retryErr instanceof Error ? retryErr.message : String(retryErr)
					});
					dossier = buildFallbackDossier({
						sources: sourceMaterials.sources,
						language,
						packSignature,
						fallbackJurisdiction: jurisdiction,
						pack
					});
				}
			}

			writeCachedDossier(dossierCacheKey, dossier);
			return dossier;
		} catch (err) {
			console.error('[case-studio dossier] LLM call failed:', err);
			return throwCreateProviderError(err, 'Failed to map the active legal pack. Please try again shortly.');
		}
	};

	if (mode === 'chat') {
		const resolvedDossier = sourceEngineRequested ? await ensureDossier() : null;
		let liveSourcePacketBlock = '';
		let citationVerificationBlock = '';
		let chatCitationChecks: CitationVerificationStatus[] = [];
		if (sourceEngineRequested) {
			const { sources: chatSources } = await ensureSourceMaterials();
			const chatCitationLookupBlock = buildCitationPriorityLookupBlock(requestIntent, language);
			const chatGoalBlock = requestIntent.understoodGoal && requestIntent.understoodGoal !== cleanText(message)
				? `UNDERSTOOD GOAL\n${requestIntent.understoodGoal}`
				: '';
			const chatEvidenceQuery = [
				retrievalJobBlock,
				chatCitationLookupBlock,
				chatGoalBlock,
				message,
				retrievalIntentHistoryBlock,
				requestIntentBlock
			]
				.filter(Boolean)
				.join('\n\n');

			let chatSourceBundle = buildRelevantSourceBundle({
				cacheKey: `${sourcePacketCacheKey}:chat`,
				sources: chatSources,
				query: chatEvidenceQuery,
				maxExcerpts: 10,
				fallbackMode: 'none',
				hints: {
					titles: mergeStringArrays(retrievalJobHints.titles, requestIntent.prioritySourceTitles, stringArray(pack.sourceTitles)),
					citations: mergeStringArrays(retrievalJobHints.citations, requestIntent.explicitCitations),
					terms: mergeStringArrays(
						retrievalJobHints.terms,
						requestIntent.requestedConcepts,
						requestIntent.expandedTerms,
						requestIntent.priorityUnits,
						requestIntent.coreTerms
					)
				}
			});
			if (!chatSourceBundle.excerpts.length) {
				chatSourceBundle = buildRelevantSourceBundle({
					cacheKey: `${sourcePacketCacheKey}:chat`,
					sources: chatSources,
					query: chatEvidenceQuery || message,
					maxExcerpts: 6,
					fallbackMode: 'first-chunks',
					hints: {
						titles: mergeStringArrays(retrievalJobHints.titles, requestIntent.prioritySourceTitles, stringArray(pack.sourceTitles)),
						citations: mergeStringArrays(retrievalJobHints.citations, requestIntent.explicitCitations),
						terms: mergeStringArrays(
							retrievalJobHints.terms,
							requestIntent.requestedConcepts,
							requestIntent.expandedTerms,
							requestIntent.priorityUnits,
							requestIntent.coreTerms
						)
					}
				});
			}

			const mandatoryLookup = enforceMandatoryCitationLookup({
				intent: requestIntent,
				bundle: chatSourceBundle,
				sources: chatSources,
				language
			});
			chatSourceBundle = mandatoryLookup.bundle;
			chatCitationChecks = mandatoryLookup.checks;

			const chatEvidence = buildEvidenceSufficiency({
				bundle: chatSourceBundle,
				memory: resolvedDossier?.packMemory,
				query: chatEvidenceQuery || message
			});
			liveSourcePacketBlock = `LIVE SOURCE PACKET\n${renderSourcePacketBlock(chatSourceBundle)}\n\nCHAT EVIDENCE CHECK\n${JSON.stringify(chatEvidence, null, 2)}`;
			citationVerificationBlock = buildChatCitationVerificationBlock({
				checks: chatCitationChecks,
				evidence: chatEvidence,
				language
			});
		}
		const dossierBlock = resolvedDossier ? `${renderDossierBlock(resolvedDossier)}\n\n` : '';
		const packMemoryBlock = resolvedDossier?.packMemory
			? `${renderPackMemoryBlock(resolvedDossier.packMemory)}\n\n${renderGeminiCacheBlock(resolvedDossier.geminiCache)}\n\n`
			: '';
		const systemPrompt = sourceEngineRequested
			? (language === 'fr'
				? `Vous etes Verdict, l assistant visible avec qui l enseignant parle. Le moteur de lecture des sources a ete invoque pour ce tour et a produit un SOURCE DOSSIER. Utilisez-le comme limite juridique, mais repondez en langage naturel, chaleureux, humain et simple. Ne recitez pas de structure technique. Ne vous presentez pas spontanement et ne listez pas vos capacites sauf si l utilisateur le demande clairement. Si le message est juste une salutation ou reste vague, repondez comme une personne normale puis posez une seule question courte pour comprendre ce que l utilisateur veut construire ou pratiquer. Si quelque chose est incertain, demandez au lieu de supposer. Repondez uniquement en JSON valide et uniquement en francais canadien.`
				: `You are Verdict, the visible assistant the teacher talks to. The source-reading engine was invoked for this turn and produced a SOURCE DOSSIER. Use it as your legal boundary, but respond in natural, warm, human, simple language. Do not dump technical structure. Do not introduce yourself or list capabilities unless the user clearly asks. If the message is only a greeting or is still vague, reply like a normal person and ask one short question to understand what the user wants to build or practice. If something is uncertain, ask instead of assuming. Respond only with valid JSON and only in English.`)
			: (language === 'fr'
				? `Vous etes Verdict, l assistant visible avec qui l enseignant parle. Ce tour est une conversation normale: le moteur de lecture des sources n a pas ete invoque. Repondez naturellement, comme une vraie personne utile, sans ton robotique, sans pitch produit, sans checklist et sans vous presenter si on ne vous l a pas demande. N inventez pas d autorites juridiques issues des sources. Si l utilisateur veut une analyse fondee sur les documents ou un exercice complet, dites simplement que vous pouvez fouiller le pack juridique actif et construire a partir des passages pertinents. Si le message est juste une salutation ou reste vague, repondez simplement puis posez une seule question courte pour comprendre ce que l utilisateur veut faire. Si quelque chose est incertain, demandez au lieu de supposer. N exigez pas de jargon produit ni de formulation rituelle. Repondez uniquement en JSON valide et uniquement en francais canadien.`
				: `You are Verdict, the visible assistant the teacher talks to. This turn is normal conversation: the source-reading engine has not been invoked. Reply naturally, like a genuinely helpful person, without robotic checklist tone, product pitch language, or self-introduction unless asked. Do not invent source-grounded legal authority. If the user wants document-grounded analysis or a full exercise, simply tell them you can search the active legal pack and build from the relevant passages. If the message is only a greeting or is still vague, reply simply and ask one short question to understand what the user wants to do. If something is uncertain, ask instead of assuming. Do not require product jargon or ritual phrasing. Respond only with valid JSON and only in English.`);
		const userPrompt = sourceEngineRequested
			? `${renderBundleOverviewBlock(pack, sourceCount)}

${dossierBlock}
${packMemoryBlock}
${retrievalJobBlock ? `${retrievalJobBlock}\n\n` : ''}
${liveSourcePacketBlock ? `${liveSourcePacketBlock}\n\n` : ''}${citationVerificationBlock ? `${citationVerificationBlock}\n\n` : ''}

USER MESSAGE
${message}${historyBlock}${workingDraftBlock}

CREATE CHAT RULES
- Talk normally, warmly, and directly.
- Output language for this turn is ${language}. Keep assistantMessage and nextStep fully in this language.
- Do not mix French and English in the same sentence unless quoting source text verbatim.
- SOURCE DOSSIER is a map; LIVE SOURCE PACKET is the highest-trust evidence for this turn.
- If EXPLICIT CITATION VERIFICATION shows source-corpus=yes for a citation, never claim that citation is absent from the user pack.
- If source-corpus=yes but retrieved-packet=no, explain that this pass has not isolated the passage yet and propose a tighter retrieval.
- If source-corpus=yes and retrieved-packet=yes for a requested citation, explicitly confirm that the citation is present in the active pack before adding guidance.
- Keep technical details inside the generated exercise document, not in chat prose.
- Do not introduce yourself unless the user asks who you are.
- Do not list what Verdict can do unless the user asks.
- If the user is only greeting you or opening vaguely, answer briefly and ask one short clarifying question.
- If the user's goal, side, level, or constraints are unclear, ask instead of guessing.
- If more detail is required, ask one concise follow-up question.

${renderLanguageQualityBlock(language)}

Return JSON with this exact shape:
{
  "assistantMessage": "Natural answer to the user.",
  "nextStep": "One natural next move for the user."
}`
			: `${renderNormalChatContextBlock(language)}

USER MESSAGE
${message}${historyBlock}${workingDraftBlock}

CREATE CHAT RULES
- Keep this as natural conversation.
- Output language for this turn is ${language}. Keep assistantMessage and nextStep fully in this language.
- Do not mix French and English in the same sentence.
- Do not pretend you have read sources in this turn.
- Do not mention source titles, document names, pack contents, source count, jurisdiction, or domain.
- Do not introduce yourself unless the user asks who you are.
- Do not list capabilities or product surfaces unless the user asks.
- If the user asks global questions about who you are, what Verdict does, or how Judge mode works, answer briefly and naturally without marketing tone.
- If the user is only greeting you or opening vaguely, answer briefly and ask one short clarifying question.
- If the user's goal, side, level, or constraints are unclear, ask instead of guessing.
- Help the user clarify goals in plain language.
- If they want source-grounded legal analysis or a full exercise pack, tell them you can search the active legal pack and build from the relevant passages. Do not demand exact product wording.

${renderLanguageQualityBlock(language)}

Return JSON with this exact shape:
{
  "assistantMessage": "Natural answer to the user.",
  "nextStep": "One natural next move for the user."
}`;

		const enforceCitationTruthAgainstLoadedSources = async (response: CaseStudioResponse): Promise<CaseStudioResponse> => {
			const citationTokens = extractIntentCitationTokens(requestIntent);
			if (!citationTokens.length || !sourceIds.length) return response;

			try {
				const sourceMaterials = await ensureSourceMaterials();
				const corpusText = normalizeIntentText(
					sourceMaterials.sources
						.map((source) => `${source.title}\n${cleanText(source.content, source.description)}`)
						.join('\n\n')
				);
				const presentTokens = citationTokens.filter((token) => citationTokenInText(corpusText, token));
				if (!presentTokens.length) return response;

				const normalizedResponse = normalizeIntentText(response.assistantMessage).replace(/[’']/g, ' ');
				const contradicted = presentTokens.filter((token) => responseDeniesCitation(response.assistantMessage, token));
				const uncertain = presentTokens.filter((token) => {
					const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					const confirmsPresence = new RegExp(
						`(?:${escaped}[^\\n.]{0,140}(?:present|trouve|retrouve|confirme|disponible|included|found|available)|(?:present|trouve|retrouve|confirme|disponible|included|found|available)[^\\n.]{0,140}${escaped})`,
						'i'
					).test(normalizedResponse);
					return !confirmsPresence;
				});

				if (!contradicted.length && !uncertain.length) return response;

				const cited = presentTokens.join(', ');
				return {
					...response,
					assistantMessage: language === 'fr'
						? `Correction de fiabilite: la citation ${cited} est bien presente dans le pack actif charge cote serveur. Je retire donc toute affirmation d absence et je peux maintenant construire le cas sur cet article.`
						: `Reliability correction: citation ${cited} is present in the active pack loaded on the server. I am withdrawing any absence claim and can now build the case on that article.`,
					workflow: {
						...response.workflow,
						nextStep: language === 'fr'
							? `Je peux maintenant construire un cas sur ${cited}. Dites-moi le niveau souhaite (introductif, intermediaire ou avance).`
							: `I can now build a case on ${cited}. Tell me the level you want (introductory, intermediate, or advanced).`
					}
				};
			} catch (err) {
				console.warn('[case-studio chat] Citation truth guard could not load sources; keeping model response.', {
					detail: err instanceof Error ? err.message : String(err)
				});
				return response;
			}
		};

		const buildChatResponse = async (raw: string): Promise<CaseStudioResponse> => {
			const baseResponse = enforceConversationCitationTruth({
				response: normaliseConversationResponse(raw, language, sourceCount, {
					dossier: resolvedDossier,
					sourceReviewed: sourceEngineRequested
				}),
				checks: chatCitationChecks,
				language
			});
			return enforceCitationTruthAgainstLoadedSources(baseResponse);
		};

		const requestChat = async (promptText: string) =>
			callLLM({
				task: 'create-chat',
				systemPrompt,
				userPrompt: promptText,
				temperature: 0.7,
				maxTokens: 2400,
				jsonMode: true,
				schema: assistantEnvelopeJsonSchema,
				cachedContent: sourceEngineRequested ? resolvedDossier?.geminiCache?.name : undefined
			});

		let content = '';
		try {
			content = await requestChat(userPrompt);
		} catch (err) {
			console.error('[case-studio chat] LLM call failed:', err);
			return throwCreateProviderError(err, 'Failed to continue the Verdict conversation. Please try again shortly.');
		}

		try {
			return json(await buildChatResponse(content), {
				headers: { 'Cache-Control': 'no-store, max-age=0' }
			});
		} catch (err) {
			if (!isStructuredOutputError(err)) throw err;
			console.warn('[case-studio chat] Malformed structured output; retrying once with stricter JSON rules.');

			let retryContent = '';
			try {
				retryContent = await requestChat(`${userPrompt}

OUTPUT RETRY RULES
- Return one JSON object only.
- Do not add markdown, code fences, prose, or bullet points.
- The first character must be { and the last character must be }.`);
				return json(await buildChatResponse(retryContent), {
					headers: { 'Cache-Control': 'no-store, max-age=0' }
				});
			} catch (retryErr) {
				if (!isStructuredOutputError(retryErr)) {
					console.error('[case-studio chat] Retry LLM call failed:', retryErr);
					return throwCreateProviderError(retryErr, 'Failed to continue the Verdict conversation. Please try again shortly.');
				}
				console.warn('[case-studio chat] Structured output unavailable after retry; attempting JSON repair.', {
					detail: retryErr instanceof Error ? retryErr.message : String(retryErr)
				});
			}

			try {
				const repairedContent = await repairStructuredJsonWithLLM({
					raw: retryContent || content,
					language,
					schema: assistantEnvelopeJsonSchema,
					label: 'case-studio chat',
					maxTokens: 1800
				});
				return json(await buildChatResponse(repairedContent), {
					headers: { 'Cache-Control': 'no-store, max-age=0' }
				});
			} catch (repairErr) {
				console.warn('[case-studio chat] JSON repair unavailable; returning resilient chat fallback.', {
					detail: repairErr instanceof Error ? repairErr.message : String(repairErr)
				});
				const fallbackEnvelope = buildConversationFallbackEnvelope(language, sourceEngineRequested);
				return json(await buildChatResponse(fallbackEnvelope), {
					headers: { 'Cache-Control': 'no-store, max-age=0' }
				});
			}
		}
	}

	if (needsBuildClarification(message, hasCurrentDraft, sourceIds.length > 0)) {
		return json(buildClarificationResponse({
			language,
			sourceCount,
			dossier
		}), {
			headers: { 'Cache-Control': 'no-store, max-age=0' }
		});
	}

	const resolvedDossier = await ensureDossier();
	const { sources: buildSources } = await ensureSourceMaterials();
	if (resolvedDossier.packMemory) {
		const plannedIntent = await requestSourceGroundedIntentPlan({
			language,
			teacherRequest: message,
			historyBlock: retrievalIntentHistoryBlock,
			retrievalDraftBlock,
			fallbackIntent: requestIntent,
			dossier: resolvedDossier,
			packMemory: resolvedDossier.packMemory,
			geminiCache: resolvedDossier.geminiCache
		});
		if (plannedIntent) {
			requestIntent = mergeSourceGroundedRequestIntent(requestIntent, plannedIntent);
			requestIntentBlock = renderSourceGroundedIntentBlock(requestIntent);
		}
	}
	const plannedGoalBlock = requestIntent.understoodGoal && requestIntent.understoodGoal !== cleanText(message)
		? `PLANNED USER GOAL\n${requestIntent.understoodGoal}`
		: '';
	const plannedQueriesBlock = requestIntent.plannerQueries.length
		? `INITIAL RETRIEVAL PLAN\n${requestIntent.plannerQueries.join('\n\n')}`
		: '';
	const citationPriorityLookupBlock = buildCitationPriorityLookupBlock(requestIntent, language);
	const buildEvidenceQuery = [
		retrievalJobBlock,
		plannedGoalBlock,
		plannedQueriesBlock,
		message,
		retrievalIntentHistoryBlock,
		retrievalDraftBlock,
		requestIntentBlock
	]
		.filter(Boolean)
		.join('\n\n');
	const initialBuildEvidenceQuery = [
		citationPriorityLookupBlock,
		buildEvidenceQuery
	]
		.filter(Boolean)
		.join('\n\n');
	let buildSourceBundle = buildRelevantSourceBundle({
		cacheKey: sourcePacketCacheKey,
		sources: buildSources,
		query: initialBuildEvidenceQuery,
		fallbackMode: 'none',
		hints: {
			titles: mergeStringArrays(retrievalJobHints.titles, requestIntent.prioritySourceTitles, stringArray(pack.sourceTitles)),
			citations: mergeStringArrays(retrievalJobHints.citations, requestIntent.explicitCitations),
			terms: mergeStringArrays(retrievalJobHints.terms, requestIntent.requestedConcepts, requestIntent.expandedTerms, requestIntent.priorityUnits)
		}
	});
	let evidenceSufficiency = buildEvidenceSufficiency({
		bundle: buildSourceBundle,
		memory: resolvedDossier.packMemory,
		query: initialBuildEvidenceQuery
	});
	const retrievalBudget = computePackRetrievalBudget({
		sourceCount,
		bundle: buildSourceBundle,
		evidence: evidenceSufficiency,
		packMemory: resolvedDossier.packMemory
	});
	const retrievalAttempts: RetrievalAttempt[] = [
		captureRetrievalAttempt({
			pass: 0,
			query: buildSourceBundle.query || buildEvidenceQuery,
			bundle: buildSourceBundle,
			evidence: evidenceSufficiency
		})
	];
	const seenRetrievalPlans = new Set<string>([
		fingerprintRetrievalIntent(buildSourceBundle.query || initialBuildEvidenceQuery, [])
	]);
	const isTargetedRequest = requestIntent.explicitCitations.length > 0
		|| requestIntent.requestedConcepts.length > 0
		|| requestIntent.priorityUnits.length > 0;
	const minimumPasses = Math.min(
		retrievalBudget,
		isTargetedRequest ? MIN_TARGETED_RETRIEVAL_PASSES : MIN_GENERIC_RETRIEVAL_PASSES
	);
	if (!evidenceSufficiency.canProceed && resolvedDossier.packMemory) {
		for (let retry = 0; retry < retrievalBudget && !evidenceSufficiency.canProceed; retry += 1) {
			const enforceCoveragePass = retry + 1 < minimumPasses;
			const deterministicPlan = buildDeterministicSourceNavigationPlan({
				buildEvidenceQuery,
				retryPass: retry + 1,
				retrievalBudget,
				evidenceSufficiency,
				packMemory: resolvedDossier.packMemory
			});
			let navigationPlan = (await requestSourceNavigationPlan({
				language,
				teacherRequest: message,
				currentQuery: buildSourceBundle.query || buildEvidenceQuery,
				currentBundle: buildSourceBundle,
				attempts: retrievalAttempts,
				retrievalBudget,
				remainingBudget: retrievalBudget - retry,
				dossier: resolvedDossier,
				evidenceSufficiency,
				packMemory: resolvedDossier.packMemory,
				geminiCache: resolvedDossier.geminiCache
			})) ?? deterministicPlan;
			if (navigationPlan.action === 'stop' && enforceCoveragePass) {
				navigationPlan = {
					...deterministicPlan,
					rationale: `${navigationPlan.rationale} | Forced pass: minimum retrieval policy not reached yet.`
				};
			}
			if (navigationPlan.action === 'stop') {
				retrievalAttempts.push(captureRetrievalAttempt({
					pass: retry + 1,
					query: buildSourceBundle.query || buildEvidenceQuery,
					bundle: buildSourceBundle,
					evidence: evidenceSufficiency,
					plannerRationale: navigationPlan.rationale,
					stopReason: navigationPlan.stopReason || (language === 'fr'
						? 'Le planificateur juge que la recherche dans ce pack a plafonne.'
						: 'The planner judged that retrieval in this pack had plateaued.')
				}));
				break;
			}
			let planFingerprint = fingerprintRetrievalIntent(navigationPlan.expandedQuery, navigationPlan.citations);
			if (seenRetrievalPlans.has(planFingerprint)) {
				if (enforceCoveragePass) {
					navigationPlan = {
						...deterministicPlan,
						expandedQuery: `${deterministicPlan.expandedQuery}\n\nFORCED TARGETED PASS ${retry + 1}\nPrioritize request targets: ${mergeStringArrays(requestIntent.explicitCitations, requestIntent.priorityUnits, requestIntent.requestedConcepts).join('; ') || 'request intent terms'}`,
						rationale: `${navigationPlan.rationale} | Forced pass: equivalent query was repeated before minimum coverage passes.`
					};
					planFingerprint = fingerprintRetrievalIntent(navigationPlan.expandedQuery, navigationPlan.citations);
				} else {
				retrievalAttempts.push(captureRetrievalAttempt({
					pass: retry + 1,
					query: navigationPlan.expandedQuery,
					bundle: buildSourceBundle,
					evidence: evidenceSufficiency,
					plannerRationale: navigationPlan.rationale,
					stopReason: language === 'fr'
						? 'La boucle de recherche a ete stoppee parce que Gemini a repropose une requete equivalente dans le meme pack.'
						: 'The retrieval loop was stopped because Gemini repeated an equivalent query inside the same pack.'
				}));
				break;
				}
			}
			seenRetrievalPlans.add(planFingerprint);
			const nextBundle = buildRelevantSourceBundle({
				cacheKey: sourcePacketCacheKey,
				sources: buildSources,
				query: navigationPlan.expandedQuery,
				maxExcerpts: Math.min(10 + retry, 12),
				fallbackMode: 'none',
				hints: {
					titles: mergeStringArrays(retrievalJobHints.titles, requestIntent.prioritySourceTitles, stringArray(pack.sourceTitles)),
					citations: mergeStringArrays(retrievalJobHints.citations, requestIntent.explicitCitations, navigationPlan.citations),
					terms: mergeStringArrays(retrievalJobHints.terms, requestIntent.requestedConcepts, requestIntent.expandedTerms, requestIntent.priorityUnits, evidenceSufficiency.missingConcepts, navigationPlan.citations)
				}
			});
			const nextEvidence = buildEvidenceSufficiency({
				bundle: nextBundle,
				memory: resolvedDossier.packMemory,
				query: buildEvidenceQuery
			});
			const improved = retrievalImproved({
				currentBundle: buildSourceBundle,
				currentEvidence: evidenceSufficiency,
				nextBundle,
				nextEvidence
			});
			retrievalAttempts.push(captureRetrievalAttempt({
				pass: retry + 1,
				query: navigationPlan.expandedQuery,
				bundle: nextBundle,
				evidence: nextEvidence,
				plannerRationale: navigationPlan.rationale,
				stopReason: improved ? '' : navigationPlan.stopReason || (language === 'fr'
					? 'La recherche n a plus ameliore la couverture ou les concepts manquants.'
					: 'Retrieval no longer improved coverage or missing-concept coverage.')
			}));
			if (!improved && enforceCoveragePass) {
				buildSourceBundle = nextBundle;
				evidenceSufficiency = nextEvidence;
				continue;
			}
			if (!improved) {
				break;
			}
			buildSourceBundle = nextBundle;
			evidenceSufficiency = nextEvidence;
		}
	}

	const mandatoryBuildLookup = enforceMandatoryCitationLookup({
		intent: requestIntent,
		bundle: buildSourceBundle,
		sources: buildSources,
		language
	});
	buildSourceBundle = mandatoryBuildLookup.bundle;
	evidenceSufficiency = buildEvidenceSufficiency({
		bundle: buildSourceBundle,
		memory: resolvedDossier.packMemory,
		query: buildEvidenceQuery
	});
	const buildCitationTokens = extractIntentCitationTokens(requestIntent);
	const buildCorpusText = buildCitationTokens.length
		? normalizeIntentText(
			buildSources
				.map((source) => `${source.title}\n${cleanText(source.content, source.description)}`)
				.join('\n\n')
		)
		: '';
	const presentBuildCitationTokens = buildCitationTokens.filter((token) => citationTokenInText(buildCorpusText, token));
	const enforceBuildCitationTruth = (response: CaseStudioResponse): CaseStudioResponse => {
		const targetTokens = presentBuildCitationTokens.length ? presentBuildCitationTokens : buildCitationTokens;
		if (!targetTokens.length) return response;

		const normalizedResponse = normalizeIntentText(response.assistantMessage).replace(/[’']/g, ' ');
		const contradicted = targetTokens.some((token) => responseDeniesCitation(response.assistantMessage, token));

		if (!presentBuildCitationTokens.length) {
			if (!contradicted) return response;
			const cited = targetTokens.join(', ');
			return {
				...response,
				assistantMessage: language === 'fr'
					? `Je ne vais pas conclure que la citation ${cited} est absente. Recherche obligatoire active: je continue la verification ciblee dans le pack actif avant de trancher.`
					: `I will not conclude that citation ${cited} is absent. Mandatory lookup is active: I am continuing targeted verification inside the active pack before concluding.`,
				analysis: {
					...response.analysis,
					limits: Array.from(new Set([
						...response.analysis.limits,
						language === 'fr'
							? 'Verdict evite toute conclusion d absence tant que la verification ciblee des citations demandees n est pas terminee.'
							: 'Verdict avoids any absence conclusion until targeted citation verification is complete.'
					]))
				},
				workflow: {
					...response.workflow,
					nextStep: language === 'fr'
						? `Je continue la verification ciblee de ${cited} dans ce meme pack actif.`
						: `I am continuing targeted verification of ${cited} inside this same active pack.`
				}
			};
		}

		const uncertain = presentBuildCitationTokens.some((token) => {
			const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			return !new RegExp(
				`(?:${escaped}[^\\n.]{0,140}(?:present|trouve|retrouve|confirme|disponible|included|found|available)|(?:present|trouve|retrouve|confirme|disponible|included|found|available)[^\\n.]{0,140}${escaped})`,
				'i'
			).test(normalizedResponse);
		});

		if (!contradicted && !uncertain) return response;

		const cited = presentBuildCitationTokens.join(', ');
		return {
			...response,
			assistantMessage: language === 'fr'
				? `Confirmation serveur: la citation ${cited} est bien presente dans le pack actif charge cote serveur. Je retire toute affirmation d absence et je peux poursuivre la creation du cas sur cet article.`
				: `Server confirmation: citation ${cited} is present in the active pack loaded on the server. I am withdrawing any absence claim and can proceed with case creation on that article.`,
			analysis: {
				...response.analysis,
				limits: Array.from(new Set([
					...response.analysis.limits,
					language === 'fr'
						? 'Citation demandee confirmee dans le corpus source charge cote serveur.'
						: 'Requested citation is confirmed in the source corpus loaded on the server.'
				]))
			},
			workflow: {
				...response.workflow,
				nextStep: language === 'fr'
					? `Je peux maintenant finaliser un cas sur ${cited}. Precisez seulement le niveau souhaite (introductif, intermediaire ou avance).`
					: `I can now finalize a case on ${cited}. Just confirm the level you want (introductory, intermediate, or advanced).`
			}
		};
	};

	const retrievalPassCount = Math.max(0, retrievalAttempts.length - 1);
	const retrievalStopped = Boolean(retrievalAttempts.at(-1)?.stopReason);
	const retrievalExhausted = !evidenceSufficiency.canProceed
		&& retrievalPassCount >= minimumPasses
		&& (retrievalPassCount >= retrievalBudget || retrievalStopped);
	const retrievalSearchState: RetrievalSearchState = retrievalExhausted ? 'exhausted' : 'not-found-yet';
	let intentCoverage = assessSourceGroundedIntentCoverage({
		intent: requestIntent,
		bundle: buildSourceBundle,
		evidence: evidenceSufficiency,
		language
	});
	const requestedCitationTokens = buildCitationTokens;
	const directCitationHits = extractLooseNumericCitationTokens(requestIntent.rawText).filter((token) =>
		buildSources.some((source) => cleanText(source.content, source.description).includes(token))
	);
	if (!intentCoverage.supported && (directCitationHits.length || requestedCitationTokens.length)) {
		intentCoverage = {
			...intentCoverage,
			supported: true,
			missingExplicitCitations: [],
			missingTargets: [],
			reason: ''
		};
		if (shouldLogCaseStudioIntent()) {
			console.info('[case-studio] Direct citation fallback unlocked build flow', {
				hits: directCitationHits,
				requestedTokens: requestedCitationTokens,
				previousMissing: intentCoverage.missingExplicitCitations
			});
		}
	}
	if (!intentCoverage.supported) {
		return json(
			enforceBuildCitationTruth(buildStrictSourceGroundedMissResponse({
				language,
				message,
				sourceCount,
				dossier: resolvedDossier,
				intent: requestIntent,
				coverage: intentCoverage,
				searchState: retrievalSearchState,
				attemptCount: Math.max(1, retrievalPassCount)
			})),
			{ headers: { 'Cache-Control': 'no-store, max-age=0' } }
		);
	}
	const buildPromptSources = materializeSourceBundleSources(buildSourceBundle);
	try {
		assertWithinBudget(buildPromptSources, 'generate-case');
	} catch (err) {
		if (err instanceof SourcesOverBudgetError) throw error(413, err.message);
		throw err;
	}
	const buildSourceBlock = renderSourcePacketBlock(buildSourceBundle);
	const packMemoryBlock = resolvedDossier.packMemory
		? `${renderPackMemoryBlock(resolvedDossier.packMemory)}\n\n${renderGeminiCacheBlock(resolvedDossier.geminiCache)}`
		: renderGeminiCacheBlock(resolvedDossier.geminiCache);
	const evidenceSufficiencyBlock = `EVIDENCE SUFFICIENCY CHECK
${JSON.stringify(evidenceSufficiency, null, 2)}`;
	const buildSystemPrompt = language === 'fr'
		? `Vous etes le moteur cache de redaction de Verdict. L enseignant decide ce qu il veut faire pratiquer; votre travail est de verifier si le pack juridique actif l appuie, puis de rediger ou reviser un exercice court, stipule et jouable. Le champ assistantMessage sera montre directement a l enseignant: il doit donc etre naturel, clair et fidele aux sources. Utilisez le SOURCE DOSSIER comme carte et les SOURCES comme autorite finale. N inventez jamais le droit, les citations, ni les faits manquants. Si la demande depasse les sources, dites-le clairement et proposez une version plus etroite qui reste appuyee. Repondez uniquement en JSON valide et uniquement en francais canadien. Ne melangez pas le francais et l anglais dans la meme phrase, sauf pour une citation source verbatim.`
		: `You are Verdict's hidden drafting engine. The teacher decides what students should practice; your job is to verify whether the active legal pack supports it, then draft or revise a short, stipulated, playable exercise. The assistantMessage field is shown directly to the teacher, so it must be natural, clear, and faithful to the sources. Use the SOURCE DOSSIER as a map and the SOURCES as the final authority. Never invent missing law, citations, or facts. If the request outruns the sources, say so clearly and propose a narrower supported version. Respond only with valid JSON and only in English. Do not mix English and French in the same sentence unless quoting source text verbatim.`;
	const buildUserPrompt = `CREATE CONTEXT
Pack: ${cleanText(pack.packName, 'Active legal pack')}
Source metadata if present: ${jurisdiction}
Domain metadata: ${cleanText(pack.domain, 'General')}
Language: ${language}
Drafting mode: ${hasCurrentDraft ? 'revise-existing-paper' : 'new-paper'}

${renderDossierBlock(resolvedDossier)}

${packMemoryBlock}

${retrievalJobBlock ? `${retrievalJobBlock}\n` : ''}

${evidenceSufficiencyBlock}

REQUEST TARGETS
${requestIntentBlock || 'No explicit request targets were parsed beyond the teacher message.'}

TEACHER REQUEST
${message}${historyBlock}${workingDraftBlock}

LANGUAGE OUTPUT RULES
- Target output language for this turn: ${language}
- Write assistantMessage and all teacher-facing draft prose in this language.
- Keep citations and grounding excerpts verbatim from SOURCES; do not translate quotes.
- Do not mix French and English in the same sentence unless quoting verbatim source text.

${renderLanguageQualityBlock(language)}

TEACHER-INTENT-FIRST RULE
- Treat the teacher's request as the starting objective. Do not invent a different learning goal because the sources contain something else.
- If the teacher request is broad, open-ended, or simply asks for an exercise/case, choose the strongest honest exercise direction that the SOURCE DOSSIER and SOURCES clearly support. Do not stall just because the user did not name a precise article, issue, or angle.
- First verify whether the active legal pack supports the teacher's requested skill, concept, level, and constraints.
- If fully supported, build or revise the exercise around that teacher request.
- If partly supported, build the closest honest narrower version and explain the missing coverage in analysis.missingSources / sourceWarnings.
- If not supported, set canGenerate to false and explain what source material is missing. Do not create a fake legal theory.

ITERATIVE DRAFTING RULE
- If Drafting mode is revise-existing-paper, preserve the current title, core facts, level, roles, and judge brief unless the teacher asks to change them.
- Apply plain-language revision commands directly: add, remove, shorten, make easier, make harder, focus on, avoid, use the same facts, strengthen one side, change judge questions, or adjust the source boundaries.
- Never restart from zero during revision unless the teacher clearly asks for a new exercise.

SCENARIO DESIGN RULE
- Build stipulated classroom facts, not full real-life litigation files.
- The scenario may be fictional, but the legal reasoning must be real and source-grounded.
- Do not require evidence files, photos, recordings, expert reports, discovery, witnesses, procedural history, or external records unless the active legal pack is specifically about that.
- Make all facts needed for the oral exercise available in the synopsis and positions.
- The exercise should train theory-to-practice: applying source concepts to facts, distinguishing arguments, answering judge questions, and recognizing unsupported claims.

SOURCE AUTHORITY RULES
- The SOURCES block below is a retrieved packet of verbatim passages from the active legal pack. It is the only legal authority currently in view.
- SOURCE DOSSIER is a summary map, not a substitute for the retrieved passages.
- PACK MEMORY is a durable navigation map created from the structured source library. Use it to identify related authorities, exceptions, defences, definitions, gaps, and retrieval risks.
- EVIDENCE SUFFICIENCY CHECK is an app-side guard. If it says canProceed=false or identifies missingConcepts, do not produce a final exercise using the missing law; either narrow the exercise to verified passages or set canGenerate=false.
- GEMINI SOURCE-NAVIGATION CACHE, when available, may help you plan broader retrieval. It is not final authority. Final citations and grounding excerpts must come from the SOURCES packet.
- Source titles, jurisdiction/domain metadata, and pack metadata are routing context only. They are not authority.
- Follow the user s request exactly. If the request and sources do not safely fit together, say what is missing instead of improvising.
- Do not use outside law, training-memory statutes, cases, doctrine, examples, or article numbers.
- You may mention an article, section, case name, quote, or legal test only if it appears verbatim in the SOURCES block.
- Do not assume unseen parts of a statute or case say anything helpful. If the retrieved packet does not establish a point, say the current packet is silent or incomplete on that point.
- If the user asks for a case that the sources do not support, say what is missing and do not pretend.
- If you are unsure whether a detail is supported, ask the user before generating it.
- If REQUEST TARGETS names specific citations or concepts, do not substitute different articles or switch to a different legal topic just because another part of the pack is easier to use.
- If the retrieved packet does not actually cover the REQUEST TARGETS, set canGenerate to false and return options as [].
- Judge mode is a narrow format: a judge-led oral exercise testing source-grounded legal reasoning on stipulated facts.
- Build simple pedagogical cases for students to practice source-based legal reasoning, not real-world evidence simulation.
- Opposing counsel in these cases will only find weaknesses from the same sources, not secret facts.
- Treat this as an ongoing Verdict conversation, not a one-shot generator. If there is a current working draft, revise that draft unless the user clearly asks for a different one.

SOURCES (RETRIEVED PASSAGE PACKET)
${buildSourceBlock}

TASK
1. Read the teacher request first and state the requested training goal in analysis.understoodGoal.
2. Verify that goal against the active legal pack and the retrieved passage packet.
3. Decide whether that goal is a high, medium, or low fit for Verdict s Judge mode.
4. Explain what the sources support, what is missing, and why the fit is honest.
5. If the request is supportable enough, produce one main working draft or revise the current draft in place.
6. Produce exactly one main working draft when generation is possible. Do not include alternatives in this response.
7. Each draft must identify the primary skill being trained and include a judge-facing exercise brief.
8. Each draft must be playable in Verdict as plaintiff vs defendant, with the student later choosing the side.
9. Keep scenarios focused, concrete, and simple enough for class practice.
10. Keep technical source support, article/citation references, warnings, pressure points, and success criteria inside the structured paper fields, not the chat-style assistantMessage.

Return JSON with this exact shape:
{
	"assistantMessage": "Direct teacher-facing reply that explains what you drafted or why the sources are too limited.",
  "analysis": {
    "understoodGoal": "What the user wants students to practice.",
    "jurisdiction": "Jurisdiction supported by the pack or metadata.",
    "sourceSummary": "What useful materials were found in the supplied sources.",
    "missingSources": ["Missing statutes, codes, jurisprudence, or doctrine needed for a stronger case."],
    "limits": ["Clear limits caused by the current source pack."],
    "judgeModeFit": "high | medium | low",
    "judgeModeRationale": "Why the current sources and request do or do not fit Judge mode.",
    "canGenerate": true,
    "confidence": "low | medium | high"
  },
  "options": [
    {
      "id": "option-1",
      "title": "Short case title, max 80 chars",
      "level": "introductory | intermediate | advanced",
      "objective": "Pedagogical objective.",
      "targetSkill": "Primary skill being trained in 2 to 6 words.",
      "synopsis": "Neutral facts, 100-600 chars, based on the source-supported concept.",
      "issues": "Main legal question students must argue.",
      "plaintiffPosition": "What the claimant or plaintiff argues or seeks.",
      "defendantPosition": "What the defendant or respondent argues or seeks.",
      "recommendedRole": "plaintiff | defendant",
      "sourcesUsed": [{ "title": "Exact source title", "citation": "Exact article, section, or case if present, otherwise blank", "reason": "Why this source matters" }],
      "practicePoints": ["What students practice."],
      "difficultyTrap": "The main reasoning trap or ambiguity.",
      "sourceWarnings": ["Any source-bound warning for this option."],
      "judgeBrief": {
        "goal": "What Judge mode is testing in this exercise.",
        "studentTask": "What the student must do at the hearing.",
        "hearingFocus": "What the judge should focus on during questioning.",
        "primarySkill": "Main skill being tested.",
        "issuesToProbe": ["Precise issue the judge should probe."],
        "pressurePoints": ["Weaknesses or reasoning gaps the judge should press on."],
        "sourceBoundaries": ["What the judge must not invent beyond the sources."],
        "successCriteria": ["What a strong student performance would look like."]
			},
			"groundingMap": [
				{
					"area": "mainIssue | plaintiffTheory | defendantTheory | judgePressurePoint | successCriteria | sourceBoundary | other",
					"claim": "The exact exercise element being grounded.",
					"sourceTitle": "Exact source title from the SOURCES block.",
					"citation": "Exact article, section, paragraph, case, or quote if present; blank if none.",
					"excerpt": "A verbatim 8-30 word excerpt copied from the source text that supports this element.",
					"note": "Why this excerpt supports the element."
				}
			]
    }
  ]
}

IMPORTANT OUTPUT RULES
- The first item in options must always be the main working draft when a draft is possible.
- If Judge mode fit is low or the sources are too weak for a fair judge-led hearing, set canGenerate to false and explain why.
- If canGenerate is false, options must be [] and assistantMessage must clearly explain which authorities or passages are still missing from retrieval in the active pack.
- judgeBrief must be concrete, source-bound, and usable by the judge without inventing new law or facts.
- For revisions, keep the existing option id when possible so the UI treats it as the same working paper.
- Any article, section, case, doctrine, or source reference must come from the SOURCES block and belong in sourcesUsed, sourceWarnings, or judgeBrief.sourceBoundaries.
- groundingMap is mandatory when canGenerate is true. Include at least 5 items: main issue, plaintiff theory, defendant theory, judge pressure point, and success criteria.
- Every groundingMap excerpt must be copied verbatim from the SOURCES block. If you cannot copy a supporting excerpt, set canGenerate false instead of improvising.
- Do not include legal concepts in groundingMap claims that cannot be tied to a source excerpt.
- Return exactly 1 main draft in options when canGenerate is true. Do not generate alternatives just to fill space.`;

		const requestBuild = async (promptText: string) =>
			callLLM({
				task: 'create-build',
				systemPrompt: buildSystemPrompt,
				userPrompt: promptText,
				temperature: 0.45,
				maxTokens: 7000,
				jsonMode: true,
				schema: caseStudioBuildJsonSchema,
				cachedContent: resolvedDossier.geminiCache?.name
			});

		let buildContent = '';
		try {
			buildContent = await requestBuild(buildUserPrompt);
	} catch (err) {
		console.error('[case-studio build] LLM call failed:', err);
		return throwCreateProviderError(err, 'Failed to create exercise pack. Please try again shortly.');
	}

		let buildResponse: CaseStudioResponse;
		let usedDeterministicCitationFallback = false;
		try {
			buildResponse = normaliseResponse(buildContent, language, sourceCount, {
				dossier: resolvedDossier
			});
			buildResponse = attachSourceBundleToResponse(
				buildResponse,
				buildSourceBundle,
				resolvedDossier.packMemory,
				evidenceSufficiency
			);
		} catch (err) {
			if (!isStructuredOutputError(err)) throw err;
			console.warn('[case-studio build] Malformed structured output; retrying once with stricter JSON rules.');
			let retryContent = '';
			try {
				retryContent = await requestBuild(`${buildUserPrompt}

	OUTPUT RETRY RULES
	- Return one JSON object only.
	- Do not add markdown, code fences, prose, or bullet points.
	- The first character must be { and the last character must be }.`);
				buildResponse = normaliseResponse(retryContent, language, sourceCount, {
					dossier: resolvedDossier
				});
				buildResponse = attachSourceBundleToResponse(
					buildResponse,
					buildSourceBundle,
					resolvedDossier.packMemory,
					evidenceSufficiency
				);
			} catch (retryErr) {
				if (!isStructuredOutputError(retryErr)) throw retryErr;
				console.warn('[case-studio build] Structured output unavailable after retry; attempting JSON repair.', {
					detail: retryErr instanceof Error ? retryErr.message : String(retryErr)
				});
				try {
					const repairedContent = await repairStructuredJsonWithLLM({
						raw: retryContent || buildContent,
						language,
						schema: caseStudioBuildJsonSchema,
						label: 'case-studio build',
						maxTokens: 7000
					});
					buildResponse = normaliseResponse(repairedContent, language, sourceCount, {
						dossier: resolvedDossier
					});
						buildResponse = attachSourceBundleToResponse(
							buildResponse,
							buildSourceBundle,
							resolvedDossier.packMemory,
							evidenceSufficiency
						);
				} catch (repairErr) {
					console.warn('[case-studio build] JSON repair unavailable; returning source-reviewed fallback.', {
						detail: repairErr instanceof Error ? repairErr.message : String(repairErr)
					});
				return json(structuredBuildFallbackResponse({
					language,
					message,
					sourceCount,
					dossier: resolvedDossier
				}), {
					headers: { 'Cache-Control': 'no-store, max-age=0' }
				});
				}
			}
		}

		const requestedCitationForFallback = extractLooseNumericCitationTokens(requestIntent.rawText)[0];
		if (requestedCitationForFallback) {
			const fallbackSource = buildSources.find((source) =>
				cleanText(source.content, source.description).includes(requestedCitationForFallback)
			);
			if (fallbackSource) {
				const sourceBody = cleanText(fallbackSource.content, fallbackSource.description);
				const sourceExcerpt = findCitationExcerptInText(sourceBody, requestedCitationForFallback)
					?? sourceBody.slice(0, 420);
				const fallbackGroundingMap: CaseStudioGroundingMapItem[] = [
					{
						area: 'mainIssue',
						claim: language === 'fr'
							? `Application de l article ${requestedCitationForFallback} dans un conflit civil.`
							: `Applying article ${requestedCitationForFallback} in a civil dispute.`,
						sourceTitle: cleanText(fallbackSource.title, language === 'fr' ? 'Source selectionnee' : 'Selected source'),
						citation: `article ${requestedCitationForFallback}`,
						excerpt: sourceExcerpt,
						status: 'needs-review',
						note: language === 'fr'
							? 'Passage recupere automatiquement depuis le texte source charge.'
							: 'Passage auto-retrieved from loaded source text.'
					}
				];

				const fallbackOption: CaseStudioOption = {
					id: 'option-1',
					title: language === 'fr'
						? `Cas pratique — article ${requestedCitationForFallback}`
						: `Practice Case — Article ${requestedCitationForFallback}`,
					level: 'intermediate',
					objective: language === 'fr'
						? `Appliquer l article ${requestedCitationForFallback} a des faits stipules.`
						: `Apply article ${requestedCitationForFallback} to stipulated facts.`,
					targetSkill: language === 'fr' ? 'Raisonnement juridique source' : 'Source-grounded legal reasoning',
					synopsis: language === 'fr'
						? `Un voisin allegue un prejudice civil et invoque l article ${requestedCitationForFallback}; les parties doivent argumenter uniquement a partir du pack actif.`
						: `A neighbor alleges civil harm under article ${requestedCitationForFallback}; both sides must argue strictly from the active pack.`,
					issues: language === 'fr'
						? `Les faits stipules permettent-ils d engager la responsabilite civile sous l article ${requestedCitationForFallback}?`
						: `Do the stipulated facts establish civil liability under article ${requestedCitationForFallback}?`,
					plaintiffPosition: language === 'fr'
						? `Le demandeur soutient que les conditions de responsabilite sont remplies.`
						: 'The plaintiff argues the liability conditions are met.',
					defendantPosition: language === 'fr'
						? `Le defendeur conteste le lien entre conduite, prejudice et reparation demandee.`
						: 'The defendant contests the link between conduct, harm, and requested remedy.',
					recommendedRole: 'plaintiff',
					sourcesUsed: [
						{
							title: cleanText(fallbackSource.title, language === 'fr' ? 'Source selectionnee' : 'Selected source'),
							citation: `article ${requestedCitationForFallback}`,
							reason: language === 'fr'
								? 'Citation ciblee retrouvee dans les sources chargees du pack actif.'
								: 'Target citation found in loaded active-pack sources.'
						}
					],
					practicePoints: language === 'fr'
						? ['Identifier les conditions de responsabilite', 'Relier les faits au texte source', 'Tester les contre-arguments']
						: ['Identify liability conditions', 'Tie facts to source text', 'Test counter-arguments'],
					difficultyTrap: language === 'fr'
						? 'Confondre affirmation generale et preuve tiree du passage source.'
						: 'Confusing general assertions with proof grounded in source passage.',
					sourceWarnings: [
						language === 'fr'
							? 'Version generee automatiquement sur la citation demandee; verifier les extraits avant usage en classe.'
							: 'Automatically generated on requested citation; verify excerpts before classroom use.'
					],
					judgeBrief: {
						goal: language === 'fr'
							? `Verifier si l etudiant applique correctement l article ${requestedCitationForFallback} aux faits.`
							: `Test whether the student applies article ${requestedCitationForFallback} correctly to the facts.`,
						studentTask: language === 'fr'
							? 'Plaider un camp en restant strictement dans les sources autorisees.'
							: 'Argue one side while staying strictly within allowed sources.',
						hearingFocus: language === 'fr'
							? 'Lien entre conduite, prejudice allegue et reparation demandee.'
							: 'Link between conduct, alleged harm, and requested remedy.',
						primarySkill: language === 'fr' ? 'Application de norme' : 'Rule application',
						issuesToProbe: language === 'fr'
							? ['Quels faits satisfont chaque condition de responsabilite?']
							: ['Which facts satisfy each liability condition?'],
						pressurePoints: language === 'fr'
							? ['Passage source exact utilise pour chaque affirmation.']
							: ['Exact source passage used for each assertion.'],
						sourceBoundaries: language === 'fr'
							? ['Ne pas ajouter de normes externes au pack actif.']
							: ['Do not add rules outside the active pack.'],
						successCriteria: language === 'fr'
							? ['Arguments relies explicitement sur les extraits cites.']
							: ['Arguments rely explicitly on cited excerpts.']
					},
					groundingAudit: pendingGroundingAudit(fallbackGroundingMap, language)
				};

				buildResponse = {
					...buildResponse,
					assistantMessage: language === 'fr'
						? `J ai construit un premier cas sur l article ${requestedCitationForFallback} a partir des sources chargees du pack actif.`
						: `I built an initial case on article ${requestedCitationForFallback} from loaded active-pack sources.`,
					analysis: {
						...buildResponse.analysis,
						canGenerate: true,
						confidence: 'medium'
					},
					draft: fallbackOption,
					options: [fallbackOption],
					alternatives: [],
					workflow: {
						...buildResponse.workflow,
						stage: 'draft-ready',
						nextStep: language === 'fr'
							? 'Vous pouvez maintenant ajuster le niveau ou lancer ce projet en mode juge.'
							: 'You can now adjust the level or launch this draft in Judge mode.'
					}
				};
				usedDeterministicCitationFallback = true;
			}
		}

		const lowCoverageNeedsCaution = buildSourceBundle.coverage === 'low' && !evidenceSufficiency.canProceed;
		if (lowCoverageNeedsCaution && !buildResponse.options.length) {
			buildResponse = {
				...buildResponse,
				assistantMessage: language === 'fr'
					? 'Je ne peux pas conclure de facon fiable que le pack ne couvre pas encore cette demande. Pour ce tour, je n ai pas recuperé assez de passages exacts et directement pertinents. Je peux repartir sur une recherche plus ciblee si vous nommez le point precis, les faits vises, ou l article a verifier.'
					: 'I cannot reliably conclude from this turn that the pack does not cover your request. I did not retrieve enough exact and directly relevant passages yet. I can retry with a more targeted search if you name the precise issue, facts, or article to verify.',
				analysis: {
					...buildResponse.analysis,
					canGenerate: false,
					confidence: 'low',
					limits: Array.from(new Set([
						...buildResponse.analysis.limits,
						language === 'fr'
							? 'Couverture de retrieval encore trop faible pour conclure proprement sur l absence de support dans le pack.'
							: 'Retrieval coverage is still too weak to conclude cleanly that the pack lacks support.'
					]))
				},
				workflow: {
					...buildResponse.workflow,
					stage: 'source-reviewed',
					nextStep: language === 'fr'
						? 'Precisez la notion, l angle factuel, ou l article vise pour que je relance une recherche plus ciblee dans le pack actif.'
						: 'Name the concept, factual angle, or target article so I can rerun a more targeted search inside the active pack.'
				}
			};
		}

	const canKeepNarrowDraft = !evidenceSufficiency.canProceed
		&& buildResponse.options.length > 0
		&& (evidenceSufficiency.mainRuleCovered || buildSourceBundle.coverage !== 'low')
		&& buildSourceBundle.excerptCount >= 2;

	if (!evidenceSufficiency.canProceed && buildResponse.options.length && !canKeepNarrowDraft && !usedDeterministicCitationFallback) {
		return json(
			enforceBuildCitationTruth({
				...buildResponse,
				assistantMessage: language === 'fr'
					? `Je ne peux pas lancer ce projet de facon fiable avec les passages recuperes. Il manque encore: ${evidenceSufficiency.missingConcepts.join('; ') || 'des passages juridiques connexes'}.`
					: `I cannot launch this draft reliably from the retrieved passages yet. Still missing: ${evidenceSufficiency.missingConcepts.join('; ') || 'related legal passages'}.`,
				analysis: {
					...buildResponse.analysis,
					canGenerate: false,
					confidence: 'low',
					missingSources: Array.from(new Set([...buildResponse.analysis.missingSources, ...evidenceSufficiency.missingConcepts])),
					limits: Array.from(new Set([...buildResponse.analysis.limits, evidenceSufficiency.reason]))
				},
				draft: null,
				alternatives: [],
				options: [],
				workflow: {
					...buildResponse.workflow,
					stage: 'source-reviewed',
					nextStep: language === 'fr'
						? 'Indiquez les articles/pages precis a verifier, ou demandez une version plus etroite; je relancerai la recherche dans le pack actif.'
						: 'Name the exact articles/pages to verify, or ask for a narrower version; I will rerun retrieval in the active pack.'
				}
			}),
			{ headers: { 'Cache-Control': 'no-store, max-age=0' } }
		);
	}

	if (canKeepNarrowDraft && !usedDeterministicCitationFallback) {
		const narrowedWarning = language === 'fr'
			? `Version etroite construite a partir des passages recuperes. Points encore incomplets: ${evidenceSufficiency.missingConcepts.join('; ') || 'certaines limites ou exceptions voisines'}.`
			: `Narrower version built from the retrieved passages. Still incomplete: ${evidenceSufficiency.missingConcepts.join('; ') || 'some related limits or exceptions'}.`;
		buildResponse = {
			...buildResponse,
			assistantMessage: language === 'fr'
				? `J ai construit la version la plus etroite que les passages recuperes appuient clairement. ${evidenceSufficiency.missingConcepts.length ? `Il reste toutefois des points a verifier: ${evidenceSufficiency.missingConcepts.join('; ')}.` : ''}`
				: `I built the narrowest version clearly supported by the retrieved passages. ${evidenceSufficiency.missingConcepts.length ? `Some points still need checking: ${evidenceSufficiency.missingConcepts.join('; ')}.` : ''}`,
			analysis: {
				...buildResponse.analysis,
				confidence: 'low',
				missingSources: Array.from(new Set([...buildResponse.analysis.missingSources, ...evidenceSufficiency.missingConcepts])),
				limits: Array.from(new Set([...buildResponse.analysis.limits, evidenceSufficiency.reason]))
			},
			options: buildResponse.options.map((option) => ({
				...option,
				sourceWarnings: Array.from(new Set([...option.sourceWarnings, narrowedWarning]))
			})),
			draft: buildResponse.draft
				? {
					...buildResponse.draft,
					sourceWarnings: Array.from(new Set([...buildResponse.draft.sourceWarnings, narrowedWarning]))
				}
				: buildResponse.draft
		};
	}

	if (buildResponse.options.length && !usedDeterministicCitationFallback) {
		const optionsWithSourceBackbone = buildResponse.options.map((option) => {
			if (option.sourcesUsed.length || !buildSourceBundle.excerpts.length) return option;
			const fallbackSourcesUsed = Array.from(
				new Map(
					buildSourceBundle.excerpts.map((excerpt) => [
						excerpt.sourceId,
						{
							title: excerpt.sourceTitle,
							citation: excerpt.citation ?? '',
							reason: language === 'fr'
								? 'Source rattachee automatiquement depuis les passages recuperes du pack actif.'
								: 'Source auto-linked from retrieved passages in the active pack.'
						}
					])
				).values()
			).slice(0, 4);
			const sourceBackboneWarning = language === 'fr'
				? 'Sources rattachees automatiquement depuis le packet recupere; verifier les citations avant finalisation.'
				: 'Sources were auto-linked from the retrieved packet; verify citations before finalizing.';
			return {
				...option,
				sourcesUsed: fallbackSourcesUsed,
				sourceWarnings: Array.from(new Set([...option.sourceWarnings, sourceBackboneWarning]))
			};
		});

		const optionBackboneById = new Map(optionsWithSourceBackbone.map((option) => [option.id, option]));
		buildResponse = {
			...buildResponse,
			draft: buildResponse.draft
				? optionBackboneById.get(buildResponse.draft.id) ?? optionsWithSourceBackbone[0] ?? buildResponse.draft
				: buildResponse.draft,
			options: optionsWithSourceBackbone,
			alternatives: buildResponse.draft
				? optionsWithSourceBackbone.filter((option) => option.id !== (buildResponse.draft?.id ?? ''))
				: optionsWithSourceBackbone.slice(1)
		};

		const auditedOptions = buildResponse.options.map((option) => ({
			...option,
			groundingAudit: auditCaseStudioOption({ option, sources: buildPromptSources, language })
		}));
		const usableOptions = auditedOptions.filter((option) => option.groundingAudit?.status !== 'insufficient-sources');
		const recoverableOption = !usableOptions.length
			? auditedOptions.find((option) => {
				const audit = option.groundingAudit;
				if (!audit) return false;
				const groundedItems = audit.groundingMap.filter((item) => item.status === 'grounded').length;
				return groundedItems > 0 && audit.checks.sourceTitlesVerified && audit.checks.judgeModeAligned;
			})
			: null;
		const recoveredOptions: CaseStudioOption[] = recoverableOption
			? [
				{
					...recoverableOption,
					groundingAudit: {
						...recoverableOption.groundingAudit,
						status: 'needs-review' as const,
						blockedReasons: [],
						warnings: Array.from(new Set([
							...recoverableOption.groundingAudit.warnings,
							...recoverableOption.groundingAudit.blockedReasons
						]))
					},
					sourceWarnings: Array.from(new Set([
						...recoverableOption.sourceWarnings,
						language === 'fr'
							? 'Version jouable conservee a partir des passages verifies; certains rattachements restent a revoir.'
							: 'Playable version kept from verified passages; some source links still need review.'
					]))
				}
			]
			: [];
		const finalUsableOptions: CaseStudioOption[] = usableOptions.length ? usableOptions : recoveredOptions;
		const auditedDraft = buildResponse.draft
			? finalUsableOptions.find((option) => option.id === buildResponse.draft?.id) ?? finalUsableOptions[0] ?? null
			: null;
		buildResponse = {
			...buildResponse,
			draft: auditedDraft,
			options: finalUsableOptions,
			alternatives: auditedDraft
				? finalUsableOptions.filter((option) => option.id !== auditedDraft.id)
				: finalUsableOptions.slice(1)
		};

		const blockingAudit = !finalUsableOptions.length
			? auditedOptions.find((option) => option.groundingAudit?.status === 'insufficient-sources')?.groundingAudit ?? null
			: null;
		if (blockingAudit) {
			return json(
				enforceBuildCitationTruth({
					...buildResponse,
					assistantMessage: formatGroundingBlockMessage(blockingAudit, language),
					analysis: {
						...buildResponse.analysis,
						canGenerate: false,
						confidence: 'low',
						missingSources: Array.from(new Set([...buildResponse.analysis.missingSources, ...blockingAudit.blockedReasons])),
						limits: Array.from(new Set([...buildResponse.analysis.limits, ...blockingAudit.warnings]))
					},
					draft: null,
					alternatives: [],
					options: [],
					workflow: {
						...buildResponse.workflow,
						stage: 'source-reviewed',
						nextStep: language === 'fr'
							? 'Demandez une version plus etroite ou nommez les passages a verifier; je poursuis la recherche dans le pack actif.'
							: 'Ask for a narrower version or name passages to verify; I will continue retrieval in the active pack.'
					}
				}),
				{ headers: { 'Cache-Control': 'no-store, max-age=0' } }
			);
		}
	}
	return json(
		enforceBuildCitationTruth({
			...buildResponse,
			dossier: resolvedDossier
		}),
		{
			headers: { 'Cache-Control': 'no-store, max-age=0' }
		}
	);
};