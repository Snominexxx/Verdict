import { describe, it, expect } from 'vitest';
import { parseIntent, detectLanguage, detectAction, extractCitations } from './intent';

/**
 * Core promise #1: when the user names an authority ("article 1457"), the
 * engine must treat it as a MANDATORY retrieval target — the foundation of
 * source-bound truth.
 */
describe('parseIntent — source-bound targets', () => {
	it('treats a named French article as a mandatory citation target', () => {
		const intent = parseIntent("fais un cas sur l'article 1457");
		expect(intent.language).toBe('fr');
		expect(intent.action).toBe('build');
		expect(intent.sourceBound).toBe(true);
		expect(intent.citations).toContain('1457');
		const target = intent.targets.find((t) => t.kind === 'citation' && t.value === '1457');
		expect(target).toBeDefined();
		expect(target?.mandatory).toBe(true);
	});

	it('treats a named English section as a mandatory citation target', () => {
		const intent = parseIntent('Create a case based on section 124 of the labour act');
		expect(intent.language).toBe('en');
		expect(intent.action).toBe('build');
		expect(intent.sourceBound).toBe(true);
		expect(intent.citations).toContain('124');
	});

	it('detects build vs chat', () => {
		expect(detectAction('génère un procès')).toBe('build');
		expect(detectAction('what does this article mean?')).toBe('chat');
	});

	it('flags source-bound requests even without an explicit citation', () => {
		const intent = parseIntent('Build an exercise based on the uploaded document');
		expect(intent.sourceBound).toBe(true);
	});

	it('does not invent citations that were not asked for', () => {
		const intent = parseIntent('Make a contract dispute about a broken promise');
		expect(intent.citations).toHaveLength(0);
		expect(intent.targets.filter((t) => t.mandatory)).toHaveLength(0);
	});
});

describe('detectLanguage', () => {
	it('detects French from accents', () => {
		expect(detectLanguage('rédige un argument sur la responsabilité')).toBe('fr');
	});
	it('defaults to English', () => {
		expect(detectLanguage('build a tort case about negligence')).toBe('en');
	});
});

describe('extractCitations', () => {
	it('captures multiple distinct article numbers', () => {
		const hits = extractCitations('articles 1457 et 1458 du Code civil');
		const values = hits.map((h) => h.value);
		expect(values).toContain('1457');
		expect(values).toContain('1458');
	});
});
