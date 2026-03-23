<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { caseHistoryStore, type CaseHistoryEntry } from '$lib/stores/caseHistory';
	import { stageCase } from '$lib/stores/stagedCase';
	import type { StagedCase } from '$lib/types';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';

	onMount(() => {
		caseHistoryStore.hydrateCaseHistory();
	});

	const roleCopy: Record<string, Record<string, string>> = {
		plaintiff: { en: 'Plaintiff / Appellant', fr: 'Demandeur / Appelant' },
		defendant: { en: 'Defendant / Respondent', fr: 'Défendeur / Intimé' }
	};

	const toStagedCase = (entry: CaseHistoryEntry): StagedCase => {
		const { status: _status, startedAt: _startedAt, updatedAt: _updatedAt, performance: _performance, ...record } = entry;
		return record as StagedCase;
	};

	const resumeCase = (entry: CaseHistoryEntry) => {
		const record = toStagedCase(entry);
		stageCase(record);
		caseHistoryStore.markCaseOngoing(entry.id);
		goto('/debate');
	};

	const finalizeCase = (id: string) => {
		caseHistoryStore.markCaseFinished(id);
	};

	const deleteCase = (id: string) => {
		caseHistoryStore.removeCase(id);
	};

	const formatRelativeTime = (timestamp?: string) => {
		if (!timestamp) return t('court.momentsAgo', $language);
		const diff = Date.now() - new Date(timestamp).getTime();
		const minutes = Math.max(Math.round(diff / 60000), 0);
		if (minutes < 1) return t('court.momentsAgo', $language);
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
		const days = Math.round(hours / 24);
		return `${days} day${days === 1 ? '' : 's'} ago`;
	};

	const formatDate = (timestamp?: string) => {
		if (!timestamp) return '—';
		return new Date(timestamp).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	const summarize = (text?: string, limit = 220) => {
		if (!text) return '—';
		return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
	};

	$: caseHistory = $caseHistoryStore ?? [];
	$: ongoingCases = caseHistory.filter((entry) => entry.status === 'ongoing');
	$: finishedCases = caseHistory.filter((entry) => entry.status === 'finished');
	$: hasHistory = caseHistory.length > 0;
</script>

<div class="h-full flex flex-col text-white">
	<!-- Header -->
	<header class="border-b border-white/15 bg-black/20 px-6 py-4 flex items-center justify-between">
		<div>
			<h2 class="text-lg font-bold uppercase tracking-wider text-white">{t('court.hub', $language)}</h2>
			<p class="text-sm text-white/60 mt-0.5">{t('court.description', $language)}</p>
		</div>
		<div class="flex gap-3 items-center">
			<div class="flex gap-4 text-xs font-mono uppercase text-white/70">
				<span>{t('court.ongoing', $language)}: <strong class="text-white">{ongoingCases.length}</strong></span>
				<span>{t('court.finished', $language)}: <strong class="text-white">{finishedCases.length}</strong></span>
			</div>
			<a href="/cases" class="px-4 py-2 bg-white text-black text-sm font-bold uppercase tracking-widest rounded hover:bg-white/90 transition">
				{t('court.stageNew', $language)}
			</a>
			<a href="/library" class="px-4 py-2 border border-white/30 text-sm font-bold uppercase tracking-widest rounded text-white/90 hover:bg-white/10 transition">
				{t('court.refineSources', $language)}
			</a>
		</div>
	</header>

	<section class="flex-1 overflow-y-auto px-6 py-6 space-y-8">
		<!-- Ongoing -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<div class="flex items-baseline gap-3">
					<h3 class="text-sm font-bold uppercase tracking-widest text-white/70">{t('court.ongoingCases', $language)}</h3>
				</div>
				{#if ongoingCases.length}
					<p class="text-xs text-white/50 font-mono">{t('court.lastUpdated', $language)} {formatRelativeTime(ongoingCases[0]?.updatedAt)}</p>
				{/if}
			</div>

			{#if ongoingCases.length === 0}
				<div class="border border-dashed border-white/20 rounded-lg p-5 text-center text-white/50">
					<p class="text-sm">{t('court.emptyOngoing', $language)}</p>
				</div>
			{:else}
				<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{#each ongoingCases as entry (entry.id)}
						<article class="border border-white/15 bg-white/[0.05] rounded-xl p-4 flex flex-col gap-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-xs uppercase tracking-[0.2em] text-white/50">{roleCopy[entry.role]?.[$language] ?? t('court.litigant', $language)}</p>
									<h4 class="text-sm font-semibold leading-snug mt-0.5 truncate">{entry.title}</h4>
								</div>
								<span class="text-[9px] uppercase tracking-wider text-amber-300 border border-amber-300/30 rounded-full px-2 py-0.5 whitespace-nowrap">{t('court.ongoingBadge', $language)}</span>
							</div>
							<p class="text-sm text-white/70 leading-relaxed line-clamp-2">{summarize(entry.synopsis, 140)}</p>
							<div class="flex gap-2 text-xs text-white/60 font-mono">
								<span class="px-2 py-1 border border-white/10 rounded bg-black/20 truncate flex-1">{entry.issues || '—'}</span>
								<span class="px-2 py-1 border border-white/10 rounded bg-black/20 whitespace-nowrap">{formatRelativeTime(entry.updatedAt)}</span>
							</div>
							<div class="flex gap-2">
								<button type="button" on:click={() => resumeCase(entry)} class="flex-1 text-center bg-white text-black py-2 rounded text-sm font-bold uppercase tracking-widest hover:bg-white/90 transition">
									{t('court.reenter', $language)}
								</button>
								<button type="button" on:click={() => finalizeCase(entry.id)} class="flex-1 text-center border border-white/25 py-2 rounded text-sm font-bold uppercase tracking-widest text-white/80 hover:text-white hover:border-flare/50 transition">
									{t('court.markFinished', $language)}
								</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Finished -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<div class="flex items-baseline gap-3">
					<h3 class="text-sm font-bold uppercase tracking-widest text-white/70">{t('court.finishedCases', $language)}</h3>
				</div>
				{#if finishedCases.length}
					<p class="text-xs text-white/50 font-mono">{t('court.lastClosure', $language)} {formatRelativeTime(finishedCases[0]?.updatedAt)}</p>
				{/if}
			</div>

			{#if finishedCases.length === 0}
				<div class="border border-dashed border-white/20 rounded-lg p-5 text-center text-white/50">
					<p class="text-sm">{t('court.emptyFinished', $language)}</p>
				</div>
			{:else}
				<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{#each finishedCases as entry (entry.id)}
						<article class="border border-white/10 bg-black/20 rounded-xl p-4 flex flex-col gap-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-xs uppercase tracking-[0.2em] text-white/50">{roleCopy[entry.role]?.[$language] ?? t('court.litigant', $language)}</p>
									<h4 class="text-sm font-semibold leading-snug mt-0.5 truncate">{entry.title}</h4>
								</div>
								<span class="text-[9px] uppercase tracking-wider text-white/50 border border-white/15 rounded-full px-2 py-0.5 whitespace-nowrap">{t('court.finishedBadge', $language)}</span>
							</div>
							<p class="text-sm text-white/70 leading-relaxed line-clamp-2">{summarize(entry.synopsis, 140)}</p>
							{#if entry.performance}
								<div class="border border-white/15 rounded-lg p-3 bg-white/[0.04] space-y-2">
									<div class="flex items-center justify-between">
										<p class="text-xs uppercase tracking-[0.2em] text-white/50">{t('court.performance', $language)}</p>
										<p class="text-base font-mono font-bold text-white">{entry.performance.scores.average}%</p>
									</div>
									<p class="text-xs text-white/70 leading-relaxed line-clamp-2">{entry.performance.summary}</p>
									<div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs font-mono">
										<div class="p-1.5 border border-white/15 rounded bg-black/25 text-center">
											<p class="text-white/50 truncate">{t('debate.metricPersuasion', $language)}</p>
											<p class="text-white/90 font-bold">{entry.performance.scores.persuasion}%</p>
										</div>
										<div class="p-1.5 border border-white/15 rounded bg-black/25 text-center">
											<p class="text-white/50 truncate">{t('debate.metricLawCited', $language)}</p>
											<p class="text-white/90 font-bold">{entry.performance.scores.lawCited}%</p>
										</div>
										<div class="p-1.5 border border-white/15 rounded bg-black/25 text-center">
											<p class="text-white/50 truncate">{t('debate.metricStructure', $language)}</p>
											<p class="text-white/90 font-bold">{entry.performance.scores.structure}%</p>
										</div>
										<div class="p-1.5 border border-white/15 rounded bg-black/25 text-center">
											<p class="text-white/50 truncate">{t('debate.metricResponsiveness', $language)}</p>
											<p class="text-white/90 font-bold">{entry.performance.scores.responsiveness}%</p>
										</div>
										<div class="p-1.5 border border-white/15 rounded bg-black/25 text-center">
											<p class="text-white/50 truncate">{t('debate.metricFactFidelity', $language)}</p>
											<p class="text-white/90 font-bold">{entry.performance.scores.factFidelity}%</p>
										</div>
									</div>
								</div>
							{:else}
								<div class="border border-dashed border-white/20 rounded-lg p-3 bg-black/15">
									<p class="text-xs text-white/60">{t('court.noScoreRecorded', $language)}</p>
								</div>
							{/if}
							<div class="flex gap-2 text-[10px] text-white/50 font-mono">
								<span class="px-2 py-1 border border-white/10 rounded flex-1">{t('court.opened', $language)}: {formatDate(entry.startedAt)}</span>
								<span class="px-2 py-1 border border-white/10 rounded flex-1">{t('court.closed', $language)}: {formatDate(entry.updatedAt)}</span>
							</div>
							<div class="flex gap-2">
								<button type="button" on:click={() => resumeCase(entry)} class="flex-1 text-center border border-white/15 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest text-white/70 hover:text-black hover:bg-white transition">
									{t('court.reopen', $language)}
								</button>
								<button type="button" on:click={() => deleteCase(entry.id)} class="flex-1 text-center border border-white/10 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white hover:border-pulse/60 transition">
									{t('court.removeDossier', $language)}
								</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	{#if !hasHistory}
		<div class="px-6 pb-8 text-white/40 text-xs font-mono">
			{t('court.footer', $language)}
		</div>
	{/if}
</div>
