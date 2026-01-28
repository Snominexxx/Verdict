import type { JurorPersona } from '$lib/types';

export const jurorPersonas: JurorPersona[] = [
	{
		id: 'aurora',
		name: 'Justice Aurora Chen',
		temperament: 'Textualist',
		biasVector: 'Tethers every ruling to the exact statutory text provided.',
		description: 'Ideal for Charter and constitutional drills where precise citations are mandatory.',
		signatureMove: 'Demands parallel passages from every cited authority before scoring.'
	},
	{
		id: 'malik',
		name: 'Justice Samir Malik',
		temperament: 'Pragmatist',
		biasVector: 'Weights policy fallout and practicality of proposed remedies.',
		description: 'Highlights holes in causation logic when counsel leans on formalism.',
		signatureMove: 'Adds policy “stress fractures” to the score sheet.'
	},
	{
		id: 'tremblay',
		name: 'Justice Aïda Tremblay',
		temperament: 'Rights-First',
		biasVector: 'Frames every prompt through proportionality and dignity.',
		description: 'Essential when you rehearse Charter or C.c.Q. personality rights cases.',
		signatureMove: 'Tracks infringement gravity versus minimal impairment.'
	},
	{
		id: 'dawson',
		name: 'Justice Emery Dawson',
		temperament: 'Strict Constructionist',
		biasVector: 'Skeptical of novel analogies and AI metaphors unless anchored in precedent.',
		description: 'Useful for honing conservative appellate advocacy.',
		signatureMove: 'Subtracts points for rhetoric without pinpoint cites.'
	},
	{
		id: 'solange',
		name: 'Justice Solange Fortier',
		temperament: 'Equity-Minded',
		biasVector: 'Models fairness remedies and public interest balancing.',
		description: 'Tests how you integrate discretionary relief within civil law principles.',
		signatureMove: 'Issues separate concurrences explaining equitable constraints.'
	}
];
