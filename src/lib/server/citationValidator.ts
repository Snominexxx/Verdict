/**
 * Citation Validator — server-side rigor guard for AI-generated legal references.
 *
 * Goal: every citation the AI produces ("art. 1457 C.c.Q.", "section 124 LNT",
 * « toute personne a le devoir... ») must be cross-checked against the actual
 * text of the user-supplied sources. Anything that cannot be located is flagged
 * as unverified so the UI can surface a red badge and the user knows not to
 * trust it.
 *
 * This module is pure (no I/O) and has no dependency on Supabase, the LLM
 * provider, or SvelteKit so it can be unit-tested directly.
 */

import type { LibraryDocument } from '$lib/data/library';

export type CitationStatus = 'verified' | 'unverified';
export type CitationType = 'article' | 'section' | 'paragraph' | 'quote' | 'other';

export type VerifiedCitation = {
	/** The raw citation text as the AI produced it (e.g. "art. 1457 C.c.Q."). */
	text: string;
	/** Heuristic classification used by the UI. */
	type: CitationType;
	/** Whether the citation could be located inside the provided sources. */
	status: CitationStatus;
	/** Source document id where the citation was found (if verified). */
	sourceId?: string;
	/** Source document title where the citation was found (if verified). */
	sourceTitle?: string;
	/** Short excerpt from the source around the match (≤220 chars). */
	excerpt?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect article / section / paragraph references in free text.
 *
 * Matches handled (case-insensitive):
 *   art. 1457            article 1457        articles 1457 et 1458
 *   art. 2(1)(b)         art. 1457 C.c.Q.    art. 1457 al. 2
 *   section 124          s. 124              s. 124(1)(a)
 *   para. 3              paragraph 3
 *
 * We capture the smallest meaningful unit ("art. 1457") rather than the full
 * suffix; the suffix (C.c.Q., LNT, etc.) is only used as a hint when matching.
 */
const ARTICLE_REGEX =
	/\b(?:art(?:\.|icle)?s?|sect(?:\.|ion)?s?|s\.|para(?:\.|graph)?s?|al(?:\.|inéa)?s?)\s*\d+(?:[\.\-]\d+)*(?:\s*\([^)]{1,12}\))*/gi;

/**
 * Detect verbatim quotes (« ... » or " ... ") of 5–250 characters. We only
 * keep quotes that look like actual prose (≥3 words) to avoid catching things
 * like "yes" or single-word emphasis.
 */
const QUOTE_REGEX = /(?:«\s*([^»]{12,250})\s*»|"([^"]{12,250})")/g;

const WORD_BOUNDARY_RE = /\W+/g;

const tokenize = (text: string): string[] =>
	text
		.toLowerCase()
		.replace(WORD_BOUNDARY_RE, ' ')
		.split(' ')
		.filter((w) => w.length > 0);

/**
 * Normalise an article reference to a canonical comparison form.
 *   "art. 1457"   → "1457"
 *   "Article 124" → "124"
 *   "s. 2(1)(b)"  → "2(1)(b)"
 *   "para. 3"     → "3"
 */
const normaliseArticleNumber = (raw: string): string => {
	const m = raw.match(/(\d+(?:[\.\-]\d+)*(?:\s*\([^)]{1,12}\))*)/);
	return m ? m[1].replace(/\s+/g, '') : raw.trim();
};

const classifyReference = (raw: string): CitationType => {
	const lower = raw.toLowerCase();
	if (lower.startsWith('art')) return 'article';
	if (lower.startsWith('s')) return 'section';
	if (lower.startsWith('para') || lower.startsWith('al')) return 'paragraph';
	return 'other';
};

// ─────────────────────────────────────────────────────────────────────────────
// Matching against sources
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a normalised lookup blob per source so we can run cheap substring
 * checks. We strip diacritics and collapse whitespace; this lets the AI write
 * "art. 1457" while the source has "Article 1457." (period, capital A).
 */
type IndexedSource = {
	id: string;
	title: string;
	rawContent: string;
	normalisedContent: string;
};

const stripDiacritics = (s: string): string =>
	s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normaliseForSearch = (s: string): string =>
	stripDiacritics(s).toLowerCase().replace(/\s+/g, ' ');

const indexSources = (sources: LibraryDocument[]): IndexedSource[] =>
	sources
		.filter((doc) => typeof doc.content === 'string' && doc.content.trim().length > 0)
		.map((doc) => ({
			id: doc.id,
			title: doc.title,
			rawContent: doc.content as string,
			normalisedContent: normaliseForSearch(doc.content as string)
		}));

/**
 * Try to find an article/section number inside a source's text. We look for
 * common patterns:
 *   "art. 1457"            "article 1457"
 *   "1457."  (start of a numbered paragraph)
 *   "Section 124"          "s. 124"
 */
const findArticleInSource = (
	number: string,
	source: IndexedSource
): { start: number; end: number } | null => {
	const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const patterns = [
		new RegExp(`\\bart(?:\\.|icle)?\\s*${escaped}\\b`, 'i'),
		new RegExp(`\\bsect(?:\\.|ion)?\\s*${escaped}\\b`, 'i'),
		new RegExp(`\\bs\\.\\s*${escaped}\\b`, 'i'),
		new RegExp(`(?:^|\\n)\\s*${escaped}\\.\\s`, 'm') // "1457. Toute personne…"
	];
	for (const re of patterns) {
		const m = source.normalisedContent.match(re);
		if (m && typeof m.index === 'number') {
			return { start: m.index, end: m.index + m[0].length };
		}
	}
	return null;
};

/**
 * Try to find a verbatim quote inside a source. We compare on the normalised
 * (diacritic-stripped, whitespace-collapsed) form so capitalisation and
 * punctuation differences don't cause false negatives.
 */
const findQuoteInSource = (
	quote: string,
	source: IndexedSource
): { start: number; end: number } | null => {
	const needle = normaliseForSearch(quote.trim());
	if (needle.length < 12) return null;
	const idx = source.normalisedContent.indexOf(needle);
	if (idx < 0) return null;
	return { start: idx, end: idx + needle.length };
};

const buildExcerpt = (source: IndexedSource, span: { start: number; end: number }): string => {
	// Map back to the raw content using approximate offsets. Because
	// normalisation only removes diacritics and collapses whitespace the
	// offsets are close enough for an excerpt window; we widen by ±80 chars
	// and trim to a clean word boundary.
	const padding = 90;
	const rawStart = Math.max(0, span.start - padding);
	const rawEnd = Math.min(source.rawContent.length, span.end + padding);
	let excerpt = source.rawContent.slice(rawStart, rawEnd).replace(/\s+/g, ' ').trim();
	if (rawStart > 0) excerpt = '…' + excerpt;
	if (rawEnd < source.rawContent.length) excerpt = excerpt + '…';
	return excerpt.length > 220 ? excerpt.slice(0, 217) + '…' : excerpt;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type ValidateInput = {
	message: string;
	declaredCitations?: string[];
	sources: LibraryDocument[];
	/** Keep true for judge replies; disable for exercise audits where quoted phrases can be ordinary wording. */
	extractQuotes?: boolean;
};

export type ValidateResult = {
	citations: VerifiedCitation[];
	verifiedCount: number;
	unverifiedCount: number;
};

/**
 * Validate every citation produced by the AI against the user's sources.
 *
 * The function is conservative: when in doubt it marks a citation as
 * `unverified` rather than `verified`. False negatives are recoverable
 * (the user re-uploads the source); false positives destroy trust.
 */
export const validateCitations = ({
	message,
	declaredCitations = [],
	sources,
	extractQuotes = true
}: ValidateInput): ValidateResult => {
	const indexed = indexSources(sources);
	const seen = new Map<string, VerifiedCitation>();

	const consider = (raw: string, kind: CitationType): void => {
		const key = `${kind}::${raw.toLowerCase().replace(/\s+/g, ' ').trim()}`;
		if (seen.has(key)) return;

		if (indexed.length === 0) {
			seen.set(key, { text: raw, type: kind, status: 'unverified' });
			return;
		}

		if (kind === 'quote') {
			for (const src of indexed) {
				const span = findQuoteInSource(raw, src);
				if (span) {
					seen.set(key, {
						text: raw,
						type: 'quote',
						status: 'verified',
						sourceId: src.id,
						sourceTitle: src.title,
						excerpt: buildExcerpt(src, span)
					});
					return;
				}
			}
			seen.set(key, { text: raw, type: 'quote', status: 'unverified' });
			return;
		}

		const number = normaliseArticleNumber(raw);
		for (const src of indexed) {
			const span = findArticleInSource(number, src);
			if (span) {
				seen.set(key, {
					text: raw,
					type: kind,
					status: 'verified',
					sourceId: src.id,
					sourceTitle: src.title,
					excerpt: buildExcerpt(src, span)
				});
				return;
			}
		}
		seen.set(key, { text: raw, type: kind, status: 'unverified' });
	};

	// 1. Citations the model declared in its structured `citations[]` array.
	for (const decl of declaredCitations) {
		if (typeof decl !== 'string' || !decl.trim()) continue;
		consider(decl.trim(), classifyReference(decl));
	}

	// 2. Article / section / paragraph references found inline in the message.
	for (const m of message.matchAll(ARTICLE_REGEX)) {
		consider(m[0], classifyReference(m[0]));
	}

	// 3. Verbatim quotes the model emitted inline. This is useful in judge replies,
	// but exercise drafts often quote labels or phrases that are not intended as
	// citations, so callers can disable quote extraction for that path.
	if (extractQuotes) {
		for (const m of message.matchAll(QUOTE_REGEX)) {
			const quoted = m[1] ?? m[2];
			if (quoted) consider(quoted, 'quote');
		}
	}

	const citations = Array.from(seen.values());
	return {
		citations,
		verifiedCount: citations.filter((c) => c.status === 'verified').length,
		unverifiedCount: citations.filter((c) => c.status === 'unverified').length
	};
};

// Used by `tokenize` test surface — kept exported for unit tests.
export const __testables = { tokenize, normaliseArticleNumber, normaliseForSearch };
