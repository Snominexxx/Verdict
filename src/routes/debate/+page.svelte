<script lang="ts">
	import type { PageData } from './$types';
	import { debateStore, appendTurn, seedTranscript } from '$lib/stores/debate';
	import { stagedCaseStore, hydrateStagedCase, clearStagedCase } from '$lib/stores/stagedCase';
	import { legalPacksStore } from '$lib/stores/legalPacks';
	import type { LibraryDocument } from '$lib/data/library';
	import { jurorPersonas } from '$lib/data/jurors';
	import { judgePersona } from '$lib/data/judge';
	import type { DebateTurn, VerdictScore, StagedCase } from '$lib/types';
	import { fly } from 'svelte/transition';
	import { focusMode } from '$lib/stores/ui';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { get } from 'svelte/store';

	export let data: PageData;

	let prompt = '';
	let sending = false;
	let jurorScores: VerdictScore[] = [];
	let judgeMind: { assessment: string; concerns: string; leaning: string } | null = null;
	let stagedCase: StagedCase | null = null;
	let allowedSources: LibraryDocument[] = [];
	let focusArmed = false;
	let scoreModalOpen = false;
	let scoring = false;
	let scoreError = '';
	let scoreSummary = '';
	let endScores = {
		persuasion: 50,
		lawCited: 50,
		structure: 50,
		responsiveness: 50,
		factFidelity: 50,
		average: 50
	};

	const allJurorIds = jurorPersonas.map((juror) => juror.id);
	const scoreLabels = [
		{ key: 'persuasion', label: 'debate.metricPersuasion' },
		{ key: 'lawCited', label: 'debate.metricLawCited' },
		{ key: 'structure', label: 'debate.metricStructure' },
		{ key: 'responsiveness', label: 'debate.metricResponsiveness' },
		{ key: 'factFidelity', label: 'debate.metricFactFidelity' }
	] as const;

	onMount(() => {
		legalPacksStore.hydrate();
	});

	$: stagedCase = $stagedCaseStore;
	$: isBenchTrial = stagedCase?.courtType === 'bench';
	$: if (data?.stagedCase && !$stagedCaseStore) {
		hydrateStagedCase(data.stagedCase);
		seedTranscript(data.stagedCase);
	}
	$: allPackSources = $legalPacksStore.flatMap((pack) => pack.sources);
	$: activePack = stagedCase?.packId
		? $legalPacksStore.find((pack) => pack.id === stagedCase.packId) ?? null
		: null;
	$: allowedSources = stagedCase
		? activePack
			? (stagedCase.sources.length
				? activePack.sources.filter((doc) => stagedCase.sources.includes(doc.id))
				: activePack.sources)
			: allPackSources.filter((doc) => stagedCase.sources.includes(doc.id))
		: allPackSources;
	$: jurorScoreMap = Object.fromEntries(jurorScores.map((score) => [score.jurorId, score]));
	
	// Jury verdict summary
	$: plaintiffVotes = jurorScores.filter(s => s.stance === 'plaintiff').length;
	$: defenseVotes = jurorScores.filter(s => s.stance === 'defense').length;
	$: hungVotes = jurorScores.filter(s => s.stance === 'hung').length;
	$: avgScore = jurorScores.length ? Math.round(jurorScores.reduce((sum, s) => sum + s.score, 0) / jurorScores.length) : 0;
	$: verdictStatus = plaintiffVotes >= 3 ? t('debate.leaningPlaintiff', $language) : defenseVotes >= 3 ? t('debate.leaningDefense', $language) : jurorScores.length ? t('debate.splitJury', $language) : t('debate.awaitingArgs', $language);
	
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
					sources: allowedSources.map((source) => ({
						id: source.id,
						title: source.title,
						jurisdiction: source.jurisdiction,
						description: source.description
					})),
					language: $language
				})
			});
			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || 'Debate request failed.');
			}
			const data = await response.json();

			// Handle judge interjection (bench trial only)
			if (data.judgeInterjection) {
				const prefix = data.judgeInterjection.type
					? `[${data.judgeInterjection.type.toUpperCase()}] `
					: '';
				appendTurn({
					role: 'judge',
					speaker: data.judgeInterjection.speaker,
					message: `${prefix}${data.judgeInterjection.message}`,
					timestamp: data.judgeInterjection.timestamp
				});
			}

			appendTurn({
				...data.reply,
				timestamp: new Date().toISOString()
			});

			// Handle scores based on court type
			if (data.courtType === 'bench') {
				judgeMind = data.judgeMind ?? null;
				jurorScores = [];
			} else {
				jurorScores = data.jurorScores ?? [];
				judgeMind = null;
			}
		} catch (err) {
			console.error('Debate endpoint failed', err);
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			const fallbackSpeaker = isBenchTrial ? judgePersona.name : 'Advocate AI';
			appendTurn({
				role: isBenchTrial ? 'judge' : 'ai',
				speaker: fallbackSpeaker,
				message: `${t('debate.errorFallback', $language)} ${errorMsg}`,
				timestamp: new Date().toISOString()
			});
		} finally {
			sending = false;
			prompt = '';
		}
	};

	const restartDebate = () => {
		seedTranscript(stagedCase ?? undefined);
		jurorScores = [];
		judgeMind = null;
		prompt = '';
	};

	const leaveCourt = (finalize = false) => {
		if (!stagedCase) {
			focusMode.set(false);
			goto('/court');
			return;
		}

		if (finalize) {
			caseHistoryStore.markCaseFinished(stagedCase.id, {
				summary: scoreSummary || t('debate.scoreFallbackSummary', $language),
				scores: { ...endScores }
			});
		} else {
			caseHistoryStore.markCaseOngoing(stagedCase.id);
		}

		clearStagedCase();
		focusMode.set(false);
		goto('/court');
	};

	const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

	const tokenize = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((token) => token.length > 3);

	const keywordSet = (text: string) => {
		const stopWords = new Set(['with', 'that', 'this', 'from', 'have', 'will', 'your', 'about', 'their', 'there', 'would']);
		return new Set(tokenize(text).filter((token) => !stopWords.has(token)));
	};

	const computeResponsiveness = (transcript: DebateTurn[]) => {
		const ratios: number[] = [];
		for (let index = 1; index < transcript.length; index += 1) {
			const current = transcript[index];
			const previous = transcript[index - 1];
			if (current.role !== 'litigant' || previous.role === 'litigant') continue;

			const previousKeywords = keywordSet(previous.message);
			const currentKeywords = keywordSet(current.message);
			if (!previousKeywords.size || !currentKeywords.size) continue;

			let overlap = 0;
			for (const token of previousKeywords) {
				if (currentKeywords.has(token)) overlap += 1;
			}
			ratios.push(overlap / previousKeywords.size);
		}

		if (!ratios.length) return 40;
		const avgRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
		// Fair scale: 0% overlap → 25, 50% overlap → 55, full overlap → 85
		return clampScore(25 + avgRatio * 60);
	};

	const computeDeterministicScores = (transcript: DebateTurn[]) => {
		const litigantTurns = transcript.filter((turn) => turn.role === 'litigant');
		const combinedLitigantText = litigantTurns.map((turn) => turn.message).join(' ');

		const legalMentions = (combinedLitigantText.match(/\b(section|article|charter|act|code|statute|regulation|precedent|case|v\.)\b/gi) ?? []).length;
		const sourceMentions = allowedSources.reduce((count, source) => {
			const titleCore = source.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
			const words = titleCore.split(/\s+/).filter((word) => word.length > 4);
			if (!words.length) return count;
			return words.some((word) => combinedLitigantText.toLowerCase().includes(word)) ? count + 1 : count;
		}, 0);

		const connectors = (combinedLitigantText.match(/\b(because|therefore|however|first|second|third|thus|since|consequently|moreover|furthermore|accordingly)\b/gi) ?? []).length;
		const avgTurnLength = litigantTurns.length
			? litigantTurns.reduce((sum, turn) => sum + tokenize(turn.message).length, 0) / litigantTurns.length
			: 0;

		const caseAnchor = keywordSet(`${stagedCase?.synopsis ?? ''} ${stagedCase?.issues ?? ''} ${stagedCase?.remedy ?? ''}`);
		const litigantAnchor = keywordSet(combinedLitigantText);
		let anchorOverlap = 0;
		for (const token of caseAnchor) {
			if (litigantAnchor.has(token)) anchorOverlap += 1;
		}
		const fidelityBase = caseAnchor.size ? anchorOverlap / caseAnchor.size : 0.5;

		const jurySourcesMetric = jurorScores.length
			? jurorScores.reduce((sum, score) => sum + (score.metrics?.sources ?? 50), 0) / jurorScores.length
			: 0;
		const juryLogicMetric = jurorScores.length
			? jurorScores.reduce((sum, score) => sum + (score.metrics?.logic ?? 50), 0) / jurorScores.length
			: 0;

		// Bench mode: use judge signals instead of absent jury metrics
		const judgeLeaning = judgeMind?.leaning?.toLowerCase() ?? '';
		const judgeLeanScore = judgeLeaning.includes('undecided') ? 45
			: judgeLeaning.includes('plaintiff') && stagedCase?.role === 'plaintiff' ? 72
			: judgeLeaning.includes('defendant') && stagedCase?.role === 'defendant' ? 72
			: judgeLeaning.includes('plaintiff') || judgeLeaning.includes('defendant') ? 35
			: 45;
		const judgeConcernsLength = (judgeMind?.concerns ?? '').length;
		const judgeEngagement = Math.min(judgeConcernsLength / 4, 20);

		const persuasionBase = isBenchTrial
			? judgeLeanScore + judgeEngagement * 0.3
			: avgScore || 45;

		// Fair calibration: text signals start low, scale with real effort
		const textLegalScore = 15 + Math.min(legalMentions * 4, 40) + Math.min(sourceMentions * 8, 40);
		const lawCited = isBenchTrial
			? clampScore(textLegalScore)
			: clampScore(jurySourcesMetric * 0.5 + textLegalScore * 0.5);

		const textStructureScore = 25 + Math.min(connectors * 5, 30) + Math.min(avgTurnLength, 30);
		const structure = isBenchTrial
			? clampScore(textStructureScore)
			: clampScore(juryLogicMetric * 0.6 + textStructureScore * 0.4);

		const responsiveness = computeResponsiveness(transcript);
		// Fidelity: 0% overlap → 20, 50% → 50, 100% → 80
		const factFidelity = clampScore(20 + fidelityBase * 60);
		const persuasion = clampScore(persuasionBase);

		return { persuasion, lawCited, structure, responsiveness, factFidelity };
	};

	const evaluatePerformance = async () => {
		if (!stagedCase) return;
		scoreModalOpen = true;
		scoring = true;
		scoreError = '';

		const transcript = get(debateStore);
		const deterministic = computeDeterministicScores(transcript);

		try {
			const response = await fetch('/api/debate/score', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					case: stagedCase,
					transcript,
					sources: allowedSources,
					deterministic,
					language: $language
				})
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			const payload = await response.json();
			scoreSummary = payload.summary || t('debate.scoreFallbackSummary', $language);
			endScores = {
				persuasion: clampScore(payload.scores?.persuasion ?? deterministic.persuasion),
				lawCited: clampScore(payload.scores?.lawCited ?? deterministic.lawCited),
				structure: clampScore(payload.scores?.structure ?? deterministic.structure),
				responsiveness: clampScore(payload.scores?.responsiveness ?? deterministic.responsiveness),
				factFidelity: clampScore(payload.scores?.factFidelity ?? deterministic.factFidelity),
				average: clampScore(payload.scores?.average ?? ((deterministic.persuasion + deterministic.lawCited + deterministic.structure + deterministic.responsiveness + deterministic.factFidelity) / 5))
			};
		} catch (err) {
			console.error('Performance scoring failed', err);
			scoreError = err instanceof Error ? err.message : 'Scoring failed.';
			scoreSummary = t('debate.scoreFallbackSummary', $language);
			endScores = {
				...deterministic,
				average: clampScore((deterministic.persuasion + deterministic.lawCited + deterministic.structure + deterministic.responsiveness + deterministic.factFidelity) / 5)
			};
		} finally {
			scoring = false;
		}
	};

	const exitCourt = () => leaveCourt(false);
	const endCase = () => {
		void evaluatePerformance();
	};
	const keepPracticing = () => {
		scoreModalOpen = false;
	};
	const finalizeCaseFromModal = () => {
		scoreModalOpen = false;
		leaveCourt(true);
	};

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
			<p class="text-xs uppercase tracking-[0.2em] text-white/40">{t('debate.noCase', $language)}</p>
			<h2 class="text-xl font-display text-white">{t('debate.noCaseDesc', $language)}</h2>
			<a href="/cases" class="inline-block mt-4 px-6 py-2 border border-white/20 hover:bg-white/5 text-white text-xs font-mono uppercase transition rounded-sm">
				{t('debate.launchBuilder', $language)}
			</a>
		</div>
	</div>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] h-[calc(100vh-3.5rem)] overflow-hidden min-h-0">
		<!-- Left: Case Context -->
		<aside class="hidden lg:flex flex-col border-r border-white/10 bg-black/20 overflow-hidden min-h-0">
			<div class="p-5 border-b border-white/5">
				<p class="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-2">{t('debate.activeCase', $language)}</p>
				<h2 class="text-lg font-display text-white leading-tight">{stagedCase.title}</h2>
				<div class="flex items-center gap-2 mt-3 text-xs font-mono text-white/50">
					<span class={stagedCase.role === 'plaintiff' ? 'text-flare' : 'text-white/50'}>{t('debate.pl', $language)}</span>
					<span class="text-white/20">{t('debate.vs', $language)}</span>
					<span class={stagedCase.role === 'defendant' ? 'text-flare' : 'text-white/50'}>{t('debate.df', $language)}</span>
				</div>
			</div>
			
			<div class="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide min-h-0">
				<div>
					<p class="text-[10px] uppercase tracking-[0.1em] text-white/30 mb-2 font-mono">{t('debate.synopsis', $language)}</p>
					<p class="text-xs text-white/70 leading-relaxed font-light">{stagedCase.synopsis}</p>
				</div>
				<div>
					<p class="text-[10px] uppercase tracking-[0.1em] text-white/30 mb-2 font-mono">{t('debate.issues', $language)}</p>
					<p class="text-xs text-white/70 leading-relaxed font-light">{stagedCase.issues || t('debate.na', $language)}</p>
				</div>
				<div>
					<p class="text-[10px] uppercase tracking-[0.1em] text-white/30 mb-2 font-mono">{t('debate.sources', $language)}</p>
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
					{t('debate.exitCourt', $language)}
				</button>
				<button
					type="button"
					on:click={endCase}
					class="w-full py-2 text-[10px] uppercase tracking-widest text-white/70 hover:text-flare transition flex items-center justify-center gap-2 border border-flare/40 hover:border-flare rounded-sm"
				>
					{t('debate.endCase', $language)}
				</button>
				<button on:click={restartDebate} class="w-full py-2 text-[10px] uppercase tracking-widest text-white/40 hover:text-flare transition flex items-center justify-center gap-2 hover:bg-white/5 rounded-sm">
					{t('debate.resetSim', $language)}
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
							{isBenchTrial ? judgePersona.name : 'Advocate AI'}
							<span class="opacity-50 mx-1">/</span>
							<span class="font-mono opacity-40">{t('debate.thinking', $language)}</span>
						</p>
						<div class="p-5 text-base leading-relaxed border border-white/10 text-white/80 bg-black/30 rounded-t-lg rounded-br-lg w-full max-w-xl">
							<div class="flex items-center gap-2">
								<span class="w-2 h-2 rounded-full bg-white/40 animate-pulse"></span>
								<span class="text-white/70 font-mono text-sm">
									{isBenchTrial ? t('debate.reviewingBench', $language) : t('debate.formulatingJury', $language)}
								</span>
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
						placeholder={t('debate.inputPlaceholder', $language)}
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

		<!-- Right: Judge or Juror Panel -->
		<aside class="hidden lg:flex flex-col border-l border-white/10 bg-black/20 overflow-hidden min-h-0">
			<div class="p-5 border-b border-white/5">
				<div class="flex items-center justify-between mb-3">
					<div>
						<p class="text-xs uppercase tracking-[0.2em] text-white/50">{t('debate.panel', $language)}</p>
						<h2 class="text-base font-display text-white mt-1">{isBenchTrial ? t('debate.judgeLabel', $language) : t('debate.juryLabel', $language)}</h2>
					</div>
					<div class="flex gap-1">
						{#if isBenchTrial}
							<div class="w-2 h-4 rounded-full bg-white/10"></div>
						{:else}
							{#each jurorPersonas as juror, i}
								{@const jurorScore = jurorScoreMap[juror.id]}
								<div class={`w-2 h-4 rounded-full transition-colors ${
									jurorScore?.stance === 'plaintiff' ? 'bg-flare' :
									jurorScore?.stance === 'defense' ? 'bg-pulse' :
									jurorScore ? 'bg-white/30' : 'bg-white/10'
								}`}></div>
							{/each}
						{/if}
					</div>
				</div>
				
				{#if !isBenchTrial && jurorScores.length > 0}
					<div class="bg-black/30 rounded-md p-3 border border-white/5">
						<div class="flex justify-between items-center">
							<div>
								<p class={`text-sm font-semibold ${
									plaintiffVotes >= 3 ? 'text-flare' : 
									defenseVotes >= 3 ? 'text-pulse' : 'text-white/70'
								}`}>{verdictStatus}</p>
								<p class="text-[10px] text-white/40 mt-0.5">
									{plaintiffVotes} {t('debate.plaintiffLabel', $language)} · {defenseVotes} {t('debate.defenseLabel', $language)} · {hungVotes} {t('debate.undecided', $language)}
								</p>
							</div>
							<div class="text-right">
								<p class={`text-xl font-mono font-bold ${getScoreColor(avgScore)}`}>{avgScore}%</p>
								<p class="text-[9px] text-white/40 uppercase">{t('debate.avgScore', $language)}</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide min-h-0">
				{#if isBenchTrial}
					<!-- Judge Mind (Bench Trial) -->
					<div class="group border border-white/10 bg-white/[0.03] p-5 rounded-md transition-all">
						<div class="mb-3">
							<h3 class="text-base font-semibold text-white">{judgePersona.name}</h3>
							<p class="text-xs text-white/50 mt-1">{t('debate.judgeMindTitle', $language)}</p>
						</div>
						
						{#if judgeMind}
							<div class="space-y-3 border-t border-white/10 pt-3">
								<div>
									<p class="text-[10px] uppercase tracking-wider text-white/40 mb-1">{t('debate.assessment', $language)}</p>
									<p class="text-sm text-white/90 leading-relaxed">{judgeMind.assessment}</p>
								</div>
								<div>
									<p class="text-[10px] uppercase tracking-wider text-white/40 mb-1">{t('debate.concerns', $language)}</p>
									<p class="text-sm text-white/80 leading-relaxed">{judgeMind.concerns}</p>
								</div>
								<div>
									<p class="text-[10px] uppercase tracking-wider text-white/40 mb-1">{t('debate.leaning', $language)}</p>
									<p class="text-sm text-white/80 leading-relaxed">{judgeMind.leaning}</p>
								</div>
							</div>
						{:else}
							<p class="text-xs text-white/50 italic border-t border-white/5 pt-3">{t('debate.listening', $language)}</p>
						{/if}
					</div>
				{:else}
					<!-- Juror Panel (Jury Trial) -->
					{#each jurorPersonas as juror}
						{@const score = jurorScoreMap[juror.id]}
						{@const stanceColor = score?.stance === 'plaintiff' ? 'border-l-flare' : score?.stance === 'defense' ? 'border-l-pulse' : 'border-l-white/20'}
						<div class={`group border border-white/5 hover:border-white/10 bg-white/[0.02] p-4 rounded-md transition-all ${score ? `border-l-2 ${stanceColor}` : ''}`}>
							<div class="flex justify-between items-start mb-2">
								<div>
									<h3 class="text-sm font-semibold text-white">{juror.name}</h3>
									<p class="text-xs text-white/50 mt-0.5">{juror.temperament}</p>
								</div>
								{#if score}
									<div class="text-right">
										<span class={`text-lg font-mono font-bold ${getScoreColor(score.score)}`}>
											{score.score}%
										</span>
										<p class={`text-[9px] uppercase tracking-wider mt-0.5 ${
											score.stance === 'plaintiff' ? 'text-flare' : 
											score.stance === 'defense' ? 'text-pulse' : 'text-white/40'
										}`}>
											{score.stance === 'plaintiff' ? t('debate.stancePlaintiff', $language) : score.stance === 'defense' ? t('debate.stanceDefense', $language) : t('debate.stanceUndecided', $language)}
										</p>
									</div>
								{:else}
									<span class="w-2 h-2 rounded-full bg-white/10 mt-1"></span>
								{/if}
							</div>
							
							{#if score}
								<p class="text-sm text-white/80 leading-relaxed border-t border-white/5 pt-2 mt-2 italic">
									"{score.rationale}"
								</p>
								<div class="grid grid-cols-3 gap-2 mt-3">
									<div class="text-center bg-black/30 py-2 rounded border border-white/5">
										<p class="text-[9px] text-white/40 uppercase tracking-wide">{t('debate.logic', $language)}</p>
										<p class={`text-sm font-mono font-semibold ${getScoreColor(score.metrics?.logic ?? 50)}`}>{Math.round(score.metrics?.logic ?? 0)}</p>
									</div>
									<div class="text-center bg-black/30 py-2 rounded border border-white/5">
										<p class="text-[9px] text-white/40 uppercase tracking-wide">{t('debate.evidence', $language)}</p>
										<p class={`text-sm font-mono font-semibold ${getScoreColor(score.metrics?.sources ?? 50)}`}>{Math.round(score.metrics?.sources ?? 0)}</p>
									</div>
									<div class="text-center bg-black/30 py-2 rounded border border-white/5">
										<p class="text-[9px] text-white/40 uppercase tracking-wide">{t('debate.tone', $language)}</p>
										<p class={`text-sm font-mono font-semibold ${getScoreColor(score.metrics?.tone ?? 50)}`}>{Math.round(score.metrics?.tone ?? 0)}</p>
									</div>
								</div>
							{:else}
								<p class="text-xs text-white/40 italic">{t('debate.jurorListening', $language)}</p>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</aside>
	</div>
{/if}

{#if scoreModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={(event) => {
			if (event.target === event.currentTarget && !scoring) keepPracticing();
		}}
		on:keydown={(event) => {
			if (event.key === 'Escape' && !scoring) keepPracticing();
		}}
	>
		<div class="w-full max-w-3xl bg-ink border border-white/15 rounded-2xl p-6 space-y-5">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="text-xl font-display text-white">{t('debate.performanceTitle', $language)}</h3>
					<p class="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1">{stagedCase?.title}</p>
				</div>
				{#if !scoring}
					<button type="button" class="text-white/60 hover:text-white" on:click={keepPracticing}>×</button>
				{/if}
			</div>

			{#if scoring}
				<div class="border border-white/10 rounded-xl p-5 bg-white/[0.02]">
					<p class="text-sm text-white/70">{t('debate.scoringNow', $language)}</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
					<div class="border border-white/15 rounded-xl p-4 bg-white/[0.04] flex flex-col justify-between">
						<p class="text-[10px] uppercase tracking-widest text-white/50">{t('debate.metricAverage', $language)}</p>
						<p class={`text-4xl font-mono font-bold mt-3 ${getScoreColor(endScores.average)}`}>{endScores.average}%</p>
					</div>

					<div class="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
						<p class="text-sm text-white/80 leading-relaxed">{scoreSummary}</p>
					</div>
				</div>

				<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
					{#each scoreLabels as metric}
						<div class="border border-white/15 rounded-xl p-4 bg-white/[0.03] min-h-[108px] flex flex-col justify-between">
							<p class="text-[10px] uppercase tracking-widest text-white/50">{t(metric.label, $language)}</p>
							<p class={`text-2xl font-mono font-bold mt-2 ${getScoreColor(endScores[metric.key])}`}>{endScores[metric.key]}%</p>
						</div>
					{/each}
				</div>

				{#if scoreError}
					<p class="text-xs text-flare">{scoreError}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-1">
					<button type="button" on:click={keepPracticing} class="px-4 py-2 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white/70">{t('debate.keepPracticing', $language)}</button>
					<button type="button" on:click={finalizeCaseFromModal} class="px-4 py-2 bg-white text-ink rounded text-xs font-bold uppercase tracking-widest">{t('debate.closeCase', $language)}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
