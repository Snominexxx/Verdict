import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { ExercisePaperSnapshot, StagedCase } from '$lib/types';

const STORAGE_KEY = 'verdict.stagedCase.v1';
const MAX_PERSISTED_PACKET_EXCERPTS = 6;
const MAX_PERSISTED_EXCERPT_CHARS = 1200;
const MAX_PERSISTED_JSON_CHARS = 700_000;

const compactSourceBundle = (bundle: ExercisePaperSnapshot['sourceBundle']): ExercisePaperSnapshot['sourceBundle'] => {
	if (!bundle) return undefined;
	const excerpts = bundle.excerpts.slice(0, MAX_PERSISTED_PACKET_EXCERPTS).map((excerpt) => ({
		...excerpt,
		excerpt: excerpt.excerpt.slice(0, MAX_PERSISTED_EXCERPT_CHARS)
	}));
	return {
		...bundle,
		excerptCount: excerpts.length,
		sourceCount: new Set(excerpts.map((excerpt) => excerpt.sourceId)).size,
		tokenCount: Math.ceil(excerpts.reduce((total, excerpt) => total + excerpt.excerpt.length, 0) / 4),
		excerpts
	};
};

const compactPaperSnapshot = (snapshot: ExercisePaperSnapshot | undefined): ExercisePaperSnapshot | undefined => {
	if (!snapshot) return undefined;
	return {
		...snapshot,
		sourceBundle: compactSourceBundle(snapshot.sourceBundle),
		packMemory: undefined,
		evidenceSufficiency: snapshot.evidenceSufficiency
	};
};

const compactStagedCase = (record: StagedCase): StagedCase => ({
	...record,
	paperSnapshot: compactPaperSnapshot(record.paperSnapshot),
	judgePacket: record.judgePacket
		? {
			...record.judgePacket,
			paper: compactPaperSnapshot(record.judgePacket.paper) ?? record.judgePacket.paper,
			sourcePacket: compactSourceBundle(record.judgePacket.sourcePacket)
		}
		: undefined
});

const readStoredCase = (): StagedCase | null => {
	if (!browser) return null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) as StagedCase : null;
	} catch {
		return null;
	}
};

const persistCase = (record: StagedCase | null) => {
	if (!browser) return;
	try {
		if (!record) {
			sessionStorage.removeItem(STORAGE_KEY);
			return;
		}

		const compact = compactStagedCase(record);
		let payload = JSON.stringify(compact);
		if (payload.length > MAX_PERSISTED_JSON_CHARS) {
			const minimal: StagedCase = {
				...compact,
				paperSnapshot: compact.paperSnapshot
					? {
						...compact.paperSnapshot,
						sourceBundle: undefined
					}
					: compact.paperSnapshot
			};
			payload = JSON.stringify(minimal);
		}

		sessionStorage.setItem(STORAGE_KEY, payload);
	} catch {
		// Session storage is a convenience backup; the writable store remains authoritative.
	}
};

const { subscribe, set } = writable<StagedCase | null>(readStoredCase());

export const stagedCaseStore = { subscribe };

export const stageCase = (record: StagedCase): StagedCase => {
	persistCase(record);
	set(record);
	return record;
};

export const hydrateStagedCase = (record: StagedCase | null) => {
	persistCase(record);
	set(record);
};

export const loadStagedCase = (): StagedCase | null => {
	const record = readStoredCase();
	if (record) set(record);
	return record;
};

export const clearStagedCase = () => {
	persistCase(null);
	set(null);
};
