import { writable } from 'svelte/store';

/**
 * Tracks source IDs currently being indexed and their progress (0–100).
 */
export const indexingSourceIds = writable<Set<string>>(new Set());
export const indexingProgress = writable<Record<string, number>>({});

export function markIndexing(sourceId: string) {
	indexingSourceIds.update((s) => {
		s.add(sourceId);
		return new Set(s);
	});
	indexingProgress.update((p) => ({ ...p, [sourceId]: 0 }));
}

export function updateProgress(sourceId: string, pct: number) {
	indexingProgress.update((p) => ({ ...p, [sourceId]: Math.min(100, Math.round(pct)) }));
}

export function markIndexed(sourceId: string) {
	indexingSourceIds.update((s) => {
		s.delete(sourceId);
		return new Set(s);
	});
	indexingProgress.update((p) => {
		const { [sourceId]: _, ...rest } = p;
		return rest;
	});
}
