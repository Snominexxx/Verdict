import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type UserTier = 'free' | 'pro' | 'enterprise';

export type SubscriptionState = {
	tier: UserTier;
	status: string;
	currentPeriodEnd: string | null;
	loaded: boolean;
};

const STORAGE_KEY = 'verdict.subscription.v1';
const FREE_DEBATE_LIMIT = 3;

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
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as SubscriptionState;
				set({ ...parsed, loaded: true });
			}
		} catch {
			// ignore
		}
	};

	const persist = (state: SubscriptionState) => {
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
		loadFromRemote,
		FREE_DEBATE_LIMIT
	};
};

export const subscriptionStore = createSubscriptionStore();
export { FREE_DEBATE_LIMIT };
