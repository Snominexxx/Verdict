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
	import { setActiveUser, clearAllUserData } from '$lib/stores/userSession';
	import { caseDraftStore } from '$lib/stores/caseDraft';

	let { data, children } = $props();

	onMount(() => {
		const userId = data.session?.user?.id ?? null;
		setActiveUser(userId);

		if (userId) {
			// Hydrate from user-namespaced localStorage first (fast)
			caseHistoryStore.hydrateCaseHistory();
			legalPacksStore.hydrate();
			subscriptionStore.hydrate();

			// Then load from Supabase
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
		clearAllUserData();
		caseDraftStore.clear();
		await data.supabase.auth.signOut();
		window.location.href = '/login';
	};

	let session = $derived(data.session);
	let userEmail = $derived(session?.user?.email ?? '');
	let userInitial = $derived((session?.user?.user_metadata?.full_name?.[0] ?? userEmail?.[0] ?? '?').toUpperCase());

	// Contact modal state
	let contactOpen = $state(false);
	let contactName = $state('');
	let contactEmail = $state('');
	let contactMessage = $state('');
	let contactSending = $state(false);
	let contactSent = $state(false);
	let contactError = $state('');

	const handleContact = async () => {
		contactError = '';
		if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
			contactError = t('pricing.contactAllRequired', $language);
			return;
		}
		contactSending = true;
		try {
			const res = await fetch('/api/contact', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: contactName.trim(), email: contactEmail.trim(), message: contactMessage.trim() })
			});
			if (!res.ok) throw new Error();
			contactSent = true;
		} catch {
			contactError = t('pricing.contactError', $language);
		} finally {
			contactSending = false;
		}
	};

	const closeContact = () => {
		contactOpen = false;
		contactName = '';
		contactEmail = '';
		contactMessage = '';
		contactSent = false;
		contactError = '';
	};
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#020617" />
	<meta name="description" content={t('meta.description', $language)} />

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Verdict — AI Legal Debates" />
	<meta property="og:description" content={t('meta.description', $language)} />
	<meta property="og:url" content="https://verdictmvp.netlify.app" />
	<meta property="og:image" content="https://verdictmvp.netlify.app/og-image.png" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Verdict — AI Legal Debates" />
	<meta name="twitter:description" content={t('meta.description', $language)} />
	<meta name="twitter:image" content="https://verdictmvp.netlify.app/og-image.png" />

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
		<nav class="w-24 flex flex-col items-center border-r border-white/20 py-5 gap-4 bg-slate-800/50 z-40">
			<a href="/" class="flex flex-col items-center justify-center font-display text-2xl font-bold bg-white/10 hover:bg-white/20 rounded-lg w-14 h-14 mb-1 text-white transition" title="Home">
				V
			</a>
			<div class="w-12 h-[1px] bg-white/20"></div>
			<a href="/cases" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.stage', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
				<span class="text-xs font-semibold uppercase tracking-wide">{t('nav.stage', $language)}</span>
			</a>
			<a href="/court" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.court', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M3 10h18"></path>
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M5 10l7-5 7 5"></path>
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M6 10v7m4-7v7m4-7v7m4-7v7"></path>
					<path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M4 20h16"></path>
				</svg>
				<span class="text-xs font-semibold uppercase tracking-wide">{t('nav.court', $language)}</span>
			</a>
			<a href="/library" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.library', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
				<span class="text-xs font-semibold uppercase tracking-wide">{t('nav.library', $language)}</span>
			</a>
			<a href="/pricing" class="flex flex-col items-center gap-1 py-2 px-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('nav.pricing', $language)}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
				<span class="text-xs font-semibold uppercase tracking-wide">{t('nav.pricing', $language)}</span>
			</a>
			<div class="flex-1"></div>
			{#if session}
				<div class="flex flex-col items-center gap-2">
					<a href="/dashboard" class="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold text-white hover:bg-white/25 transition" title={userEmail}>
						{userInitial}
					</a>
					<button
						onclick={signOut}
						class="text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition"
						title={t('auth.signOut', $language)}
					>
						{t('auth.signOut', $language)}
					</button>
				</div>
			{:else}
				<a href="/login" class="flex flex-col items-center gap-1 py-2 px-1 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition w-[78px]" title={t('auth.signIn', $language)}>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" /></svg>
					<span class="text-xs font-semibold uppercase tracking-wide">{t('auth.signIn', $language)}</span>
				</a>
			{/if}
			<button
				onclick={toggleLanguage}
				class="flex items-center justify-center w-12 h-8 rounded bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-wider text-white/90 transition"
				title={$language === 'en' ? 'Passer au français' : 'Switch to English'}
			>
				{$language === 'en' ? 'FR' : 'EN'}
			</button>
		</nav>
	{/if}

	<main class="flex-1 w-full flex flex-col h-screen overflow-hidden">
		{#if !$focusMode}
			<!-- Top Bar -->
			<header class="h-12 border-b border-white/15 flex items-center justify-end px-6 bg-black/15">
				<div class="flex items-center gap-2">
					<a href="/about" class="text-sm font-bold uppercase tracking-[0.12em] text-white border border-white/30 bg-white/10 px-4 py-1.5 rounded hover:bg-white/20 transition-all">{t('nav.about', $language)}</a>
					<a href="/how-it-works" class="text-sm font-bold uppercase tracking-[0.12em] text-white border border-white/30 bg-white/10 px-4 py-1.5 rounded hover:bg-white/20 transition-all">{t('nav.howItWorks', $language)}</a>
					<button type="button" onclick={() => (contactOpen = true)} class="text-sm font-bold uppercase tracking-[0.12em] text-white border border-white/30 bg-white/10 px-4 py-1.5 rounded hover:bg-white/20 transition-all cursor-pointer">{t('nav.contact', $language)}</button>
				</div>
			</header>
		{/if}
		
		<!-- Workspace -->
		<div class="flex-1 overflow-auto bg-[url('/grid.svg')]">
			{@render children()}
		</div>
	</main>
</div>

<!-- Contact Modal -->
{#if contactOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
		onkeydown={(e) => e.key === 'Escape' && closeContact()}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="absolute inset-0" onclick={closeContact}></div>

		<div class="relative w-full max-w-md rounded-xl border border-white/15 bg-[#0e0e10] p-6 shadow-2xl">
			<button
				type="button"
				onclick={closeContact}
				class="absolute top-4 right-4 text-white/40 hover:text-white text-lg"
			>✕</button>

			<h3 class="text-lg font-display font-bold text-white mb-1">{t('pricing.contactTitle', $language)}</h3>
			<p class="text-xs text-white/50 mb-5">{t('pricing.contactSubtitle', $language)}</p>

			{#if contactSent}
				<div class="text-center py-8">
					<div class="text-3xl mb-3">✓</div>
					<p class="text-sm font-semibold text-green-400 mb-1">{t('pricing.contactSentTitle', $language)}</p>
					<p class="text-xs text-white/50">{t('pricing.contactSentDesc', $language)}</p>
					<button
						type="button"
						onclick={closeContact}
						class="mt-5 px-6 py-2 rounded-lg bg-white/10 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition"
					>{t('pricing.contactClose', $language)}</button>
				</div>
			{:else}
				<div class="space-y-4">
					<div>
						<label for="contact-name" class="block text-xs font-semibold text-white/60 mb-1">{t('pricing.contactNameLabel', $language)}</label>
						<input
							id="contact-name"
							type="text"
							bind:value={contactName}
							placeholder={t('pricing.contactNamePlaceholder', $language)}
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none transition"
						/>
					</div>
					<div>
						<label for="contact-email" class="block text-xs font-semibold text-white/60 mb-1">{t('pricing.contactEmailLabel', $language)}</label>
						<input
							id="contact-email"
							type="email"
							bind:value={contactEmail}
							placeholder={t('pricing.contactEmailPlaceholder', $language)}
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none transition"
						/>
					</div>
					<div>
						<label for="contact-msg" class="block text-xs font-semibold text-white/60 mb-1">{t('pricing.contactMessageLabel', $language)}</label>
						<textarea
							id="contact-msg"
							bind:value={contactMessage}
							rows="4"
							placeholder={t('pricing.contactMessagePlaceholder', $language)}
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none transition resize-none"
						></textarea>
					</div>

					{#if contactError}
						<p class="text-xs text-red-400 font-semibold">{contactError}</p>
					{/if}

					<button
						type="button"
						onclick={handleContact}
						disabled={contactSending}
						class="w-full py-2.5 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition disabled:opacity-50"
					>
						{contactSending ? t('pricing.contactSending', $language) : t('pricing.contactSend', $language)}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Desktop-only gate -->
<div class="fixed inset-0 z-[9999] bg-ink flex flex-col items-center justify-center px-8 text-center lg:hidden">
	<svg class="w-12 h-12 text-white/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" /></svg>
	<h2 class="text-lg font-display font-bold text-white mb-2">{t('mobile.title', $language)}</h2>
	<p class="text-sm text-white/60 max-w-xs leading-relaxed">{t('mobile.description', $language)}</p>
</div>
