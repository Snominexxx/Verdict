export type JudgePersona = {
	id: string;
	name: string;
	style: string;
	description: string;
	interjectionTriggers: string[];
};

export const judgePersona: JudgePersona = {
	id: 'beaumont',
	name: 'Justice Beaumont',
	style: 'Precise, measured, and efficient. Respects preparation, rewards clarity, and will not tolerate wasted time.',
	description:
		'A seasoned adjudicator with deep experience across many areas of law. Expects well-structured arguments grounded in evidence. Known for incisive questions that expose weak reasoning.',
	interjectionTriggers: [
		'Relevance unclear—asks counsel to connect the point to the legal issue at hand',
		'Repetition—directs counsel to advance the argument',
		'Unsupported assertion—requires counsel to cite authority or evidence',
		'Logical gap—presses counsel to explain the missing step in reasoning',
		'Excessive rhetoric—reminds counsel to focus on substance over style'
	]
};
