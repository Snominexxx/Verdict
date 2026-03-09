import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { StagedCase } from '$lib/types';

export type CasePerformance = {
	summary: string;
	scores: {
		persuasion: number;
		lawCited: number;
		structure: number;
		responsiveness: number;
		factFidelity: number;
		average: number;
	};
};

export type CaseHistoryEntry = StagedCase & {
status: 'ongoing' | 'finished';
startedAt: string;
updatedAt: string;
performance?: CasePerformance;
};

const STORAGE_KEY = 'verdict.caseHistory.v1';

/** Debounced sync to Supabase */
let syncTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleSync = (cases: CaseHistoryEntry[], deletedIds?: string[]) => {
	if (!browser) return;
	if (syncTimer) clearTimeout(syncTimer);
	syncTimer = setTimeout(() => {
		const payload: Record<string, unknown> = { cases };
		if (deletedIds?.length) payload.deletedCaseIds = deletedIds;
		fetch('/api/user-data', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}).catch((err) => console.warn('Case sync failed (offline?):', err));
	}, 800);
};

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

/** Load from Supabase (called after auth is confirmed) */
const loadFromRemote = async () => {
	if (!browser) return;
	try {
		const res = await fetch('/api/user-data');
		if (!res.ok) return;
		const data = await res.json();
		if (data.cases && Array.isArray(data.cases)) {
			set(data.cases as CaseHistoryEntry[]);
			persist(data.cases as CaseHistoryEntry[]);
		}
	} catch {
		// Offline — localStorage values are already loaded
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
scheduleSync(next);
return next;
});
};

const markCaseStatus = (id: string, status: CaseHistoryEntry['status'], performance?: CasePerformance) => {
update((cases) => {
const now = new Date().toISOString();
const next = cases.map((entry) =>
		entry.id === id
			? {
				...entry,
				status,
				updatedAt: now,
				performance: status === 'finished' ? performance ?? entry.performance : entry.performance
			}
			: entry
);
persist(next);
scheduleSync(next);
return next;
});
};

const removeCase = (id: string) => {
update((cases) => {
const next = cases.filter((entry) => entry.id !== id);
persist(next);
scheduleSync(next, [id]);
return next;
});
};

return {
subscribe,
hydrateCaseHistory,
loadFromRemote,
registerCase,
markCaseFinished: (id: string, performance?: CasePerformance) => markCaseStatus(id, 'finished', performance),
markCaseOngoing: (id: string) => markCaseStatus(id, 'ongoing'),
removeCase
};
};

export const caseHistoryStore = createHistoryStore();
