import type { CaseStudioMode } from '$lib/caseStudioIntent';
import type { PackLanguage } from '$lib/types';

export type CaseStudioTeacherHints = {
	citations: string[];
	pages: string[];
	sourceTitles: string[];
	concepts: string[];
	commands: string[];
};

export type CaseStudioRetrievalJob = {
	version: 'case-studio-retrieval-job-v1';
	userRequest: string;
	mode: CaseStudioMode;
	mustRetrieve: boolean;
	reason: string;
	pack: {
		packId?: string;
		packName?: string;
		sourceIds: string[];
		sourceTitles: string[];
	};
	teacherHints: CaseStudioTeacherHints;
	mandatoryTargets: string[];
	initialQuery: string;
};

type BuildRetrievalJobArgs = {
	userRequest: string;
	history?: Array<{ role?: string; content?: string }>;
	mode: CaseStudioMode;
	sourceBound: boolean;
	hasSelectedSources: boolean;
	pack?: {
		packId?: string;
		packName?: string;
		sourceIds?: string[];
		sourceTitles?: string[];
	};
};

const unique = (values: string[], limit = 12): string[] =>
	Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);

const normalize = (value: string): string =>
	value
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim();

const splitCitationGroup = (raw: string): string[] =>
	raw
		.split(/\s*(?:,|;|et|and|ou|or|-)\s*/i)
		.map((part) => part.trim())
		.filter(Boolean);

const articleGroupPattern = /\b(?:article|articles|art\.?|section|sections|sec\.?|s\.?|ss\.?|§)\s+([0-9][A-Za-z0-9()./-]*(?:\s*(?:,|;|et|and|ou|or|-)\s*[0-9][A-Za-z0-9()./-]*)*)/gi;
const codeCitationPattern = /\b([0-9]{1,5}(?:\.[0-9]+)?[A-Za-z]?)\s*(?:c\.?\s*c\.?\s*q\.?|ccq|code civil du quebec|code civil du québec|c\.?\s*cr\.?|code criminel|criminal code)\b/gi;
const pagePattern = /\b(?:page|pages|p\.?|pg\.?|a\s+la\s+page|à\s+la\s+page)\s*([0-9]{1,5})\b/gi;

const conceptMatchers: Array<{ concept: string; pattern: RegExp; related: string[] }> = [
	{ concept: 'responsabilite civile', pattern: /responsabilit[a-z]*\s+civil[a-z]*|civil\s+liability/, related: ['faute', 'prejudice', 'dommage', 'causalite', 'reparation'] },
	{ concept: 'bagarre', pattern: /\bbagarr[a-z]*\b|\baltercation\b|\bfight\b|\bassault\b|\bviolence\b/, related: ['blessure', 'faute', 'dommage', 'prejudice', 'responsabilite'] },
	{ concept: 'contrat', pattern: /\bcontrat\b|\bcontract\b|\binexecution\b|\bbreach\b/, related: ['obligation', 'inexecution', 'dommages', 'responsabilite contractuelle'] },
	{ concept: 'dommages', pattern: /\bdommages?\b|\bdamages?\b|\bprejudice\b|\bpréjudice\b/, related: ['reparation', 'indemnisation', 'causalite'] },
	{ concept: 'prescription', pattern: /\bprescription\b|\blimitation\b|\bdelai\b|\bdélai\b/, related: ['delai', 'recours', 'extinction'] },
	{ concept: 'mandat', pattern: /\bmandat\b|\bmandataire\b|\bmandator\b/, related: ['obligation', 'responsabilite', 'pouvoirs'] }
];

const extractCitations = (text: string): string[] => {
	const citations: string[] = [];
	for (const match of text.matchAll(articleGroupPattern)) {
		if (!match[1]) continue;
		citations.push(...splitCitationGroup(match[1]));
	}
	for (const match of text.matchAll(codeCitationPattern)) {
		if (match[1]) citations.push(match[1]);
	}
	return unique(citations, 16);
};

const extractPages = (text: string): string[] => {
	const pages: string[] = [];
	for (const match of text.matchAll(pagePattern)) {
		if (match[1]) pages.push(match[1]);
	}
	return unique(pages, 8);
};

const extractQuotedSourceTitles = (text: string): string[] => {
	const titles: string[] = [];
	for (const match of text.matchAll(/["“”«»']([^"“”«»']{4,120})["“”«»']/g)) {
		const value = match[1]?.trim();
		if (value && /code|loi|law|act|règlement|reglement|source|document|jurisprudence|decision|décision/i.test(value)) {
			titles.push(value);
		}
	}
	return unique(titles, 6);
};

const extractConcepts = (text: string): string[] => {
	const normalized = normalize(text);
	const concepts: string[] = [];
	for (const matcher of conceptMatchers) {
		if (matcher.pattern.test(normalized)) concepts.push(matcher.concept, ...matcher.related);
	}
	return unique(concepts, 18);
};

const extractCommands = (text: string): string[] => {
	const normalized = normalize(text);
	const commands: string[] = [];
	if (/\b(?:build|create|draft|generate|write|construis|cree|crée|redige|rédige|fais)\b/.test(normalized)) commands.push('build-case');
	if (/\b(?:read|scan|search|find|retrieve|look\s+for|lis|cherche|trouve|va\s+chercher)\b/.test(normalized)) commands.push('retrieve-source');
	if (/\b(?:my|uploaded|active|pack|source|sources|code|document|mes|mon|ma|pack|source|sources|televerse|téléversé)\b/.test(normalized)) commands.push('active-pack-bound');
	return unique(commands, 8);
};

export const extractCaseStudioTeacherHints = (text: string): CaseStudioTeacherHints => ({
	citations: extractCitations(text),
	pages: extractPages(text),
	sourceTitles: extractQuotedSourceTitles(text),
	concepts: extractConcepts(text),
	commands: extractCommands(text)
});

export const buildCaseStudioRetrievalJob = (args: BuildRetrievalJobArgs): CaseStudioRetrievalJob => {
	const historyText = (args.history ?? [])
		.filter((entry) => entry.role === 'user')
		.map((entry) => String(entry.content ?? '').trim())
		.filter(Boolean)
		.slice(-4)
		.join('\n\n');
	const userRequest = [historyText, args.userRequest.trim()].filter(Boolean).join('\n\n');
	const teacherHints = extractCaseStudioTeacherHints(userRequest);
	const hasTeacherHints = Boolean(
		teacherHints.citations.length
		|| teacherHints.pages.length
		|| teacherHints.sourceTitles.length
		|| teacherHints.concepts.length
		|| teacherHints.commands.includes('retrieve-source')
		|| teacherHints.commands.includes('active-pack-bound')
	);
	const mustRetrieve = args.hasSelectedSources && (args.mode === 'build' || args.sourceBound || hasTeacherHints);
	const mandatoryTargets = unique([
		...teacherHints.citations.map((citation) => `citation:${citation}`),
		...teacherHints.pages.map((page) => `page:${page}`),
		...teacherHints.sourceTitles.map((title) => `source:${title}`),
		...teacherHints.concepts.map((concept) => `concept:${concept}`)
	], 24);
	const packSourceTitles = unique(args.pack?.sourceTitles ?? [], 16);
	const initialQuery = unique([
		args.userRequest,
		...teacherHints.citations.map((citation) => `article ${citation}`),
		...teacherHints.pages.map((page) => `page ${page}`),
		...teacherHints.sourceTitles,
		...teacherHints.concepts,
		...packSourceTitles
	], 32).join('\n');

	return {
		version: 'case-studio-retrieval-job-v1',
		userRequest,
		mode: args.mode,
		mustRetrieve,
		reason: mustRetrieve
			? 'The teacher request is source-bound or asks for a draft from active-pack materials; retrieval must run before answering.'
			: 'No mandatory source-bound retrieval signal was detected.',
		pack: {
			packId: args.pack?.packId,
			packName: args.pack?.packName,
			sourceIds: unique(args.pack?.sourceIds ?? [], 64),
			sourceTitles: packSourceTitles
		},
		teacherHints,
		mandatoryTargets,
		initialQuery
	};
};

export const retrievalJobSearchHints = (job: CaseStudioRetrievalJob) => ({
	titles: job.teacherHints.sourceTitles.length ? job.teacherHints.sourceTitles : job.pack.sourceTitles,
	citations: job.teacherHints.citations,
	terms: unique([
		...job.teacherHints.concepts,
		...job.teacherHints.pages.map((page) => `page ${page}`),
		...job.mandatoryTargets
	], 32)
});

export const renderCaseStudioRetrievalJobBlock = (job: CaseStudioRetrievalJob, language: PackLanguage): string => {
	if (!job.mustRetrieve && !job.mandatoryTargets.length) return '';
	const labels = language === 'fr'
		? {
			title: 'RETRIEVAL JOB OBLIGATOIRE',
			reason: 'Raison',
			must: 'Recherche obligatoire',
			targets: 'Cibles imposees par l enseignant',
			query: 'Requete initiale controlee',
			rule: 'Regle'
		}
		: {
			title: 'MANDATORY RETRIEVAL JOB',
			reason: 'Reason',
			must: 'Mandatory retrieval',
			targets: 'Teacher-imposed targets',
			query: 'Controlled initial query',
			rule: 'Rule'
		};
	const rule = language === 'fr'
		? 'Ces cibles doivent etre cherchees dans le pack actif avant toute conclusion. Si une cible est trouvee, elle prime sur les suggestions generiques.'
		: 'These targets must be searched in the active pack before any conclusion. If a target is found, it overrides generic suggestions.';
	return `${labels.title}\n${labels.must}: ${job.mustRetrieve ? 'yes' : 'no'}\n${labels.reason}: ${job.reason}\n${labels.targets}: ${job.mandatoryTargets.length ? job.mandatoryTargets.join('; ') : 'none'}\n${labels.query}:\n${job.initialQuery}\n${labels.rule}: ${rule}`;
};
