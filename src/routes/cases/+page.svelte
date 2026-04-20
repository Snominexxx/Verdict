<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { stageCase } from '$lib/stores/stagedCase';
	import { seedTranscript, saveTurns, debateStore } from '$lib/stores/debate';
	import { get } from 'svelte/store';
	import { caseDraftStore } from '$lib/stores/caseDraft';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import { legalPacksStore, selectedLegalPackId } from '$lib/stores/legalPacks';
	import { indexingSourceIds } from '$lib/stores/indexing';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { subscriptionStore, TIER_CONFIG } from '$lib/stores/subscription';
	import type { StagedCase, CourtType } from '$lib/types';

	const totalCases = $derived($caseHistoryStore.length);
	const tier = $derived($subscriptionStore.tier);
	const currentLimit = $derived(TIER_CONFIG[tier].credits);
	const debatesRemaining = $derived(Math.max(0, currentLimit - totalCases));
	const limitReached = $derived(totalCases >= currentLimit);

	type FormSubmission = {
		title: string;
		synopsis: string;
		issues: string;
		remedy: string;
		defendantPosition: string;
		role: '' | 'plaintiff' | 'defendant';
		sources: string[];
		courtType: CourtType;
	};

	let formSubmitAttempted = $state(false);
	let packMissing = $state(false);

	let formData: FormSubmission = $state(get(caseDraftStore));

	let submission: StagedCase | null = $state(null);
	let submitting = $state(false);
	let errorMessage = $state('');
	let generating = $state(false);

	// Wizard state
	let step = $state(1);
	let step1Attempted = $state(false);
	let step2Attempted = $state(false);
	let step3Attempted = $state(false);
	let showSourceEditor = $state(false);

	onMount(() => {
		legalPacksStore.hydrate();
		selectedLegalPackId.hydrate();
		// Auto-advance if returning with saved draft
		if (formData.title.trim()) step = 2;
	});

	// Keep the draft store in sync so data survives navigation
	$effect(() => {
		caseDraftStore.set({ ...formData });
	});

	const selectedPack = $derived($legalPacksStore.find((pack) => pack.id === $selectedLegalPackId) ?? null);

	$effect(() => {
		if (selectedPack && formData.sources.length === 0) {
			formData = { ...formData, sources: selectedPack.sources.map((doc) => doc.id) };
		}
	});

	// Step validation
	const step1Valid = $derived(!!$selectedLegalPackId);
	const step2Valid = $derived(
		!!formData.title.trim() &&
		!!formData.synopsis.trim() &&
		!!formData.issues.trim() &&
		!!formData.remedy.trim() &&
		!!formData.defendantPosition.trim()
	);

	const setPack = (packId: string) => {
		selectedLegalPackId.select(packId);
		packMissing = false;
		errorMessage = '';
		const pack = $legalPacksStore.find((p) => p.id === packId);
		formData = {
			...formData,
			sources: pack ? pack.sources.map((doc) => doc.id) : []
		};
	};

	const autoFill = async () => {
		if (!$selectedLegalPackId) {
			step1Attempted = true;
			packMissing = true;
			errorMessage = t('cases.selectPackFirst', $language);
			return;
		}
		packMissing = false;
		generating = true;
		errorMessage = '';
		try {
			const selectedSources = selectedPack
				? selectedPack.sources.filter((s) => formData.sources.includes(s.id))
				: [];
			const packPayload = selectedPack
				? {
						packId: selectedPack.id,
						packName: selectedPack.name,
						jurisdictions: [...new Set(selectedSources.map((s) => s.jurisdiction).filter(Boolean))],
						sourceTitles: selectedSources.map((s) => s.title).slice(0, 10),
						sourceIds: selectedSources.map((s) => s.id)
					}
				: null;
			const recentTitles = $caseHistoryStore.slice(0, 5).map((c) => c.title);
			const response = await fetch('/api/generate-case', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ language: $language, pack: packPayload, recentTitles })
			});
			if (!response.ok) {
				const text = await response.text();
				let msg = 'Failed to generate case';
				try { msg = JSON.parse(text).message ?? msg; } catch {}
				throw new Error(msg);
			}
			const data = await response.json();
			formData = {
				...formData,
				title: data.title,
				synopsis: data.synopsis,
				issues: data.issues,
				remedy: data.remedy,
				defendantPosition: data.defendantPosition
			};
			step = 2;
		} catch (err) {
			console.error('Auto-fill failed:', err);
			const errMsg = err instanceof Error ? err.message : '';
			if (errMsg.includes('limit reached') || errMsg.includes('Too many')) {
				errorMessage = errMsg;
			} else {
				const jurisdiction = selectedPack
					? [...new Set(selectedPack.sources.map((s) => s.jurisdiction).filter(Boolean))].join(' / ') || ''
					: '';
				const locationLabel = jurisdiction || ($language === 'fr' ? 'le pays concerné' : 'the relevant jurisdiction');
				formData = {
					...formData,
					title: $language === 'fr' ? `Exemple c. Partie adverse` : `Example v. Opposing Party`,
					synopsis: $language === 'fr'
						? `Litige civil typique dans ${locationLabel}. Un employé a été congédié sans préavis après 3 ans de service. L'employeur invoque une restructuration mais a embauché un remplaçant peu après.`
						: `Typical civil dispute in ${locationLabel}. An employee was dismissed without notice after 3 years of service. The employer cited restructuring but hired a replacement shortly after.`,
					issues: $language === 'fr'
						? 'Le congédiement était-il justifié? Y a-t-il droit à une indemnité?'
						: 'Was the dismissal justified? Is there entitlement to compensation?',
					remedy: $language === 'fr'
						? 'Compensation pour perte de salaire et indemnité de départ.'
						: 'Compensation for lost wages and severance pay.',
					defendantPosition: $language === 'fr'
						? 'Rejet de la réclamation ou réduction des montants demandés.'
						: 'Dismissal of the claim or reduction of requested amounts.'
				};
				step = 2;
			}
		} finally {
			generating = false;
		}
	};

	const toggleSource = (id: string) => {
		if (formData.sources.includes(id)) {
			formData = { ...formData, sources: formData.sources.filter((src) => src !== id) };
		} else {
			formData = { ...formData, sources: [...formData.sources, id] };
		}
	};

	const resetForm = () => {
		caseDraftStore.clear();
		formData = get(caseDraftStore);
		step = 1;
		step1Attempted = false;
		step2Attempted = false;
		step3Attempted = false;
		formSubmitAttempted = false;
		errorMessage = '';
		showSourceEditor = false;
	};

	const handleSubmit = async () => {
		formSubmitAttempted = true;
		if (limitReached) return;
		if (!formData.title.trim() || !formData.synopsis.trim() || !formData.issues.trim()) return;
		if (!$selectedLegalPackId) return;
		if (!formData.role) return;
		if (!formData.remedy.trim() || !formData.defendantPosition.trim()) return;
		submitting = true;
		errorMessage = '';
		try {
			const roleAlignedRemedy = formData.role === 'plaintiff'
				? formData.remedy
				: formData.defendantPosition;

			const response = await fetch('/api/cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: formData.title,
					synopsis: formData.synopsis,
					issues: formData.issues,
					remedy: roleAlignedRemedy,
					role: formData.role,
					sources: formData.sources,
					packId: $selectedLegalPackId,
					courtType: formData.courtType
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || !payload) {
				throw new Error(payload?.message ?? 'Unable to stage the case.');
			}
			const staged = stageCase(payload as StagedCase);
			seedTranscript(staged);
			caseHistoryStore.registerCase(staged);
			// Save the opening turns to Supabase
			const openingTurns = get(debateStore);
			if (openingTurns.length) saveTurns(staged.id, openingTurns);
			submission = staged;
			caseDraftStore.clear();
			await goto('/debate');
		} catch (err) {
			console.error('Case creation failed', err);
			errorMessage = err instanceof Error ? err.message : 'Something went wrong while staging the case.';
		} finally {
			submitting = false;
		}
	};
</script>

<div class="h-full grid grid-rows-[auto_1fr] gap-0">
	<!-- Module Header -->
	<header class="border-b border-white/15 bg-black/20 px-6 py-4 flex items-center justify-between">
		<div>
			<h2 class="text-lg font-bold uppercase tracking-wider text-white">{t('cases.header', $language)}</h2>
			<p class="text-sm text-white/70 mt-1">{t('cases.subheader', $language)}</p>
		</div>
		<button onclick={resetForm} class="px-3 py-1.5 border border-white/20 hover:bg-white/10 text-sm text-white/80 rounded transition">{t('cases.resetForm', $language)}</button>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="max-w-3xl mx-auto px-6 py-8">

			<!-- Step Indicator -->
			<div class="flex items-center justify-center mb-10">
				{#each [{ n: 1, label: t('cases.setup', $language) }, { n: 2, label: t('cases.caseDetails', $language) }, { n: 3, label: t('cases.reviewStep', $language) }] as s, i}
					{#if i > 0}
						<div class={`h-px w-12 sm:w-20 transition-colors ${step > i ? 'bg-white/50' : 'bg-white/15'}`}></div>
					{/if}
					<button
						type="button"
						onclick={() => { if (s.n < step) step = s.n; }}
						class="flex flex-col items-center gap-1.5"
						disabled={s.n > step}
					>
						<div class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
							step > s.n ? 'bg-white text-black' :
							step === s.n ? 'bg-white text-black' :
							'border border-white/30 text-white/30'
						}`}>
							{step > s.n ? '✓' : s.n}
						</div>
						<span class={`text-xs font-mono uppercase tracking-wider transition-colors ${step >= s.n ? 'text-white/80' : 'text-white/40'}`}>{s.label}</span>
					</button>
				{/each}
			</div>

			<!-- Limit Banners -->
			{#if limitReached}
				<div class="mb-6 p-5 rounded-xl border border-white/15 bg-white/5 text-center">
					<p class="text-sm font-semibold text-white mb-2">{t('pricing.limitReached', $language)}</p>
					<p class="text-sm text-white/60 mb-4">{t('pricing.limitDesc', $language)}</p>
					{#if tier !== 'enterprise'}
						<a href="/pricing" class="inline-block px-5 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition">
							{t('pricing.upgradePro', $language)}
						</a>
					{/if}
				</div>
			{:else if debatesRemaining <= currentLimit}
				<div class="mb-6 px-4 py-2 rounded-lg border border-white/15 bg-white/5 flex items-center justify-between">
					<p class="text-sm text-white/60">{t('pricing.debatesRemaining', $language)}: <span class="text-white font-bold">{debatesRemaining}/{currentLimit}</span></p>
					{#if tier !== 'enterprise'}
						<a href="/pricing" class="text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition">{t('pricing.upgradePro', $language)}</a>
					{/if}
				</div>
			{/if}

			<!-- Error banner -->
			{#if errorMessage}
				<div class="mb-6 p-4 rounded-lg border-2 border-red-500 bg-red-500/20">
					<p class="text-base font-bold text-red-400">⚠ {errorMessage}</p>
				</div>
			{/if}

			<!-- ═══════════════════ STEP 1: SETUP ═══════════════════ -->
			{#if step === 1}
				<div class="space-y-8">
					<!-- Legal Pack -->
					<div class="space-y-3">
						<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.legalPack', $language)}</p>
						{#if $legalPacksStore.length === 0}
							<div class="p-6 border border-dashed border-white/20 rounded-lg text-center">
								<p class="text-sm text-white/50 mb-3">{t('cases.noPacksYet', $language)}</p>
								<a href="/library" class="inline-block px-4 py-2 border border-white/30 rounded text-sm text-white/70 hover:bg-white/10 transition">{t('cases.goToLibrary', $language)}</a>
							</div>
						{:else}
							<div class="grid gap-3 sm:grid-cols-2">
								{#each $legalPacksStore as pack}
									<button
										type="button"
										onclick={() => setPack(pack.id)}
										class={`text-left p-4 border rounded-lg transition-all ${$selectedLegalPackId === pack.id ? 'border-white/50 bg-white/15 ring-1 ring-white/20' : 'border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25'}`}
									>
										<p class="font-bold text-white">{pack.name}</p>
										<p class="text-sm text-white/50 mt-1">{pack.sources.length} source{pack.sources.length !== 1 ? 's' : ''}</p>
									</button>
								{/each}
							</div>
						{/if}
						{#if step1Attempted && !$selectedLegalPackId}
							<p class="text-sm font-semibold text-red-400">{t('cases.selectPackRequired', $language)}</p>
						{/if}
					</div>

					<!-- Mode -->
					<div class="space-y-3">
						<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.mode', $language)}</p>
						<div class="grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								onclick={() => (formData = { ...formData, courtType: 'jury' })}
								class={`text-left p-4 border rounded-lg transition-all ${formData.courtType === 'jury' ? 'border-white/50 bg-white/15 ring-1 ring-white/20' : 'border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25'}`}
							>
								<p class="font-bold text-white">{t('cases.jury', $language)}</p>
								<p class="text-sm text-white/50 mt-2 leading-relaxed">{t('cases.juryDesc', $language)}</p>
							</button>
							<button
								type="button"
								onclick={() => (formData = { ...formData, courtType: 'bench' })}
								class={`text-left p-4 border rounded-lg transition-all ${formData.courtType === 'bench' ? 'border-white/50 bg-white/15 ring-1 ring-white/20' : 'border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25'}`}
							>
								<p class="font-bold text-white">{t('cases.judge', $language)}</p>
								<p class="text-sm text-white/50 mt-2 leading-relaxed">{t('cases.judgeDesc', $language)}</p>
							</button>
						</div>
					</div>

					<!-- Hero CTAs -->
					<div class="pt-6 space-y-4 border-t border-white/15">
						<button
							type="button"
							onclick={autoFill}
							disabled={generating || limitReached}
							class="w-full py-4 bg-white hover:bg-white/90 text-black text-sm font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-50 disabled:cursor-wait"
						>
							{generating ? t('cases.generating', $language) : t('cases.generateWithAI', $language)}
						</button>
						<p class="text-center text-sm text-white/40">{t('cases.generateDesc', $language)}</p>
						<button
							type="button"
							onclick={() => { if (!step1Valid) { step1Attempted = true; return; } step = 2; }}
							class="block mx-auto text-sm text-white/40 hover:text-white/70 underline underline-offset-4 transition"
						>
							{t('cases.orManual', $language)}
						</button>
					</div>
				</div>

			<!-- ═══════════════════ STEP 2: CASE DETAILS ═══════════════════ -->
			{:else if step === 2}
				<div class="space-y-6">
					<!-- Case Title -->
					<div class="space-y-1.5">
						<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.caseTitle', $language)}</p>
						<input
							type="text"
							class={`w-full bg-white/10 rounded border px-4 py-3 text-base font-medium text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-colors placeholder-white/40 font-display ${step2Attempted && !formData.title.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
							bind:value={formData.title}
							placeholder={t('cases.caseTitlePlaceholder', $language)}
						/>
						{#if step2Attempted && !formData.title.trim()}
							<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
						{/if}
					</div>

					<!-- What Happened -->
					<div class="space-y-1.5">
						<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.whatHappened', $language)}</p>
						<textarea
							class={`w-full bg-white/10 border rounded px-4 py-3 text-sm text-white min-h-[160px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none leading-relaxed placeholder-white/40 ${step2Attempted && !formData.synopsis.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
							bind:value={formData.synopsis}
							placeholder={t('cases.whatHappenedPlaceholder', $language)}
						></textarea>
						{#if step2Attempted && !formData.synopsis.trim()}
							<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
						{/if}
					</div>

					<!-- Main Question -->
					<div class="space-y-1.5">
						<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.mainQuestion', $language)}</p>
						<textarea
							class={`w-full bg-white/10 border rounded px-4 py-3 text-sm text-white min-h-[100px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none placeholder-white/40 ${step2Attempted && !formData.issues.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
							bind:value={formData.issues}
							placeholder={t('cases.mainQuestionPlaceholder', $language)}
						></textarea>
						{#if step2Attempted && !formData.issues.trim()}
							<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
						{/if}
					</div>

					<!-- Positions — 2 columns -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-1.5">
							<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.whatYouWant', $language)}</p>
							<textarea
								class={`w-full bg-white/10 border rounded px-4 py-3 text-sm text-white min-h-[100px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none placeholder-white/40 ${step2Attempted && !formData.remedy.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
								bind:value={formData.remedy}
								placeholder={formData.role === 'plaintiff' ? t('cases.plaintiffPlaceholderYou', $language) : t('cases.plaintiffPlaceholderOther', $language)}
							></textarea>
							{#if step2Attempted && !formData.remedy.trim()}
								<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
							{/if}
						</div>
						<div class="space-y-1.5">
							<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.whatDefendantWants', $language)}</p>
							<textarea
								class={`w-full bg-white/10 border rounded px-4 py-3 text-sm text-white min-h-[100px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none placeholder-white/40 ${step2Attempted && !formData.defendantPosition.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
								bind:value={formData.defendantPosition}
								placeholder={formData.role === 'defendant' ? t('cases.defendantPlaceholderYou', $language) : t('cases.defendantPlaceholderOther', $language)}
							></textarea>
							{#if step2Attempted && !formData.defendantPosition.trim()}
								<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
							{/if}
						</div>
					</div>

					<!-- Navigation -->
					<div class="flex items-center justify-between pt-6 border-t border-white/15">
						<button type="button" onclick={() => step = 1} class="px-5 py-2.5 text-sm text-white/60 hover:text-white transition">
							← {t('cases.back', $language)}
						</button>
						<button
							type="button"
							onclick={() => { step2Attempted = true; if (step2Valid) step = 3; }}
							class="px-8 py-3 bg-white hover:bg-white/90 text-black text-sm font-bold uppercase tracking-widest rounded transition-colors"
						>
							{t('cases.next', $language)} →
						</button>
					</div>
				</div>

			<!-- ═══════════════════ STEP 3: REVIEW & LAUNCH ═══════════════════ -->
			{:else}
				<div class="space-y-6">
					<div>
						<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono mb-1">{t('cases.reviewStep', $language)}</p>
						<p class="text-sm text-white/40">{t('cases.reviewDesc', $language)}</p>
					</div>

					<!-- Pick Your Side -->
					<div class="space-y-3">
						<p class="text-sm font-bold uppercase tracking-widest text-white/70 font-mono">{t('cases.chooseSide', $language)}</p>
						<p class="text-sm text-white/40">{t('cases.chooseSideDesc', $language)}</p>
						<div class="grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								onclick={() => (formData = { ...formData, role: 'plaintiff' })}
								class={`text-center py-3 border rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${formData.role === 'plaintiff' ? 'bg-white text-black border-white' : 'border-white/25 text-white/80 bg-white/5 hover:bg-white/10'}`}
							>
								{t('cases.plaintiff', $language)}
							</button>
							<button
								type="button"
								onclick={() => (formData = { ...formData, role: 'defendant' })}
								class={`text-center py-3 border rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${formData.role === 'defendant' ? 'bg-white text-black border-white' : 'border-white/25 text-white/80 bg-white/5 hover:bg-white/10'}`}
							>
								{t('cases.defendant', $language)}
							</button>
						</div>
						{#if step3Attempted && !formData.role}
							<p class="text-sm font-semibold text-red-400">{t('cases.selectSideRequired', $language)}</p>
						{/if}
					</div>

					<!-- Summary Card -->
					<div class="border border-white/20 rounded-xl bg-white/5 divide-y divide-white/10 overflow-hidden">
						<div class="p-5">
							<h3 class="text-xl font-bold text-white font-display">{formData.title}</h3>
							<p class="text-sm text-white/50 mt-1.5 flex flex-wrap gap-x-2">
								<span>{formData.courtType === 'jury' ? t('cases.jury', $language) : t('cases.judge', $language)}</span>
								{#if selectedPack}
									<span class="text-white/25">·</span>
									<span>{selectedPack.name}</span>
								{/if}
							</p>
						</div>
						<div class="p-5">
							<p class="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-2">{t('cases.whatHappened', $language)}</p>
							<p class="text-sm text-white/80 leading-relaxed whitespace-pre-line">{formData.synopsis}</p>
						</div>
						<div class="p-5">
							<p class="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-2">{t('cases.mainQuestion', $language)}</p>
							<p class="text-sm text-white/80 leading-relaxed whitespace-pre-line">{formData.issues}</p>
						</div>
						<div class="p-5 grid gap-5 sm:grid-cols-2">
							<div>
								<p class="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-2">{t('cases.whatYouWant', $language)}</p>
								<p class="text-sm text-white/80 leading-relaxed">{formData.remedy}</p>
							</div>
							<div>
								<p class="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-2">{t('cases.whatDefendantWants', $language)}</p>
								<p class="text-sm text-white/80 leading-relaxed">{formData.defendantPosition}</p>
							</div>
						</div>
					</div>

					<!-- Sources -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<p class="text-sm text-white/60">
								<span class="font-bold font-mono uppercase tracking-widest">{t('cases.legalPack', $language)}</span>
								<span class="ml-2 text-white/25">·</span>
								<span class="ml-2">{formData.sources.length} {t('cases.selected', $language)}</span>
							</p>
							<button
								type="button"
								onclick={() => showSourceEditor = !showSourceEditor}
								class="text-xs text-white/40 hover:text-white/70 underline underline-offset-4 transition"
							>
								{t('cases.editSources', $language)}
							</button>
						</div>
						{#if showSourceEditor && selectedPack}
							<div class="flex flex-wrap gap-1.5 p-3 border border-white/10 rounded-lg bg-white/5">
								{#each selectedPack.sources.filter((s) => !$indexingSourceIds.has(s.id)) as doc}
									<label class={`inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-full transition-all cursor-pointer text-sm ${formData.sources.includes(doc.id) ? 'border-white/40 bg-white/15 text-white' : 'border-white/20 text-white/60 hover:bg-white/10'}`}>
										<input type="checkbox" checked={formData.sources.includes(doc.id)} onchange={() => toggleSource(doc.id)} class="w-3 h-3" />
										<span class="truncate max-w-[180px]">{doc.title}</span>
									</label>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Navigation -->
					<div class="flex items-center justify-between pt-6 border-t border-white/15">
						<button type="button" onclick={() => step = 2} class="px-5 py-2.5 text-sm text-white/60 hover:text-white transition">
							← {t('cases.back', $language)}
						</button>
						<button
							type="button"
							onclick={() => { step3Attempted = true; if (!formData.role) return; handleSubmit(); }}
							disabled={submitting || limitReached}
							class="px-8 py-3 bg-white hover:bg-white/90 text-black text-sm font-bold uppercase tracking-widest rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{submitting ? t('cases.processing', $language) : t('cases.startDebate', $language)}
						</button>
					</div>
				</div>
			{/if}

			<p class="mt-8 text-center text-xs text-white/30">{t('disclaimer.banner', $language)}</p>
		</div>
	</div>
</div>
