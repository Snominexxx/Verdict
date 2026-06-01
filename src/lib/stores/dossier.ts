import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { CaseDossier, JudgeMind, JudgeTranscriptEntry } from '$lib/verdict/contracts';

/**
 * Verdict v2 — dossier session store.
 *
 * Holds the ONE source of truth for the current hearing: the active
 * `CaseDossier` plus the running transcript. Persisted to sessionStorage so a
 * refresh keeps the hearing alive, but the writable store is authoritative.
 */

const STORAGE_KEY = 'verdict.dossier.v1';

type DossierState = {
	dossier: CaseDossier | null;
	transcript: JudgeTranscriptEntry[];
	/** The bench's latest source-bound state of mind. */
	mind: JudgeMind | null;
};

const empty: DossierState = { dossier: null, transcript: [], mind: null };

const read = (): DossierState => {
	if (!browser) return empty;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as DossierState) : empty;
	} catch {
		return empty;
	}
};

const persist = (state: DossierState) => {
	if (!browser) return;
	try {
		if (!state.dossier) sessionStorage.removeItem(STORAGE_KEY);
		else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// sessionStorage is a convenience backup only.
	}
};

const { subscribe, set, update } = writable<DossierState>(read());

export const dossierStore = {
	subscribe,
	/** Start a fresh hearing from a newly built dossier. */
	start(dossier: CaseDossier) {
		const state: DossierState = { dossier, transcript: [], mind: null };
		persist(state);
		set(state);
	},
	/** Append one transcript entry. */
	addTurn(entry: JudgeTranscriptEntry) {
		update((state) => {
			const next = { ...state, transcript: [...state.transcript, entry] };
			persist(next);
			return next;
		});
	},
	/** Record the bench's latest state of mind. */
	setMind(mind: JudgeMind) {
		update((state) => {
			const next = { ...state, mind };
			persist(next);
			return next;
		});
	},
	/** Reload from sessionStorage (e.g. on navigation). */
	hydrate() {
		set(read());
	},
	clear() {
		persist(empty);
		set(empty);
	}
};
