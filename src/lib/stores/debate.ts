import { writable, get } from 'svelte/store';
import type { DebateTurn, StagedCase } from '$lib/types';
import { language } from '$lib/stores/language';

const emptyTranscript: DebateTurn[] = [];

const isTransientCaseId = (caseId: string): boolean =>
	caseId.startsWith('local-') || caseId.startsWith('shared-');

const { subscribe, update, set } = writable<DebateTurn[]>(emptyTranscript);

export const debateStore = { subscribe };

export const appendTurn = (turn: DebateTurn) => {
	update((turns) => [...turns, turn]);
};

export const resetTranscript = () => set(emptyTranscript);

/** Save an array of new turns to the backend. */
export const saveTurns = async (caseId: string, turns: DebateTurn[]) => {
	if (isTransientCaseId(caseId)) return;
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
	if (isTransientCaseId(caseId)) return false;
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
	if (isTransientCaseId(caseId)) return;
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
	const skillFocus = stagedCase.targetSkill?.trim();
	const hearingFocus = stagedCase.judgeBrief?.hearingFocus?.trim();
	const studentTask = stagedCase.judgeBrief?.studentTask?.trim();
	const judgeSummary: DebateTurn = {
		role: 'judge',
		speaker: 'Justice Beaumont',
		message: `**${stagedCase.title}**\n\n` +
			(lang === 'fr'
				? `Audience devant juge seul. Vous vous représentez en tant que ${youAre}.`
				: `Bench hearing. You represent yourself as ${youAre}.`) +
			(hearingFocus
				? `\n\n${lang === 'fr' ? `Cadre de l audience : ${hearingFocus}.` : `Hearing focus: ${hearingFocus}.`}`
				: '') +
			(skillFocus
				? `\n\n${lang === 'fr' ? `Compétence ciblée : ${skillFocus}.` : `Skill focus: ${skillFocus}.`}`
				: ''),
		timestamp: now
	};

	const judgeOpening: DebateTurn = {
		role: 'judge',
		speaker: 'Justice Beaumont',
		message: lang === 'fr'
			? (studentTask
				? `${studentTask}${skillFocus ? ` Compétence ciblée : ${skillFocus}.` : ''}`
				: skillFocus
				? `La compétence ciblée aujourd'hui est ${skillFocus}. Présentez votre argument en citant le droit applicable.`
				: `Les faits sont notés. Présentez votre argument en citant le droit applicable.`)
			: (studentTask
				? `${studentTask}${skillFocus ? ` Primary skill: ${skillFocus}.` : ''}`
				: skillFocus
				? `Today's exercise focuses on ${skillFocus}. Present your argument and cite the applicable law.`
				: `The facts are noted. Present your argument and cite the applicable law.`),
		timestamp: new Date().toISOString()
	};

	set([judgeSummary, judgeOpening]);
};
