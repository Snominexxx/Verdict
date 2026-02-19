import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Lang = 'en' | 'fr';

const stored = browser ? (localStorage.getItem('verdict-lang') as Lang) ?? 'en' : 'en';

export const language = writable<Lang>(stored);

language.subscribe((val) => {
	if (browser) {
		localStorage.setItem('verdict-lang', val);
	}
});

export const toggleLanguage = () => {
	language.update((l) => (l === 'en' ? 'fr' : 'en'));
};
