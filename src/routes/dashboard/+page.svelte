<script lang="ts">
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { subscriptionStore, TIER_CONFIG } from '$lib/stores/subscription';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import type { CasePerformance } from '$lib/stores/caseHistory';

	const tier = $derived($subscriptionStore.tier);
	const renewalDate = $derived(
		$subscriptionStore.currentPeriodEnd
			? new Date($subscriptionStore.currentPeriodEnd).toLocaleDateString($language === 'fr' ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
			: null
	);

	const totalCases = $derived($caseHistoryStore.length);
	const finishedCases = $derived($caseHistoryStore.filter((c) => c.status === 'finished'));
	const ongoingCases = $derived($caseHistoryStore.filter((c) => c.status === 'ongoing'));

	const scoredCases = $derived(finishedCases.filter((c) => c.performance?.scores));

	const avgScores = $derived(() => {
		if (scoredCases.length === 0) return null;
		const totals = { persuasion: 0, lawCited: 0, structure: 0, responsiveness: 0, factFidelity: 0, average: 0 };
		for (const c of scoredCases) {
			const s = c.performance!.scores;
			totals.persuasion += s.persuasion;
			totals.lawCited += s.lawCited;
			totals.structure += s.structure;
			totals.responsiveness += s.responsiveness;
			totals.factFidelity += s.factFidelity;
			totals.average += s.average;
		}
		const n = scoredCases.length;
		return {
			persuasion: Math.round(totals.persuasion / n),
			lawCited: Math.round(totals.lawCited / n),
			structure: Math.round(totals.structure / n),
			responsiveness: Math.round(totals.responsiveness / n),
			factFidelity: Math.round(totals.factFidelity / n),
			average: Math.round(totals.average / n)
		};
	});

	const scores = $derived(avgScores());

	const tierLabel = $derived(
		tier === 'pro_plus' ? 'Pro+' : tier === 'pro' ? 'Pro' : tier === 'enterprise' ? t('pricing.enterpriseName', $language) : t('pricing.freeName', $language)
	);

	const creditsUsed = $derived(totalCases);
	const creditsTotal = $derived(TIER_CONFIG[tier].credits);
	const maxRounds = $derived(TIER_CONFIG[tier].maxRounds);

	const pillars = $derived([
		{ key: 'persuasion', label: t('debate.metricPersuasion', $language) },
		{ key: 'lawCited', label: t('debate.metricLawCited', $language) },
		{ key: 'structure', label: t('debate.metricStructure', $language) },
		{ key: 'responsiveness', label: t('debate.metricResponsiveness', $language) },
		{ key: 'factFidelity', label: t('debate.metricFactFidelity', $language) }
	]);
</script>

<div class="h-full overflow-auto">
	<div class="max-w-3xl mx-auto px-6 py-10">
		<!-- Header -->
		<div class="mb-8">
			<p class="text-xs uppercase tracking-[0.25em] text-white/60 font-mono mb-2">{t('dashboard.kicker', $language)}</p>
			<h1 class="text-2xl font-display font-bold text-white">{t('dashboard.title', $language)}</h1>
		</div>

		<div class="grid gap-5">
			<!-- Subscription Card -->
			<div class="rounded-xl border border-white/15 bg-white/[0.06] p-5">
				<h2 class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono mb-3">{t('dashboard.subscription', $language)}</h2>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-lg font-display font-bold text-white">{tierLabel}</p>
						{#if (tier === 'pro' || tier === 'pro_plus') && renewalDate}
							<p class="text-xs text-white/50 mt-1">{t('dashboard.renewsOn', $language)} {renewalDate}</p>
						{:else if tier === 'free'}
							<p class="text-xs text-white/50 mt-1">{t('dashboard.freeDesc', $language)}</p>
						{/if}
					</div>
					{#if tier === 'free'}
						<a href="/pricing" class="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition">
							{t('pricing.upgradePro', $language)}
						</a>
					{:else}
						<a href="/pricing" class="px-4 py-2 rounded-lg border border-white/25 bg-white/10 text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/15 transition">
							{t('pricing.manageSub', $language)}
						</a>
					{/if}
				</div>
				<!-- Credits & Limits -->
				<div class="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
					<div>
						<p class="text-xs uppercase tracking-wider text-white/50 mb-1">{t('dashboard.creditsUsed', $language)}</p>
						<p class="text-lg font-bold text-white">{creditsUsed}<span class="text-sm text-white/50">/{creditsTotal}</span></p>
					</div>
					<div>
						<p class="text-xs uppercase tracking-wider text-white/50 mb-1">{t('dashboard.maxRounds', $language)}</p>
						<p class="text-lg font-bold text-white">{maxRounds}</p>
					</div>
				</div>
			</div>

			<!-- Cases Stats -->
			<div class="rounded-xl border border-white/15 bg-white/[0.06] p-5">
				<h2 class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono mb-3">{t('dashboard.cases', $language)}</h2>
				<div class="grid grid-cols-3 gap-4">
					<div class="text-center">
						<p class="text-2xl font-bold text-white">{totalCases}</p>
						<p class="text-xs uppercase tracking-wider text-white/50 mt-1">{t('dashboard.totalCases', $language)}</p>
					</div>
					<div class="text-center">
						<p class="text-2xl font-bold text-white">{ongoingCases.length}</p>
						<p class="text-xs uppercase tracking-wider text-white/50 mt-1">{t('court.ongoing', $language)}</p>
					</div>
					<div class="text-center">
						<p class="text-2xl font-bold text-white">{finishedCases.length}</p>
						<p class="text-xs uppercase tracking-wider text-white/50 mt-1">{t('court.finished', $language)}</p>
					</div>
				</div>
			</div>

			<!-- Performance Scores -->
			<div class="rounded-xl border border-white/15 bg-white/[0.06] p-5">
				<h2 class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono mb-3">{t('dashboard.performance', $language)}</h2>
				{#if scores}
					<!-- Overall Average -->
					<div class="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
						<p class="text-sm font-semibold text-white">{t('debate.metricAverage', $language)}</p>
						<p class="text-2xl font-bold text-white">{scores.average}<span class="text-sm text-white/50">%</span></p>
					</div>
					<!-- 5 Pillars -->
					<div class="space-y-3">
						{#each pillars as pillar}
							{@const value = scores[pillar.key as keyof typeof scores] ?? 0}
							<div class="flex items-center gap-3">
								<p class="text-xs text-white/70 w-28 shrink-0">{pillar.label}</p>
								<div class="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
									<div class="h-full rounded-full bg-white/60 transition-all" style="width: {value}%"></div>
								</div>
								<p class="text-xs font-bold text-white w-10 text-right">{value}%</p>
							</div>
						{/each}
					</div>
					<p class="text-xs text-white/50 mt-3">{t('dashboard.basedOn', $language)} {scoredCases.length} {scoredCases.length === 1 ? t('dashboard.debate', $language) : t('dashboard.debates', $language)}</p>
				{:else}
					<p class="text-sm text-white/50">{t('dashboard.noScores', $language)}</p>
				{/if}
			</div>
		</div>
	</div>
</div>
