import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { AssignmentContext } from '$lib/types';

/**
 * Verdict — assignment context store.
 *
 * When a student opens a teacher's assignment link, this holds who they are and
 * which assignment they are arguing. The hearing reads it to (a) know it is a
 * graded exercise and (b) record the transcript back to the teacher on finish.
 * Persisted to sessionStorage so a refresh mid-hearing keeps the link intact.
 */

const STORAGE_KEY = 'verdict.assignment.v1';

const read = (): AssignmentContext | null => {
	if (!browser) return null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as AssignmentContext) : null;
	} catch {
		return null;
	}
};

const persist = (value: AssignmentContext | null) => {
	if (!browser) return;
	try {
		if (!value) sessionStorage.removeItem(STORAGE_KEY);
		else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		// sessionStorage is a convenience backup only.
	}
};

const { subscribe, set } = writable<AssignmentContext | null>(read());

export const assignmentContext = {
	subscribe,
	/** Begin an assigned hearing for a named student. */
	begin(context: AssignmentContext) {
		persist(context);
		set(context);
	},
	/** Reload from sessionStorage (e.g. on navigation into the hearing). */
	hydrate() {
		set(read());
	},
	clear() {
		persist(null);
		set(null);
	}
};
