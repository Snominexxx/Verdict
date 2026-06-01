<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import ExercisePaperPreview from '$lib/components/ExercisePaperPreview.svelte';
	import { stageCase } from '$lib/stores/stagedCase';
	import { seedTranscript, saveTurns, debateStore } from '$lib/stores/debate';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import { focusMode } from '$lib/stores/ui';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { get } from 'svelte/store';
	import type { SourceBundleExcerpt, StagedCase } from '$lib/types';
	import { onDestroy, onMount } from 'svelte';

	export let data: PageData;

	let selectedRole: 'plaintiff' | 'defendant' = data.sharedCase.paperSnapshot.recommendedRole ?? 'plaintiff';
	let starting = false;
	let leavingForJudge = false;

	const paper = data.sharedCase.paperSnapshot;
	const hearingLanguage = paper.hearingLanguage ?? paper.sourceLanguage ?? data.sharedCase.packContext?.language ?? 'en';

	onMount(() => {
		language.set(hearingLanguage);
		focusMode.set(true);
	});

	onDestroy(() => {
		if (!leavingForJudge) focusMode.set(false);
	});

	const sourceIdsFromPacket = (): string[] => {
		const ids = paper.sourceBundle?.excerpts?.map((excerpt: SourceBundleExcerpt) => excerpt.sourceId).filter(Boolean) ?? [];
		return Array.from(new Set(ids));
	};

	const startJudge = async () => {
		if (starting) return;
		starting = true;
		leavingForJudge = true;
		const now = new Date().toISOString();
		const nextPaper = { ...paper, selectedRole };
		const staged: StagedCase = stageCase({
			id: `shared-${data.sharedCase.token}-${Date.now().toString(36)}`,
			title: paper.title,
			synopsis: paper.synopsis,
			issues: paper.issues,
			remedy: selectedRole === 'defendant' ? paper.defendantPosition : paper.plaintiffPosition,
			objective: paper.objective,
			targetSkill: paper.targetSkill,
			practicePoints: paper.practicePoints,
			judgeBrief: paper.judgeBrief,
			groundingAudit: paper.groundingAudit,
			paperSnapshot: nextPaper,
			role: selectedRole,
			sources: sourceIdsFromPacket(),
			packContext: data.sharedCase.packContext,
			courtType: 'bench',
			createdAt: now
		});
		seedTranscript(staged);
		caseHistoryStore.registerCase(staged);
		const openingTurns = get(debateStore);
		if (openingTurns.length) saveTurns(staged.id, openingTurns);
		await goto('/debate');
	};
</script>

<svelte:head>
	<title>{paper.title} · Verdict</title>
</svelte:head>

<main class="min-h-screen bg-[#e8e0d1] text-slate-900">
	<section class="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px] lg:py-8">
		<div class="min-w-0">
			<ExercisePaperPreview paper={paper} />
		</div>

		<aside class="lg:sticky lg:top-6 lg:self-start">
			<div class="rounded-2xl border border-slate-300 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
				<p class="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{t('share.sharedCase', $language)}</p>
				<h1 class="mt-2 text-xl font-semibold leading-tight text-slate-950">{paper.title}</h1>
				<p class="mt-3 text-sm leading-relaxed text-slate-600">{t('share.chooseSideDesc', $language)}</p>

				<div class="mt-5 grid gap-3">
					<button type="button" onclick={() => (selectedRole = 'plaintiff')} class={`rounded-xl border p-4 text-left transition ${selectedRole === 'plaintiff' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}>
						<p class="text-xs font-bold uppercase tracking-[0.18em] opacity-70">{t('cases.plaintiff', $language)}</p>
						<p class="mt-2 text-sm leading-relaxed">{paper.plaintiffPosition}</p>
					</button>
					<button type="button" onclick={() => (selectedRole = 'defendant')} class={`rounded-xl border p-4 text-left transition ${selectedRole === 'defendant' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}>
						<p class="text-xs font-bold uppercase tracking-[0.18em] opacity-70">{t('cases.defendant', $language)}</p>
						<p class="mt-2 text-sm leading-relaxed">{paper.defendantPosition}</p>
					</button>
				</div>

				<button type="button" onclick={startJudge} disabled={starting} class="mt-5 w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
					{starting ? t('share.starting', $language) : t('share.startJudge', $language)}
				</button>

				<p class="mt-4 text-xs leading-relaxed text-slate-500">{t('share.sourceBoundary', $language)}</p>
			</div>
		</aside>
	</section>
</main>