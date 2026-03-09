import type { JurorPersona } from '$lib/types';

export const jurorPersonas: JurorPersona[] = [
	{
		id: 'marcus',
		name: 'Marcus',
		temperament: 'Skeptical Pragmatist',
		biasVector: 'Trusts common sense over jargon. Wants to see practical, real-world impact before committing to a position.',
		description: 'Experienced and direct. Has seen many arguments before and cuts through vague claims quickly.',
		signatureMove: 'Asks "What would a reasonable person actually do here?"'
	},
	{
		id: 'priya',
		name: 'Priya',
		temperament: 'Analytical Thinker',
		biasVector: 'Loves logic chains and clear evidence. Distrusts emotional appeals that lack factual grounding.',
		description: 'Methodical and data-driven. Will follow your reasoning step by step—if it holds up.',
		signatureMove: 'Traces the logical chain: "If A, then B, then C… but you skipped B."'
	},
	{
		id: 'darlene',
		name: 'Darlene',
		temperament: 'Empathetic Listener',
		biasVector: 'Reads between the lines. Sensitive to who was affected and why. Cares deeply about fairness.',
		description: 'Compassionate and attentive. Weighs human impact heavily—technicalities alone won\'t persuade her.',
		signatureMove: 'Asks "But what happened to the actual person involved?"'
	},
	{
		id: 'jake',
		name: 'Jake',
		temperament: 'Gut-Instinct',
		biasVector: 'Trusts instinct and plain honesty. Skeptical of polished speakers. Respects straightforward arguments.',
		description: 'No-nonsense and observant. Detects inconsistencies fast and values integrity above all.',
		signatureMove: 'Credibility check: "Something about this story doesn\'t add up."'
	},
	{
		id: 'elena',
		name: 'Elena',
		temperament: 'Fair-Minded Moderator',
		biasVector: 'Listens to all sides patiently before deciding. Values clarity, balance, and well-supported explanations.',
		description: 'Thoughtful and thorough. Often the voice of reason. Wants every perspective heard before reaching a conclusion.',
		signatureMove: 'Balance test: "But what would the other side say to that?"'
	}
];
