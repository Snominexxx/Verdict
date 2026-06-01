import { writable } from 'svelte/store';
import type { ExerciseDraftData } from '$lib/types';

export type CaseDraft = ExerciseDraftData;

const empty: CaseDraft = {
	title: '',
	synopsis: '',
	issues: '',
	remedy: '',
	objective: '',
	targetSkill: '',
	practicePoints: [],
	judgeBrief: null,
	groundingAudit: null,
	defendantPosition: '',
	role: '',
	sources: [],
	courtType: 'bench'
};

const { subscribe, set, update } = writable<CaseDraft>({ ...empty });

export const caseDraftStore = {
	subscribe,
	/** Replace the entire draft */
	set(draft: CaseDraft) { set(draft); },
	/** Merge partial updates */
	patch(partial: Partial<CaseDraft>) { update((d) => ({ ...d, ...partial })); },
	/** Reset to blank */
	clear() { set({ ...empty }); }
};
