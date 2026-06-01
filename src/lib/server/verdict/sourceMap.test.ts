import { describe, it, expect } from 'vitest';
import { extractLegalRefs, resolveCrossReferences, type ParsedSource } from './sourceMap';
import type { LegalStructureUnit } from '../legalStructure';

/**
 * Cross-reference following is the mechanism that catches the article
 * "200 pages later" that modifies or enforces the one the user asked about.
 * It must be deterministic and source-bound — it only pulls article text that
 * actually exists in the parsed sources.
 */

describe('extractLegalRefs — finds referenced articles inside a passage', () => {
	it('extracts a single French article reference', () => {
		expect(extractLegalRefs("nonobstant l'article 1474, le débiteur...")).toContain('1474');
	});

	it('extracts enumerations ("articles 1457 et 1458")', () => {
		const refs = extractLegalRefs('voir les articles 1457 et 1458 du Code');
		expect(refs).toContain('1457');
		expect(refs).toContain('1458');
	});

	it('extracts English section references', () => {
		const refs = extractLegalRefs('subject to sections 9 to 11 of the Act');
		expect(refs).toContain('9');
		expect(refs).toContain('11');
	});

	it('handles article numbers with decimals (1457.1)', () => {
		expect(extractLegalRefs('see art. 1457.1')).toContain('1457.1');
	});

	it('returns nothing when there is no legal reference', () => {
		expect(extractLegalRefs('the parties met on a Tuesday')).toEqual([]);
	});

	it('extracts a neutral citation to another judgment', () => {
		const refs = extractLegalRefs('as held in 2023 SCC 15, the duty applies');
		expect(refs).toContain('2023 SCC 15');
	});

	it('extracts a Quebec neutral citation', () => {
		expect(extractLegalRefs('voir 2024 QCCA 567')).toContain('2024 QCCA 567');
	});
});

const makeUnit = (label: string, citation: string, content: string): LegalStructureUnit => ({
	unitId: `u-${label}`,
	kind: 'article',
	label,
	citation,
	heading: `Heading ${label}`,
	path: [],
	content,
	startOffset: 0,
	endOffset: content.length,
	tokenCount: Math.ceil(content.length / 4),
	language: 'fr',
	confidence: 'high'
});

const makeParsed = (units: LegalStructureUnit[]): ParsedSource => {
	const byNumber = new Map<string, LegalStructureUnit>();
	for (const u of units) {
		const num = (u.citation?.match(/\d+(?:\.\d+)*/) ?? [])[0];
		if (num) byNumber.set(num, u);
	}
	return { sourceId: 's1', sourceTitle: 'Code civil', units, byNumber };
};

describe('resolveCrossReferences — pulls exact text of referenced articles', () => {
	const parsed = [
		makeParsed([
			makeUnit('1457', 'art. 1457', 'Toute personne a le devoir de respecter les règles de conduite.'),
			makeUnit('1474', 'art. 1474', 'Une personne ne peut exclure sa responsabilité pour faute lourde.')
		])
	];

	it('fetches a referenced article that is not already retrieved', () => {
		const out = resolveCrossReferences(parsed, ['1474'], new Set());
		expect(out).toHaveLength(1);
		expect(out[0].citation).toBe('art. 1474');
		expect(out[0].crossReferenced).toBe(true);
		expect(out[0].text).toContain('responsabilité');
	});

	it('skips numbers already covered (in the exclude set)', () => {
		const out = resolveCrossReferences(parsed, ['1474'], new Set(['1474']));
		expect(out).toHaveLength(0);
	});

	it('never invents an article that does not exist in the sources', () => {
		const out = resolveCrossReferences(parsed, ['9999'], new Set());
		expect(out).toHaveLength(0);
	});

	it('respects the max cap', () => {
		const out = resolveCrossReferences(parsed, ['1457', '1474'], new Set(), 1);
		expect(out).toHaveLength(1);
	});
});

describe('resolveCrossReferences — follows neutral citations to other judgments', () => {
	const judgment: ParsedSource = {
		sourceId: 'j1',
		sourceTitle: 'Tremblay c. Untel',
		selfCitation: '2023 SCC 15',
		units: [makeUnit('1', 'par. 1', 'The appeal raises the standard of care owed by a notary.')],
		byNumber: new Map()
	};

	it('pulls the referenced judgment when it is in the pack', () => {
		const out = resolveCrossReferences([judgment], ['2023 SCC 15'], new Set());
		expect(out).toHaveLength(1);
		expect(out[0].sourceId).toBe('j1');
		expect(out[0].crossReferenced).toBe(true);
		expect(out[0].text).toContain('standard of care');
	});

	it('does not invent a judgment that is not in the pack', () => {
		const out = resolveCrossReferences([judgment], ['2099 SCC 1'], new Set());
		expect(out).toHaveLength(0);
	});
});
