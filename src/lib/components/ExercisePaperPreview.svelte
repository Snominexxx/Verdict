<script lang="ts">
	import type { ExercisePaperSnapshot, CaseStudioGroundingAudit } from '$lib/types';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';

	export let paper: ExercisePaperSnapshot;

	const levelLabel = (level: ExercisePaperSnapshot['level']) => {
		if (level === 'advanced') return t('cases.levelAdvanced', $language);
		if (level === 'introductory') return t('cases.levelIntroductory', $language);
		return t('cases.levelIntermediate', $language);
	};

	const roleLabel = (role: 'plaintiff' | 'defendant') =>
		role === 'defendant' ? t('cases.defendant', $language) : t('cases.plaintiff', $language);

	const groundingStatusLabel = (status?: CaseStudioGroundingAudit['status']) => {
		if (status === 'source-grounded') return t('cases.sourceGrounded', $language);
		if (status === 'insufficient-sources') return t('cases.insufficientSources', $language);
		return t('cases.needsReview', $language);
	};

	const groundingMapAreaLabel = (area: string) => {
		if (area === 'mainIssue') return t('cases.groundingMainIssue', $language);
		if (area === 'plaintiffTheory') return t('cases.groundingPlaintiffTheory', $language);
		if (area === 'defendantTheory') return t('cases.groundingDefendantTheory', $language);
		if (area === 'judgePressurePoint') return t('cases.groundingJudgePressure', $language);
		if (area === 'successCriteria') return t('cases.groundingSuccessCriteria', $language);
		if (area === 'sourceBoundary') return t('cases.groundingSourceBoundary', $language);
		return t('cases.groundingOther', $language);
	};

	const groundingChipClass = (status?: CaseStudioGroundingAudit['status']) => {
		if (status === 'source-grounded') return 'border-emerald-300/45 bg-emerald-400/10 text-emerald-950';
		if (status === 'insufficient-sources') return 'border-red-300/45 bg-red-400/10 text-red-950';
		return 'border-amber-300/45 bg-amber-400/10 text-amber-950';
	};

	const groundingPanelClass = (status?: CaseStudioGroundingAudit['status']) => {
		if (status === 'source-grounded') return 'border-emerald-200/70 bg-emerald-50/80';
		if (status === 'insufficient-sources') return 'border-red-200/70 bg-red-50/80';
		return 'border-amber-200/70 bg-amber-50/80';
	};

	const selectedSideText = (currentPaper: ExercisePaperSnapshot) =>
		currentPaper.selectedRole === 'defendant'
			? currentPaper.defendantPosition || '—'
			: currentPaper.plaintiffPosition || '—';
</script>

<section class="overflow-hidden rounded-[2rem] bg-[#f7f3ea] shadow-[0_28px_80px_rgba(15,23,42,0.28)] ring-1 ring-black/5">
	<div class="min-w-0 space-y-7 p-6 text-slate-800 sm:p-8 lg:p-10">
		<header class="flex flex-col gap-4 border-b border-slate-300/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
			<div class="min-w-0 space-y-3">
				<p class="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{t('cases.documentPreview', $language)}</p>
				<h2 class="break-words text-3xl font-semibold leading-tight text-slate-900">{paper.title}</h2>
			</div>
			<div class="flex min-w-0 flex-wrap gap-2 lg:justify-end">
				<span class="max-w-full break-all rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{levelLabel(paper.level)}</span>
				{#if paper.targetSkill}
					<span class="max-w-full break-all rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{paper.targetSkill}</span>
				{/if}
				<span class="max-w-full break-all rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{t('cases.roleRecommendation', $language)}: {roleLabel(paper.recommendedRole)}</span>
				{#if paper.groundingAudit}
					<span class={`max-w-full break-all rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${groundingChipClass(paper.groundingAudit.status)}`}>{groundingStatusLabel(paper.groundingAudit.status)}</span>
				{/if}
			</div>
		</header>

		{#if paper.groundingAudit}
			<section class={`rounded-[1.4rem] border p-5 ${groundingPanelClass(paper.groundingAudit.status)}`}>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0 space-y-1.5">
						<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{t('cases.groundingStatus', $language)}</p>
						<p class="break-words text-sm leading-relaxed text-slate-700">{paper.groundingAudit.summary}</p>
					</div>
					<span class={`max-w-full break-all rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${groundingChipClass(paper.groundingAudit.status)}`}>{groundingStatusLabel(paper.groundingAudit.status)}</span>
				</div>
			</section>
		{/if}

		<section class="rounded-[1.45rem] border border-slate-300/70 bg-white/80 p-5 sm:p-6">
			<div class="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
				<div class="space-y-2.5">
					<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.learningObjective', $language)}</p>
					<p class="break-words text-sm leading-relaxed text-slate-700">{paper.objective || '—'}</p>
					{#if paper.judgeBrief?.studentTask}
						<div class="rounded-[1rem] border border-slate-200 bg-slate-50/90 p-4">
							<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgeStudentTask', $language)}</p>
							<p class="mt-2 break-words text-sm leading-relaxed text-slate-700">{paper.judgeBrief.studentTask}</p>
						</div>
					{/if}
				</div>
				<div class="space-y-4">
					<div class="space-y-2">
						<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.skillFocus', $language)}</p>
						<p class="break-words text-sm leading-relaxed text-slate-700">{paper.targetSkill || '—'}</p>
					</div>
					{#if paper.practicePoints.length}
						<div class="space-y-2">
							<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.practicePoints', $language)}</p>
							<div class="flex flex-wrap gap-2">
								{#each paper.practicePoints as point}
									<span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">{point}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<section class="space-y-3 rounded-[1.4rem] border border-slate-300/70 bg-white/75 p-5">
			<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.whatHappened', $language)}</p>
			<p class="break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{paper.synopsis}</p>
		</section>

		<section class="space-y-3 rounded-[1.4rem] border border-slate-300/70 bg-white/75 p-5">
			<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.issueQuestion', $language)}</p>
			<p class="break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{paper.issues}</p>
		</section>

		<section class="space-y-4 rounded-[1.45rem] border border-slate-300/70 bg-white/80 p-5 sm:p-6">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.chooseSide', $language)}</p>
				<span class="inline-flex max-w-full break-all rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">{roleLabel(paper.selectedRole)}</span>
			</div>
			<p class="break-words text-sm leading-relaxed text-slate-700">{selectedSideText(paper)}</p>
			<div class="grid gap-4 lg:grid-cols-2">
				<section class="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-4">
					<p class="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{t('cases.plaintiffPosition', $language)}</p>
					<p class="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{paper.plaintiffPosition}</p>
				</section>
				<section class="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-4">
					<p class="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{t('cases.defendantPosition', $language)}</p>
					<p class="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{paper.defendantPosition}</p>
				</section>
			</div>
		</section>

		{#if paper.judgeBrief}
			<details class="paper-disclosure rounded-[1.5rem] border border-slate-300/70 bg-white/80" open={false}>
				<summary class="paper-disclosure__summary">
					<div class="min-w-0 space-y-1.5">
						<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgeBrief', $language)}</p>
						<p class="break-words text-sm leading-relaxed text-slate-700">{paper.judgeBrief.hearingFocus || paper.judgeBrief.goal || paper.judgeBrief.studentTask}</p>
					</div>
					<span class="paper-disclosure__icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d="m6 9 6 6 6-6" />
						</svg>
					</span>
				</summary>
				<div class="paper-disclosure__content">
					<div class="grid gap-6 lg:grid-cols-2">
						<div class="space-y-4 text-sm leading-relaxed text-slate-700">
							<div class="space-y-1.5">
								<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.learningObjective', $language)}</p>
								<p class="break-words">{paper.judgeBrief.goal}</p>
							</div>
							<div class="space-y-1.5">
								<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgeStudentTask', $language)}</p>
								<p class="break-words">{paper.judgeBrief.studentTask}</p>
							</div>
							<div class="space-y-1.5">
								<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgeHearingFocus', $language)}</p>
								<p class="break-words">{paper.judgeBrief.hearingFocus}</p>
							</div>
							{#if paper.difficultyTrap}
								<div class="space-y-1.5">
									<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.difficultyTrap', $language)}</p>
									<p class="break-words">{paper.difficultyTrap}</p>
								</div>
							{/if}
						</div>

						<div class="space-y-4 text-sm leading-relaxed text-slate-700">
							{#if paper.judgeBrief.issuesToProbe.length}
								<div class="space-y-2">
									<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgeIssuesToProbe', $language)}</p>
									<ul class="list-disc space-y-2 pl-5">
										{#each paper.judgeBrief.issuesToProbe as item}
											<li class="break-words">{item}</li>
										{/each}
									</ul>
								</div>
							{/if}
							{#if paper.judgeBrief.pressurePoints.length}
								<div class="space-y-2">
									<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgePressurePoints', $language)}</p>
									<ul class="list-disc space-y-2 pl-5">
										{#each paper.judgeBrief.pressurePoints as item}
											<li class="break-words">{item}</li>
										{/each}
									</ul>
								</div>
							{/if}
							{#if paper.judgeBrief.successCriteria.length}
								<div class="space-y-2">
									<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgeSuccessCriteria', $language)}</p>
									<ul class="list-disc space-y-2 pl-5">
										{#each paper.judgeBrief.successCriteria as item}
											<li class="break-words">{item}</li>
										{/each}
									</ul>
								</div>
							{/if}
							{#if paper.judgeBrief.sourceBoundaries.length}
								<div class="space-y-2">
									<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.judgeSourceBoundaries', $language)}</p>
									<ul class="list-disc space-y-2 pl-5">
										{#each paper.judgeBrief.sourceBoundaries as item}
											<li class="break-words">{item}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</details>
		{/if}

		{#if paper.groundingAudit && (paper.groundingAudit.warnings.length || paper.groundingAudit.blockedReasons.length || paper.groundingAudit.groundingMap.length)}
			<details class="paper-disclosure rounded-[1.5rem] border border-slate-300/70 bg-white/80" open={paper.groundingAudit.status === 'insufficient-sources'}>
				<summary class="paper-disclosure__summary">
					<div class="min-w-0 space-y-1.5">
						<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.groundingMap', $language)}</p>
						<p class="break-words text-sm leading-relaxed text-slate-700">{paper.groundingAudit.warnings.length || paper.groundingAudit.blockedReasons.length ? t('cases.auditWarnings', $language) : paper.groundingAudit.summary}</p>
					</div>
					<span class="paper-disclosure__icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d="m6 9 6 6 6-6" />
						</svg>
					</span>
				</summary>
				<div class="paper-disclosure__content space-y-5">
					{#if paper.groundingAudit.warnings.length || paper.groundingAudit.blockedReasons.length}
						<div class="space-y-2">
							<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('cases.auditWarnings', $language)}</p>
							<ul class="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
								{#each [...paper.groundingAudit.blockedReasons, ...paper.groundingAudit.warnings] as warning}
									<li class="break-words">{warning}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if paper.groundingAudit.groundingMap.length}
						<div class="grid gap-3">
							{#each paper.groundingAudit.groundingMap as item}
								<article class="rounded-[1.15rem] border border-slate-300/70 bg-slate-50 p-4">
									<div class="flex flex-wrap items-center gap-2">
										<span class="max-w-full break-all rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{groundingMapAreaLabel(item.area)}</span>
										<span class="break-all text-xs font-semibold text-slate-500">{item.sourceTitle}{item.citation ? ` · ${item.citation}` : ''}</span>
									</div>
									<p class="mt-2 break-words text-sm font-semibold leading-relaxed text-slate-800">{item.claim}</p>
									{#if item.excerpt}
										<blockquote class="mt-2 break-words border-l-2 border-slate-300 pl-3 text-sm leading-relaxed text-slate-600">{item.excerpt}</blockquote>
									{/if}
									{#if item.note}
										<p class="mt-2 break-words text-xs leading-relaxed text-slate-500">{item.note}</p>
									{/if}
								</article>
							{/each}
						</div>
					{/if}
				</div>
			</details>
		{/if}
	</div>
</section>

<style>
	.paper-disclosure {
		overflow: hidden;
	}

	.paper-disclosure summary {
		list-style: none;
	}

	.paper-disclosure summary::-webkit-details-marker {
		display: none;
	}

	.paper-disclosure__summary {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		cursor: pointer;
		padding: 1.25rem 1.4rem;
	}

	.paper-disclosure__content {
		border-top: 1px solid rgba(148, 163, 184, 0.2);
		padding: 0 1.4rem 1.4rem;
	}

	.paper-disclosure__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		flex: 0 0 auto;
		border-radius: 999px;
		border: 1px solid rgba(148, 163, 184, 0.28);
		background: rgba(255, 255, 255, 0.9);
		color: #475569;
		transition: transform 160ms ease;
	}

	.paper-disclosure__icon svg {
		width: 1rem;
		height: 1rem;
	}

	details[open] .paper-disclosure__icon {
		transform: rotate(180deg);
	}
</style>