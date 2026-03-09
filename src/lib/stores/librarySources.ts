import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { libraryDocuments, type LibraryDocument } from '$lib/data/library';

const STORAGE_KEY = 'verdict.librarySources.v1';

const createLibrarySourcesStore = () => {
	const { subscribe, set, update } = writable<LibraryDocument[]>(libraryDocuments);

	const persist = (docs: LibraryDocument[]) => {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
	};

	const hydrate = () => {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				set(libraryDocuments);
				return;
			}

			const parsed = JSON.parse(raw) as LibraryDocument[];
			const mergedMap = new Map<string, LibraryDocument>();
			for (const doc of libraryDocuments) mergedMap.set(doc.id, doc);
			for (const doc of parsed) mergedMap.set(doc.id, doc);
			set(Array.from(mergedMap.values()));
		} catch (err) {
			console.error('Failed to hydrate library sources', err);
			set(libraryDocuments);
		}
	};

	const addSource = (doc: LibraryDocument) => {
		update((docs) => {
			const next = [doc, ...docs.filter((existing) => existing.id !== doc.id)];
			persist(next);
			return next;
		});
	};

	const removeSource = (id: string) => {
		update((docs) => {
			const next = docs.filter((doc) => doc.id !== id || !doc.isCustom);
			persist(next);
			return next;
		});
	};

	return {
		subscribe,
		hydrate,
		addSource,
		removeSource,
		resetToDefault: () => {
			set(libraryDocuments);
			persist(libraryDocuments);
		}
	};
};

export const librarySourcesStore = createLibrarySourcesStore();
