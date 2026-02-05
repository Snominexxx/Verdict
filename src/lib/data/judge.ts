export type JudgePersona = {
	id: string;
	name: string;
	style: string;
	description: string;
	interjectionTriggers: string[];
};

export const judgePersona: JudgePersona = {
	id: 'beaumont',
	name: 'Justice Marguerite Beaumont',
	style: 'Precise, patient, but intolerant of waste. Will cut you off if you ramble.',
	description:
		'30 years on the bench. Has seen every trick, respects preparation, despises theatrics. Known for pointed questions that expose weak arguments.',
	interjectionTriggers: [
		'Relevance unclear—cuts in to ask for connection to the issue',
		'Repetition—warns counsel to move on',
		'Unsupported assertion—demands authority',
		'Procedural misstep—corrects on the spot',
		'Excessive emotion—reminds counsel this is a court of law'
	]
};
