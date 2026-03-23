<script lang="ts">
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { subscriptionStore } from '$lib/stores/subscription';
	import { page } from '$app/stores';

	let loading = $state<'pro' | 'pro_plus' | null>(null);
	let portalLoading = $state(false);

	// Enterprise contact modal
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

	const success = $derived($page.url.searchParams.get('success') === 'true');
	const canceled = $derived($page.url.searchParams.get('canceled') === 'true');
	const currentTier = $derived($subscriptionStore.tier);

	const handleCheckout = async (tier: 'pro' | 'pro_plus') => {
		loading = tier;
		try {
			const res = await fetch('/api/stripe/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier })
			});
			const data = await res.json();
			if (data.url) window.location.href = data.url;
		} catch {
			loading = null;
		}
	};

	const handlePortal = async () => {
		portalLoading = true;
		try {
			const res = await fetch('/api/stripe/portal', { method: 'POST' });
			const data = await res.json();
			if (data.url) window.location.href = data.url;
		} catch {
			portalLoading = false;
		}
	};
</script>

{#if loading || portalLoading}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
		<div class="flex flex-col items-center gap-4 p-8 rounded-xl bg-white/10 border border-white/20">
			<svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
			</svg>
			<p class="text-sm font-semibold text-white">
				{portalLoading ? t('pricing.openingPortal', $language) : t('pricing.redirecting', $language)}
			</p>
		</div>
	</div>
{/if}

<div class="h-full overflow-auto">
	<div class="max-w-6xl mx-auto px-6 py-12">
		<!-- Header -->
		<div class="text-center mb-12">
			<p class="text-xs uppercase tracking-[0.25em] text-white/60 font-mono mb-2">{t('pricing.kicker', $language)}</p>
			<h1 class="text-3xl font-display font-bold text-white mb-3">{t('pricing.title', $language)}</h1>
			<p class="text-base text-white/70 max-w-md mx-auto">{t('pricing.subtitle', $language)}</p>
		</div>

		{#if success}
			<div class="mb-8 p-4 rounded-xl border border-green-500/30 bg-green-500/10 text-center">
				<p class="text-sm text-green-400 font-semibold">{t('pricing.successMessage', $language)}</p>
			</div>
		{/if}

		{#if canceled}
			<div class="mb-8 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-center">
				<p class="text-sm text-yellow-400">{t('pricing.canceledMessage', $language)}</p>
			</div>
		{/if}

		<!-- Tiers Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
			<!-- FREE -->
			<div class="rounded-xl border border-white/15 bg-white/[0.06] p-6 flex flex-col">
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.freeName', $language)}</h2>
					<div class="mt-2">
						<span class="text-3xl font-bold text-white">$0</span>
						<span class="text-sm text-white/50">/{t('pricing.month', $language)}</span>
					</div>
					<p class="text-sm text-white/60 mt-2">{t('pricing.freeDesc', $language)}</p>
				</div>
				<ul class="space-y-2.5 mb-6 flex-1">
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.freeFeature1', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.freeFeature2', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.freeFeature3', $language)}
					</li>
				</ul>
				{#if currentTier === 'free'}
					<div class="text-center text-sm font-semibold uppercase tracking-wider text-white/50 py-2.5">
						{t('pricing.currentPlan', $language)}
					</div>
				{/if}
			</div>

			<!-- PRO -->
			<div class="rounded-xl border-2 border-white/30 bg-white/[0.08] p-6 flex flex-col relative">
				<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
					{t('pricing.popular', $language)}
				</div>
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.proName', $language)}</h2>
					<div class="mt-2">
						<span class="text-3xl font-bold text-white">$14.99</span>
						<span class="text-sm text-white/50">/{t('pricing.month', $language)}</span>
					</div>
					<p class="text-sm text-white/60 mt-2">{t('pricing.proDesc', $language)}</p>
				</div>
				<ul class="space-y-2.5 mb-6 flex-1">
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/60 mt-0.5">✓</span>
						{t('pricing.proFeature1', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/60 mt-0.5">✓</span>
						{t('pricing.proFeature2', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/60 mt-0.5">✓</span>
						{t('pricing.proFeature3', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/60 mt-0.5">✓</span>
						{t('pricing.proFeature4', $language)}
					</li>
				</ul>
				{#if currentTier === 'pro'}
					<button
						onclick={handlePortal}
						disabled={portalLoading}
						class="w-full py-2.5 rounded-lg border border-white/25 bg-white/10 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/20 transition disabled:opacity-50"
					>
						{portalLoading ? t('pricing.openingPortal', $language) : t('pricing.manageSub', $language)}
					</button>
				{:else if currentTier === 'free'}
					<button
						onclick={() => handleCheckout('pro')}
						disabled={loading === 'pro'}
						class="w-full py-2.5 rounded-lg bg-white text-black text-sm font-bold uppercase tracking-wider hover:bg-white/90 transition disabled:opacity-50"
					>
						{loading === 'pro' ? t('pricing.redirecting', $language) : t('pricing.subscribe', $language)}
					</button>
				{/if}
			</div>

			<!-- PRO+ -->
			<div class="rounded-xl border border-white/20 bg-white/[0.06] p-6 flex flex-col">
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.proPlusName', $language)}</h2>
					<div class="mt-2">
						<span class="text-3xl font-bold text-white">$29.99</span>
						<span class="text-sm text-white/50">/{t('pricing.month', $language)}</span>
					</div>
					<p class="text-sm text-white/60 mt-2">{t('pricing.proPlusDesc', $language)}</p>
				</div>
				<ul class="space-y-2.5 mb-6 flex-1">
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proPlusFeature1', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proPlusFeature2', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proPlusFeature3', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proPlusFeature4', $language)}
					</li>
				</ul>
				{#if currentTier === 'pro_plus'}
					<button
						onclick={handlePortal}
						disabled={portalLoading}
						class="w-full py-2.5 rounded-lg border border-white/25 bg-white/10 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/20 transition disabled:opacity-50"
					>
						{portalLoading ? t('pricing.openingPortal', $language) : t('pricing.manageSub', $language)}
					</button>
				{:else if currentTier === 'free' || currentTier === 'pro'}
					<button
						onclick={() => handleCheckout('pro_plus')}
						disabled={loading === 'pro_plus'}
						class="w-full py-2.5 rounded-lg bg-white/90 text-black text-sm font-bold uppercase tracking-wider hover:bg-white transition disabled:opacity-50"
					>
						{loading === 'pro_plus' ? t('pricing.redirecting', $language) : t('pricing.subscribe', $language)}
					</button>
				{/if}
			</div>

			<!-- ENTERPRISE -->
			<div class="rounded-xl border border-white/15 bg-white/[0.06] p-6 flex flex-col">
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.enterpriseName', $language)}</h2>
					<div class="mt-2">
						<span class="text-lg font-bold text-white/80">{t('pricing.contactUs', $language)}</span>
					</div>
					<p class="text-sm text-white/60 mt-2">{t('pricing.enterpriseDesc', $language)}</p>
				</div>
				<ul class="space-y-2.5 mb-6 flex-1">
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.entFeature1', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.entFeature2', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.entFeature3', $language)}
					</li>
					<li class="text-sm text-white/80 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.entFeature4', $language)}
					</li>
				</ul>
				<button
					type="button"
					onclick={() => (contactOpen = true)}
					class="w-full py-2.5 rounded-lg border border-white/25 bg-white/10 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/20 transition text-center cursor-pointer"
				>
					{t('pricing.talkToUs', $language)}
				</button>
			</div>
		</div>
	</div>
</div>

<!-- Enterprise Contact Modal -->
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
