import { writable } from 'svelte/store';
import type { CourtType } from '$lib/types';

export type CaseDraft = {
	title: string;
	synopsis: string;
	issues: string;
	remedy: string;
	defendantPosition: string;
	role: '' | 'plaintiff' | 'defendant';
	sources: string[];
	courtType: CourtType;
};

const empty: CaseDraft = {
	title: '',
	synopsis: '',
	issues: '',
	remedy: '',
	defendantPosition: '',
	role: '',
	sources: [],
	courtType: 'jury'
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
