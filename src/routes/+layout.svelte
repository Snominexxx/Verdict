<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { focusMode } from '$lib/stores/ui';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import { legalPacksStore } from '$lib/stores/legalPacks';
	import { subscriptionStore } from '$lib/stores/subscription';
	import { language, toggleLanguage } from '$lib/stores/language';
	import { t } from '$lib/i18n';

	let { data, children } = $props();

	onMount(() => {
		// Hydrate from localStorage first (fast)
		caseHistoryStore.hydrateCaseHistory();
		legalPacksStore.hydrate();
		subscriptionStore.hydrate();

		// Then load from Supabase if logged in
		if (data.session) {
			legalPacksStore.loadFromRemote();
			caseHistoryStore.loadFromRemote();
			subscriptionStore.loadFromRemote();
		}

		const { data: { subscription } } = data.supabase.auth.onAuthStateChange((_event: string, _session: unknown) => {
			invalidate('supabase:auth');
		});

		return () => subscription.unsubscribe();
	});

	const signOut = async () => {
		await data.supabase.auth.signOut();
		window.location.href = '/login';
	};

	let session = $derived(data.session);
	let userEmail = $derived(session?.user?.email ?? '');
	let userInitial = $derived((session?.user?.user_metadata?.full_name?.[0] ?? userEmail?.[0] ?? '?').toUpperCase());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#020617" />
	<meta name="description" content={t('meta.description', $language)} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@300;400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="min-h-screen text-slate-100 flex font-body bg-ink relative">
	{#if !$focusMode}
		<!-- Pro Sidebar -->
		<nav class="w-24 flex flex-col items-center border-r border-white/15 py-5 gap-4 bg-slate-900/80 z-40">
			<a href="/" class="flex flex-col items-center justify-center font-display text-2xl font-bold bg-white/10 hover:bg-white/20 rounded-lg w-14 h-14 mb-1 text-white transition" title="Home">
				V
			</a>
			<div class="w-12 h-[1px] bg-white/20"></div>
			<a href="/cases" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.stage', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
				<span class="text-[10px] font-semibold uppercase tracking-wide">{t('nav.stage', $language)}</span>
			</a>
			<a href="/court" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.court', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M3 10h18"></path>
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M5 10l7-5 7 5"></path>
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M6 10v7m4-7v7m4-7v7m4-7v7"></path>
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M4 20h16"></path>
				</svg>
				<span class="text-[10px] font-semibold uppercase tracking-wide">{t('nav.court', $language)}</span>
			</a>
			<a href="/library" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.library', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
				<span class="text-[10px] font-semibold uppercase tracking-wide">{t('nav.library', $language)}</span>
			</a>
			<a href="/pricing" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.pricing', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
				<span class="text-[10px] font-semibold uppercase tracking-wide">{t('nav.pricing', $language)}</span>
			</a>
			<div class="flex-1"></div>
			{#if session}
				<div class="flex flex-col items-center gap-2">
					<a href="/dashboard" class="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold text-white hover:bg-white/25 transition" title={userEmail}>
						{userInitial}
					</a>
					<button
						onclick={signOut}
						class="text-[9px] font-bold uppercase tracking-wider text-white/50 hover:text-white transition"
						title={t('auth.signOut', $language)}
					>
						{t('auth.signOut', $language)}
					</button>
				</div>
			{:else}
				<a href="/login" class="flex flex-col items-center gap-1 py-2 px-1 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('auth.signIn', $language)}>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" /></svg>
					<span class="text-[9px] font-semibold uppercase tracking-wide">{t('auth.signIn', $language)}</span>
				</a>
			{/if}
			<button
				onclick={toggleLanguage}
				class="flex items-center justify-center w-12 h-8 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold uppercase tracking-wider text-white/90 transition"
				title={$language === 'en' ? 'Passer au français' : 'Switch to English'}
			>
				{$language === 'en' ? 'FR' : 'EN'}
			</button>
		</nav>
	{/if}

	<main class="flex-1 w-full flex flex-col h-screen overflow-hidden">
		{#if !$focusMode}
			<!-- Top Bar -->
			<header class="h-10 border-b border-white/10 flex items-center justify-between px-6 bg-black/10">
				<div class="flex items-center gap-4">
					<p class="text-[10px] uppercase tracking-[0.25em] text-white/35 font-mono">Knowledge</p>
				</div>
				<div class="flex items-center gap-2">
					<a href="/about" class="text-[10px] font-bold uppercase tracking-[0.18em] text-white/85 border border-white/20 bg-white/5 px-3 py-1.5 rounded hover:bg-white/15 hover:text-white transition-all">{t('nav.about', $language)}</a>
					<a href="/how-it-works" class="text-[10px] font-bold uppercase tracking-[0.18em] text-white/85 border border-white/20 bg-white/5 px-3 py-1.5 rounded hover:bg-white/15 hover:text-white transition-all">{t('nav.howItWorks', $language)}</a>
				</div>
			</header>
		{/if}
		
		<!-- Workspace -->
		<div class="flex-1 overflow-auto bg-[url('/grid.svg')]">
			{@render children()}
		</div>
	</main>
</div>
