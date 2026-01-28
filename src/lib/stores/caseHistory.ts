import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { StagedCase } from '$lib/types';

export type CaseHistoryEntry = StagedCase & {
status: 'ongoing' | 'finished';
startedAt: string;
updatedAt: string;
};

const STORAGE_KEY = 'verdict.caseHistory.v1';

const createHistoryStore = () => {
const { subscribe, set, update } = writable<CaseHistoryEntry[]>([]);

const persist = (value: CaseHistoryEntry[]) => {
if (browser) {
localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
};

const hydrateCaseHistory = () => {
if (!browser) return;
try {
const raw = localStorage.getItem(STORAGE_KEY);
if (!raw) {
set([]);
return;
}
const parsed = JSON.parse(raw) as CaseHistoryEntry[];
set(parsed);
} catch (error) {
console.error('Failed to hydrate case history', error);
set([]);
}
};

const registerCase = (record: StagedCase) => {
update((cases) => {
const next = [...cases];
const index = next.findIndex((entry) => entry.id === record.id);
const now = new Date().toISOString();

if (index > -1) {
const existing = next[index];
next[index] = {
...existing,
...record,
status: 'ongoing',
startedAt: existing.startedAt,
updatedAt: now
};
} else {
next.unshift({
...record,
status: 'ongoing',
startedAt: record.createdAt ?? now,
updatedAt: now
});
}

persist(next);
return next;
});
};

const markCaseStatus = (id: string, status: CaseHistoryEntry['status']) => {
update((cases) => {
const now = new Date().toISOString();
const next = cases.map((entry) =>
entry.id === id ? { ...entry, status, updatedAt: now } : entry
);
persist(next);
return next;
});
};

const removeCase = (id: string) => {
update((cases) => {
const next = cases.filter((entry) => entry.id !== id);
persist(next);
return next;
});
};

return {
subscribe,
hydrateCaseHistory,
registerCase,
markCaseFinished: (id: string) => markCaseStatus(id, 'finished'),
markCaseOngoing: (id: string) => markCaseStatus(id, 'ongoing'),
removeCase
};
};

export const caseHistoryStore = createHistoryStore();
