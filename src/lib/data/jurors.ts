import type { JurorPersona } from '$lib/types';

type Bilingual = { en: string; fr: string };

type BilingualJurorPersona = {
	id: string;
	name: Bilingual;
	temperament: Bilingual;
	biasVector: Bilingual;
	description: Bilingual;
	signatureMove: Bilingual;
};

const bilingualJurors: BilingualJurorPersona[] = [
	{
		id: 'marcus',
		name: { en: 'Marcus', fr: 'Marcus' },
		temperament: { en: 'Skeptical Pragmatist', fr: 'Pragmatique sceptique' },
		biasVector: {
			en: 'Trusts common sense over jargon. Wants to see practical, real-world impact before committing to a position.',
			fr: 'Préfère le bon sens au jargon. Veut voir des conséquences pratiques et concrètes avant de prendre position.'
		},
		description: {
			en: 'Experienced and direct. Has seen many arguments before and cuts through vague claims quickly.',
			fr: 'Expérimenté et direct. A entendu beaucoup d\'arguments et démêle rapidement les affirmations vagues.'
		},
		signatureMove: {
			en: 'Asks "What would a reasonable person actually do here?"',
			fr: 'Demande : « Qu\'est-ce qu\'une personne raisonnable ferait réellement dans cette situation ? »'
		}
	},
	{
		id: 'priya',
		name: { en: 'Priya', fr: 'Priya' },
		temperament: { en: 'Analytical Thinker', fr: 'Esprit analytique' },
		biasVector: {
			en: 'Loves logic chains and clear evidence. Distrusts emotional appeals that lack factual grounding.',
			fr: 'Adore les chaînes logiques et les preuves claires. Se méfie des appels à l\'émotion sans fondement factuel.'
		},
		description: {
			en: 'Methodical and data-driven. Will follow your reasoning step by step—if it holds up.',
			fr: 'Méthodique et axée sur les faits. Suivra votre raisonnement étape par étape — s\'il tient la route.'
		},
		signatureMove: {
			en: 'Traces the logical chain: "If A, then B, then C… but you skipped B."',
			fr: 'Trace la chaîne logique : « Si A, alors B, puis C… mais vous avez sauté B. »'
		}
	},
	{
		id: 'darlene',
		name: { en: 'Darlene', fr: 'Darlene' },
		temperament: { en: 'Empathetic Listener', fr: 'Écoute empathique' },
		biasVector: {
			en: 'Reads between the lines. Sensitive to who was affected and why. Cares deeply about fairness.',
			fr: 'Lit entre les lignes. Sensible aux personnes touchées et aux raisons. Profondément attachée à l\'équité.'
		},
		description: {
			en: 'Compassionate and attentive. Weighs human impact heavily—technicalities alone won\'t persuade her.',
			fr: 'Compatissante et attentive. Pèse fortement l\'impact humain — les seules subtilités techniques ne la convaincront pas.'
		},
		signatureMove: {
			en: 'Asks "But what happened to the actual person involved?"',
			fr: 'Demande : « Mais qu\'est-il arrivé à la personne réellement concernée ? »'
		}
	},
	{
		id: 'jake',
		name: { en: 'Jake', fr: 'Jake' },
		temperament: { en: 'Gut-Instinct', fr: 'Instinct viscéral' },
		biasVector: {
			en: 'Trusts instinct and plain honesty. Skeptical of polished speakers. Respects straightforward arguments.',
			fr: 'Se fie à l\'instinct et à l\'honnêteté brute. Méfiant envers les beaux parleurs. Respecte les arguments directs.'
		},
		description: {
			en: 'No-nonsense and observant. Detects inconsistencies fast and values integrity above all.',
			fr: 'Sans détour et observateur. Détecte rapidement les incohérences et place l\'intégrité avant tout.'
		},
		signatureMove: {
			en: 'Credibility check: "Something about this story doesn\'t add up."',
			fr: 'Test de crédibilité : « Quelque chose dans cette histoire ne tient pas debout. »'
		}
	},
	{
		id: 'elena',
		name: { en: 'Elena', fr: 'Elena' },
		temperament: { en: 'Fair-Minded Moderator', fr: 'Modératrice impartiale' },
		biasVector: {
			en: 'Listens to all sides patiently before deciding. Values clarity, balance, and well-supported explanations.',
			fr: 'Écoute patiemment toutes les parties avant de décider. Valorise la clarté, l\'équilibre et les explications bien étayées.'
		},
		description: {
			en: 'Thoughtful and thorough. Often the voice of reason. Wants every perspective heard before reaching a conclusion.',
			fr: 'Réfléchie et minutieuse. Souvent la voix de la raison. Veut que chaque point de vue soit entendu avant de conclure.'
		},
		signatureMove: {
			en: 'Balance test: "But what would the other side say to that?"',
			fr: 'Test d\'équilibre : « Mais que répondrait l\'autre partie à cela ? »'
		}
	}
];

const pickLang = (s: Bilingual, lang: string): string => (lang === 'fr' ? s.fr : s.en);

export const getJurorPersonas = (language: string = 'en'): JurorPersona[] =>
	bilingualJurors.map((j) => ({
		id: j.id,
		name: pickLang(j.name, language),
		temperament: pickLang(j.temperament, language),
		biasVector: pickLang(j.biasVector, language),
		description: pickLang(j.description, language),
		signatureMove: pickLang(j.signatureMove, language)
	}));

// Default English export — kept for backward compatibility.
// Prefer `getJurorPersonas(language)` in new code.
export const jurorPersonas: JurorPersona[] = getJurorPersonas('en');
