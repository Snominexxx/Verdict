<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { stageCase } from '$lib/stores/stagedCase';
	import { seedTranscript, saveTurns, debateStore } from '$lib/stores/debate';
	import { get } from 'svelte/store';
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

	let formData: FormSubmission = $state({
		title: '',
		synopsis: '',
		issues: '',
		remedy: '',
		defendantPosition: '',
		role: '',
		sources: [],
		courtType: 'jury' as CourtType
	});

	let submission: StagedCase | null = $state(null);
	let submitting = $state(false);
	let errorMessage = $state('');
	let generating = $state(false);

	onMount(() => {
		legalPacksStore.hydrate();
		selectedLegalPackId.hydrate();
	});

	const selectedPack = $derived($legalPacksStore.find((pack) => pack.id === $selectedLegalPackId) ?? null);

	$effect(() => {
		if (selectedPack && formData.sources.length === 0) {
			formData = { ...formData, sources: selectedPack.sources.map((doc) => doc.id) };
		}
	});

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
			const response = await fetch('/api/generate-case', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ language: $language, pack: packPayload })
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
	<header class="border-b border-white/10 bg-black/20 px-6 py-4 flex items-center justify-between">
		<div>
			<h2 class="text-base font-bold uppercase tracking-wider text-white">{t('cases.header', $language)}</h2>
			<p class="text-sm text-white/50 mt-1">{t('cases.subheader', $language)}</p>
		</div>
		<div class="flex gap-2">
			<!-- Toolbar placeholders -->
			<button class="px-3 py-1.5 border border-white/10 hover:bg-white/5 text-xs text-white/70 rounded">{t('cases.resetForm', $language)}</button>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="max-w-5xl mx-auto px-6 py-6">
			{#if limitReached}
				<div class="mb-6 p-5 rounded-xl border border-white/15 bg-white/5 text-center">
					<p class="text-sm font-semibold text-white mb-2">{t('pricing.limitReached', $language)}</p>
					<p class="text-xs text-white/50 mb-4">{t('pricing.limitDesc', $language)}</p>
					{#if tier !== 'enterprise'}
						<a href="/pricing" class="inline-block px-5 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition">
							{t('pricing.upgradePro', $language)}
						</a>
					{/if}
				</div>
			{:else if debatesRemaining <= currentLimit}
				<div class="mb-4 px-4 py-2 rounded-lg border border-white/10 bg-white/5 flex items-center justify-between">
					<p class="text-xs text-white/50">{t('pricing.debatesRemaining', $language)}: <span class="text-white font-bold">{debatesRemaining}/{currentLimit}</span></p>
					{#if tier !== 'enterprise'}
						<a href="/pricing" class="text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition">{t('pricing.upgradePro', $language)}</a>
					{/if}
				</div>
			{/if}
			<form class="space-y-5" on:submit|preventDefault={handleSubmit}>

				<!-- Step 1: Legal Pack + Sources -->
				<div class="space-y-3">
					<div class="flex justify-between items-center">
						<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.legalPack', $language)}</p>
						<span class="text-xs text-white/40 font-mono">{formData.sources.length} {t('cases.selected', $language)}</span>
					</div>

					{#if errorMessage}
						<div class="p-4 rounded-lg border-2 border-red-500 bg-red-500/20">
							<p class="text-base font-bold text-red-400">⚠ {errorMessage}</p>
						</div>
					{/if}

					<div class="flex flex-wrap gap-2">
						{#each $legalPacksStore as pack}
							<button
								type="button"
								on:click={() => setPack(pack.id)}
								class={`text-left px-3 py-2 border rounded transition text-xs ${$selectedLegalPackId === pack.id ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}
							>
								<span class="font-bold">{pack.name}</span>
								<span class="text-white/40 ml-1">• {pack.sources.length}</span>
							</button>
						{/each}
					</div>

					{#if (formSubmitAttempted || packMissing) && !$selectedLegalPackId}
						<p class="text-sm font-semibold text-red-400">{t('cases.selectPackRequired', $language)}</p>
					{:else if selectedPack && selectedPack.sources.length === 0}
						<p class="text-xs text-white/50">{t('cases.noSourcesInPack', $language)}</p>
					{/if}

					{#if selectedPack && selectedPack.sources.length > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each selectedPack.sources.filter((s) => !$indexingSourceIds.has(s.id)) as doc}
								<label class={`
									inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-full transition-all cursor-pointer text-xs
									${formData.sources.includes(doc.id) ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-white/40 hover:bg-white/5'}
								`}>
									<input
										type="checkbox"
										checked={formData.sources.includes(doc.id)}
										on:change={() => toggleSource(doc.id)}
										class="w-3 h-3"
									/>
									<span class="truncate max-w-[180px]">{doc.title}</span>
								</label>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Step 2: Mode + Side + Auto-fill -->
				<div class="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
					<div class="space-y-1.5">
						<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.mode', $language)}</p>
						<div class="flex gap-2">
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="courtType" value="jury" bind:group={formData.courtType} class="sr-only peer" />
								<div class="text-center py-2.5 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									{t('cases.jury', $language)}
								</div>
							</label>
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="courtType" value="bench" bind:group={formData.courtType} class="sr-only peer" />
								<div class="text-center py-2.5 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									{t('cases.judge', $language)}
								</div>
							</label>
						</div>
						<p class="text-xs text-white/40 leading-relaxed mt-1">{formData.courtType === 'jury' ? t('cases.juryDesc', $language) : t('cases.judgeDesc', $language)}</p>
					</div>
					<div class="space-y-1.5">
						<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.yourSide', $language)}</p>
						<div class="flex gap-2">
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="role" value="plaintiff" bind:group={formData.role} class="sr-only peer" />
								<div class="text-center py-2.5 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									{t('cases.plaintiff', $language)}
								</div>
							</label>
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="role" value="defendant" bind:group={formData.role} class="sr-only peer" />
								<div class="text-center py-2.5 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									{t('cases.defendant', $language)}
								</div>
							</label>
						</div>
						{#if formSubmitAttempted && !formData.role}
							<p class="text-sm font-semibold text-red-400">{t('cases.selectSideRequired', $language)}</p>
						{/if}
					</div>
					<div class="flex items-end">
						<button
							type="button"
							on:click={autoFill}
							disabled={generating}
							class="px-4 py-2.5 border border-flare/50 text-flare text-xs font-bold uppercase rounded hover:bg-flare/10 transition-all disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
						>
							{generating ? t('cases.generating', $language) : t('cases.autoFill', $language)}
						</button>
					</div>
				</div>

				<!-- Case Title -->
				<div class="space-y-1.5">
					<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.caseTitle', $language)}</p>
					<input
						type="text"
						class={`w-full bg-white/10 rounded border px-4 py-3 text-base font-medium text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-colors placeholder-white/40 font-display ${formSubmitAttempted && !formData.title.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
						bind:value={formData.title}
						placeholder={t('cases.caseTitlePlaceholder', $language)}
					/>
					{#if formSubmitAttempted && !formData.title.trim()}
						<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
					{/if}
				</div>

				<!-- What Happened — full width -->
				<div class="space-y-1.5">
					<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.whatHappened', $language)}</p>
					<textarea
						class={`w-full bg-white/10 border rounded px-4 py-3 text-sm text-white min-h-[160px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none leading-relaxed placeholder-white/40 ${formSubmitAttempted && !formData.synopsis.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
						bind:value={formData.synopsis}
						placeholder={t('cases.whatHappenedPlaceholder', $language)}
					></textarea>
					{#if formSubmitAttempted && !formData.synopsis.trim()}
						<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
					{/if}
				</div>

				<!-- Issues + Positions — 3-column row -->
				<div class="grid gap-4 md:grid-cols-3">
					<div class="space-y-1.5">
						<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.mainQuestion', $language)}</p>
						<textarea
							class={`w-full bg-white/10 border rounded px-4 py-3 text-sm text-white min-h-[100px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none placeholder-white/40 ${formSubmitAttempted && !formData.issues.trim() ? 'border-red-500 ring-1 ring-red-500/50' : 'border-white/20'}`}
							bind:value={formData.issues}
							placeholder={t('cases.mainQuestionPlaceholder', $language)}
						></textarea>
						{#if formSubmitAttempted && !formData.issues.trim()}
							<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
						{/if}
					</div>
					<button
						type="button"
						on:click={() => (formData = { ...formData, role: 'plaintiff' })}
						class={`text-left space-y-1.5 border rounded p-3 transition ${formData.role === 'plaintiff' ? 'border-white/40 bg-white/10' : formSubmitAttempted && !formData.remedy.trim() ? 'border-red-500 bg-red-500/5' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}
					>
						<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.whatYouWant', $language)}</p>
						<textarea
							class="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white min-h-[80px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none placeholder-white/40"
							bind:value={formData.remedy}
							on:focus={() => (formData = { ...formData, role: 'plaintiff' })}
							placeholder={formData.role === 'plaintiff' ? t('cases.plaintiffPlaceholderYou', $language) : t('cases.plaintiffPlaceholderOther', $language)}
						></textarea>
						{#if formSubmitAttempted && !formData.remedy.trim()}
							<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
						{/if}
					</button>
					<button
						type="button"
						on:click={() => (formData = { ...formData, role: 'defendant' })}
						class={`text-left space-y-1.5 border rounded p-3 transition ${formData.role === 'defendant' ? 'border-white/40 bg-white/10' : formSubmitAttempted && !formData.defendantPosition.trim() ? 'border-red-500 bg-red-500/5' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}
					>
						<p class="text-xs font-bold uppercase tracking-widest text-white/60 font-mono">{t('cases.whatDefendantWants', $language)}</p>
						<textarea
							class="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white min-h-[80px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none placeholder-white/40"
							bind:value={formData.defendantPosition}
							on:focus={() => (formData = { ...formData, role: 'defendant' })}
							placeholder={formData.role === 'defendant' ? t('cases.defendantPlaceholderYou', $language) : t('cases.defendantPlaceholderOther', $language)}
						></textarea>
						{#if formSubmitAttempted && !formData.defendantPosition.trim()}
							<p class="text-sm font-semibold text-red-400">{t('cases.fieldRequired', $language)}</p>
						{/if}
					</button>
				</div>

				<!-- Actions -->
				<div class="flex items-center justify-between gap-4 pt-4 border-t border-white/10">
					<p class="text-xs text-white/30 font-mono hidden sm:block">{t('cases.systemReady', $language)}</p>
					<button
						type="submit"
						class="px-8 py-3 bg-white hover:bg-white/90 text-black text-xs font-bold uppercase tracking-widest rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						disabled={
							!formData.title.trim() ||
							!formData.synopsis.trim() ||
							!formData.issues.trim() ||
							!$selectedLegalPackId ||
							!formData.role ||
							!formData.remedy.trim() ||
							!formData.defendantPosition.trim() ||
							submitting
						}
					>
						{submitting ? t('cases.processing', $language) : t('cases.initializeCase', $language)}
					</button>
				</div>
			</form>
		</div>
	</div>
</div>