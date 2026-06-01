import { createHash } from 'node:crypto';
import type { LibraryDocument } from '$lib/data/library';
import type { SourceBundle, SourceBundleExcerpt } from '$lib/types';
import { estimateTokens } from '$lib/server/sources';
import { parseLegalStructure, type LegalUnitKind } from '$lib/server/legalStructure';

type SourceMapChunk = {
	sourceId: string;
	sourceTitle: string;
	jurisdiction?: string;
	docType?: LibraryDocument['docType'];
	chunkIndex: number;
	heading?: string;
	citation?: string;
	legalUnitId?: string;
	legalUnitKind?: LegalUnitKind;
	legalPath?: string[];
	legalStartOffset?: number;
	legalEndOffset?: number;
	legalStructureConfidence?: 'high' | 'medium' | 'low';
	excerpt: string;
	normalizedTitle: string;
	normalizedHaystack: string;
	searchTerms: string[];
	canonicalCitations: string[];
};

type SourceMap = {
	builtAt: number;
	expiresAt: number;
	chunks: SourceMapChunk[];
	chunksBySource: Map<string, SourceMapChunk[]>;
};

type CachedSourceMapEntry = {
	map: SourceMap;
	expiresAt: number;
};

type SourcePacketHintArgs = {
	titles?: string[];
	citations?: string[];
	terms?: string[];
};

type BuildRelevantSourceBundleArgs = {
	cacheKey: string;
	sources: LibraryDocument[];
	query: string;
	maxExcerpts?: number;
	hints?: SourcePacketHintArgs;
	fallbackMode?: 'first-chunks' | 'none';
};

type SourceDocType = NonNullable<LibraryDocument['docType']>;

type SourceQueryProfile = {
	query: string;
	primaryQueryTokens: string[];
	queryTokens: string[];
	queryTokenSet: Set<string>;
	hintTitles: string[];
	hintTitleTokens: string[];
	hintTerms: string[];
	hintTermTokens: string[];
	citationNeedles: string[];
	canonicalCitationRefs: string[];
	queryPhraseNeedles: string[];
	preferredJurisdictions: string[];
	preferredDocTypes: SourceDocType[];
};

const SOURCE_MAP_CACHE_TTL_MS = 30 * 60_000;
const SOURCE_MAP_CACHE_LIMIT = 64;
const TARGET_CHUNK_CHARS = 1400;
const MAX_CHUNK_CHARS = 2200;
const MAX_QUERY_LENGTH = 3000;
const MIN_FUZZY_TOKEN_LENGTH = 6;
const MAX_SEARCH_TERMS = 64;

const sourceMapCache = new Map<string, CachedSourceMapEntry>();

const stopWords = new Set([
	'a', 'an', 'and', 'are', 'as', 'at', 'au', 'aux', 'be', 'by', 'ce', 'ces', 'cet', 'cette', 'dans',
	'de', 'des', 'do', 'du', 'elle', 'en', 'est', 'et', 'for', 'from', 'has', 'have', 'how', 'ils',
	'into', 'its', 'la', 'le', 'les', 'mais', 'not', 'nous', 'our', 'ou', 'pour', 'par', 'pas', 'plus',
	'que', 'qui', 'se', 'ses', 'should', 'sur', 'than', 'that', 'the', 'their', 'them', 'there', 'they',
	'this', 'those', 'une', 'with', 'vous', 'your'
]);

const citationPattern = /\b(?:article|articles|art\.?|section|sections|sec\.?|paragraph|paragraphs|para\.?|par\.?|clause|clauses|alin(?:ea|ea\.)|s\.|ss\.|§)\s*[0-9]+(?:[A-Za-z0-9()./-]+)*/gi;
const bareArticleNumberPattern = /(?:^|\n)\s*([0-9]{3,5}(?:\.[0-9]+)?[a-z]?)\s*[.)]\s+/gim;
const canonicalCitationPatterns: Array<{ kind: 'article' | 'section' | 'paragraph'; regex: RegExp }> = [
	{ kind: 'article', regex: /\b(?:article|articles|art\.?)\s*([0-9]{1,5}(?:\.[0-9]+)?[a-z]?(?:\([^)]+\))?)/gi },
	{ kind: 'section', regex: /\b(?:section|sections|sec\.?|s\.|ss\.)\s*([0-9]{1,5}(?:\.[0-9]+)?[a-z]?(?:\([^)]+\))?)/gi },
	{ kind: 'paragraph', regex: /\b(?:paragraph|paragraphs|para\.?|par\.?|alinea|alin(?:ea|ea\.))\s*([0-9]{1,5}(?:\.[0-9]+)?[a-z]?(?:\([^)]+\))?)/gi }
];
const quebecCodeCitationPattern = /\b([0-9]{1,5}(?:\.[0-9]+)?[a-z]?)\s*(?:c\.?\s*c\.?\s*q\.?|ccq|code civil du quebec|code civil du québec)\b/gi;
const codeSectionCitationPattern = /\b([0-9]{1,5}(?:\.[0-9]+)?[a-z]?)\s*(?:c\.?\s*cr\.?|criminal code|code criminel)\b/gi;
const quotePattern = /["“”«»]([^"“”«»]{6,160})["“”«»]/g;
const headingPattern = /^(?:part|title|book|chapter|division|schedule|annex|annexe|titre|livre|chapitre|division)\b/i;
const boundaryPattern = /^(?:article|articles|art\.?|section|sections|sec\.?|paragraph|paragraphs|para\.?|par\.?|part|title|book|chapter|division|schedule|annex|annexe|titre|livre|chapitre)\b/i;

const legalTokenSynonyms: Record<string, string[]> = {
	defendant: ['respondent', 'defendeur', 'intime'],
	respondent: ['defendant', 'defendeur', 'intime'],
	defendeur: ['defendant', 'respondent', 'intime'],
	intime: ['defendant', 'respondent', 'defendeur'],
	plaintiff: ['claimant', 'demandeur', 'appelant', 'appellant'],
	claimant: ['plaintiff', 'demandeur', 'appelant', 'appellant'],
	demandeur: ['plaintiff', 'claimant', 'appelant', 'appellant'],
	appelant: ['plaintiff', 'claimant', 'demandeur', 'appellant'],
	appellant: ['plaintiff', 'claimant', 'demandeur', 'appelant'],
	liability: ['responsabilite', 'faute', 'negligence'],
	responsabilite: ['liability', 'faute', 'negligence'],
	faute: ['liability', 'responsabilite', 'negligence'],
	negligence: ['liability', 'responsabilite', 'faute'],
	damages: ['dommages', 'prejudice', 'indemnisation'],
	dommages: ['damages', 'prejudice', 'indemnisation'],
	prejudice: ['damages', 'dommages', 'indemnisation'],
	indemnisation: ['damages', 'dommages', 'prejudice'],
	remedy: ['reparation', 'ordonnance', 'injunction'],
	reparation: ['remedy', 'ordonnance', 'injunction'],
	ordonnance: ['remedy', 'reparation', 'injunction'],
	injunction: ['remedy', 'reparation', 'ordonnance'],
	contract: ['contrat', 'agreement'],
	contrat: ['contract', 'agreement'],
	agreement: ['contract', 'contrat'],
	labour: ['travail', 'employment'],
	travail: ['labour', 'employment'],
	employment: ['labour', 'travail'],
	evidence: ['preuve'],
	preuve: ['evidence'],
	jurisdiction: ['juridiction', 'competence'],
	juridiction: ['jurisdiction', 'competence'],
	competence: ['jurisdiction', 'juridiction']
};

const jurisdictionPatternMap: Array<{ id: string; pattern: RegExp }> = [
	{ id: 'quebec', pattern: /\b(?:quebec|qc|quebecois|quebecois|ccq|c\.?\s*c\.?\s*q\.?|legisquebec)\b/i },
	{ id: 'canada', pattern: /\b(?:canada|canadian|federal|code criminel|criminal code|c\.?\s*cr\.?)\b/i },
	{ id: 'ontario', pattern: /\bontario\b/i },
	{ id: 'alberta', pattern: /\balberta\b/i },
	{ id: 'british-columbia', pattern: /\b(?:british columbia|colombie britannique)\b/i },
	{ id: 'new-york', pattern: /\bnew york\b/i },
	{ id: 'california', pattern: /\bcalifornia\b/i },
	{ id: 'texas', pattern: /\btexas\b/i },
	{ id: 'france', pattern: /\bfrance\b/i },
	{ id: 'united-states', pattern: /\b(?:united states|u\.?s\.?)\b/i }
];

const normalizeJurisdiction = (jurisdiction: string | undefined): string => {
	const value = normalizeSearchText(jurisdiction ?? '');
	if (!value) return '';
	if (/\b(?:quebec|qc|quebecois|quebecois)\b/.test(value)) return 'quebec';
	if (/\b(?:canada|canadian|federal)\b/.test(value)) return 'canada';
	if (/\bontario\b/.test(value)) return 'ontario';
	if (/\balberta\b/.test(value)) return 'alberta';
	if (/\b(?:british columbia|colombie britannique)\b/.test(value)) return 'british-columbia';
	if (/\bnew york\b/.test(value)) return 'new-york';
	if (/\bcalifornia\b/.test(value)) return 'california';
	if (/\btexas\b/.test(value)) return 'texas';
	if (/\bfrance\b/.test(value)) return 'france';
	if (/\b(?:united states|u\.?s\.?)\b/.test(value)) return 'united-states';
	return value;
};

const cleanText = (value: unknown): string => String(value ?? '').replace(/\u0000/g, '').trim();

const normalizeSearchText = (text: string): string =>
	text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const tokenize = (text: string): string[] => {
	const tokens = normalizeSearchText(text)
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 3 && !stopWords.has(token));
	return Array.from(new Set(tokens)).slice(0, MAX_SEARCH_TERMS);
};

const truncateQuery = (text: string): string => cleanText(text).slice(0, MAX_QUERY_LENGTH);

const uniqueStrings = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const normalizeCitationLabel = (value: string): string =>
	normalizeSearchText(value).replace(/\s+/g, '').replace(/[()]/g, '').trim();

const extractCanonicalCitationRefs = (text: string): string[] => {
	if (!text) return [];
	const refs: string[] = [];
	const pushRef = (kind: 'article' | 'section' | 'paragraph', rawLabel: string) => {
		const label = normalizeCitationLabel(rawLabel);
		if (!label) return;
		refs.push(`${kind}:${label}`);
	};

	for (const pattern of canonicalCitationPatterns) {
		for (const match of text.matchAll(pattern.regex)) {
			if (!match[1]) continue;
			pushRef(pattern.kind, match[1]);
		}
	}

	for (const match of text.matchAll(quebecCodeCitationPattern)) {
		if (!match[1]) continue;
		pushRef('article', match[1]);
	}

	for (const match of text.matchAll(codeSectionCitationPattern)) {
		if (!match[1]) continue;
		pushRef('section', match[1]);
	}

	for (const match of text.matchAll(bareArticleNumberPattern)) {
		if (!match[1]) continue;
		pushRef('article', match[1]);
	}

	return uniqueStrings(refs);
};

const extractQueryPhraseNeedles = (text: string): string[] => {
	if (!text) return [];
	const normalized = normalizeSearchText(text);
	const quoted = Array.from(normalized.matchAll(quotePattern))
		.map((match) => (match[1] || '').trim())
		.filter((phrase) => phrase.length >= 8);
	const clauseCandidates = normalized
		.split(/[,.!?;:\n]+/)
		.map((segment) => segment.trim())
		.filter((segment) => {
			if (!segment || segment.length < 12 || segment.length > 140) return false;
			const wordCount = segment.split(/\s+/).filter(Boolean).length;
			return wordCount >= 2 && wordCount <= 9;
		});
	return uniqueStrings([...quoted, ...clauseCandidates]).slice(0, 12);
};

const detectPreferredDocTypes = (text: string): SourceDocType[] => {
	const normalized = normalizeSearchText(text);
	const preferred: SourceDocType[] = [];
	if (/\b(?:case|jurisprud|judgment|judgement|decision|court|tribunal|appeal|appel)\b/.test(normalized)) {
		preferred.push('case-law');
	}
	if (/\b(?:regulation|reglement|reglementaire|regulatory)\b/.test(normalized)) {
		preferred.push('regulation');
	}
	if (/\b(?:article|art\.?|section|sec\.?|code|statute|act|law|loi)\b/.test(normalized)) {
		preferred.push('statute');
	}
	if (/\b(?:commentary|doctrine|treatise|analysis|memo)\b/.test(normalized)) {
		preferred.push('secondary');
	}
	return uniqueStrings(preferred) as SourceDocType[];
};

const detectPreferredJurisdictions = (text: string): string[] => {
	const normalized = normalizeSearchText(text);
	const preferred: string[] = [];
	for (const matcher of jurisdictionPatternMap) {
		if (matcher.pattern.test(normalized)) preferred.push(matcher.id);
	}
	return uniqueStrings(preferred);
};

const expandLegalQueryTokens = (tokens: string[]): string[] => {
	const expanded = [...tokens];
	for (const token of tokens) {
		for (const synonym of legalTokenSynonyms[token] ?? []) {
			expanded.push(synonym);
		}
	}
	return uniqueStrings(expanded).slice(0, MAX_SEARCH_TERMS + 24);
};

const buildSourceQueryProfile = (query: string, hints?: SourcePacketHintArgs): SourceQueryProfile => {
	const normalizedHintTitles = uniqueStrings((hints?.titles ?? []).map((title) => normalizeSearchText(title)));
	const normalizedHintTerms = uniqueStrings((hints?.terms ?? []).map((term) => normalizeSearchText(term)));
	const hintTitleTokens = tokenize((hints?.titles ?? []).join(' '));
	const hintTermTokens = tokenize((hints?.terms ?? []).join(' '));
	const primaryQueryTokens = tokenize(query);
	const expandedQueryTokens = expandLegalQueryTokens([...primaryQueryTokens, ...hintTermTokens]);
	const queryTokens = uniqueStrings([...expandedQueryTokens, ...hintTitleTokens]);
	const citationNeedles = uniqueStrings([
		...extractCitationNeedles(query),
		...(hints?.citations ?? []).map((citation) => normalizeSearchText(citation))
	]);
	const canonicalCitationRefs = uniqueStrings([
		...extractCanonicalCitationRefs(query),
		...extractCanonicalCitationRefs((hints?.citations ?? []).join(' ')),
		...extractCanonicalCitationRefs((hints?.terms ?? []).join(' '))
	]);
	const queryPhraseNeedles = uniqueStrings([
		...extractQueryPhraseNeedles(query),
		...extractQueryPhraseNeedles((hints?.terms ?? []).join(' '))
	]);
	const preferredJurisdictions = detectPreferredJurisdictions(
		`${query}\n${(hints?.titles ?? []).join('\n')}\n${(hints?.terms ?? []).join('\n')}`
	);
	const preferredDocTypes = detectPreferredDocTypes(`${query}\n${(hints?.terms ?? []).join(' ')}`);

	return {
		query,
		primaryQueryTokens,
		queryTokens,
		queryTokenSet: new Set(primaryQueryTokens),
		hintTitles: normalizedHintTitles,
		hintTitleTokens,
		hintTerms: normalizedHintTerms,
		hintTermTokens,
		citationNeedles,
		canonicalCitationRefs,
		queryPhraseNeedles,
		preferredJurisdictions,
		preferredDocTypes
	};
};

const canonicalCitationRefMatches = (needle: string, haystack: string[]): boolean => {
	if (haystack.includes(needle)) return true;
	const [, label] = needle.split(':');
	if (!label) return false;
	return haystack.some((candidate) => candidate.endsWith(`:${label}`));
};

const boundedEditDistance = (left: string, right: string, maxDistance: number): number | null => {
	if (left === right) return 0;
	if (Math.abs(left.length - right.length) > maxDistance) return null;

	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];
		let rowMin = current[0];
		const leftCode = left.charCodeAt(leftIndex - 1);

		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const substitutionCost = leftCode === right.charCodeAt(rightIndex - 1) ? 0 : 1;
			const next = Math.min(
				previous[rightIndex] + 1,
				current[rightIndex - 1] + 1,
				previous[rightIndex - 1] + substitutionCost
			);
			current.push(next);
			if (next < rowMin) rowMin = next;
		}

		if (rowMin > maxDistance) return null;
		previous = current;
	}

	return previous[right.length] <= maxDistance ? previous[right.length] : null;
};

const queryTokenMatchesCandidate = (token: string, candidate: string): boolean => {
	if (token === candidate) return true;
	if (token.length < MIN_FUZZY_TOKEN_LENGTH || candidate.length < MIN_FUZZY_TOKEN_LENGTH) return false;
	if (token.slice(0, 3) !== candidate.slice(0, 3)) return false;
	const maxDistance = Math.max(token.length, candidate.length) >= 10 ? 2 : 1;
	return boundedEditDistance(token, candidate, maxDistance) !== null;
};

const findApproximateTokenMatch = (token: string, candidates: string[]): string | null => {
	for (const candidate of candidates) {
		if (queryTokenMatchesCandidate(token, candidate)) return candidate;
	}
	return null;
};

const extractCitationNeedles = (text: string): string[] => {
	const matches = text.match(citationPattern) ?? [];
	return uniqueStrings(matches.map((match) => normalizeSearchText(match)));
};

const extractCitationLabel = (text: string): string | undefined => {
	const match = text.match(citationPattern);
	if (match?.[0]) return match[0].trim();

	const bareNumber = text.match(/^\s*([0-9]{3,5}(?:\.[0-9]+)?[a-z]?)\s*[.)]\s+/i);
	if (bareNumber?.[1]) return `article ${bareNumber[1]}`;

	return undefined;
};

const looksLikeHeading = (paragraph: string): boolean => {
	const line = paragraph.trim();
	if (!line || line.length > 140) return false;
	if (headingPattern.test(line)) return true;
	if (/[:.;]$/.test(line)) return false;
	const words = line.split(/\s+/).filter(Boolean);
	if (!words.length || words.length > 14) return false;
	const uppercaseChars = line.replace(/[^A-Z]/g, '').length;
	const letterChars = line.replace(/[^A-Za-z]/g, '').length;
	return letterChars > 0 && uppercaseChars / letterChars > 0.65;
};

const splitSourceIntoChunks = (source: LibraryDocument): SourceMapChunk[] => {
	const body = cleanText(source.content || source.description);
	if (!body) return [];

	const legalStructure = parseLegalStructure(body);
	if (legalStructure.audit.mode === 'structured-legal' && legalStructure.units.length) {
		return legalStructure.units.map((unit, index) => {
			const normalizedHaystack = normalizeSearchText(
				`${source.title}\n${unit.path.join(' > ')}\n${unit.citation ?? ''}\n${unit.heading}\n${unit.content}`
			);
			const canonicalCitations = extractCanonicalCitationRefs(
				`${unit.citation ?? ''}\n${unit.heading}\n${unit.path.join(' > ')}\n${unit.content.slice(0, 1400)}`
			);
			return {
				sourceId: source.id,
				sourceTitle: source.title,
				jurisdiction: source.jurisdiction,
				docType: source.docType,
				chunkIndex: index,
				heading: unit.heading || unit.path.at(-1),
				citation: unit.citation,
				legalUnitId: unit.unitId,
				legalUnitKind: unit.kind,
				legalPath: unit.path,
				legalStartOffset: unit.startOffset,
				legalEndOffset: unit.endOffset,
				legalStructureConfidence: unit.confidence,
				excerpt: unit.content,
				normalizedTitle: normalizeSearchText(source.title),
				normalizedHaystack,
				searchTerms: tokenize(`${source.title} ${unit.path.join(' ')} ${unit.citation ?? ''} ${unit.heading} ${unit.content}`),
				canonicalCitations
			};
		});
	}

	const rawParagraphs = body
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
	const paragraphs = rawParagraphs.length ? rawParagraphs : [body];
	const chunks: SourceMapChunk[] = [];
	let chunkIndex = 0;
	let currentHeading = '';
	// Tracks the most recently seen article/section label so that continuation
	// chunks (produced when a single article exceeds MAX_CHUNK_CHARS) still
	// carry the correct citation and score against article-number queries.
	let currentCitation = '';
	let buffer: string[] = [];
	let bufferChars = 0;

	const flush = () => {
		if (!buffer.length) return;
		const excerpt = buffer.join('\n\n').trim();
		if (!excerpt) {
			buffer = [];
			bufferChars = 0;
			return;
		}
		// Prefer an inline citation found in the excerpt text; fall back to the
		// most recent article label seen (covers continuation chunks) or heading.
		const inlineCitation = extractCitationLabel(excerpt);
		const citation = inlineCitation ?? currentCitation ?? extractCitationLabel(currentHeading);
		const normalizedHaystack = normalizeSearchText(
			`${source.title}\n${currentHeading}\n${citation ?? ''}\n${excerpt}`
		);
		const canonicalCitations = extractCanonicalCitationRefs(`${citation ?? ''}\n${currentHeading}\n${excerpt.slice(0, 1400)}`);
		chunks.push({
			sourceId: source.id,
			sourceTitle: source.title,
			jurisdiction: source.jurisdiction,
			docType: source.docType,
			chunkIndex,
			heading: currentHeading || undefined,
			citation: citation || undefined,
			legalUnitKind: citation ? 'article' : undefined,
			excerpt,
			normalizedTitle: normalizeSearchText(source.title),
			normalizedHaystack,
			searchTerms: tokenize(`${source.title} ${currentHeading} ${citation ?? ''} ${excerpt}`),
			canonicalCitations
		});
		chunkIndex += 1;
		buffer = [];
		bufferChars = 0;
	};

	for (const paragraph of paragraphs) {
		const isHeading = looksLikeHeading(paragraph);
		const startsBoundary = boundaryPattern.test(paragraph);

		// Flush before a new article/section boundary so each provision starts
		// its own chunk, regardless of how full the current buffer is.
		if ((startsBoundary || isHeading) && buffer.length) {
			flush();
		}

		if (isHeading) {
			currentHeading = paragraph;
		}
		// Update the tracked citation whenever a paragraph introduces a new
		// article label. This must happen AFTER flush() so the citation belongs
		// to the new chunk, not the one just flushed.
		const paragraphCitation = extractCitationLabel(paragraph);
		if (paragraphCitation) {
			currentCitation = paragraphCitation;
		}

		buffer.push(paragraph);
		bufferChars += paragraph.length + 2;

		// Only hard-flush at MAX_CHUNK_CHARS. Letting TARGET_CHUNK_CHARS trigger
		// a flush mid-article would orphan continuation paragraphs from their
		// article number. Boundary detection above handles normal splits cleanly.
		if (bufferChars >= MAX_CHUNK_CHARS) {
			flush();
		}
	}

	flush();
	return chunks.length
		? chunks
		: [{
				sourceId: source.id,
				sourceTitle: source.title,
				jurisdiction: source.jurisdiction,
				docType: source.docType,
				chunkIndex: 0,
				heading: undefined,
				citation: extractCitationLabel(body),
				legalUnitKind: extractCitationLabel(body) ? 'article' : undefined,
				excerpt: body,
				normalizedTitle: normalizeSearchText(source.title),
				normalizedHaystack: normalizeSearchText(`${source.title}\n${body}`),
				searchTerms: tokenize(`${source.title} ${body}`),
				canonicalCitations: extractCanonicalCitationRefs(body.slice(0, 2000))
			}];
};

const pruneExpiredSourceMaps = (): void => {
	const now = Date.now();
	for (const [cacheKey, entry] of sourceMapCache) {
		if (entry.expiresAt <= now) sourceMapCache.delete(cacheKey);
	}
};

const buildSourceMap = (cacheKey: string, sources: LibraryDocument[]): SourceMap => {
	pruneExpiredSourceMaps();
	const cached = sourceMapCache.get(cacheKey);
	if (cached) return cached.map;

	const chunks = sources.flatMap(splitSourceIntoChunks);
	const chunksBySource = new Map<string, SourceMapChunk[]>();
	for (const chunk of chunks) {
		const existing = chunksBySource.get(chunk.sourceId);
		if (existing) existing.push(chunk);
		else chunksBySource.set(chunk.sourceId, [chunk]);
	}

	const map: SourceMap = {
		builtAt: Date.now(),
		expiresAt: Date.now() + SOURCE_MAP_CACHE_TTL_MS,
		chunks,
		chunksBySource
	};

	if (sourceMapCache.size >= SOURCE_MAP_CACHE_LIMIT) {
		const oldestKey = sourceMapCache.keys().next().value;
		if (oldestKey) sourceMapCache.delete(oldestKey);
	}

	sourceMapCache.set(cacheKey, { map, expiresAt: map.expiresAt });
	return map;
};

const buildReason = (matchTerms: string[], citationHitCount: number): string => {
	if (citationHitCount > 0) {
		return matchTerms.length
			? `Matched cited authority and request terms: ${matchTerms.slice(0, 4).join(', ')}`
			: 'Matched an expressly cited authority from the request.';
	}
	if (matchTerms.length) {
		return `Matched request terms: ${matchTerms.slice(0, 4).join(', ')}`;
	}
	return 'Selected as the closest source passage for the current request.';
};

const scoreChunk = (args: {
	chunk: SourceMapChunk;
	profile: SourceQueryProfile;
}): { score: number; matchTerms: string[]; citationHitCount: number } => {
	const { chunk, profile } = args;
	let score = 0;
	let citationHitCount = 0;
	let tokenMatchCount = 0;
	const matchTerms: string[] = [];
	const haystack = chunk.normalizedHaystack;
	const chunkJurisdiction = normalizeJurisdiction(chunk.jurisdiction);

	for (const ref of profile.canonicalCitationRefs) {
		if (canonicalCitationRefMatches(ref, chunk.canonicalCitations)) {
			score += 32;
			citationHitCount += 1;
			matchTerms.push(ref.replace(':', ' '));
		}
	}

	for (const needle of profile.citationNeedles) {
		if (haystack.includes(needle)) {
			score += 24;
			citationHitCount += 1;
			matchTerms.push(needle);
		}
	}

	for (const token of profile.queryTokens) {
		const isPrimaryToken = profile.queryTokenSet.has(token);
		if (chunk.searchTerms.includes(token)) {
			score += isPrimaryToken ? 4 : 2;
			tokenMatchCount += isPrimaryToken ? 1 : 0.5;
			matchTerms.push(token);
		} else if (chunk.normalizedTitle.includes(token)) {
			score += isPrimaryToken ? 2 : 1;
			tokenMatchCount += isPrimaryToken ? 0.5 : 0;
			matchTerms.push(token);
		} else {
			const fuzzyMatch = findApproximateTokenMatch(token, chunk.searchTerms);
			if (fuzzyMatch) {
				score += isPrimaryToken ? 3 : 1;
				tokenMatchCount += isPrimaryToken ? 0.4 : 0;
				matchTerms.push(token);
			}
		}
	}

	for (const phrase of profile.queryPhraseNeedles) {
		if (phrase.length >= 8 && haystack.includes(phrase)) {
			score += 8;
			matchTerms.push(phrase);
		}
	}

	for (const hintTitle of profile.hintTitles) {
		if (chunk.normalizedTitle.includes(hintTitle)) {
			score += 10;
			matchTerms.push(hintTitle);
		}
	}

	for (const token of profile.hintTitleTokens) {
		if (chunk.normalizedTitle.includes(token)) {
			score += 2;
		}
	}

	for (const hintTerm of profile.hintTerms) {
		if (haystack.includes(hintTerm)) {
			score += 6;
			matchTerms.push(hintTerm);
		}
	}

	for (const token of profile.hintTermTokens) {
		if (chunk.searchTerms.includes(token)) {
			score += 2;
		}
	}

	if (profile.preferredDocTypes.length && chunk.docType) {
		if (profile.preferredDocTypes.includes(chunk.docType)) score += 6;
		else score -= 1;
	}

	if (profile.preferredJurisdictions.length && chunkJurisdiction) {
		if (profile.preferredJurisdictions.includes(chunkJurisdiction)) score += 6;
		else score -= 1;
	}

	if (chunk.legalUnitKind === 'article' || chunk.legalUnitKind === 'section') score += 2;
	if (chunk.legalStructureConfidence === 'high') score += 2;
	if (chunk.legalStructureConfidence === 'medium') score += 1;

	if (profile.primaryQueryTokens.length) {
		const lexicalCoverage = Math.min(1, tokenMatchCount / profile.primaryQueryTokens.length);
		score += Math.round(lexicalCoverage * 6);
	}

	return {
		score,
		matchTerms: uniqueStrings(matchTerms).slice(0, 6),
		citationHitCount
	};
};

export const buildRelevantSourceBundle = (args: BuildRelevantSourceBundleArgs): SourceBundle => {
	const query = truncateQuery(args.query);
	const map = buildSourceMap(args.cacheKey, args.sources);
	const fallbackMode = args.fallbackMode ?? 'first-chunks';
	const profile = buildSourceQueryProfile(query, args.hints);
	const maxExcerpts = Math.min(Math.max(args.maxExcerpts ?? 8, 3), 12);
	const perSourceLimit = args.sources.length === 1 ? Math.min(maxExcerpts, 10) : 4;

	const scoredChunks = map.chunks
		.map((chunk) => {
			const score = scoreChunk({ chunk, profile });
			return { chunk, ...score };
		})
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex);
	const orderedScoredChunks = profile.citationNeedles.length || profile.canonicalCitationRefs.length
		? [
			...scoredChunks.filter((entry) => entry.citationHitCount > 0),
			...scoredChunks.filter((entry) => entry.citationHitCount === 0)
		]
		: scoredChunks;

	const selected: Array<{ chunk: SourceMapChunk; matchTerms: string[]; citationHitCount: number }> = [];
	const perSourceCount = new Map<string, number>();
	const selectedKeys = new Set<string>();
	const addSelected = (chunk: SourceMapChunk, matchTerms: string[], citationHitCount: number): boolean => {
		const key = `${chunk.sourceId}:${chunk.chunkIndex}`;
		if (selectedKeys.has(key)) return false;
		const sourceUsage = perSourceCount.get(chunk.sourceId) ?? 0;
		if (sourceUsage >= perSourceLimit) return false;
		selected.push({ chunk, matchTerms, citationHitCount });
		selectedKeys.add(key);
		perSourceCount.set(chunk.sourceId, sourceUsage + 1);
		return true;
	};

	for (const entry of orderedScoredChunks) {
		if (selected.length >= maxExcerpts) break;
		if (!addSelected(entry.chunk, entry.matchTerms, entry.citationHitCount)) continue;

		const sourceChunks = map.chunksBySource.get(entry.chunk.sourceId) ?? [];
		if (entry.chunk.citation) {
			const normalizedCitation = normalizeSearchText(entry.chunk.citation);
			for (const sibling of sourceChunks) {
				if (selected.length >= maxExcerpts) break;
				if (sibling.chunkIndex === entry.chunk.chunkIndex || !sibling.citation) continue;
				if (normalizeSearchText(sibling.citation) !== normalizedCitation) continue;
				addSelected(sibling, entry.matchTerms, entry.citationHitCount > 0 ? 1 : 0);
			}
		}

		if (entry.citationHitCount > 0 || entry.chunk.legalUnitKind === 'article' || entry.chunk.legalUnitKind === 'section') {
			const neighborIndexes = [entry.chunk.chunkIndex - 1, entry.chunk.chunkIndex + 1];
			for (const neighborIndex of neighborIndexes) {
				if (selected.length >= maxExcerpts) break;
				const neighbor = sourceChunks.find((chunk) => chunk.chunkIndex === neighborIndex);
				if (!neighbor) continue;
				addSelected(neighbor, entry.matchTerms, 0);
			}
		}
	}

	if (!selected.length && map.chunks.length && fallbackMode === 'first-chunks') {
		const fallbackChunks = map.chunks.slice(0, Math.min(maxExcerpts, 4));
		for (const chunk of fallbackChunks) {
			selected.push({ chunk, matchTerms: [], citationHitCount: 0 });
		}
	}

	const excerpts: SourceBundleExcerpt[] = selected.map(({ chunk, matchTerms, citationHitCount }) => ({
		sourceId: chunk.sourceId,
		sourceTitle: chunk.sourceTitle,
		jurisdiction: chunk.jurisdiction,
		docType: chunk.docType,
		citation: chunk.citation,
		heading: chunk.heading,
		legalUnitId: chunk.legalUnitId,
		legalUnitKind: chunk.legalUnitKind,
		legalPath: chunk.legalPath,
		legalStartOffset: chunk.legalStartOffset,
		legalEndOffset: chunk.legalEndOffset,
		legalStructureConfidence: chunk.legalStructureConfidence,
		excerpt: chunk.excerpt,
		reason: buildReason(matchTerms, citationHitCount)
	}));

	const bundleText = normalizeSearchText(
		excerpts
			.map((excerpt) => `${excerpt.sourceTitle}\n${excerpt.citation ?? ''}\n${excerpt.heading ?? ''}\n${excerpt.excerpt}`)
			.join('\n\n')
	);
	const bundleTokens = tokenize(bundleText);
	const matchedQueryTokens = profile.primaryQueryTokens.filter((token) =>
		bundleText.includes(token) || Boolean(findApproximateTokenMatch(token, bundleTokens))
	);
	const bundleCanonicalCitations = extractCanonicalCitationRefs(
		excerpts
			.map((excerpt) => `${excerpt.citation ?? ''}\n${excerpt.heading ?? ''}\n${excerpt.excerpt}`)
			.join('\n\n')
	);
	const textualCitationsCovered =
		!profile.citationNeedles.length || profile.citationNeedles.every((needle) => bundleText.includes(needle));
	const canonicalCitationsCovered =
		!profile.canonicalCitationRefs.length
		|| profile.canonicalCitationRefs.every((needle) => canonicalCitationRefMatches(needle, bundleCanonicalCitations));
	const citationsCovered = textualCitationsCovered && canonicalCitationsCovered;
	const requiredTokenMatches = Math.min(4, Math.max(profile.primaryQueryTokens.length, 1));
	const coverage = !excerpts.length
		? 'low'
		: citationsCovered && matchedQueryTokens.length >= requiredTokenMatches
			? 'high'
			: citationsCovered || matchedQueryTokens.length >= 2
				? 'medium'
				: 'low';
	const tokenCount = estimateTokens(
		excerpts.map((excerpt) => `${excerpt.sourceTitle}\n${excerpt.citation ?? ''}\n${excerpt.excerpt}`).join('\n\n')
	);

	return {
		strategy: 'relevant-passages',
		createdAt: new Date().toISOString(),
		query,
		coverage,
		excerptCount: excerpts.length,
		sourceCount: new Set(excerpts.map((excerpt) => excerpt.sourceId)).size,
		tokenCount,
		excerpts
	};
};

export const materializeSourceBundleSources = (bundle: SourceBundle): LibraryDocument[] => {
	if (!bundle.excerpts.length) return [];

	const bySource = new Map<string, SourceBundleExcerpt[]>();
	for (const excerpt of bundle.excerpts) {
		const existing = bySource.get(excerpt.sourceId);
		if (existing) existing.push(excerpt);
		else bySource.set(excerpt.sourceId, [excerpt]);
	}

	return Array.from(bySource.entries()).map(([sourceId, excerpts]) => {
		const first = excerpts[0];
		const content = excerpts
			.map((excerpt, index) => {
				const headingLine = excerpt.heading ? `${excerpt.heading}\n` : '';
				const citationLine = excerpt.citation ? `Citation: ${excerpt.citation}\n` : '';
				const pathLine = excerpt.legalPath?.length ? `Path: ${excerpt.legalPath.join(' > ')}\n` : '';
				return `Relevant legal unit ${index + 1}\n${citationLine}${pathLine}${headingLine}${excerpt.excerpt}`.trim();
			})
			.join('\n\n');

		return {
			id: sourceId,
			title: first.sourceTitle,
			jurisdiction: first.jurisdiction || 'Other',
			description: 'Relevant passages selected for the current request.',
			lastUpdated: bundle.createdAt,
			content,
			docType: first.docType,
			note: 'Relevant source packet generated from selected sources.'
		};
	});
};

export const renderSourcePacketBlock = (bundle: SourceBundle): string => {
	if (!bundle.excerpts.length) {
		return 'No relevant passages could be selected from the current sources.';
	}

	const packetId = createHash('sha1')
		.update(bundle.excerpts.map((excerpt) => `${excerpt.sourceId}:${excerpt.citation ?? ''}:${excerpt.excerpt}`).join('\n'))
		.digest('hex')
		.slice(0, 12);

	return `SOURCE PACKET ${packetId}
Coverage: ${bundle.coverage}
Retrieved query: ${bundle.query}

${bundle.excerpts
		.map((excerpt, index) => {
			const citationLine = excerpt.citation ? `Citation: ${excerpt.citation}\n` : '';
			const headingLine = excerpt.heading ? `Heading: ${excerpt.heading}\n` : '';
			const pathLine = excerpt.legalPath?.length ? `Path: ${excerpt.legalPath.join(' > ')}\n` : '';
			const unitLine = excerpt.legalUnitKind ? `Legal unit: ${excerpt.legalUnitKind}${excerpt.legalStructureConfidence ? ` (${excerpt.legalStructureConfidence} structure confidence)` : ''}\n` : '';
			const jurisdictionLine = excerpt.jurisdiction ? `Jurisdiction: ${excerpt.jurisdiction}\n` : '';
			const typeLine = excerpt.docType ? `Type: ${excerpt.docType}\n` : '';
			return `PASSAGE ${index + 1}: ${excerpt.sourceTitle}\n${jurisdictionLine}${typeLine}${unitLine}${citationLine}${pathLine}${headingLine}${excerpt.excerpt}`.trim();
		})
		.join('\n\n')}`;
};

export const sourceBundleCoversQuery = (bundle: SourceBundle | null | undefined, query: string): boolean => {
	if (!bundle || !bundle.excerpts.length) return false;
	const profile = buildSourceQueryProfile(query);
	const normalizedBundle = normalizeSearchText(
		bundle.excerpts
			.map((excerpt) => `${excerpt.sourceTitle}\n${excerpt.citation ?? ''}\n${excerpt.heading ?? ''}\n${excerpt.excerpt}`)
			.join('\n\n')
	);
	if (profile.citationNeedles.length && !profile.citationNeedles.every((needle) => normalizedBundle.includes(needle))) {
		return false;
	}

	if (profile.canonicalCitationRefs.length) {
		const bundleCanonicalCitations = extractCanonicalCitationRefs(
			bundle.excerpts
				.map((excerpt) => `${excerpt.citation ?? ''}\n${excerpt.heading ?? ''}\n${excerpt.excerpt}`)
				.join('\n\n')
		);
		if (!profile.canonicalCitationRefs.every((needle) => canonicalCitationRefMatches(needle, bundleCanonicalCitations))) {
			return false;
		}
	}

	if (!profile.primaryQueryTokens.length) return true;
	const bundleTokens = tokenize(normalizedBundle);
	const overlap = profile.primaryQueryTokens.filter((token) =>
		normalizedBundle.includes(token) || Boolean(findApproximateTokenMatch(token, bundleTokens))
	).length;
	if (bundle.coverage === 'high') {
		return overlap >= 2 || overlap / profile.primaryQueryTokens.length >= 0.3;
}
	return overlap >= 3 || overlap / profile.primaryQueryTokens.length >= 0.45;
};