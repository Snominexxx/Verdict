import type { JurorPersona } from '$lib/types';

export const jurorPersonas: JurorPersona[] = [
	{
		id: 'marcus',
		name: 'Marcus Thompson',
		temperament: 'Skeptical Pragmatist',
		biasVector: 'Former small business owner. Trusts common sense over legal jargon. Wants to see real-world impact.',
		description: '58, retired contractor. Served on two juries before. Cuts through BS quickly.',
		signatureMove: 'Asks "What would a reasonable person actually do here?"'
	},
	{
		id: 'priya',
		name: 'Priya Sharma',
		temperament: 'Analytical Thinker',
		biasVector: 'Software engineer. Loves logic chains and clear evidence. Dislikes emotional appeals without substance.',
		description: '34, data-driven mind. Will follow your reasoning step by step—if it holds up.',
		signatureMove: 'Traces the logical chain: "If A, then B, then C... but you skipped B."'
	},
	{
		id: 'darlene',
		name: 'Darlene Washington',
		temperament: 'Empathetic Listener',
		biasVector: 'Retired nurse. Reads between the lines. Sensitive to who got hurt and why.',
		description: '62, community volunteer. Weighs human cost heavily. Fairness matters more than technicalities.',
		signatureMove: 'Focuses on harm: "But what happened to the actual person here?"'
	},
	{
		id: 'jake',
		name: 'Jake Kowalski',
		temperament: 'Gut-Instinct',
		biasVector: 'Union electrician. Trusts his gut, skeptical of slick talkers. Respects straight shooters.',
		description: '45, blue-collar perspective. Detects dishonesty quickly. Loyalty and integrity matter.',
		signatureMove: 'Credibility check: "Something about this story doesn\'t add up."'
	},
	{
		id: 'elena',
		name: 'Elena Rodriguez',
		temperament: 'Fair-Minded Moderator',
		biasVector: 'High school teacher. Listens to all sides before deciding. Values clear explanations.',
		description: '41, patient and thorough. Often the voice of reason. Wants both sides heard fairly.',
		signatureMove: 'Balance test: "But what would the other side say to that?"'
	}
];
