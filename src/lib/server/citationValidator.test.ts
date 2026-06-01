import { describe, it, expect } from 'vitest';
import { validateCitations } from './citationValidator';
import type { LibraryDocument } from '$lib/data/library';

/**
 * Core promise: the engine can never cite authority that is not in the
 * sources. A citation present in the source text verifies; one that is absent
 * is flagged unverified so it can be stripped before it reaches the user.
 */
const sources: LibraryDocument[] = [
	{
		id: 'ccq',
		title: 'Civil Code of Québec',
		jurisdiction: 'QC',
		description: '',
		lastUpdated: '',
		content:
			'1457. Every person has a duty to abide by the rules of conduct incumbent on him, ' +
			'so as not to cause injury to another. 1458. Every person has a duty to honour ' +
			'his contractual undertakings.'
	}
];

describe('validateCitations — source binding', () => {
	it('verifies a citation that appears in the sources', () => {
		const result = validateCitations({
			message: 'The duty arises under art. 1457.',
			declaredCitations: ['art. 1457'],
			sources
		});
		const cite = result.citations.find((c) => c.text.includes('1457'));
		expect(cite?.status).toBe('verified');
		expect(cite?.sourceId).toBe('ccq');
	});

	it('flags a citation that is absent from the sources', () => {
		const result = validateCitations({
			message: 'The claimant relies on art. 9999.',
			declaredCitations: ['art. 9999'],
			sources
		});
		const cite = result.citations.find((c) => c.text.includes('9999'));
		expect(cite?.status).toBe('unverified');
	});

	it('flags everything as unverified when there are no sources', () => {
		const result = validateCitations({
			message: 'Under art. 1457 the duty applies.',
			declaredCitations: ['art. 1457'],
			sources: []
		});
		expect(result.verifiedCount).toBe(0);
		expect(result.unverifiedCount).toBeGreaterThan(0);
	});
});
