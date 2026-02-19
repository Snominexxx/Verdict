<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { focusMode } from '$lib/stores/ui';
	import { onMount } from 'svelte';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import { language, toggleLanguage } from '$lib/stores/language';
	import { t } from '$lib/i18n';

	onMount(() => {
		caseHistoryStore.hydrateCaseHistory();
	});

	let { children } = $props();
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
			<div class="flex-1"></div>
			<button
				on:click={toggleLanguage}
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
					<!-- Removed Branding -->
				</div>
				<div class="flex items-center gap-4">
					<a href="/about" class="text-xs font-bold uppercase tracking-wider text-white bg-white/10 px-3 py-1.5 rounded hover:bg-white/20 transition-all">{t('nav.about', $language)}</a>
					<a href="/how-it-works" class="text-xs font-bold uppercase tracking-wider text-white bg-white/10 px-3 py-1.5 rounded hover:bg-white/20 transition-all">{t('nav.howItWorks', $language)}</a>
				</div>
			</header>
		{/if}
		
		<!-- Workspace -->
		<div class="flex-1 overflow-auto bg-[url('/grid.svg')]">
			{@render children()}
		</div>
	</main>
</div>
