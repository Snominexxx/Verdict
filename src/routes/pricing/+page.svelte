<script lang="ts">
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { subscriptionStore } from '$lib/stores/subscription';
	import { page } from '$app/stores';

	let loading = $state<'pro' | 'pro_plus' | null>(null);
	let portalLoading = $state(false);

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

<div class="h-full overflow-auto">
	<div class="max-w-6xl mx-auto px-6 py-12">
		<!-- Header -->
		<div class="text-center mb-12">
			<p class="text-[10px] uppercase tracking-[0.25em] text-white/40 font-mono mb-2">{t('pricing.kicker', $language)}</p>
			<h1 class="text-2xl font-display font-bold text-white mb-3">{t('pricing.title', $language)}</h1>
			<p class="text-sm text-white/60 max-w-md mx-auto">{t('pricing.subtitle', $language)}</p>
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
			<div class="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col">
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.freeName', $language)}</h2>
					<div class="mt-2">
						<span class="text-3xl font-bold text-white">$0</span>
						<span class="text-sm text-white/40">/{t('pricing.month', $language)}</span>
					</div>
					<p class="text-xs text-white/50 mt-2">{t('pricing.freeDesc', $language)}</p>
				</div>
				<ul class="space-y-2 mb-6 flex-1">
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/30 mt-0.5">✓</span>
						{t('pricing.freeFeature1', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/30 mt-0.5">✓</span>
						{t('pricing.freeFeature2', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/30 mt-0.5">✓</span>
						{t('pricing.freeFeature3', $language)}
					</li>
				</ul>
				{#if currentTier === 'free'}
					<div class="text-center text-xs font-semibold uppercase tracking-wider text-white/40 py-2.5">
						{t('pricing.currentPlan', $language)}
					</div>
				{/if}
			</div>

			<!-- PRO -->
			<div class="rounded-xl border-2 border-white/25 bg-white/[0.08] p-6 flex flex-col relative">
				<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
					{t('pricing.popular', $language)}
				</div>
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.proName', $language)}</h2>
					<div class="mt-2">
						<span class="text-3xl font-bold text-white">$14.99</span>
						<span class="text-sm text-white/40">/{t('pricing.month', $language)}</span>
					</div>
					<p class="text-xs text-white/50 mt-2">{t('pricing.proDesc', $language)}</p>
				</div>
				<ul class="space-y-2 mb-6 flex-1">
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proFeature1', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proFeature2', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proFeature3', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/50 mt-0.5">✓</span>
						{t('pricing.proFeature4', $language)}
					</li>
				</ul>
				{#if currentTier === 'pro'}
					<button
						onclick={handlePortal}
						disabled={portalLoading}
						class="w-full py-2.5 rounded-lg border border-white/20 bg-white/10 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition disabled:opacity-50"
					>
						{portalLoading ? '...' : t('pricing.manageSub', $language)}
					</button>
				{:else if currentTier === 'free'}
					<button
						onclick={() => handleCheckout('pro')}
						disabled={loading === 'pro'}
						class="w-full py-2.5 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition disabled:opacity-50"
					>
						{loading === 'pro' ? '...' : t('pricing.subscribe', $language)}
					</button>
				{/if}
			</div>

			<!-- PRO+ -->
			<div class="rounded-xl border border-white/15 bg-white/[0.06] p-6 flex flex-col">
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.proPlusName', $language)}</h2>
					<div class="mt-2">
						<span class="text-3xl font-bold text-white">$29.99</span>
						<span class="text-sm text-white/40">/{t('pricing.month', $language)}</span>
					</div>
					<p class="text-xs text-white/50 mt-2">{t('pricing.proPlusDesc', $language)}</p>
				</div>
				<ul class="space-y-2 mb-6 flex-1">
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/40 mt-0.5">✓</span>
						{t('pricing.proPlusFeature1', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/40 mt-0.5">✓</span>
						{t('pricing.proPlusFeature2', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/40 mt-0.5">✓</span>
						{t('pricing.proPlusFeature3', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/40 mt-0.5">✓</span>
						{t('pricing.proPlusFeature4', $language)}
					</li>
				</ul>
				{#if currentTier === 'pro_plus'}
					<button
						onclick={handlePortal}
						disabled={portalLoading}
						class="w-full py-2.5 rounded-lg border border-white/20 bg-white/10 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition disabled:opacity-50"
					>
						{portalLoading ? '...' : t('pricing.manageSub', $language)}
					</button>
				{:else if currentTier === 'free' || currentTier === 'pro'}
					<button
						onclick={() => handleCheckout('pro_plus')}
						disabled={loading === 'pro_plus'}
						class="w-full py-2.5 rounded-lg bg-white/90 text-black text-xs font-bold uppercase tracking-wider hover:bg-white transition disabled:opacity-50"
					>
						{loading === 'pro_plus' ? '...' : t('pricing.subscribe', $language)}
					</button>
				{/if}
			</div>

			<!-- ENTERPRISE -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col">
				<div class="mb-6">
					<h2 class="text-lg font-display font-bold text-white">{t('pricing.enterpriseName', $language)}</h2>
					<div class="mt-2">
						<span class="text-lg font-bold text-white/70">{t('pricing.contactUs', $language)}</span>
					</div>
					<p class="text-xs text-white/50 mt-2">{t('pricing.enterpriseDesc', $language)}</p>
				</div>
				<ul class="space-y-2 mb-6 flex-1">
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/30 mt-0.5">✓</span>
						{t('pricing.entFeature1', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/30 mt-0.5">✓</span>
						{t('pricing.entFeature2', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/30 mt-0.5">✓</span>
						{t('pricing.entFeature3', $language)}
					</li>
					<li class="text-xs text-white/70 flex items-start gap-2">
						<span class="text-white/30 mt-0.5">✓</span>
						{t('pricing.entFeature4', $language)}
					</li>
				</ul>
				<a
					href="mailto:contact@verdictmvp.com"
					class="w-full py-2.5 rounded-lg border border-white/20 bg-white/5 text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/15 transition text-center block"
				>
					{t('pricing.talkToUs', $language)}
				</a>
			</div>
		</div>
	</div>
</div>
