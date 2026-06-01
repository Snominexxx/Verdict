import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { SavedDraft } from '$lib/types';
import { userKey } from './userSession';

const STORAGE_KEY = 'verdict.savedDrafts.v1';

let syncTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleSync = (drafts: SavedDraft[], deletedIds?: string[]) => {
	if (!browser) return;
	if (syncTimer) clearTimeout(syncTimer);
	syncTimer = setTimeout(() => {
		const payload: Record<string, unknown> = { drafts };
		if (deletedIds?.length) payload.deletedDraftIds = deletedIds;
		fetch('/api/user-data', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}).catch((err) => console.warn('Draft sync failed (offline?):', err));
	}, 800);
};

const createDraftsStore = () => {
	const { subscribe, set, update } = writable<SavedDraft[]>([]);

	const persist = (value: SavedDraft[]) => {
		if (!browser) return;
		const key = userKey(STORAGE_KEY);
		if (key) localStorage.setItem(key, JSON.stringify(value));
	};

	const hydrate = () => {
		if (!browser) return;
		try {
			const key = userKey(STORAGE_KEY);
			const raw = key ? localStorage.getItem(key) : null;
			if (!raw) {
				set([]);
				return;
			}
			set(JSON.parse(raw) as SavedDraft[]);
		} catch (error) {
			console.error('Failed to hydrate saved drafts', error);
			set([]);
		}
	};

	const loadFromRemote = async () => {
		if (!browser) return;
		try {
			const res = await fetch('/api/user-data');
			if (!res.ok) return;
			const data = await res.json();
			if (Array.isArray(data.drafts)) {
				set(data.drafts as SavedDraft[]);
				persist(data.drafts as SavedDraft[]);
			}
		} catch {
			// Offline — localStorage values are already loaded.
		}
	};

	const saveDraft = (draft: SavedDraft) => {
		update((drafts) => {
			const next = [...drafts];
			const index = next.findIndex((entry) => entry.id === draft.id);
			if (index > -1) next[index] = draft;
			else next.unshift(draft);
			persist(next);
			scheduleSync(next);
			return next;
		});
	};

	const removeDraft = (id: string) => {
		update((drafts) => {
			const next = drafts.filter((entry) => entry.id !== id);
			persist(next);
			scheduleSync(next, [id]);
			return next;
		});
	};

	return {
		subscribe,
		hydrate,
		loadFromRemote,
		saveDraft,
		removeDraft
	};
};

export const draftsStore = createDraftsStore();