import { writable } from 'svelte/store';
import type { StagedCase } from '$lib/types';

const { subscribe, set } = writable<StagedCase | null>(null);

export const stagedCaseStore = { subscribe };

export const stageCase = (record: StagedCase): StagedCase => {
	set(record);
	return record;
};

export const hydrateStagedCase = (record: StagedCase | null) => set(record);

export const clearStagedCase = () => set(null);
