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

/** Save an array of new turns to the backend. */
export const saveTurns = async (caseId: string, turns: DebateTurn[]) => {
	if (!caseId || !turns.length) return;
	try {
		await fetch('/api/debate-turns', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ caseId, turns })
		});
	} catch (err) {
		console.error('[debate] save turns failed', err);
	}
};

/** Load saved turns from the backend and hydrate the store. Returns true if turns were found. */
export const loadTurns = async (caseId: string): Promise<boolean> => {
	if (!caseId) return false;
	try {
		const res = await fetch(`/api/debate-turns?caseId=${encodeURIComponent(caseId)}`);
		if (!res.ok) return false;
		const { turns } = await res.json() as { turns: DebateTurn[] };
		if (turns && turns.length > 0) {
			set(turns);
			return true;
		}
	} catch (err) {
		console.error('[debate] load turns failed', err);
	}
	return false;
};

/** Clear all saved turns for a case (used on restart). */
export const clearSavedTurns = async (caseId: string) => {
	if (!caseId) return;
	try {
		await fetch(`/api/debate-turns?caseId=${encodeURIComponent(caseId)}`, { method: 'DELETE' });
	} catch (err) {
		console.error('[debate] clear turns failed', err);
	}
};

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

	const isBenchTrial = stagedCase.courtType === 'bench';

	if (isBenchTrial) {
		const judgeSummary: DebateTurn = {
			role: 'judge',
			speaker: 'Justice Beaumont',
			message: `**${stagedCase.title}**\n\n` +
				(lang === 'fr'
					? `Audience devant juge seul. Vous vous représentez en tant que ${youAre}.`
					: `Bench hearing. You represent yourself as ${youAre}.`),
			timestamp: now
		};

		const judgeOpening: DebateTurn = {
			role: 'judge',
			speaker: 'Justice Beaumont',
			message: lang === 'fr'
				? `Les faits sont notés. Présentez votre argument en citant le droit applicable.`
				: `The facts are noted. Present your argument and cite the applicable law.`,
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
		message: lang === 'fr'
			? `Les faits sont convenus. Présentez votre premier argument.`
			: `The facts are agreed. Present your opening argument.`,
		timestamp: new Date().toISOString()
	};

	set([summaryTurn, openingTurn]);
};
