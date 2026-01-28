<script lang="ts">
	import type { PageData } from './$types';
	import { debateStore, appendTurn, seedTranscript } from '$lib/stores/debate';
	import { stagedCaseStore, hydrateStagedCase, clearStagedCase } from '$lib/stores/stagedCase';
	import { jurorPersonas } from '$lib/data/jurors';
	import { libraryDocuments } from '$lib/data/library';
	import type { DebateTurn, VerdictScore, StagedCase } from '$lib/types';
	import { fly } from 'svelte/transition';
	import { focusMode } from '$lib/stores/ui';
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { caseHistoryStore } from '$lib/stores/caseHistory';

	export let data: PageData;

	let prompt = '';
	let sending = false;
	let jurorScores: VerdictScore[] = [];
	let stagedCase: StagedCase | null = null;
	let allowedSources = libraryDocuments;
	let focusArmed = false;

	const allJurorIds = jurorPersonas.map((juror) => juror.id);

	$: stagedCase = $stagedCaseStore;
	$: if (data?.stagedCase && !$stagedCaseStore) {
		hydrateStagedCase(data.stagedCase);
		seedTranscript(data.stagedCase);
	}
	$: allowedSources = stagedCase
		? libraryDocuments.filter((doc) => stagedCase.sources.includes(doc.id))
		: libraryDocuments;
	$: jurorScoreMap = Object.fromEntries(jurorScores.map((score) => [score.jurorId, score]));
	$: if (stagedCase && !focusArmed) {
		focusMode.set(true);
		focusArmed = true;
	} else if (!stagedCase && focusArmed) {
		focusMode.set(false);
		focusArmed = false;
	}

	const submitPrompt = async () => {
		if (!prompt.trim() || !stagedCase) return;
		sending = true;
		const now = new Date().toISOString();
		const litigatorTurn: DebateTurn = {
			role: 'litigant',
			speaker: 'You',
			message: prompt.trim(),
			timestamp: now
		};
		appendTurn(litigatorTurn);

		try {
			const response = await fetch('/api/debate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt,
					selectedJurors: allJurorIds,
					case: stagedCase,
					sources: allowedSources
				})
			});
			const data = await response.json();
			appendTurn({
				...data.reply,
				timestamp: new Date().toISOString()
			});
			jurorScores = data.jurorScores ?? [];
		} catch (error) {
			console.error('Debate endpoint failed', error);
		} finally {
			sending = false;
			prompt = '';
		}
	};

	const restartDebate = () => {
		seedTranscript(stagedCase ?? undefined);
		jurorScores = [];
		prompt = '';
	};

	const leaveCourt = (finalize = false) => {
		if (!stagedCase) {
			focusMode.set(false);
			goto('/court');
			return;
		}

		if (finalize) {
			caseHistoryStore.markCaseFinished(stagedCase.id);
		} else {
			caseHistoryStore.markCaseOngoing(stagedCase.id);
		}

		clearStagedCase();
		focusMode.set(false);
		goto('/court');
	};

	const exitCourt = () => leaveCourt(false);
	const endCase = () => leaveCourt(true);

	const formatMetric = (value?: number) => `${Math.round(value ?? 50)}%`;
	
	const getScoreColor = (score: number) => {
		if (score > 60) return 'text-flare';
		if (score < 40) return 'text-pulse';
		return 'text-white/60';
	};

	onDestroy(() => {
		focusMode.set(false);
		focusArmed = false;
	});
</script>

{#if !stagedCase}
	<div class="h-full flex items-center justify-center p-8">
		<div class="text-center space-y-4 max-w-md">
			<div class="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center mx-auto text-2xl mb-6">∅</div>
			<p class="text-xs uppercase tracking-[0.2em] text-white/40">No Active Case</p>
			<h2 class="text-xl font-display text-white">Initialize a case to enter the arena.</h2>
			<a href="/cases" class="inline-block mt-4 px-6 py-2 border border-white/20 hover:bg-white/5 text-white text-xs font-mono uppercase transition rounded-sm">
				Launch Case Builder
			</a>
		</div>
	</div>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] h-[calc(100vh-3.5rem)] overflow-hidden min-h-0">
		<!-- Left: Case Context -->
		<aside class="hidden lg:flex flex-col border-r border-white/10 bg-black/20 overflow-hidden min-h-0">
			<div class="p-5 border-b border-white/5">
				<p class="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-2">Active Case</p>
				<h2 class="text-lg font-display text-white leading-tight">{stagedCase.title}</h2>
				<div class="flex items-center gap-2 mt-3 text-xs font-mono text-white/50">
					<span class={stagedCase.role === 'plaintiff' ? 'text-flare' : 'text-white/50'}>PL</span>
					<span class="text-white/20">vs</span>
					<span class={stagedCase.role === 'defendant' ? 'text-flare' : 'text-white/50'}>DF</span>
				</div>
			</div>
			
			<div class="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide min-h-0">
				<div>
					<p class="text-[10px] uppercase tracking-[0.1em] text-white/30 mb-2 font-mono">Synopsis</p>
					<p class="text-xs text-white/70 leading-relaxed font-light">{stagedCase.synopsis}</p>
				</div>
				<div>
					<p class="text-[10px] uppercase tracking-[0.1em] text-white/30 mb-2 font-mono">Issues</p>
					<p class="text-xs text-white/70 leading-relaxed font-light">{stagedCase.issues || 'N/A'}</p>
				</div>
				<div>
					<p class="text-[10px] uppercase tracking-[0.1em] text-white/30 mb-2 font-mono">Sources</p>
					<div class="flex flex-wrap gap-2">
						{#each allowedSources as source}
							<div class="px-2 py-1 border border-white/10 rounded-sm text-[10px] text-white/50 bg-white/5 truncate max-w-full">
								{source.title}
							</div>
						{/each}
					</div>
				</div>
			</div>
			
			<div class="p-4 border-t border-white/5 space-y-2">
				<button
					type="button"
					on:click={exitCourt}
					class="w-full py-2 text-[10px] uppercase tracking-widest text-white/70 hover:text-white transition flex items-center justify-center gap-2 border border-white/15 hover:border-white/40 rounded-sm"
				>
					<span class="text-base">⟵</span> Exit Court
				</button>
				<button
					type="button"
					on:click={endCase}
					class="w-full py-2 text-[10px] uppercase tracking-widest text-white/70 hover:text-flare transition flex items-center justify-center gap-2 border border-flare/40 hover:border-flare rounded-sm"
				>
					<span class="text-base">✕</span> End Case
				</button>
				<button on:click={restartDebate} class="w-full py-2 text-[10px] uppercase tracking-widest text-white/40 hover:text-flare transition flex items-center justify-center gap-2 hover:bg-white/5 rounded-sm">
					<span class="text-lg">↺</span> Reset Simulation
				</button>
			</div>
		</aside>

		<!-- Middle: Transcript & Input -->
		<main class="flex flex-col relative bg-transparent min-h-0">
			<div class="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin min-h-0">
				{#each $debateStore as turn}
					<div class={`flex flex-col max-w-2xl ${turn.role === 'litigant' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
						in:fly={{ y: 10, duration: 300 }}>
						<p class="text-xs uppercase tracking-widest text-white/50 mb-1 px-1">
							{turn.speaker} <span class="opacity-50 mx-1">/</span> <span class="font-mono opacity-40">{new Date(turn.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
						</p>
						<div class={`p-5 text-base leading-relaxed border backdrop-blur-sm ${
							turn.role === 'litigant'
								? 'bg-white/5 border-white/20 text-white rounded-t-lg rounded-bl-lg'
								: 'bg-black/40 border-white/10 text-white rounded-t-lg rounded-br-lg'
						}`}>
							{turn.message}
						</div>
						{#if turn.citations?.length}
							<div class="mt-2 flex gap-2 flex-wrap justify-end">
								{#each turn.citations as cite}
									<span class="text-[10px] px-2 py-0.5 border border-white/10 rounded-full text-white/40 bg-black/20 font-mono">{cite}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				{#if sending}
					<div class="flex flex-col max-w-2xl mr-auto items-start" in:fly={{ y: 10, duration: 200 }}>
						<p class="text-xs uppercase tracking-widest text-white/50 mb-1 px-1">
							Advocate AI <span class="opacity-50 mx-1">/</span> <span class="font-mono opacity-40">thinking…</span>
						</p>
						<div class="p-5 text-base leading-relaxed border border-white/10 text-white/80 bg-black/30 rounded-t-lg rounded-br-lg w-full max-w-xl">
							<div class="flex items-center gap-2">
								<span class="w-2 h-2 rounded-full bg-white/40 animate-pulse"></span>
								<span class="text-white/70 font-mono text-sm">Formulating counter-argument…</span>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Input Area -->
			<div class="p-4 border-t border-white/10 bg-[#05030b]/80 backdrop-blur-md">
				<form class="relative" on:submit|preventDefault={submitPrompt}>
					<textarea
						bind:value={prompt}
						class="w-full bg-[#0a0814] border border-white/10 rounded-lg p-4 text-base text-white focus:outline-none focus:border-flare/50 focus:ring-1 focus:ring-flare/50 transition-all min-h-[100px] pr-20 font-mono resize-none"
						placeholder="Enter your argument..."
						on:keydown={(e) => { if((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitPrompt(); }}
					></textarea>
					<div class="absolute bottom-3 right-3 flex items-center gap-2">
						<span class="text-xs text-white/40 font-mono hidden sm:inline-block">CTRL+ENTER</span>
						<button
							type="submit"
							aria-label="Send Message"
							class="p-2 rounded-md bg-white text-ink hover:bg-white/90 hover:text-black transition disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={sending || !prompt.trim()}
						>
							<svg class="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M12 19V5m-7 7l7-7 7 7"></path></svg>
						</button>
					</div>
				</form>
			</div>
		</main>

		<!-- Right: Juror Intelligence -->
		<aside class="hidden lg:flex flex-col border-l border-white/10 bg-black/20 overflow-hidden min-h-0">
			<div class="p-5 border-b border-white/5 flex items-center justify-between">
				<div>
					<p class="text-xs uppercase tracking-[0.2em] text-white/50">Panel</p>
					<h2 class="text-base font-display text-white mt-1">Juror Analysis</h2>
				</div>
				<div class="flex gap-1">
					{#each [1,2,3,4,5] as i}
						<div class={`w-1 h-3 rounded-full ${jurorScores.length ? 'bg-flare' : 'bg-white/10'}`}></div>
					{/each}
				</div>
			</div>

			<div class="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide min-h-0">
				{#each jurorPersonas as juror}
					{@const score = jurorScoreMap[juror.id]}
					<div class="group border border-white/5 hover:border-white/10 bg-white/[0.02] p-4 rounded-md transition-all">
						<div class="flex justify-between items-start mb-2">
							<div>
								<h3 class="text-sm font-semibold text-white">{juror.name}</h3>
								<p class="text-xs text-white/60 uppercase tracking-wider mt-0.5">{juror.temperament}</p>
							</div>
							{#if score}
								<span class={`text-base font-mono font-bold ${getScoreColor(score.score)}`}>
									{score.score}%
								</span>
							{:else}
								<span class="w-2 h-2 rounded-full bg-white/10 mt-1"></span>
							{/if}
						</div>
						
						{#if score}
							<p class="text-sm text-white/90 leading-relaxed border-t border-white/5 pt-2 mt-2">
								{score.rationale}
							</p>
							<div class="grid grid-cols-3 gap-1 mt-3">
								<div class="text-[10px] text-white/50 text-center bg-black/20 py-1 rounded">
									LOGIC <br/> <span class="text-white font-mono">{Math.round(score.metrics?.logic ?? 0)}</span>
								</div>
								<div class="text-[10px] text-white/50 text-center bg-black/20 py-1 rounded">
									SRC <br/> <span class="text-white font-mono">{Math.round(score.metrics?.sources ?? 0)}</span>
								</div>
								<div class="text-[10px] text-white/50 text-center bg-black/20 py-1 rounded">
									TONE <br/> <span class="text-white font-mono">{Math.round(score.metrics?.tone ?? 0)}</span>
								</div>
							</div>
						{:else}
							<p class="text-xs text-white/50 italic">Waiting for connection...</p>
						{/if}
					</div>
				{/each}
			</div>
		</aside>
	</div>
{/if}
