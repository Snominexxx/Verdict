import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import type { LibraryDocument } from '$lib/data/library';
import type { PackLanguage } from '$lib/types';
import { userKey } from './userSession';

export type LegalPack = {
	id: string;
	name: string;
	jurisdiction: string;
	language: PackLanguage;
	domain: string;
	description: string;
	sources: LibraryDocument[];
	isDefault?: boolean;
};

const STORAGE_KEY = 'verdict.legalPacks.v1';
const SELECTED_PACK_KEY = 'verdict.selectedPackId.v1';

const defaultPacks: LegalPack[] = [];

const normalizePackLanguage = (value: unknown): PackLanguage => (value === 'fr' ? 'fr' : 'en');

const normalizePack = (raw: Partial<LegalPack> & Record<string, unknown>): LegalPack | null => {
	if (!raw || typeof raw !== 'object') return null;
	const id = String(raw.id ?? '').trim();
	const name = String(raw.name ?? '').trim();
	if (!id || !name) return null;
	return {
		id,
		name,
		jurisdiction: String(raw.jurisdiction ?? 'Other').trim() || 'Other',
		language: normalizePackLanguage(raw.language),
		domain: String(raw.domain ?? 'General').trim() || 'General',
		description: String(raw.description ?? ''),
		sources: Array.isArray(raw.sources) ? raw.sources.map(withCustomFlag) : [],
		isDefault: raw.isDefault === true
	};
};

const normalizePacks = (value: unknown): LegalPack[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((pack) => normalizePack(pack as Partial<LegalPack> & Record<string, unknown>))
		.filter((pack): pack is LegalPack => Boolean(pack));
};

const withCustomFlag = (source: LibraryDocument): LibraryDocument => ({
	...source,
	isCustom: source.isCustom ?? true
});

/** Debounced sync to Supabase — avoids hammering on rapid mutations */
let syncTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleSync = (packs: LegalPack[], deletedIds?: string[]) => {
	if (!browser) return;
	if (syncTimer) clearTimeout(syncTimer);
	syncTimer = setTimeout(() => {
		const payload: Record<string, unknown> = { packs };
		if (deletedIds?.length) payload.deletedPackIds = deletedIds;
		const syncOnce = async () =>
			fetch('/api/user-data', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

		void (async () => {
			let response = await syncOnce();
			if (response.status === 401) {
				// Right after auth transitions there can be a short cookie propagation
				// race. Retry once before surfacing a sync failure.
				await new Promise((resolve) => setTimeout(resolve, 250));
				response = await syncOnce();
			}
			if (!response.ok) {
				const details = await response.text().catch(() => '');
				throw new Error(`Pack sync failed (${response.status})${details ? `: ${details}` : ''}`);
			}
		})().catch((err) => console.warn('Pack sync failed:', err));
	}, 800);
};

const createLegalPacksStore = () => {
	const { subscribe, set, update } = writable<LegalPack[]>(defaultPacks);
	let _hydrated = false;

	const persist = (packs: LegalPack[]) => {
		if (!browser) return;
		const key = userKey(STORAGE_KEY);
		if (key) localStorage.setItem(key, JSON.stringify(packs));
	};

	/** Clear old default packs from storage on first load */
	const clearLegacyDefaults = () => {
		if (!browser) return;
		const key = userKey(STORAGE_KEY);
		const cleared = userKey('verdict.legacyPacksCleared');
		if (cleared && localStorage.getItem(cleared)) return;
		if (key) {
			try {
				const raw = localStorage.getItem(key);
				if (raw) {
					const parsed = normalizePacks(JSON.parse(raw));
					const filtered = parsed.filter((p) => !p.isDefault);
					persist(filtered);
					set(filtered);
				}
			} catch { /* ignore */ }
		}
		if (cleared) localStorage.setItem(cleared, '1');
	};

	const hydrate = () => {
		if (!browser) return;
		clearLegacyDefaults();
		// Load localStorage immediately for fast display
		try {
			const key = userKey(STORAGE_KEY);
			const raw = key ? localStorage.getItem(key) : null;
			if (raw) {
				const parsed = normalizePacks(JSON.parse(raw));
				set(parsed);
			} else {
				set([]);
			}
		} catch {
			set([]);
		}
		_hydrated = true;
	};

	/** Load from Supabase (called after auth is confirmed) */
	const loadFromRemote = async () => {
		if (!browser) return;
		try {
			const res = await fetch('/api/user-data');
			if (!res.ok) return;
			const data = await res.json();
			if (data.packs && Array.isArray(data.packs) && data.packs.length > 0) {
				const remotePacks = normalizePacks(data.packs);
				set(remotePacks);
				persist(remotePacks);
			} else if (!_hydrated) {
				set([]);
				persist([]);
			}
		} catch {
			// Offline — localStorage values are already loaded
		}
	};

	const createPack = (pack: Omit<LegalPack, 'id'>) => {
		update((packs) => {
			const next: LegalPack[] = [
				{ ...pack, language: normalizePackLanguage(pack.language), id: `pack-${Date.now()}` },
				...packs
			];
			persist(next);
			scheduleSync(next);
			return next;
		});
	};

	const updatePack = (id: string, patch: Partial<Omit<LegalPack, 'id'>>) => {
		update((packs) => {
			const next = packs.map((pack) => (pack.id === id ? { ...pack, ...patch } : pack));
			persist(next);
			scheduleSync(next);
			return next;
		});
	};

	const deletePack = (id: string) => {
		update((packs) => {
			const next = packs.filter((pack) => pack.id !== id);
			persist(next);
			scheduleSync(next, [id]);
			return next;
		});
		if (browser) {
			const key = userKey(SELECTED_PACK_KEY);
			if (key && localStorage.getItem(key) === id) {
				localStorage.removeItem(key);
			}
		}
	};

	const addSourceToPack = (packId: string, source: LibraryDocument) => {
		update((packs) => {
			const next = packs.map((pack) => {
				if (pack.id !== packId) return pack;
				const prepared = withCustomFlag({
					...source,
					jurisdiction: source.jurisdiction && source.jurisdiction !== 'Other'
						? source.jurisdiction
						: pack.jurisdiction
				});
				const deduped = [prepared, ...pack.sources.filter((s) => s.id !== prepared.id)];
				return { ...pack, sources: deduped };
			});
			persist(next);
			scheduleSync(next);
			return next;
		});
	};

	const removeSourceFromPack = (packId: string, sourceId: string) => {
		update((packs) => {
			const next = packs.map((pack) => {
				if (pack.id !== packId) return pack;
				return {
					...pack,
					sources: pack.sources.filter((s) => s.id !== sourceId || !s.isCustom)
				};
			});
			persist(next);
			scheduleSync(next);
			return next;
		});
	};

	const renameSource = (packId: string, sourceId: string, newTitle: string) => {
		const trimmed = newTitle.trim();
		if (!trimmed) return;
		update((packs) => {
			const next = packs.map((pack) => {
				if (pack.id !== packId) return pack;
				return {
					...pack,
					sources: pack.sources.map((s) => (s.id === sourceId ? { ...s, title: trimmed } : s))
				};
			});
			persist(next);
			scheduleSync(next);
			return next;
		});
	};

	return {
		subscribe,
		hydrate,
		loadFromRemote,
		createPack,
		updatePack,
		deletePack,
		addSourceToPack,
		removeSourceFromPack,
		renameSource
	};
};

const createSelectedPackStore = () => {
	const { subscribe, set } = writable<string>('');

	const hydrate = () => {
		if (!browser) return;
		const key = userKey(SELECTED_PACK_KEY);
		set(key ? localStorage.getItem(key) ?? '' : '');
	};

	const select = (packId: string) => {
		set(packId);
		if (!browser) return;
		const key = userKey(SELECTED_PACK_KEY);
		if (key) {
			if (packId) localStorage.setItem(key, packId);
			else localStorage.removeItem(key);
		}
	};

	return { subscribe, hydrate, select };
};

export const legalPacksStore = createLegalPacksStore();
export const selectedLegalPackId = createSelectedPackStore();
