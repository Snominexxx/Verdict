import { createHash } from 'node:crypto';

export type LegalUnitKind = 'article' | 'section' | 'chapter' | 'part' | 'division' | 'preamble' | 'paragraph';

export type LegalStructureUnit = {
	unitId: string;
	kind: LegalUnitKind;
	label: string;
	citation?: string;
	heading: string;
	path: string[];
	content: string;
	startOffset: number;
	endOffset: number;
	tokenCount: number;
	language: 'en' | 'fr' | 'mixed' | 'unknown';
	confidence: 'high' | 'medium' | 'low';
};

export type LegalStructureAudit = {
	mode: 'structured-legal' | 'paragraph-fallback';
	reliableForClassroom: boolean;
	qualityScore: number;
	coverageRatio: number;
	unitCount: number;
	articleCount: number;
	sectionCount: number;
	language: 'en' | 'fr' | 'mixed' | 'unknown';
	bilingualRisk: boolean;
	warnings: string[];
};

export type LegalStructureResult = {
	units: LegalStructureUnit[];
	audit: LegalStructureAudit;
};

type LineRecord = {
	text: string;
	start: number;
	end: number;
};

type BoundaryRecord = {
	line: LineRecord;
	kind: LegalUnitKind;
	label: string;
	citation?: string;
	heading: string;
	path: string[];
	confidence: 'high' | 'medium' | 'low';
};

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const hashText = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 12);

const normalizeWhitespace = (text: string): string =>
	text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\t ]+/g, ' ').trim();

const readLines = (text: string): LineRecord[] => {
	const lines: LineRecord[] = [];
	let offset = 0;
	for (const rawLine of text.split('\n')) {
		const start = offset;
		const end = start + rawLine.length;
		lines.push({ text: rawLine.trim(), start, end });
		offset = end + 1;
	}
	return lines;
};

const detectLanguage = (text: string): LegalStructureAudit['language'] => {
	const sample = text.slice(0, 80_000).toLowerCase();
	const frenchHits = (sample.match(/\b(?:article|loi|code|que(?:bec|becois)|québec|responsabilite|responsabilité|prejudice|préjudice|dommage|contrat|obligation|tribunal|personne|droit)\b/g) ?? []).length;
	const englishHits = (sample.match(/\b(?:section|act|code|canada|liability|damage|contract|obligation|court|person|right|offence|defendant|plaintiff)\b/g) ?? []).length;
	if (frenchHits >= 8 && englishHits >= 8) return 'mixed';
	if (frenchHits > englishHits * 1.4) return 'fr';
	if (englishHits > frenchHits * 1.4) return 'en';
	if (frenchHits || englishHits) return 'mixed';
	return 'unknown';
};

const detectBilingualRisk = (text: string, language: LegalStructureAudit['language']): boolean => {
	if (language === 'mixed') return true;
	const sample = text.slice(0, 120_000);
	const explicitBilingualMarkers = /\b(?:english|anglais|french|fran[cç]ais|version anglaise|version fran[cç]aise)\b/i.test(sample);
	const repeatedDualLabels = (sample.match(/\b(?:article|section)\s+\d+/gi) ?? []).length >= 8 && /\b(?:loi|act)\b/i.test(sample);
	return explicitBilingualMarkers || repeatedDualLabels;
};

const parseHierarchyHeading = (line: string): string | null => {
	const match = line.match(/^(Livre|Book|Titre|Title|Chapitre|Chapter|Partie|Part|Division|Section)\s+([IVXLCDM\dA-Z.-]+)?\b\s*:?[\s-]*(.*)$/i);
	if (!match) return null;
	const tail = match[3]?.trim();
	return [match[1], match[2], tail].filter(Boolean).join(' ').slice(0, 180);
};

const parseArticleBoundary = (line: string): Omit<BoundaryRecord, 'line' | 'path'> | null => {
	const explicit = line.match(/^(Art(?:icle)?\.?|ARTICLE|Article)\s+([0-9]+[A-Za-z0-9()./-]*)\b\s*[:.-]?\s*(.*)$/);
	if (explicit) {
		const label = explicit[2];
		return {
			kind: 'article',
			label,
			citation: `${explicit[1].replace(/\.$/, '')} ${label}`,
			heading: line.slice(0, 180),
			confidence: 'high'
		};
	}

	const section = line.match(/^(s\.|sec\.?|section|Section|SECTION)\s+([0-9]+[A-Za-z0-9()./-]*)\b\s*[:.-]?\s*(.*)$/);
	if (section) {
		const label = section[2];
		return {
			kind: 'section',
			label,
			citation: `${section[1].replace(/\.$/, '')} ${label}`,
			heading: line.slice(0, 180),
			confidence: 'high'
		};
	}

	const civilCodeStyle = line.match(/^([0-9]{2,5}(?:\.[0-9]+)?[A-Za-z]?)\.\s+\S(.*)$/);
	if (civilCodeStyle) {
		const label = civilCodeStyle[1];
		return {
			kind: 'article',
			label,
			citation: `Article ${label}`,
			heading: line.slice(0, 180),
			confidence: 'medium'
		};
	}

	const criminalCodeStyle = line.match(/^([0-9]{2,5}(?:\.[0-9]+)?[A-Za-z]?)\s+\((?:[0-9]+|[a-z])\)\s+\S(.*)$/);
	if (criminalCodeStyle) {
		const label = criminalCodeStyle[1];
		return {
			kind: 'section',
			label,
			citation: `Section ${label}`,
			heading: line.slice(0, 180),
			confidence: 'medium'
		};
	}

	// Jurisprudence / judgments are structured by bracketed paragraph numbers
	// ("[42] The appellant submits..."). Treat each as a navigable paragraph
	// unit so case law is searchable and cross-referenceable like statutes.
	const judgmentParagraph = line.match(/^\[(\d{1,4})\]\s+\S(.*)$/);
	if (judgmentParagraph) {
		const label = judgmentParagraph[1];
		return {
			kind: 'paragraph',
			label,
			citation: `par. ${label}`,
			heading: line.slice(0, 180),
			confidence: 'high'
		};
	}

	return null;
};

const confidenceWeight = (confidence: LegalStructureUnit['confidence']): number =>
	confidence === 'high' ? 1 : confidence === 'medium' ? 0.72 : 0.45;

const buildAudit = (args: {
	mode: LegalStructureAudit['mode'];
	textLength: number;
	coveredChars: number;
	units: LegalStructureUnit[];
	language: LegalStructureAudit['language'];
	bilingualRisk: boolean;
	warnings: string[];
}): LegalStructureAudit => {
	const unitCount = args.units.length;
	const articleCount = args.units.filter((unit) => unit.kind === 'article').length;
	const sectionCount = args.units.filter((unit) => unit.kind === 'section').length;
	const coverageRatio = args.textLength > 0 ? Math.min(1, args.coveredChars / args.textLength) : 0;
	const confidenceAverage = unitCount
		? args.units.reduce((sum, unit) => sum + confidenceWeight(unit.confidence), 0) / unitCount
		: 0;
	const structureScore = args.mode === 'structured-legal' ? Math.min(1, unitCount / 20) : 0.35;
	const bilingualPenalty = args.bilingualRisk ? 0.2 : 0;
	const qualityScore = Math.max(0, Math.min(1, coverageRatio * 0.35 + confidenceAverage * 0.4 + structureScore * 0.25 - bilingualPenalty));
	const reliableForClassroom = args.mode === 'structured-legal' && qualityScore >= 0.72 && coverageRatio >= 0.88 && !args.bilingualRisk;
	return {
		mode: args.mode,
		reliableForClassroom,
		qualityScore: Math.round(qualityScore * 100) / 100,
		coverageRatio: Math.round(coverageRatio * 100) / 100,
		unitCount,
		articleCount,
		sectionCount,
		language: args.language,
		bilingualRisk: args.bilingualRisk,
		warnings: args.warnings
	};
};

export const parseLegalStructure = (rawText: string): LegalStructureResult => {
	const text = normalizeWhitespace(rawText);
	if (!text) {
		return {
			units: [],
			audit: buildAudit({
				mode: 'paragraph-fallback',
				textLength: 0,
				coveredChars: 0,
				units: [],
				language: 'unknown',
				bilingualRisk: false,
				warnings: ['No text available for legal structure parsing.']
			})
		};
	}

	const language = detectLanguage(text);
	const bilingualRisk = detectBilingualRisk(text, language);
	const lines = readLines(text);
	const boundaries: BoundaryRecord[] = [];
	const hierarchy: string[] = [];

	for (const line of lines) {
		if (!line.text) continue;
		const heading = parseHierarchyHeading(line.text);
		if (heading) {
			const level = /^(Livre|Book)/i.test(heading) ? 0 : /^(Titre|Title|Partie|Part)/i.test(heading) ? 1 : /^(Chapitre|Chapter)/i.test(heading) ? 2 : 3;
			hierarchy.splice(level);
			hierarchy[level] = heading;
			continue;
		}

		const boundary = parseArticleBoundary(line.text);
		if (boundary) {
			boundaries.push({ ...boundary, line, path: hierarchy.filter(Boolean) });
		}
	}

	const warnings: string[] = [];
	if (bilingualRisk) warnings.push('The text appears bilingual or language-mixed; split language versions before classroom use.');
	if (boundaries.length < 3) warnings.push('Few legal article or section boundaries were detected; falling back to paragraph-style storage.');

	if (boundaries.length >= 3) {
		const units = boundaries.map((boundary, index): LegalStructureUnit => {
			const endOffset = index + 1 < boundaries.length ? boundaries[index + 1].line.start : text.length;
			const content = text.slice(boundary.line.start, endOffset).trim();
			return {
				unitId: `${boundary.kind}-${boundary.label}-${hashText(content)}`,
				kind: boundary.kind,
				label: boundary.label,
				citation: boundary.citation,
				heading: boundary.heading,
				path: boundary.path,
				content,
				startOffset: boundary.line.start,
				endOffset,
				tokenCount: estimateTokens(content),
				language,
				confidence: boundary.confidence
			};
		}).filter((unit) => unit.content.length >= 30);
		const coveredChars = units.reduce((sum, unit) => sum + unit.content.length, 0);

		return {
			units,
			audit: buildAudit({
				mode: 'structured-legal',
				textLength: text.length,
				coveredChars,
				units,
				language,
				bilingualRisk,
				warnings
			})
		};
	}

	const paragraphs = text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length >= 50);
	const units: LegalStructureUnit[] = paragraphs.map((paragraph, index) => {
		const startOffset = text.indexOf(paragraph, index === 0 ? 0 : undefined);
		return {
			unitId: `paragraph-${index + 1}-${hashText(paragraph)}`,
			kind: 'paragraph',
			label: `Paragraph ${index + 1}`,
			heading: paragraph.split('\n')[0].slice(0, 180),
			path: [],
			content: paragraph,
			startOffset: Math.max(0, startOffset),
			endOffset: Math.max(0, startOffset) + paragraph.length,
			tokenCount: estimateTokens(paragraph),
			language,
			confidence: 'low'
		};
	});

	return {
		units,
		audit: buildAudit({
			mode: 'paragraph-fallback',
			textLength: text.length,
			coveredChars: units.reduce((sum, unit) => sum + unit.content.length, 0),
			units,
			language,
			bilingualRisk,
			warnings
		})
	};
};

export const legalStructureMetadataForUnit = (unit: LegalStructureUnit): Record<string, unknown> => ({
	legalUnitId: unit.unitId,
	legalUnitKind: unit.kind,
	legalUnitLabel: unit.label,
	legalCitation: unit.citation,
	legalHeading: unit.heading,
	legalPath: unit.path,
	legalStartOffset: unit.startOffset,
	legalEndOffset: unit.endOffset,
	legalLanguage: unit.language,
	legalStructureConfidence: unit.confidence
});