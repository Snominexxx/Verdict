/**
 * Verdict v2 — Source map & cross-reference resolver.
 *
 * Two jobs, both deterministic and source-bound:
 *
 *  1. `renderSourceMap` builds a compact "table of contents" of the user's
 *     sources (article / section labels + headings) that the AI planner is
 *     allowed to navigate. It contains LABELS ONLY — never the law itself — so
 *     the planner can decide WHAT to look for without ever seeing (or being
 *     able to invent) the substance of the law.
 *
 *  2. `resolveCrossReferences` follows references found INSIDE retrieved
 *     passages ("nonobstant l'article 1474", "voir art. 1726") and pulls the
 *     exact text of those articles. This is how the engine catches an article
 *     "200 pages later" that limits or enforces the one the user asked about.
 *     It is pure text lookup against the parsed structure — no AI, fully
 *     traceable.
 */

import { createHash } from 'node:crypto';
import type { LibraryDocument } from '$lib/data/library';
import type { SourcePassage } from '$lib/verdict/contracts';
import { parseLegalStructure, type LegalStructureUnit } from '../legalStructure';

// ─────────────────────────────────────────────────────────
// Parsed-source cache (parsing is the only non-trivial cost)
// ─────────────────────────────────────────────────────────

export type ParsedSource = {
	sourceId: string;
	sourceTitle: string;
	units: LegalStructureUnit[];
	/** Article/section number (normalized, e.g. "1457", "1457.1") → unit. */
	byNumber: Map<string, LegalStructureUnit>;
	/** This document's own neutral citation (e.g. "2023 SCC 15"), if it is a judgment. */
	selfCitation?: string;
};

type CacheEntry = { parsed: ParsedSource; expiresAt: number };

const PARSE_CACHE = new Map<string, CacheEntry>();
const PARSE_CACHE_TTL_MS = 30 * 60_000;
const PARSE_CACHE_LIMIT = 64;

const hashContent = (text: string): string =>
	createHash('sha1').update(text).digest('hex').slice(0, 16);

/** Pull the canonical numeric token out of a label/citation ("art. 1457" → "1457"). */
const normalizeNumber = (value: string | undefined): string | null => {
	if (!value) return null;
	const m = value.match(/(\d+(?:\.\d+)*)/);
	return m ? m[1] : null;
};

// Modern neutral citation: YEAR COURT NUMBER, e.g. "2023 SCC 15", "2024 QCCA 567".
const NEUTRAL_CITATION_RE = /\[?(\d{4})\]?\s+([A-Z]{2,6})\s+(\d{1,5})\b/g;

/** Normalize a neutral citation to a stable key ("[2023] SCC 15" → "2023 SCC 15"). */
const normalizeCitation = (year: string, court: string, num: string): string =>
	`${year} ${court.toUpperCase()} ${num}`;

const looksLikeNeutralCitation = (token: string): boolean =>
	/^\d{4}\s+[A-Z]{2,6}\s+\d{1,5}$/.test(token.trim().toUpperCase());

/** Detect a judgment's own neutral citation from its title or opening text. */
const detectSelfCitation = (title: string, content: string): string | undefined => {
	for (const haystack of [title, content.slice(0, 4000)]) {
		NEUTRAL_CITATION_RE.lastIndex = 0;
		const m = NEUTRAL_CITATION_RE.exec(haystack ?? '');
		if (m) return normalizeCitation(m[1], m[2], m[3]);
	}
	return undefined;
};

const ARTICLE_LIKE = new Set(['article', 'section', 'paragraph']);

const parseOneSource = (source: LibraryDocument): ParsedSource => {
	const content = source.content ?? '';
	const cacheKey = `${source.id}:${hashContent(content)}`;
	const now = Date.now();

	const cached = PARSE_CACHE.get(cacheKey);
	if (cached && cached.expiresAt > now) return cached.parsed;

	const { units } = parseLegalStructure(content);
	const byNumber = new Map<string, LegalStructureUnit>();
	for (const unit of units) {
		if (!ARTICLE_LIKE.has(unit.kind)) continue;
		const num = normalizeNumber(unit.citation) ?? normalizeNumber(unit.label);
		if (num && !byNumber.has(num)) byNumber.set(num, unit);
	}

	const parsed: ParsedSource = {
		sourceId: source.id,
		sourceTitle: source.title,
		units,
		byNumber,
		selfCitation: detectSelfCitation(source.title ?? '', content)
	};

	// Bounded LRU-ish eviction.
	if (PARSE_CACHE.size >= PARSE_CACHE_LIMIT) {
		const oldestKey = PARSE_CACHE.keys().next().value;
		if (oldestKey) PARSE_CACHE.delete(oldestKey);
	}
	PARSE_CACHE.set(cacheKey, { parsed, expiresAt: now + PARSE_CACHE_TTL_MS });
	return parsed;
};

export const parseSources = (sources: LibraryDocument[]): ParsedSource[] =>
	sources.map(parseOneSource);

// ─────────────────────────────────────────────────────────
// Source map (table of contents) for the AI planner
// ─────────────────────────────────────────────────────────

const MAX_MAP_ENTRIES_PER_SOURCE = 120;
const MAX_MAP_CHARS = 8000;

/**
 * Render a compact, label-only table of contents the planner can navigate.
 * Articles/sections only, with their heading when short. No legal substance.
 */
export const renderSourceMap = (parsed: ParsedSource[]): string => {
	const blocks: string[] = [];
	for (const src of parsed) {
		const entries: string[] = [];
		for (const unit of src.units) {
			if (!ARTICLE_LIKE.has(unit.kind)) continue;
			const num = normalizeNumber(unit.citation) ?? normalizeNumber(unit.label);
			if (!num) continue;
			const heading = (unit.heading ?? '').trim().slice(0, 80);
			entries.push(heading ? `${num} (${heading})` : num);
			if (entries.length >= MAX_MAP_ENTRIES_PER_SOURCE) {
				entries.push('…');
				break;
			}
		}
		if (entries.length) {
			blocks.push(`# ${src.sourceTitle}\n${entries.join(', ')}`);
		} else {
			blocks.push(`# ${src.sourceTitle}\n(no structured articles detected — search by concept)`);
		}
	}
	const text = blocks.join('\n\n');
	return text.length > MAX_MAP_CHARS ? `${text.slice(0, MAX_MAP_CHARS)}\n…(truncated)` : text;
};

// ─────────────────────────────────────────────────────────
// Cross-reference extraction & resolution (1 hop)
// ─────────────────────────────────────────────────────────

/**
 * Find article/section numbers REFERENCED inside a passage of text, including
 * enumerations ("articles 1457 et 1458") and connectors ("1611 à 1613").
 * Also captures neutral citations to OTHER judgments ("2023 SCC 15") so case
 * law can be cross-referenced like statutes.
 */
export const extractLegalRefs = (text: string): string[] => {
	if (!text) return [];
	const KEYWORD = /(?:art(?:icle)?s?\.?|s(?:ec(?:tion)?)?s?\.?|par(?:agraph)?s?\.?|al(?:in[ée]a)?s?\.?)/i;
	const NUM = /\d+(?:\.\d+)*/;
	const CONNECTOR = /\s*(?:,|;|et|and|to|à|a|ou|or|-|–)\s*/i;
	const RE = new RegExp(
		`${KEYWORD.source}\\s*(${NUM.source}(?:${CONNECTOR.source}${NUM.source})*)`,
		'gi'
	);
	const out = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = RE.exec(text)) !== null) {
		const group = match[1];
		const parts = group.split(/\s*(?:,|;|et|and|to|à|a|ou|or|-|–)\s*/i);
		for (const part of parts) {
			const num = part.match(/^\d+(?:\.\d+)*/);
			if (num) out.add(num[0]);
		}
	}
	// Neutral citations to other judgments.
	NEUTRAL_CITATION_RE.lastIndex = 0;
	let cite: RegExpExecArray | null;
	while ((cite = NEUTRAL_CITATION_RE.exec(text)) !== null) {
		out.add(normalizeCitation(cite[1], cite[2], cite[3]));
	}
	return [...out];
};

const MAX_CROSSREF_PASSAGES = 6;
const CROSSREF_TEXT_CHARS = 1100;

/**
 * Given numbers referenced by already-retrieved passages, pull the exact text
 * of those articles from the parsed sources — but only ones not already
 * covered (the `exclude` set holds numbers already present/targeted).
 */
export const resolveCrossReferences = (
	parsed: ParsedSource[],
	referencedNumbers: string[],
	exclude: Set<string>,
	max: number = MAX_CROSSREF_PASSAGES
): SourcePassage[] => {
	const out: SourcePassage[] = [];
	const seen = new Set<string>(exclude);

	for (const num of referencedNumbers) {
		if (out.length >= max) break;
		if (seen.has(num)) continue;
		seen.add(num);

		// Neutral citation → pull the referenced judgment (if it is in the pack).
		if (looksLikeNeutralCitation(num)) {
			const src = parsed.find((p) => p.selfCitation === num.toUpperCase());
			if (src && src.sourceId !== undefined) {
				const repText = (src.units.map((u) => u.content).find((c) => c?.trim()) ??
					'').trim();
				if (repText) {
					out.push({
						sourceId: src.sourceId,
						sourceTitle: src.sourceTitle,
						citation: num,
						heading: src.sourceTitle,
						text: repText.length > CROSSREF_TEXT_CHARS ? `${repText.slice(0, CROSSREF_TEXT_CHARS)}…` : repText,
						crossReferenced: true
					});
				}
			}
			continue;
		}

		for (const src of parsed) {
			const unit = src.byNumber.get(num);
			if (!unit) continue;
			const text = (unit.content ?? '').trim();
			if (!text) continue;
			out.push({
				sourceId: src.sourceId,
				sourceTitle: src.sourceTitle,
				citation: unit.citation ?? unit.label,
				heading: unit.heading || undefined,
				text: text.length > CROSSREF_TEXT_CHARS ? `${text.slice(0, CROSSREF_TEXT_CHARS)}…` : text,
				crossReferenced: true
			});
			break; // one source per referenced number is enough
		}
	}

	return out;
};
