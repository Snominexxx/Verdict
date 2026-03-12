import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

const ACTIVE_USER_KEY = 'verdict.activeUserId';

/**
 * Stores the current authenticated user ID.
 * Used to namespace localStorage keys per user and detect user changes.
 */
export const activeUserId = writable<string | null>(null);

/** All localStorage keys that are user-scoped */
const USER_SCOPED_KEYS = [
	'verdict.caseHistory.v1',
	'verdict.legalPacks.v1',
	'verdict.subscription.v1',
	'verdict.librarySources.v1',
	'verdict.selectedPackId.v1'
];

/**
 * Returns a user-namespaced localStorage key.
 * Format: `baseKey.userId` — ensures per-user isolation.
 */
export function userKey(baseKey: string): string | null {
	const uid = get(activeUserId);
	if (!uid) return null;
	return `${baseKey}.${uid}`;
}

/**
 * Clear all user-scoped localStorage data for the current (or any previous) user.
 * Called on sign-out to prevent data leakage.
 */
export function clearAllUserData(): void {
	if (!browser) return;
	const uid = get(activeUserId);

	// Clear namespaced keys for current user
	if (uid) {
		for (const base of USER_SCOPED_KEYS) {
			localStorage.removeItem(`${base}.${uid}`);
		}
	}

	// Also clear any legacy non-namespaced keys (from before this fix)
	for (const base of USER_SCOPED_KEYS) {
		localStorage.removeItem(base);
	}

	localStorage.removeItem(ACTIVE_USER_KEY);
}

/**
 * Set the active user ID. If it changed from the previous user,
 * clear old localStorage data before proceed.
 * Returns true if the user changed (stores should re-hydrate).
 */
export function setActiveUser(userId: string | null): boolean {
	if (!browser) {
		activeUserId.set(userId);
		return false;
	}

	const previousId = localStorage.getItem(ACTIVE_USER_KEY);
	activeUserId.set(userId);

	if (!userId) {
		// Signing out
		clearAllUserData();
		return true;
	}

	if (previousId && previousId !== userId) {
		// Different user logging in on same browser — clear previous user's data
		for (const base of USER_SCOPED_KEYS) {
			localStorage.removeItem(`${base}.${previousId}`);
		}
		// Also clear legacy non-namespaced keys
		for (const base of USER_SCOPED_KEYS) {
			localStorage.removeItem(base);
		}
	}

	localStorage.setItem(ACTIVE_USER_KEY, userId);
	return previousId !== userId;
}
