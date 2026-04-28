export type JudgePersona = {
	id: string;
	name: string;
	style: string;
	description: string;
	interjectionTriggers: string[];
};

type Bilingual = { en: string; fr: string };

const bilingualJudge = {
	id: 'beaumont',
	name: { en: 'Justice Beaumont', fr: 'Hon. juge Beaumont' } as Bilingual,
	style: {
		en: 'Precise, measured, and efficient. Respects preparation, rewards clarity, and will not tolerate wasted time.',
		fr: 'Précis, mesuré et efficace. Respecte la préparation, récompense la clarté et ne tolère pas la perte de temps.'
	} as Bilingual,
	description: {
		en: 'A seasoned adjudicator with deep experience across many areas of law. Expects well-structured arguments grounded in evidence. Known for incisive questions that expose weak reasoning.',
		fr: 'Un magistrat chevronné avec une vaste expérience dans plusieurs domaines du droit. S\'attend à des arguments bien structurés et fondés sur la preuve. Connu pour des questions incisives qui exposent les raisonnements faibles.'
	} as Bilingual,
	interjectionTriggers: {
		en: [
			'Relevance unclear—asks counsel to connect the point to the legal issue at hand',
			'Repetition—directs counsel to advance the argument',
			'Unsupported assertion—requires counsel to cite authority or evidence',
			'Logical gap—presses counsel to explain the missing step in reasoning',
			'Excessive rhetoric—reminds counsel to focus on substance over style'
		],
		fr: [
			'Pertinence floue — demande à l\'avocat de relier le point à la question juridique en cause',
			'Répétition — invite l\'avocat à faire avancer l\'argument',
			'Affirmation non étayée — exige de l\'avocat qu\'il cite une autorité ou une preuve',
			'Lacune logique — presse l\'avocat d\'expliquer l\'étape manquante du raisonnement',
			'Rhétorique excessive — rappelle à l\'avocat de privilégier la substance sur le style'
		]
	}
};

const pickLang = (s: Bilingual, lang: string): string => (lang === 'fr' ? s.fr : s.en);

export const getJudgePersona = (language: string = 'en'): JudgePersona => ({
	id: bilingualJudge.id,
	name: pickLang(bilingualJudge.name, language),
	style: pickLang(bilingualJudge.style, language),
	description: pickLang(bilingualJudge.description, language),
	interjectionTriggers: language === 'fr' ? bilingualJudge.interjectionTriggers.fr : bilingualJudge.interjectionTriggers.en
});

// Default English export — kept for backward compatibility.
// Prefer `getJudgePersona(language)` in new code.
export const judgePersona: JudgePersona = getJudgePersona('en');
