<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { caseHistoryStore, type CaseHistoryEntry } from '$lib/stores/caseHistory';
	import { stageCase } from '$lib/stores/stagedCase';
	import { seedTranscript } from '$lib/stores/debate';
	import type { StagedCase } from '$lib/types';

	onMount(() => {
		caseHistoryStore.hydrateCaseHistory();
	});

	const roleCopy: Record<string, string> = {
		plaintiff: 'Plaintiff / Appellant',
		defendant: 'Defendant / Respondent'
	};

	const toStagedCase = (entry: CaseHistoryEntry): StagedCase => {
		const { status: _status, startedAt: _startedAt, updatedAt: _updatedAt, ...record } = entry;
		return record as StagedCase;
	};

	const resumeCase = (entry: CaseHistoryEntry) => {
		const record = toStagedCase(entry);
		stageCase(record);
		seedTranscript(record);
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
		if (!timestamp) return 'moments ago';
		const diff = Date.now() - new Date(timestamp).getTime();
		const minutes = Math.max(Math.round(diff / 60000), 0);
		if (minutes < 1) return 'moments ago';
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

<div class="h-full flex flex-col bg-gradient-to-b from-[#05010c] via-[#070214] to-[#080517] text-white">
	<section class="px-6 sm:px-10 py-8 border-b border-white/10 bg-white/5">
		<div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
			<div class="space-y-3 max-w-3xl">
				<p class="text-[10px] uppercase tracking-[0.3em] text-white/40">Chambers Overview</p>
				<h1 class="text-3xl sm:text-4xl font-display leading-tight">Court Hub</h1>
				<p class="text-sm text-white/60 max-w-2xl">
					Review every dispute staged inside Verdict. Ongoing matters live on the left; finished rulings are preserved for later study.
				</p>
			</div>
			<div class="flex gap-4 text-xs font-mono uppercase">
				<div class="px-4 py-3 border border-white/15 rounded-lg bg-white/5 shadow-md shadow-black/40">
					<p class="text-white/40">Ongoing</p>
					<p class="text-2xl font-bold text-white">{ongoingCases.length}</p>
				</div>
				<div class="px-4 py-3 border border-white/15 rounded-lg bg-white/5 shadow-md shadow-black/40">
					<p class="text-white/40">Finished</p>
					<p class="text-2xl font-bold text-white">{finishedCases.length}</p>
				</div>
			</div>
		</div>
		<div class="mt-6 flex flex-col sm:flex-row gap-3">
			<a href="/cases" class="flex-1 text-center border border-white/20 bg-white text-black px-4 py-3 text-xs font-bold tracking-widest uppercase rounded-md hover:bg-white/90 transition">
				Stage New Case
			</a>
			<a href="/library" class="flex-1 text-center border border-white/20 bg-white/5 px-4 py-3 text-xs font-bold tracking-widest uppercase rounded-md hover:bg-white/10 transition text-white">
				Refine Library Sources
			</a>
		</div>
	</section>

	<section class="flex-1 overflow-y-auto px-6 sm:px-10 py-10 space-y-12">
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-[10px] uppercase tracking-[0.3em] text-white/40">Active Dockets</p>
					<h2 class="text-xl font-display">Ongoing Cases</h2>
				</div>
				{#if ongoingCases.length}
					<p class="text-xs text-white/50">Last updated {formatRelativeTime(ongoingCases[0]?.updatedAt)}</p>
				{/if}
			</div>

			{#if ongoingCases.length === 0}
				<div class="border border-dashed border-white/20 rounded-xl p-8 text-center text-white/50">
					<p class="text-sm">No active cases yet. Stage a dispute to enter oral argument.</p>
				</div>
			{:else}
				<div class="grid gap-6 lg:grid-cols-2">
					{#each ongoingCases as entry (entry.id)}
						<article class="border border-white/10 bg-white/[0.04] rounded-2xl p-6 flex flex-col gap-4 shadow-xl shadow-black/30">
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="text-[10px] uppercase tracking-[0.3em] text-white/40">{roleCopy[entry.role] ?? 'Litigant'}</p>
									<h3 class="text-lg font-semibold leading-tight mt-1">{entry.title}</h3>
								</div>
								<span class="text-[10px] uppercase tracking-[0.3em] text-amber-300 border border-amber-300/40 rounded-full px-3 py-1">Ongoing</span>
							</div>
							<p class="text-sm text-white/70 leading-relaxed">{summarize(entry.synopsis)}</p>
							<div class="grid grid-cols-2 gap-3 text-[11px] text-white/60 font-mono">
								<div class="p-3 border border-white/10 rounded-lg bg-black/30">
									<p class="text-white/40 uppercase tracking-[0.3em] mb-1">Issues</p>
									<p class="text-white/70 leading-snug">{entry.issues || '—'}</p>
								</div>
								<div class="p-3 border border-white/10 rounded-lg bg-black/30">
									<p class="text-white/40 uppercase tracking-[0.3em] mb-1">Last Activity</p>
									<p>{formatRelativeTime(entry.updatedAt)}</p>
								</div>
							</div>
							<div class="flex flex-col sm:flex-row gap-3">
								<button type="button" on:click={() => resumeCase(entry)} class="flex-1 text-center bg-white text-black py-2.5 rounded-md text-xs font-bold uppercase tracking-widest hover:bg-white/90 transition">
									Re-enter Court
								</button>
								<button type="button" on:click={() => finalizeCase(entry.id)} class="flex-1 text-center border border-white/20 py-2.5 rounded-md text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white hover:border-flare/50 transition">
									Mark Finished
								</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>

		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-[10px] uppercase tracking-[0.3em] text-white/40">Closed Matters</p>
					<h2 class="text-xl font-display">Finished Cases</h2>
				</div>
				{#if finishedCases.length}
					<p class="text-xs text-white/50">Last closure {formatRelativeTime(finishedCases[0]?.updatedAt)}</p>
				{/if}
			</div>

			{#if finishedCases.length === 0}
				<div class="border border-dashed border-white/20 rounded-xl p-8 text-center text-white/50">
					<p class="text-sm">Once you end a case, the dossier will be archived here.</p>
				</div>
			{:else}
				<div class="grid gap-6 lg:grid-cols-2">
					{#each finishedCases as entry (entry.id)}
						<article class="border border-white/5 bg-black/30 rounded-2xl p-6 flex flex-col gap-4">
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="text-[10px] uppercase tracking-[0.3em] text-white/40">{roleCopy[entry.role] ?? 'Litigant'}</p>
									<h3 class="text-lg font-semibold leading-tight mt-1">{entry.title}</h3>
								</div>
								<span class="text-[10px] uppercase tracking-[0.3em] text-white/60 border border-white/20 rounded-full px-3 py-1">Finished</span>
							</div>
							<p class="text-sm text-white/70 leading-relaxed">{summarize(entry.synopsis)}</p>
							<div class="grid grid-cols-2 gap-3 text-[11px] text-white/60 font-mono">
								<div class="p-3 border border-white/10 rounded-lg">
									<p class="text-white/40 uppercase tracking-[0.3em] mb-1">Opened</p>
									<p>{formatDate(entry.startedAt)}</p>
								</div>
								<div class="p-3 border border-white/10 rounded-lg">
									<p class="text-white/40 uppercase tracking-[0.3em] mb-1">Closed</p>
									<p>{formatDate(entry.updatedAt)}</p>
								</div>
							</div>
							<div class="flex flex-col sm:flex-row gap-3">
								<button type="button" on:click={() => resumeCase(entry)} class="flex-1 text-center border border-white/20 py-2.5 rounded-md text-xs font-bold uppercase tracking-widest text-white/80 hover:text-black hover:bg-white transition">
									Reopen Case
								</button>
								<button type="button" on:click={() => deleteCase(entry.id)} class="flex-1 text-center border border-white/10 py-2.5 rounded-md text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white hover:border-pulse/60 transition">
									Remove Dossier
								</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	{#if !hasHistory}
		<div class="px-6 sm:px-10 pb-12 text-white/40 text-xs font-mono">
			SYSTEM // Ready for first filing
		</div>
	{/if}
</div>
