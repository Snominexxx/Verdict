import { writable } from 'svelte/store';
import type { DebateTurn, StagedCase } from '$lib/types';

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

	const now = new Date().toISOString();
	const youAre = stagedCase.role === 'plaintiff' ? 'Plaintiff' : 'Defendant';
	const iAm = stagedCase.role === 'plaintiff' ? 'Defendant' : 'Plaintiff';

	const hasIssues = stagedCase.issues?.trim();
	const hasRemedy = stagedCase.remedy?.trim();
	const hasSynopsis = stagedCase.synopsis?.trim();

	// Build clarifying questions if case info is sparse
	const questions: string[] = [];
	if (!hasSynopsis || hasSynopsis.length < 30) {
		questions.push('What exactly happened? Give me the key facts.');
	}
	if (!hasIssues) {
		questions.push('What legal question do you want resolved?');
	}
	if (!hasRemedy) {
		questions.push('What outcome are you asking for?');
	}

	let openingText: string;

	if (questions.length > 0) {
		openingText = `Before we begin, I need some clarity:\n\n` +
			questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
			`\n\nAnswer these so I can argue against you properly.`;
	} else {
		openingText = `Understood. You claim: "${hasSynopsis}"\n\n` +
			`I'll argue that you're wrong. Present your first argument—cite your sources.`;
	}

	const summaryTurn: DebateTurn = {
		role: 'ai',
		speaker: 'Advocate AI',
		message: `**${stagedCase.title}**\n\n` +
			`You = ${youAre}\n` +
			`Me = ${iAm} (I argue against you)`,
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
