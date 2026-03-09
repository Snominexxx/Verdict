import { writable, get } from 'svelte/store';
import type { DebateTurn, StagedCase } from '$lib/types';
import { language } from '$lib/stores/language';

const emptyTranscript: DebateTurn[] = [];

const { subscribe, update, set } = writable<DebateTurn[]>(emptyTranscript);

export const debateStore = { subscribe };

export const appendTurn = (turn: DebateTurn) => {
	update((turns) => [...turns, turn]);
};

export const resetTranscript = () => set(emptyTranscript);

export const seedTranscript = (stagedCase?: StagedCase | null) => {
	if (!stagedCase) {
		set(emptyTranscript);
		return;
	}

	const lang = get(language);
	const now = new Date().toISOString();

	const youAre = stagedCase.role === 'plaintiff'
		? (lang === 'fr' ? 'Demandeur' : 'Plaintiff')
		: (lang === 'fr' ? 'Défendeur' : 'Defendant');
	const iAm = stagedCase.role === 'plaintiff'
		? (lang === 'fr' ? 'Défendeur' : 'Defendant')
		: (lang === 'fr' ? 'Demandeur' : 'Plaintiff');

	const hasIssues = stagedCase.issues?.trim();
	const hasRemedy = stagedCase.remedy?.trim();
	const hasSynopsis = stagedCase.synopsis?.trim();

	// Build clarifying questions if case info is sparse
	const questions: string[] = [];
	if (!hasSynopsis || hasSynopsis.length < 30) {
		questions.push(lang === 'fr'
			? 'Que s\'est-il passé exactement? Donnez-moi les faits essentiels.'
			: 'What exactly happened? Give me the key facts.');
	}
	if (!hasIssues) {
		questions.push(lang === 'fr'
			? 'Quelle question juridique voulez-vous résoudre?'
			: 'What legal question do you want resolved?');
	}
	if (!hasRemedy) {
		questions.push(lang === 'fr'
			? 'Quel résultat demandez-vous?'
			: 'What outcome are you asking for?');
	}

	let openingText: string;
	const isBenchTrial = stagedCase.courtType === 'bench';

	if (questions.length > 0) {
		openingText = lang === 'fr'
			? `Rôle confirmé : vous plaidez pour ${youAre}, et je plaide pour ${iAm}.\n\nAvant de commencer, j'ai besoin de clarifications :\n\n` +
				questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
				`\n\nRépondez à ces questions pour que je puisse argumenter contre vous correctement.`
			: `Role confirmed: you argue for ${youAre}, and I argue for ${iAm}.\n\nBefore we begin, I need some clarity:\n\n` +
				questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
				`\n\nAnswer these so I can argue against you properly.`;
	} else {
		openingText = lang === 'fr'
			? `Rôle confirmé : vous plaidez pour ${youAre}, et je plaide pour ${iAm}.\n\nCompris. Vous prétendez : « ${hasSynopsis} »\n\n` +
				`Je vais démontrer que vous avez tort. Présentez votre premier argument — citez vos sources.`
			: `Role confirmed: you argue for ${youAre}, and I argue for ${iAm}.\n\nUnderstood. You claim: "${hasSynopsis}"\n\n` +
				`I'll argue that you're wrong. Present your first argument—cite your sources.`;
	}

	if (isBenchTrial) {
		const judgeSummary: DebateTurn = {
			role: 'judge',
			speaker: 'Justice Beaumont',
			message: lang === 'fr'
				? `**${stagedCase.title}**\n\n` +
					`Ceci est une audience devant juge seul. Vous vous représentez en tant que ${youAre}.` +
					`\nRépondez clairement. Citez le droit sur lequel vous vous appuyez.`
				: `**${stagedCase.title}**\n\n` +
					`This is a bench hearing. You represent yourself as ${youAre}.` +
					`\nAnswer clearly. Cite the law you rely on.`,
			timestamp: now
		};

		const judgeOpening: DebateTurn = {
			role: 'judge',
			speaker: 'Justice Beaumont',
			message: questions.length
				? (lang === 'fr'
					? `Maître, commençons par les bases :\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
					: `Counsel, start with the basics:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`)
				: (lang === 'fr'
					? `Énoncez votre réclamation en une phrase, puis indiquez-moi la loi ou l'autorité sur laquelle vous vous appuyez.`
					: `State your claim in one sentence, then tell me the specific law or authority you rely on.`),
			timestamp: new Date().toISOString()
		};

		set([judgeSummary, judgeOpening]);
		return;
	}

	const summaryTurn: DebateTurn = {
		role: 'ai',
		speaker: 'Advocate AI',
		message: `**${stagedCase.title}**\n\n` +
			(lang === 'fr'
				? `Vous = ${youAre}\nMoi = ${iAm} (j'argumente contre vous)`
				: `You = ${youAre}\nMe = ${iAm} (I argue against you)`),
		timestamp: now
	};

	const openingTurn: DebateTurn = {
		role: 'ai',
		speaker: 'Advocate AI',
		message: openingText,
		timestamp: new Date().toISOString()
	};

	set([summaryTurn, openingTurn]);
};
