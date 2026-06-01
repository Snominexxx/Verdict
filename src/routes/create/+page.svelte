<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { legalPacksStore, selectedLegalPackId } from '$lib/stores/legalPacks';
	import { dossierStore } from '$lib/stores/dossier';
	import { focusMode } from '$lib/stores/ui';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import type { CaseDossier, CreateChatMessage, JudgeTurn } from '$lib/verdict/contracts';
	type Phase = 'create' | 'hearing';

	let phase = $state<Phase>('create');
	let selectedSourceIds = $state<string[]>([]);
	let building = $state(false);
	let errorMessage = $state('');
	let dossier = $state<CaseDossier | null>(null);
	let dossierOpen = $state(false);
	let showSettings = $state(false);

	// Studio chat state
	let chatMessages = $state<CreateChatMessage[]>([]);
	let chatInput = $state('');
	let chatThinking = $state(false);
	let readyToBuild = $state(false);
	let buildRequest = $state('');
	let chatLogEl = $state<HTMLDivElement | null>(null);

	// Hearing state
	let submission = $state('');
	let thinking = $state(false);
	let hearingLogEl = $state<HTMLDivElement | null>(null);
	let caseViewOpen = $state(false);

	const scrollHearing = async () => {
		await tick();
		if (hearingLogEl) hearingLogEl.scrollTop = hearingLogEl.scrollHeight;
	};

	onMount(() => {
		legalPacksStore.hydrate();
		selectedLegalPackId.hydrate();
		dossierStore.hydrate();
	});

	// Always release the immersive hearing layout when leaving the page.
	onDestroy(() => {
		focusMode.set(false);
	});

	const selectedPack = $derived(
		$legalPacksStore.find((pack) => pack.id === $selectedLegalPackId) ?? null
	);

	const selectedSources = $derived(
		selectedPack ? selectedPack.sources.filter((s) => selectedSourceIds.includes(s.id)) : []
	);

	// Default to all sources in the pack whenever the pack changes.
	$effect(() => {
		const pack = selectedPack;
		if (pack) selectedSourceIds = pack.sources.map((s) => s.id);
		else selectedSourceIds = [];
	});

	const scrollChat = async () => {
		await tick();
		if (chatLogEl) chatLogEl.scrollTop = chatLogEl.scrollHeight;
	};

	const sendChat = async () => {
		errorMessage = '';
		const text = chatInput.trim();
		if (!text || chatThinking) return;
		if (!selectedSourceIds.length) {
			errorMessage = t('v2.noSources', $language);
			return;
		}
		chatInput = '';
		chatMessages = [...chatMessages, { role: 'user', content: text }];
		chatThinking = true;
		void scrollChat();
		try {
			const res = await fetch('/api/verdict/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: chatMessages,
					sourceIds: selectedSourceIds,
					packId: selectedPack?.id,
					sourceTitles: selectedSources.map((s) => s.title),
					language: $language
				})
			});
			if (!res.ok) throw new Error(`chat failed: ${res.status}`);
			const data = await res.json();
			const result = data.result as {
				reply: string;
				readyToBuild: boolean;
				buildRequest: string;
			};
			chatMessages = [...chatMessages, { role: 'assistant', content: result.reply }];
			readyToBuild = result.readyToBuild;
			buildRequest = result.buildRequest;
			void scrollChat();
		} catch (err) {
			console.error(err);
			errorMessage = t('v2.error', $language);
		} finally {
			chatThinking = false;
		}
	};

	const build = async () => {
		errorMessage = '';
		const requestText = (buildRequest || chatInput).trim()
			|| [...chatMessages].reverse().find((m) => m.role === 'user')?.content?.trim()
			|| '';
		if (!requestText) {
			errorMessage = t('v2.emptyRequest', $language);
			return;
		}
		if (!selectedSourceIds.length) {
			errorMessage = t('v2.noSources', $language);
			return;
		}
		building = true;
		dossier = null;
		try {
			const res = await fetch('/api/verdict/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					request: requestText,
					sourceIds: selectedSourceIds,
					packId: selectedPack?.id
				})
			});
			if (!res.ok) throw new Error(`create failed: ${res.status}`);
			const data = await res.json();
			dossier = data.dossier as CaseDossier;
			dossierOpen = true;
			void scrollChat();
		} catch (err) {
			console.error(err);
			errorMessage = t('v2.error', $language);
		} finally {
			building = false;
		}
	};

	const onChatKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendChat();
		}
	};

	const enterHearing = () => {
		if (!dossier) return;
		dossierOpen = false;
		dossierStore.start(dossier);
		submission = '';
		phase = 'hearing';
		focusMode.set(true);
	};

	const leaveHearing = () => {
		focusMode.set(false);
		caseViewOpen = false;
		goto('/');
	};

	const newCase = () => {
		dossierStore.clear();
		focusMode.set(false);
		caseViewOpen = false;
		dossier = null;
		dossierOpen = false;
		chatMessages = [];
		chatInput = '';
		readyToBuild = false;
		buildRequest = '';
		showSettings = false;
		phase = 'create';
	};

	const submit = async () => {
		const state = $dossierStore;
		if (!state.dossier || !submission.trim() || thinking) return;
		const text = submission.trim();
		submission = '';
		dossierStore.addTurn({ role: 'litigant', speaker: t('v2.you', $language), message: text });
		thinking = true;
		void scrollHearing();
		try {
			const res = await fetch('/api/verdict/judge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					dossier: state.dossier,
					transcript: state.transcript,
					userTurn: text
				})
			});
			if (!res.ok) throw new Error(`judge failed: ${res.status}`);
			const data = await res.json();
			const turn = data.turn as JudgeTurn;
			dossierStore.addTurn({ role: 'judge', speaker: turn.speaker, message: turn.message });
			if (turn.mind) dossierStore.setMind(turn.mind);
			void scrollHearing();
		} catch (err) {
			console.error(err);
			dossierStore.addTurn({
				role: 'judge',
				speaker: $language === 'fr' ? 'La Cour' : 'The Court',
				message: t('v2.error', $language)
			});
		} finally {
			thinking = false;
		}
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	};
</script>

{#if phase === 'create'}
	<div class="mx-auto max-w-4xl px-6 py-10">
		{#if $legalPacksStore.length === 0}
			<header class="mb-6">
				<h1 class="font-display text-2xl font-semibold text-white">{t('v2.title', $language)}</h1>
			</header>
			<p class="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
				{t('v2.noPacks', $language)}
			</p>
		{:else}
			<!-- Minimal header: pack picker only (document icon, top-right) -->
			<header class="relative mb-4 flex items-center justify-end">
				<button
					type="button"
					class="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10"
					onclick={() => (showSettings = !showSettings)}
					title={t('v2.pack', $language)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<path d="M14 2v6h6" />
					</svg>
					<span class="max-w-[160px] truncate">{selectedPack?.name ?? t('v2.pack', $language)}</span>
				</button>

				{#if showSettings}
					<div class="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-white/10 bg-dusk p-4 shadow-card">
						<label for="v2-pack" class="font-mono text-xs uppercase tracking-wide text-white/40">
							{t('v2.pack', $language)}
						</label>
						<select
							id="v2-pack"
							class="mt-1 w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white"
							value={$selectedLegalPackId ?? ''}
							onchange={(e) => selectedLegalPackId.select((e.target as HTMLSelectElement).value)}
						>
							<option class="bg-dusk text-white" value="" disabled>—</option>
							{#each $legalPacksStore as pack (pack.id)}
								<option class="bg-dusk text-white" value={pack.id}>{pack.name}</option>
							{/each}
						</select>
					</div>
				{/if}
			</header>

			<!-- Conversation (plain, like a familiar chat — no card border) -->
			<div bind:this={chatLogEl} class="no-scrollbar mb-4 h-[52vh] space-y-5 overflow-y-auto px-1">
				{#if chatMessages.length === 0}
					<div class="flex h-full items-center justify-center px-6 text-center">
						<p class="text-base text-white/40">{t('v2.chatIntro', $language)}</p>
					</div>
				{/if}
				{#each chatMessages as msg, i (i)}
					<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div
							class="max-w-[85%] whitespace-pre-wrap text-base leading-7 {msg.role === 'user'
								? 'rounded-2xl bg-white/10 px-4 py-3 text-white'
								: 'text-white/90'}"
						>
							{msg.content}
						</div>
					</div>
				{/each}
				{#if chatThinking}
					<div class="flex justify-start">
						<p class="text-[15px] italic text-white/40">{t('v2.chatThinking', $language)}</p>
					</div>
				{/if}

				<!-- Built case appears inline as a clickable artifact -->
				{#if dossier}
					<div class="flex justify-start">
						<button
							type="button"
							onclick={() => (dossierOpen = true)}
							class="group flex w-full max-w-[85%] items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-left transition hover:border-white/30 hover:bg-white/[0.07]"
						>
							<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5">
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
									<path d="M14 2v6h6" />
									<path d="M9 13h6" />
									<path d="M9 17h6" />
								</svg>
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium text-white">{dossier.title}</span>
								<span class="block text-xs text-white/45">{t('v2.openCase', $language)}</span>
							</span>
						</button>
					</div>
				{/if}

				<!-- Ready-to-build affordance, attached to the conversation -->
				{#if readyToBuild && !dossier}
					<div class="flex justify-start">
						<button
							type="button"
							onclick={build}
							disabled={building}
							class="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-accent-hover disabled:opacity-40"
						>
							{#if building}
								{t('v2.building', $language)}
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
									<path d="m5 12 5 5L20 7" />
								</svg>
								{t('v2.buildNow', $language)}
							{/if}
						</button>
					</div>
				{/if}
			</div>

			{#if errorMessage}
				<p class="mb-2 text-sm text-red-300">{errorMessage}</p>
			{/if}

			<!-- Composer: single rounded box, like ChatGPT/Claude -->
			<div class="flex items-end gap-2 rounded-3xl border border-white/15 bg-white/[0.05] px-5 py-3 focus-within:border-white/30">
				<textarea
					rows="2"
					bind:value={chatInput}
					onkeydown={onChatKeydown}
					placeholder={t('v2.chatPlaceholder', $language)}
					class="flex-1 resize-none bg-transparent px-2 py-1.5 text-[17px] leading-7 text-white placeholder-white/30 focus:outline-none"
				></textarea>
				<button
					type="button"
					onclick={sendChat}
					disabled={chatThinking || !chatInput.trim()}
					aria-label={t('v2.send', $language)}
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90 disabled:opacity-30"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
						<path d="M12 19V5" />
						<path d="m5 12 7-7 7 7" />
					</svg>
				</button>
			</div>
		{/if}

		<!-- Dossier reader — opens from the in-chat artifact -->
		{#if dossier && dossierOpen}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
				role="presentation"
				onclick={(e) => { if (e.target === e.currentTarget) dossierOpen = false; }}
			>
				<section class="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-dusk p-6 shadow-card">
					<div class="flex items-start justify-between gap-4">
						<h2 class="font-display text-xl font-semibold text-white">{dossier.title}</h2>
						<button
							type="button"
							onclick={() => (dossierOpen = false)}
							aria-label={t('v2.close', $language)}
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
								<path d="M18 6 6 18" /><path d="m6 6 12 12" />
							</svg>
						</button>
					</div>

					<span
						class="mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium {dossier.grounded
							? 'bg-emerald-500/15 text-emerald-300'
							: 'bg-amber-500/15 text-amber-300'}"
					>
						{dossier.grounded ? t('v2.grounded', $language) : t('v2.notGrounded', $language)}
					</span>

				<dl class="mt-4 space-y-4 text-sm">
					<!-- Your side + the goal you'll be tested on in the hearing -->
					<div class="rounded-lg border border-accent/25 bg-accent/10 p-3">
						<dt class="font-mono text-xs uppercase tracking-wide text-accent">{t('v2.yourSide', $language)}</dt>
						<dd class="mt-1 font-medium text-white">
							{dossier.selectedRole === 'plaintiff' ? t('v2.plaintiff', $language) : t('v2.defendant', $language)}
						</dd>
						{#if dossier.objective}
							<dt class="mt-3 font-mono text-xs uppercase tracking-wide text-accent">{t('v2.objective', $language)}</dt>
							<dd class="mt-1 text-white/85">{dossier.objective}</dd>
						{/if}
					</div>
					<div>
						<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.facts', $language)}</dt>
						<dd class="mt-1 whitespace-pre-wrap text-white/80">{dossier.facts}</dd>
					</div>
					{#if dossier.issues.length}
						<div>
							<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.issues', $language)}</dt>
							<dd class="mt-1"><ul class="list-disc pl-5 text-white/80">
								{#each dossier.issues as issue}<li>{issue}</li>{/each}
							</ul></dd>
						</div>
					{/if}
					{#if dossier.remedySought}
						<div>
							<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.remedy', $language)}</dt>
							<dd class="mt-1 text-white/80">{dossier.remedySought}</dd>
						</div>
					{/if}
					{#if dossier.citationsUsed.length}
						<div>
							<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.citations', $language)}</dt>
							<dd class="mt-1 flex flex-wrap gap-1.5">
								{#each dossier.citationsUsed as c}
									<span class="rounded bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent">{c.text}</span>
								{/each}
							</dd>
						</div>
					{/if}
					{#if dossier.sourceBoundaries.length}
						<div>
							<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.boundaries', $language)}</dt>
							<dd class="mt-1"><ul class="list-disc pl-5 text-white/70">
								{#each dossier.sourceBoundaries as b}<li>{b}</li>{/each}
							</ul></dd>
						</div>
					{/if}
					{#if dossier.warnings.length}
						<div class="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
							<dt class="font-mono text-xs uppercase tracking-wide text-amber-300">{t('v2.warnings', $language)}</dt>
							<dd class="mt-1"><ul class="list-disc pl-5 text-amber-200">
								{#each dossier.warnings as w}<li>{w}</li>{/each}
							</ul></dd>
						</div>
					{/if}
				</dl>

				<button
					type="button"
					onclick={enterHearing}
					class="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-accent-hover"
				>
					{t('v2.enterHearing', $language)}
				</button>
			</section>
			</div>
		{/if}
	</div>
{:else if $dossierStore.dossier}
	<!-- Hearing — immersive chat with a live "judge's mind" sidebar -->
	<div class="flex h-full">
		<!-- Conversation column -->
		<div class="flex h-full min-w-0 flex-1 flex-col">
			<header class="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-3">
				<div class="min-w-0">
					<h1 class="font-display text-lg font-semibold text-white">{t('v2.hearing', $language)}</h1>
					<p class="truncate text-xs text-white/55">{$dossierStore.dossier.title}</p>
				</div>
				<button type="button" onclick={leaveHearing} class="flex shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/5">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
						<path d="m16 17 5-5-5-5" />
						<path d="M21 12H9" />
					</svg>
					{t('v2.leaveHearing', $language)}
				</button>
			</header>

			<!-- Scrollable transcript -->
			<div bind:this={hearingLogEl} class="thin-scrollbar mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-y-auto px-6 py-6">
				{#if $dossierStore.transcript.length === 0}
					<div class="flex h-full items-center justify-center px-6 text-center">
						<p class="text-base text-white/40">{t('v2.openingPrompt', $language)}</p>
					</div>
				{/if}
				{#each $dossierStore.transcript as entry, i (i)}
					<div class="flex {entry.role === 'litigant' ? 'justify-end' : 'justify-start'}">
						<div class="flex max-w-[82%] flex-col {entry.role === 'litigant' ? 'items-end' : 'items-start'}">
							<p class="mb-1.5 font-mono text-[11px] uppercase tracking-wide {entry.role === 'judge' ? 'text-accent' : 'text-white/40'}">{entry.speaker}</p>
							<div
								class="whitespace-pre-wrap break-words text-left text-[17px] leading-8 {entry.role === 'litigant'
									? 'rounded-2xl bg-white/10 px-5 py-3.5 text-white'
									: 'rounded-2xl border border-accent/20 bg-accent/[0.07] px-5 py-3.5 text-white/90'}"
							>
								{entry.message}
							</div>
						</div>
					</div>
				{/each}
				{#if thinking}
					<div class="flex justify-start">
						<p class="text-[17px] italic text-white/40">{t('v2.thinking', $language)}</p>
					</div>
				{/if}
			</div>

			<!-- Static composer at the bottom -->
			<div class="shrink-0 border-t border-white/10 px-6 py-4">
				<div class="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-white/15 bg-white/[0.05] px-5 py-3 focus-within:border-white/30">
					<textarea
						rows="3"
						bind:value={submission}
						onkeydown={onKeydown}
						placeholder={t('v2.submitPlaceholder', $language)}
						class="thin-scrollbar max-h-[35vh] flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-[17px] leading-8 text-white placeholder-white/30 focus:outline-none"
					></textarea>
					<button
						type="button"
						onclick={submit}
						disabled={thinking || !submission.trim()}
						aria-label={t('v2.submit', $language)}
						class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90 disabled:opacity-30"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
							<path d="M12 19V5" />
							<path d="m5 12 7-7 7 7" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Judge's mind sidebar -->
		<aside class="no-scrollbar hidden h-full w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-white/[0.02] px-5 py-6 lg:block">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4 text-accent">
						<path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4 2.5 5.3.7.7 1.5 1.4 1.5 2.7v1h6v-1c0-1.3.8-2 1.5-2.7C17.8 13 19 11.4 19 9a7 7 0 0 0-7-7Z" />
						<path d="M9 21h6" />
					</svg>
					<h2 class="font-display text-sm font-semibold text-white">{t('v2.judgeMind', $language)}</h2>
				</div>
				{#if $dossierStore.dossier}
					<button
						type="button"
						onclick={() => (caseViewOpen = true)}
						title={t('v2.viewCase', $language)}
						aria-label={t('v2.viewCase', $language)}
						class="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<path d="M14 2v6h6" />
							<path d="M9 13h6" />
							<path d="M9 17h6" />
						</svg>
					</button>
				{/if}
			</div>
			<p class="mt-1 text-xs text-white/45">{t('v2.judgeMindHint', $language)}</p>

			{#if $dossierStore.mind}
				{@const mind = $dossierStore.mind}
				<!-- Lean meter -->
				<div class="mt-6">
					<div class="flex items-center justify-between text-[11px] font-mono uppercase tracking-wide text-white/40">
						<span class={mind.lean === 'plaintiff' ? 'text-accent' : ''}>{t('v2.plaintiff', $language)}</span>
						<span class={mind.lean === 'defendant' ? 'text-accent' : ''}>{t('v2.defendant', $language)}</span>
					</div>
					<div class="relative mt-2 h-2 rounded-full bg-white/10">
						<!-- center marker -->
						<div class="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-white/20"></div>
						<div
							class="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-ink bg-accent shadow transition-all duration-500"
							style="left: calc({mind.lean === 'undecided' ? 50 : mind.lean === 'plaintiff' ? 50 - mind.leanConfidence / 2 : 50 + mind.leanConfidence / 2}% - 7px)"
						></div>
					</div>
					<p class="mt-2 text-xs text-white/55">
						{mind.lean === 'undecided'
							? t('v2.leanUndecided', $language)
							: `${mind.lean === 'plaintiff' ? t('v2.plaintiff', $language) : t('v2.defendant', $language)} · ${mind.leanConfidence}%`}
					</p>
				</div>

				<!-- Persuasion -->
				<div class="mt-6">
					<div class="flex items-center justify-between text-[11px] font-mono uppercase tracking-wide text-white/40">
						<span>{t('v2.persuasion', $language)}</span>
						<span class="text-white/70">{mind.persuasion}%</span>
					</div>
					<div class="mt-2 h-2 rounded-full bg-white/10">
						<div
							class="h-2 rounded-full bg-accent transition-all duration-500"
							style="width: {mind.persuasion}%"
						></div>
					</div>
				</div>

				{#if mind.thoughts}
					<div class="mt-6">
						<p class="font-mono text-[11px] uppercase tracking-wide text-white/40">{t('v2.thoughts', $language)}</p>
						<p class="mt-1.5 text-sm leading-relaxed text-white/80">{mind.thoughts}</p>
					</div>
				{/if}

				{#if mind.citationAssessment}
					<div class="mt-5">
						<p class="font-mono text-[11px] uppercase tracking-wide text-white/40">{t('v2.citationCheck', $language)}</p>
						<p class="mt-1.5 text-sm leading-relaxed text-white/80">{mind.citationAssessment}</p>
					</div>
				{/if}

				{#if mind.nextChallenge}
					<div class="mt-5 rounded-lg border border-accent/25 bg-accent/[0.08] p-3">
						<p class="font-mono text-[11px] uppercase tracking-wide text-accent">{t('v2.nextChallenge', $language)}</p>
						<p class="mt-1.5 text-sm leading-relaxed text-white/85">{mind.nextChallenge}</p>
					</div>
				{/if}
			{:else}
				<p class="mt-8 text-sm text-white/40">{t('v2.mindEmpty', $language)}</p>
			{/if}
		</aside>
	</div>

	<!-- Case file reader — opened from the bench sidebar during the hearing -->
	{#if caseViewOpen && $dossierStore.dossier}
		{@const c = $dossierStore.dossier}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
			role="presentation"
			onclick={(e) => { if (e.target === e.currentTarget) caseViewOpen = false; }}
		>
			<section class="no-scrollbar relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-dusk p-6 shadow-card">
				<div class="flex items-start justify-between gap-4">
					<h2 class="font-display text-xl font-semibold text-white">{c.title}</h2>
					<button
						type="button"
						onclick={() => (caseViewOpen = false)}
						aria-label={t('v2.close', $language)}
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
							<path d="M18 6 6 18" /><path d="m6 6 12 12" />
						</svg>
					</button>
				</div>

				<dl class="mt-4 space-y-4 text-sm">
					<div class="rounded-lg border border-accent/25 bg-accent/10 p-3">
						<dt class="font-mono text-xs uppercase tracking-wide text-accent">{t('v2.yourSide', $language)}</dt>
						<dd class="mt-1 font-medium text-white">
							{c.selectedRole === 'plaintiff' ? t('v2.plaintiff', $language) : t('v2.defendant', $language)}
						</dd>
						{#if c.objective}
							<dt class="mt-3 font-mono text-xs uppercase tracking-wide text-accent">{t('v2.objective', $language)}</dt>
							<dd class="mt-1 text-white/85">{c.objective}</dd>
						{/if}
					</div>
					<div>
						<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.facts', $language)}</dt>
						<dd class="mt-1 whitespace-pre-wrap text-white/80">{c.facts}</dd>
					</div>
					{#if c.issues.length}
						<div>
							<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.issues', $language)}</dt>
							<dd class="mt-1"><ul class="list-disc pl-5 text-white/80">
								{#each c.issues as issue}<li>{issue}</li>{/each}
							</ul></dd>
						</div>
					{/if}
					{#if c.remedySought}
						<div>
							<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.remedy', $language)}</dt>
							<dd class="mt-1 text-white/80">{c.remedySought}</dd>
						</div>
					{/if}
					{#if c.citationsUsed.length}
						<div>
							<dt class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.citations', $language)}</dt>
							<dd class="mt-1 flex flex-wrap gap-1.5">
								{#each c.citationsUsed as cit}
									<span class="rounded bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent">{cit.text}</span>
								{/each}
							</dd>
						</div>
					{/if}
				</dl>
			</section>
		</div>
	{/if}
{:else}
	<div class="mx-auto max-w-3xl px-6 py-10">
		<p class="text-sm text-white/60">{t('v2.subtitle', $language)}</p>
		<button type="button" onclick={newCase} class="mt-4 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90">
			{t('v2.newCase', $language)}
		</button>
	</div>
{/if}