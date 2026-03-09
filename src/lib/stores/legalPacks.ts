import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import type { LibraryDocument } from '$lib/data/library';

export type LegalPack = {
	id: string;
	name: string;
	jurisdiction: string;
	domain: string;
	description: string;
	sources: LibraryDocument[];
	isDefault?: boolean;
};

const STORAGE_KEY = 'verdict.legalPacks.v1';
const SELECTED_PACK_KEY = 'verdict.selectedPackId.v1';

const defaultPacks: LegalPack[] = [
	{
		id: 'pack-canadian-constitutional-law',
		name: 'Canadian Constitutional Law',
		jurisdiction: 'Canada',
		domain: 'Constitutional',
		description: 'Core constitutional texts and rights framework for Canada.',
		isDefault: true,
		sources: [
			{
				id: 'source-canadian-charter',
				title: 'Canadian Charter of Rights and Freedoms',
				jurisdiction: 'Canada',
				description: 'Constitution Act, 1982, Part I (fundamental freedoms and legal rights).',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://laws-lois.justice.gc.ca/eng/Const/page-12.html',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
			},
			{
				id: 'source-constitution-act-1867',
				title: 'Constitution Act, 1867',
				jurisdiction: 'Canada',
				description: 'Federal structure, powers, and constitutional architecture.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://laws-lois.justice.gc.ca/eng/Const/page-1.html',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
			},
			{
				id: 'source-canadian-bill-rights',
				title: 'Canadian Bill of Rights',
				jurisdiction: 'Canada',
				description: 'Federal rights instrument applicable to federal law and institutions.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://laws-lois.justice.gc.ca/eng/acts/c-12.3/',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
				},
				{
					id: 'source-constitution-act-1982',
					title: 'Constitution Act, 1982',
					jurisdiction: 'Canada',
					description: 'Part II (Aboriginal rights), amending formula, and constitutional supremacy provisions.',
					lastUpdated: '2024-01-01',
					sourceUrl: 'https://laws-lois.justice.gc.ca/eng/Const/page-15.html',
					docType: 'statute',
					trustLevel: 'official',
					isCustom: false
				},
				{
					id: 'source-supreme-court-act',
					title: 'Supreme Court Act',
					jurisdiction: 'Canada',
					description: 'Jurisdiction, composition, and constitutional role of the Supreme Court of Canada.',
					lastUpdated: '2024-01-01',
					sourceUrl: 'https://laws-lois.justice.gc.ca/eng/acts/s-26/',
					docType: 'statute',
					trustLevel: 'official',
					isCustom: false
				},
				{
					id: 'source-canadian-human-rights-act',
					title: 'Canadian Human Rights Act',
					jurisdiction: 'Canada',
					description: 'Federal anti-discrimination statute relevant to Charter-adjacent rights analysis.',
					lastUpdated: '2024-01-01',
					sourceUrl: 'https://laws-lois.justice.gc.ca/eng/acts/h-6/',
					docType: 'statute',
					trustLevel: 'official',
					isCustom: false
			}
		]
	},
	{
		id: 'pack-us-criminal-law',
		name: 'US Criminal Law',
		jurisdiction: 'United States',
		domain: 'Criminal',
		description: 'Starter federal criminal law references and constitutional protections.',
		isDefault: true,
		sources: [
			{
				id: 'source-us-constitution',
				title: 'United States Constitution',
				jurisdiction: 'United States',
				description: 'Constitutional framework including due process and criminal procedure rights.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://www.archives.gov/founding-docs/constitution-transcript',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
			},
			{
				id: 'source-us-code-title-18',
				title: 'U.S. Code Title 18 (Crimes and Criminal Procedure)',
				jurisdiction: 'United States',
				description: 'Federal criminal offences and procedure provisions.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://uscode.house.gov/view.xhtml?path=/prelim@title18&edition=prelim',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
			},
			{
				id: 'source-frcp',
				title: 'Federal Rules of Criminal Procedure',
				jurisdiction: 'United States',
				description: 'Rules governing federal criminal proceedings.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://www.law.cornell.edu/rules/frcrmp',
				docType: 'regulation',
				trustLevel: 'recognized',
				isCustom: false
			}
		]
	},
	{
		id: 'pack-french-civil-law',
		name: 'French Civil Law',
		jurisdiction: 'France',
		domain: 'Civil',
		description: 'Core French civil law references for obligations and contracts.',
		isDefault: true,
		sources: [
			{
				id: 'source-code-civil-france',
				title: 'Code civil (France)',
				jurisdiction: 'France',
				description: 'Foundational French civil code including obligations and contracts.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721/',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
			},
			{
				id: 'source-code-procedure-civile-france',
				title: 'Code de procédure civile',
				jurisdiction: 'France',
				description: 'Civil procedure framework in French courts.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070716/',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
			},
			{
				id: 'source-code-consommation-france',
				title: 'Code de la consommation',
				jurisdiction: 'France',
				description: 'French consumer law provisions relevant to civil disputes.',
				lastUpdated: '2024-01-01',
				sourceUrl: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006069565/',
				docType: 'statute',
				trustLevel: 'official',
				isCustom: false
			}
		]
	}
];

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
		fetch('/api/user-data', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}).catch((err) => console.warn('Pack sync failed (offline?):', err));
	}, 800);
};

const createLegalPacksStore = () => {
	const { subscribe, set, update } = writable<LegalPack[]>(defaultPacks);
	let _hydrated = false;

	const persist = (packs: LegalPack[]) => {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
	};

	const hydrate = () => {
		if (!browser) return;
		// Load localStorage immediately for fast display
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as LegalPack[];
				const merged = [...defaultPacks];
				for (const pack of parsed) {
					const idx = merged.findIndex((p) => p.id === pack.id);
					if (idx > -1) merged[idx] = pack;
					else merged.push(pack);
				}
				set(merged);
			} else {
				set(defaultPacks);
			}
		} catch {
			set(defaultPacks);
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
				// Merge remote packs with defaults
				const merged = [...defaultPacks];
				for (const pack of data.packs as LegalPack[]) {
					const idx = merged.findIndex((p) => p.id === pack.id);
					if (idx > -1) merged[idx] = pack;
					else merged.push(pack);
				}
				set(merged);
				persist(merged);
			} else if (!_hydrated) {
				// First time user — push defaults to remote
				set(defaultPacks);
				persist(defaultPacks);
				scheduleSync(defaultPacks);
			}
		} catch {
			// Offline — localStorage values are already loaded
		}
	};

	const createPack = (pack: Omit<LegalPack, 'id'>) => {
		update((packs) => {
			const next: LegalPack[] = [
				{ ...pack, id: `pack-${Date.now()}` },
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
			const next = packs.filter((pack) => pack.id !== id || pack.isDefault);
			persist(next);
			scheduleSync(next, [id]);
			return next;
		});
		if (browser && localStorage.getItem(SELECTED_PACK_KEY) === id) {
			localStorage.removeItem(SELECTED_PACK_KEY);
		}
	};

	const addSourceToPack = (packId: string, source: LibraryDocument) => {
		update((packs) => {
			const next = packs.map((pack) => {
				if (pack.id !== packId) return pack;
				const prepared = withCustomFlag(source);
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

	return {
		subscribe,
		hydrate,
		loadFromRemote,
		createPack,
		updatePack,
		deletePack,
		addSourceToPack,
		removeSourceFromPack
	};
};

const createSelectedPackStore = () => {
	const { subscribe, set } = writable<string>('');

	const hydrate = () => {
		if (!browser) return;
		set(localStorage.getItem(SELECTED_PACK_KEY) ?? '');
	};

	const select = (packId: string) => {
		set(packId);
		if (!browser) return;
		if (packId) localStorage.setItem(SELECTED_PACK_KEY, packId);
		else localStorage.removeItem(SELECTED_PACK_KEY);
	};

	return { subscribe, hydrate, select };
};

export const legalPacksStore = createLegalPacksStore();
export const selectedLegalPackId = createSelectedPackStore();
