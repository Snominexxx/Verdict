import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { userKey } from './userSession';

export type UserTier = 'free' | 'pro' | 'pro_plus' | 'enterprise';

export type SubscriptionState = {
	tier: UserTier;
	status: string;
	currentPeriodEnd: string | null;
	loaded: boolean;
};

const STORAGE_KEY = 'verdict.subscription.v1';

export const TIER_CONFIG = {
	free:       { credits: 3,   maxRounds: 10 },
	pro:        { credits: 20,  maxRounds: 15 },
	pro_plus:   { credits: 60,  maxRounds: 20 },
	enterprise: { credits: 999, maxRounds: 999 }
} as const;

const createSubscriptionStore = () => {
	const { subscribe, set, update } = writable<SubscriptionState>({
		tier: 'free',
		status: 'active',
		currentPeriodEnd: null,
		loaded: false
	});

	const hydrate = () => {
		if (!browser) return;
		try {
			const key = userKey(STORAGE_KEY);
			const raw = key ? localStorage.getItem(key) : null;
			if (raw) {
				const parsed = JSON.parse(raw) as SubscriptionState;
				set({ ...parsed, loaded: true });
			}
		} catch {
			// ignore
		}
	};

	const persist = (state: SubscriptionState) => {
		if (!browser) return;
		const key = userKey(STORAGE_KEY);
		if (key) localStorage.setItem(key, JSON.stringify(state));
	};

	const loadFromRemote = async () => {
		if (!browser) return;
		try {
			const res = await fetch('/api/stripe/status');
			if (!res.ok) {
				set({ tier: 'free', status: 'active', currentPeriodEnd: null, loaded: true });
				return;
			}
			const data = await res.json();
			const state: SubscriptionState = {
				tier: data.tier ?? 'free',
				status: data.status ?? 'active',
				currentPeriodEnd: data.currentPeriodEnd ?? null,
				loaded: true
			};
			set(state);
			persist(state);
		} catch {
			set({ tier: 'free', status: 'active', currentPeriodEnd: null, loaded: true });
		}
	};

	return {
		subscribe,
		hydrate,
		loadFromRemote
	};
};

export const subscriptionStore = createSubscriptionStore();
