import type { LibraryDocument } from '$lib/data/library';
import type {
	CaseStudioGroundingAudit,
	CaseStudioGroundingMapItem,
	CaseStudioOption,
	PackLanguage
} from '$lib/types';
import { validateCitations } from './citationValidator';

const normalise = (value: string): string =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const requiredGroundingAreas: Array<CaseStudioGroundingMapItem['area']> = [
	'mainIssue',
	'plaintiffTheory',
	'defendantTheory',
	'judgePressurePoint',
	'successCriteria'
];

const citationHintPattern = /\b(?:article|art\.?|section|sec\.?|paragraph|para\.?|alinea|alin(?:ea|ea\.)|s\.|§)\s*[0-9]+(?:[A-Za-z0-9()./-]+)*/i;

const collectOptionText = (option: CaseStudioOption): string => {
	const brief = option.judgeBrief;
	return [
		option.title,
		option.objective,
		option.targetSkill,
		option.synopsis,
		option.issues,
		option.plaintiffPosition,
		option.defendantPosition,
		option.difficultyTrap,
		...option.practicePoints,
		...option.sourceWarnings,
		brief?.goal,
		brief?.studentTask,
		brief?.hearingFocus,
		brief?.primarySkill,
		...(brief?.issuesToProbe ?? []),
		...(brief?.pressurePoints ?? []),
		...(brief?.sourceBoundaries ?? []),
		...(brief?.successCriteria ?? []),
		...(option.groundingAudit?.groundingMap ?? []).flatMap((item) => [item.claim, item.citation, item.excerpt, item.note])
	]
		.filter(hasText)
		.join('\n');
};

const outsideProofDemandPattern = /\b(?:provide|produce|submit|upload|send|show|authenticate|obtain|discover|depose|call|bring)\b[\s\S]{0,90}\b(?:exhibit|evidence|photo|photograph|recording|video|email|contract|witness|testimony|expert|report|document|file|receipt|invoice|discovery|affidavit|deposition)\b|\b(?:fournir|produire|deposer|déposer|televerser|téléverser|envoyer|montrer|authentifier|obtenir|appeler)\b[\s\S]{0,90}\b(?:piece|pièce|preuve|photo|enregistrement|video|vidéo|courriel|contrat|temoin|témoin|temoignage|témoignage|expert|rapport|document|dossier|facture|decouverte|découverte|affidavit)\b/i;

const sourceTitleMap = (sources: LibraryDocument[]): Map<string, LibraryDocument> => {
	const map = new Map<string, LibraryDocument>();
	for (const source of sources) {
		map.set(normalise(source.title), source);
	}
	return map;
};

const sourceContainsExcerpt = (source: LibraryDocument | undefined, excerpt: string | undefined): boolean => {
	if (!source || !excerpt?.trim()) return false;
	const content = source.content?.trim() || source.description?.trim() || '';
	if (!content) return false;
	return normalise(content).includes(normalise(excerpt));
};

const citationKey = (value: string): string => normalise(value).replace(/[.,;:]+$/g, '');

const defaultSummary = (status: CaseStudioGroundingAudit['status'], language: PackLanguage): string => {
	if (language === 'fr') {
		if (status === 'source-grounded') return 'Audit reussi: le projet est rattache aux sources selectionnees et au cadre du mode juge.';
		if (status === 'insufficient-sources') return 'Audit bloque: le projet ne peut pas etre lance de facon fiable avec les sources actuelles.';
		return 'Audit partiel: le projet semble utilisable, mais certains rattachements aux sources demandent une revue.';
	}
	if (status === 'source-grounded') return 'Audit passed: the draft is tied to the selected sources and aligned with Judge mode.';
	if (status === 'insufficient-sources') return 'Audit blocked: this draft cannot be launched reliably with the current sources.';
	return 'Partial audit: the draft may be usable, but some source links need review.';
};

const warningText = (key: string, language: PackLanguage): string => {
	const fr: Record<string, string> = {
		noSources: 'Aucune source chargee pour auditer le projet.',
		noSourcesUsed: 'Le projet ne declare aucune source utilisee.',
		badSourceTitle: 'Au moins une source declaree ne correspond pas aux sources selectionnees.',
		badCitation: 'Au moins une citation ou reference juridique doit etre revue; elle n a pas ete localisee textuellement dans les sources.',
		outsideProof: 'Le projet semble demander une preuve externe ou une production de documents hors exercice.',
		judgeBrief: 'Le brief du juge est incomplet pour encadrer une audience source-bound.',
		boundaries: 'Les limites de sources du juge sont trop minces ou absentes.',
		map: 'La carte de rattachement ne contient pas assez d extraits verbatim verifiables dans le packet de sources.'
	};
	const en: Record<string, string> = {
		noSources: 'No loaded sources were available for audit.',
		noSourcesUsed: 'The draft does not declare any sources used.',
		badSourceTitle: 'At least one declared source does not match the selected sources.',
		badCitation: 'At least one citation or legal reference needs review; it was not located verbatim in the sources.',
		outsideProof: 'The draft appears to require outside proof or document production beyond the exercise.',
		judgeBrief: 'The judge brief is incomplete for a source-bound hearing.',
		boundaries: 'The judge source boundaries are too thin or missing.',
		map: 'The grounding map does not contain enough verbatim excerpts verifiable inside the retrieved source packet.'
	};
	return (language === 'fr' ? fr : en)[key] ?? key;
};

const deriveMapFromSourcesUsed = (option: CaseStudioOption): CaseStudioGroundingMapItem[] =>
	option.sourcesUsed.map((sourceUse) => ({
		area: 'other',
		claim: sourceUse.reason,
		sourceTitle: sourceUse.title,
		citation: sourceUse.citation,
		status: 'needs-review',
		note: 'Derived from sourcesUsed; no verbatim excerpt was supplied by the drafting model.'
	}));

const extractVerbatimExcerpt = (source: LibraryDocument): string | undefined => {
	const body = (source.content?.trim() || source.description?.trim() || '').replace(/\s+/g, ' ').trim();
	if (!body) return undefined;

	const candidates = body
		.split(/(?<=[.!?;:])\s+/)
		.map((segment) => segment.trim())
		.filter(Boolean);

	for (const candidate of candidates) {
		const words = candidate.split(/\s+/).filter(Boolean);
		if (words.length >= 8 && words.length <= 30) return candidate;
	}

	const firstWords = body.split(/\s+/).filter(Boolean).slice(0, 24);
	if (firstWords.length >= 8) return firstWords.join(' ');
	return undefined;
};

const pickClaimForArea = (option: CaseStudioOption, area: CaseStudioGroundingMapItem['area']): string => {
	if (area === 'mainIssue') return option.issues || option.objective || option.title;
	if (area === 'plaintiffTheory') return option.plaintiffPosition || option.judgeBrief.studentTask || option.synopsis;
	if (area === 'defendantTheory') return option.defendantPosition || option.synopsis;
	if (area === 'judgePressurePoint') {
		return option.judgeBrief.pressurePoints[0] || option.difficultyTrap || option.judgeBrief.hearingFocus || option.issues;
	}
	if (area === 'successCriteria') return option.judgeBrief.successCriteria[0] || option.judgeBrief.goal || option.objective;
	return option.objective || option.synopsis || option.title;
};

const deriveFallbackGroundingMap = (args: {
	option: CaseStudioOption;
	sources: LibraryDocument[];
	existingMap: CaseStudioGroundingMapItem[];
	titleMap: Map<string, LibraryDocument>;
}): CaseStudioGroundingMapItem[] => {
	const citationByTitle = new Map(
		args.option.sourcesUsed
			.filter((entry) => hasText(entry.title))
			.map((entry) => [normalise(entry.title), entry.citation?.trim() || ''])
	);

	const supports = args.sources
		.map((source) => {
			const excerpt = extractVerbatimExcerpt(source);
			if (!excerpt) return null;
			const title = source.title.trim();
			const declaredCitation = citationByTitle.get(normalise(title)) || '';
			const sourceCitation = source.content?.match(citationHintPattern)?.[0]?.trim() || '';
			return {
				title,
				excerpt,
				citation: declaredCitation || sourceCitation
			};
		})
		.filter((support): support is { title: string; excerpt: string; citation: string } => Boolean(support));

	if (!supports.length) return [];

	const excerptGroundedAreas = new Set(
		args.existingMap
			.filter((item) => {
				const source = args.titleMap.get(normalise(item.sourceTitle));
				return sourceContainsExcerpt(source, item.excerpt);
			})
			.map((item) => item.area)
	);

	const fallback: CaseStudioGroundingMapItem[] = [];
	let supportIndex = 0;
	for (const area of requiredGroundingAreas) {
		if (excerptGroundedAreas.has(area)) continue;
		const support = supports[supportIndex % supports.length];
		supportIndex += 1;
		fallback.push({
			area,
			claim: pickClaimForArea(args.option, area),
			sourceTitle: support.title,
			citation: support.citation || undefined,
			excerpt: support.excerpt,
			status: 'needs-review',
			note: 'Auto-grounded from retrieved source packet because the model grounding map was incomplete.'
		});
	}

	return fallback;
};

export const auditCaseStudioOption = (args: {
	option: CaseStudioOption;
	sources: LibraryDocument[];
	language: PackLanguage;
}): CaseStudioGroundingAudit => {
	const { option, sources, language } = args;
	const titleMap = sourceTitleMap(sources);
	const warnings: string[] = [];
	const blockedReasons: string[] = [];

	const declaredSources = option.sourcesUsed.filter((entry) => entry.title.trim());
	const sourceTitlesVerified =
		sources.length > 0 &&
		declaredSources.length > 0 &&
		declaredSources.every((entry) => titleMap.has(normalise(entry.title)));

	if (!sources.length) blockedReasons.push(warningText('noSources', language));
	if (!declaredSources.length) blockedReasons.push(warningText('noSourcesUsed', language));
	if (declaredSources.length && !sourceTitlesVerified) blockedReasons.push(warningText('badSourceTitle', language));

	const baseMap = option.groundingAudit?.groundingMap?.length
		? option.groundingAudit.groundingMap
		: deriveMapFromSourcesUsed(option);
	const fallbackGroundingMap = deriveFallbackGroundingMap({
		option,
		sources,
		existingMap: baseMap,
		titleMap
	});
	const suppliedMap = [...baseMap, ...fallbackGroundingMap];

	const declaredCitations = [
		...option.sourcesUsed.map((entry) => entry.citation).filter(hasText),
		...suppliedMap.map((entry) => entry.citation).filter(hasText)
	];
	const citationResult = validateCitations({
		message: collectOptionText(option),
		declaredCitations,
		sources,
		extractQuotes: false
	});
	const citationStatus = new Map(citationResult.citations.map((citation) => [citationKey(citation.text), citation.status]));
	const citationsVerified = citationResult.unverifiedCount === 0;
	if (!citationsVerified) warnings.push(warningText('badCitation', language));

	const noOutsideProofRequired = !outsideProofDemandPattern.test(
		[
			option.issues,
			option.plaintiffPosition,
			option.defendantPosition,
			option.difficultyTrap,
			...option.sourceWarnings,
			option.judgeBrief.studentTask,
			option.judgeBrief.hearingFocus,
			...option.judgeBrief.issuesToProbe,
			...option.judgeBrief.pressurePoints,
			...option.judgeBrief.successCriteria
		].join('\n')
	);
	if (!noOutsideProofRequired) blockedReasons.push(warningText('outsideProof', language));

	const judgeModeAligned = Boolean(
		option.judgeBrief.goal.trim() &&
		option.judgeBrief.studentTask.trim() &&
		option.judgeBrief.hearingFocus.trim() &&
		option.judgeBrief.primarySkill.trim() &&
		option.judgeBrief.issuesToProbe.length &&
		option.judgeBrief.pressurePoints.length &&
		option.judgeBrief.successCriteria.length
	);
	if (!judgeModeAligned) blockedReasons.push(warningText('judgeBrief', language));

	const sourceBoundariesComplete = option.judgeBrief.sourceBoundaries.length > 0;
	if (!sourceBoundariesComplete) warnings.push(warningText('boundaries', language));

	const auditedMap = suppliedMap.map((item) => {
		const source = titleMap.get(normalise(item.sourceTitle));
		const citation = item.citation?.trim();
		const citationWasRejected = citation ? citationStatus.get(citationKey(citation)) === 'unverified' : false;
		const excerptVerified = sourceContainsExcerpt(source, item.excerpt);
		const status: CaseStudioGroundingMapItem['status'] = !source
			? 'unsupported'
			: excerptVerified && !citationWasRejected
				? 'grounded'
				: 'needs-review';
		return {
			...item,
			status,
			note: status === 'grounded'
				? item.note
				: item.note || (source ? warningText('map', language) : warningText('badSourceTitle', language))
		};
	});

	const groundedMapItems = auditedMap.filter((item) => {
		const source = titleMap.get(normalise(item.sourceTitle));
		return sourceContainsExcerpt(source, item.excerpt);
	});
	const excerptGroundedAreas = new Set(groundedMapItems.map((item) => item.area));
	const groundingMapComplete = auditedMap.length >= 5 && requiredGroundingAreas.every((area) => excerptGroundedAreas.has(area));
	if (!groundingMapComplete) {
		if (groundedMapItems.length === 0) {
			blockedReasons.push(warningText('map', language));
		} else {
			warnings.push(warningText('map', language));
		}
	}

	const uniqueWarnings = Array.from(new Set(warnings));
	const uniqueBlockedReasons = Array.from(new Set(blockedReasons));
	const status: CaseStudioGroundingAudit['status'] = uniqueBlockedReasons.length
		? 'insufficient-sources'
		: uniqueWarnings.length
			? 'needs-review'
			: 'source-grounded';

	return {
		status,
		summary: defaultSummary(status, language),
		warnings: uniqueWarnings,
		blockedReasons: uniqueBlockedReasons,
		checks: {
			sourceTitlesVerified,
			citationsVerified,
			noOutsideProofRequired,
			judgeModeAligned,
			sourceBoundariesComplete,
			groundingMapComplete
		},
		groundingMap: auditedMap
	};
};

export const formatGroundingBlockMessage = (audit: CaseStudioGroundingAudit, language: PackLanguage): string => {
	const reasons = audit.blockedReasons.length ? audit.blockedReasons : audit.warnings;
	const list = reasons.map((reason) => `- ${reason}`).join('\n');
	return language === 'fr'
		? `Je ne peux pas lancer ce projet de façon fiable pour le moment. L audit de rattachement aux sources a bloque le document:\n${list}\n\nAjoutez des sources plus precises ou demandez-moi de reconstruire l exercice avec un objectif plus etroit.`
		: `I cannot launch this draft reliably yet. The source-grounding audit blocked the document:\n${list}\n\nAdd more precise sources or ask me to rebuild the exercise with a narrower objective.`;
};