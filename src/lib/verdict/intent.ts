/**
 * Verdict v2 — Intent parser.
 *
 * Pure, deterministic, no network. Turns a raw user request into an
 * `IntentPlan`: what action they want (chat vs build), whether the request is
 * bound to their uploaded sources, and the concrete retrieval targets
 * (citations, concepts) the engine must honour.
 *
 * Source-boundedness starts here: if the user names "article 1457", that
 * becomes a MANDATORY retrieval target. The engine must find it in the
 * uploaded sources or say honestly that it could not.
 */

import type { IntentPlan, RetrievalTarget, VerdictLanguage } from './contracts';

// ─────────────────────────────────────────────────────────
// Language detection (lightweight, deterministic)
// ─────────────────────────────────────────────────────────

const FRENCH_MARKERS = [
	'fais', 'crée', 'cree', 'créer', 'creer', 'génère', 'genere', 'générer',
	'construis', 'prépare', 'prepare', 'rédige', 'redige', 'article', 'cas',
	'le', 'la', 'les', 'un', 'une', 'des', 'sur', 'avec', 'dans', 'pour',
	'monte', 'plaide', 'procès', 'proces', 'juge', 'bonjour', 'salut'
];

export const detectLanguage = (text: string): VerdictLanguage => {
	const lower = text.toLowerCase();
	// Accented characters are a strong French signal.
	if (/[àâäéèêëïîôöùûüçœ]/.test(lower)) return 'fr';
	const words = lower.split(/[^a-zàâäéèêëïîôöùûüçœ]+/).filter(Boolean);
	if (!words.length) return 'en';
	const frenchHits = words.filter((w) => FRENCH_MARKERS.includes(w)).length;
	return frenchHits / words.length >= 0.25 ? 'fr' : 'en';
};

// ─────────────────────────────────────────────────────────
// Action detection: chat vs build
// ─────────────────────────────────────────────────────────

const BUILD_VERBS = [
	// English
	'build', 'create', 'make', 'generate', 'draft', 'prepare', 'set up',
	'design', 'write', 'produce', 'give me a case', 'new case',
	// French
	'fais', 'crée', 'cree', 'créer', 'creer', 'génère', 'genere', 'générer',
	'generer', 'construis', 'construire', 'prépare', 'prepare', 'préparer',
	'rédige', 'redige', 'rédiger', 'monte', 'monter', 'élabore', 'elabore',
	'donne-moi un cas', 'nouveau cas', 'un cas'
];

export const detectAction = (text: string): 'chat' | 'build' => {
	const lower = text.toLowerCase();
	return BUILD_VERBS.some((verb) => lower.includes(verb)) ? 'build' : 'chat';
};

// ─────────────────────────────────────────────────────────
// Citation extraction
// ─────────────────────────────────────────────────────────

/** Normalize a captured citation identifier: trim, collapse spaces, lowercase letter suffix. */
const normalizeCitation = (value: string): string =>
	value
		.replace(/\s+/g, '')
		.replace(/[.,;]+$/, '')
		.toLowerCase();

type Extracted = { value: string; raw: string };

const ARTICLE_RE = /\b(?:art(?:icle)?s?\.?)\s*(\d+(?:\.\d+)?(?:\s*(?:bis|ter|quater))?[a-z]?)\b/gi;
const SECTION_RE = /\b(?:s(?:ec(?:tion)?)?s?\.?)\s+(\d+(?:\.\d+)?[a-z]?)\b/gi;
const PARAGRAPH_RE = /\b(?:para(?:graph(?:e)?)?s?\.?|al(?:in[ée]a)?\.?|¶)\s*(\d+)/gi;

/** A single number with optional structural suffix, e.g. "1457", "1457.1", "267a". */
const NUM = String.raw`\d+(?:\.\d+)?(?:bis|ter|quater)?[a-z]?`;
const LEAD = String.raw`(?:art(?:icle)?s?\.?|s(?:ec(?:tion)?)?s?\.?|para(?:graph(?:e)?)?s?\.?|al(?:in[ée]a)?\.?|¶)`;
const CONNECTOR = String.raw`(?:,|;|&|et|and|à|to)`;
/** Captures a keyword followed by an enumeration: "articles 1457 et 1458". */
const ENUM_RE = new RegExp(`\\b${LEAD}\\s*(${NUM}(?:\\s*${CONNECTOR}\\s*${NUM})*)`, 'gi');
const SPLIT_RE = new RegExp(`\\s*${CONNECTOR}\\s*`, 'i');

export const extractCitations = (text: string): Extracted[] => {
	const seen = new Map<string, Extracted>();
	ENUM_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = ENUM_RE.exec(text)) !== null) {
		const numbers = m[1].split(SPLIT_RE).map((n) => n.trim()).filter(Boolean);
		for (const num of numbers) {
			const value = normalizeCitation(num);
			if (!value || seen.has(value)) continue;
			seen.set(value, { value, raw: `${m[0].trim().split(/\s+/)[0]} ${num}`.trim() });
		}
	}
	return [...seen.values()];
};

// ─────────────────────────────────────────────────────────
// Concept extraction
// ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
	// English
	'the', 'a', 'an', 'and', 'or', 'of', 'on', 'in', 'to', 'for', 'with',
	'about', 'case', 'make', 'build', 'create', 'generate', 'draft', 'me',
	'please', 'can', 'you', 'give', 'new', 'article', 'section', 'paragraph',
	// French
	'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'sur',
	'avec', 'dans', 'pour', 'cas', 'fais', 'crée', 'cree', 'génère', 'genere',
	'article', 'section', 'paragraphe', 'alinéa', 'alinea', 'moi', 'un',
	'que', 'qui', 'est', 'au', 'aux', 'ce', 'cette', 'sont'
]);

export const extractConcepts = (text: string): string[] => {
	// Strip out citation phrases so we don't double-count "article 1457" as a concept.
	const cleaned = text
		.replace(ARTICLE_RE, ' ')
		.replace(SECTION_RE, ' ')
		.replace(PARAGRAPH_RE, ' ');
	const words = cleaned
		.toLowerCase()
		.split(/[^a-zàâäéèêëïîôöùûüçœ0-9-]+/)
		.map((w) => w.trim())
		.filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
	return [...new Set(words)].slice(0, 12);
};

// ─────────────────────────────────────────────────────────
// Source-bound detection
// ─────────────────────────────────────────────────────────

const SOURCE_BOUND_MARKERS = [
	// English
	'this article', 'this section', 'based on', 'using', 'from the source',
	'from the document', 'in the source', 'in my sources', 'uploaded', 'the pack',
	// French
	'cet article', 'cette section', 'à partir de', 'a partir de', 'selon',
	'dans le document', 'dans la source', 'dans mes sources', 'téléversé',
	'televerse', 'du document', 'de la source', 'le pack'
];

export const detectSourceBound = (text: string, hasCitations: boolean): boolean => {
	if (hasCitations) return true;
	const lower = text.toLowerCase();
	return SOURCE_BOUND_MARKERS.some((m) => lower.includes(m));
};

// ─────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────

export const parseIntent = (rawRequest: string): IntentPlan => {
	const text = (rawRequest ?? '').trim();
	const language = detectLanguage(text);
	const action = detectAction(text);

	const citationHits = extractCitations(text);
	const concepts = extractConcepts(text);
	const sourceBound = detectSourceBound(text, citationHits.length > 0);

	const targets: RetrievalTarget[] = [];

	// Citations the user named are MANDATORY — we must find them or say why not.
	for (const hit of citationHits) {
		targets.push({ kind: 'citation', value: hit.value, raw: hit.raw, mandatory: true });
	}

	// Concepts are soft hints that steer retrieval.
	for (const concept of concepts) {
		targets.push({ kind: 'concept', value: concept, raw: concept, mandatory: false });
	}

	return {
		rawRequest: text,
		language,
		action,
		sourceBound,
		targets,
		citations: citationHits.map((h) => h.value),
		concepts
	};
};
