<script lang="ts">
	import { onMount } from 'svelte';
	import type { LibraryDocument } from '$lib/data/library';
	import { legalPacksStore, selectedLegalPackId, type LegalPack } from '$lib/stores/legalPacks';
	import { language } from '$lib/stores/language';
	import { indexingSourceIds, indexingProgress, markIndexing, markIndexed, updateProgress } from '$lib/stores/indexing';
	import { t } from '$lib/i18n';

	let selectedDoc: LibraryDocument | null = null;
	let content = '';
	let loading = false;
	let error: string | null = null;
	let readerOpen = false;

	let packModalOpen = false;
	let editingPackId = '';
	let packName = '';
	let packJurisdiction = '';
	let packDomain = '';
	let packDescription = '';

	let sourceModalOpen = false;
	let helpModalOpen = false;
	let ingesting = false;
	let sourceTitle = '';
	let sourceDescription = '';
	let sourceFile: File | null = null;
	let sourceError: string | null = null;
	let previewDoc: LibraryDocument | null = null;

	onMount(() => {
		legalPacksStore.hydrate();
		selectedLegalPackId.hydrate();
		checkPendingIndexing();
	});

	/** On page load, check for sources with un-embedded chunks and auto-resume. */
	const checkPendingIndexing = async () => {
		try {
			const res = await fetch('/api/library/pending');
			if (!res.ok) return;
			const { sourceIds } = await res.json() as { sourceIds: string[] };
			for (const sid of sourceIds) {
				if (!$indexingSourceIds.has(sid)) {
					markIndexing(sid);
					runBatchEmbedding(sid, 0);
				}
			}
		} catch { /* silent */ }
	};

	$: packs = $legalPacksStore;
	$: selectedPack = packs.find((p) => p.id === $selectedLegalPackId) ?? packs[0] ?? null;
	$: if (selectedPack && !$selectedLegalPackId) {
		selectedLegalPackId.select(selectedPack.id);
	}

	const selectPack = (packId: string) => {
		selectedLegalPackId.select(packId);
		selectedDoc = null;
		readerOpen = false;
	};

	const openCreatePack = () => {
		editingPackId = '';
		packName = '';
		packJurisdiction = '';
		packDomain = '';
		packDescription = '';
		packModalOpen = true;
	};

	const openEditPack = (pack: LegalPack) => {
		editingPackId = pack.id;
		packName = pack.name;
		packJurisdiction = pack.jurisdiction;
		packDomain = pack.domain;
		packDescription = pack.description;
		packModalOpen = true;
	};

	const closePackModal = () => {
		packModalOpen = false;
	};

	const savePack = () => {
		if (!packName.trim()) return;

		if (editingPackId) {
			legalPacksStore.updatePack(editingPackId, {
				name: packName.trim(),
				jurisdiction: packJurisdiction.trim() || 'Other',
				domain: packDomain.trim() || 'General',
				description: packDescription.trim()
			});
		} else {
			legalPacksStore.createPack({
				name: packName.trim(),
				jurisdiction: packJurisdiction.trim() || 'Other',
				domain: packDomain.trim() || 'General',
				description: packDescription.trim(),
				sources: []
			});
		}

		closePackModal();
	};

	const removePack = (pack: LegalPack) => {
		legalPacksStore.deletePack(pack.id);
	};

	const openSourceModal = () => {
		ingesting = false;
		sourceTitle = '';
		sourceDescription = '';
		sourceFile = null;
		sourceError = null;
		previewDoc = null;
		sourceModalOpen = true;
	};

	const closeSourceModal = () => {
		sourceModalOpen = false;
	};

	const prepareUploadSource = async () => {
		sourceError = null;
		previewDoc = null;
		if (!sourceFile) {
			sourceError = t('library.fileRequired', $language);
			return;
		}
		if (!selectedPack) {
			sourceError = t('library.noPackSelected', $language);
			return;
		}

		ingesting = true;
		try {
			const formData = new FormData();
			formData.append('file', sourceFile);
			formData.append('packId', selectedPack.id);
			const response = await fetch('/api/library/ingest-pdf', {
				method: 'POST',
				body: formData
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || !payload?.document) {
				throw new Error(payload?.message ?? t('library.pdfParseFailed', $language));
			}
			const ingested = payload.document as LibraryDocument;
			sourceTitle = sourceTitle.trim() || ingested.title;
			sourceDescription = sourceDescription.trim() || ingested.description;
			previewDoc = {
				...ingested,
				title: sourceTitle.trim() || ingested.title,
				description: sourceDescription.trim() || ingested.description
			};
			// Store totalChunks for batch embedding after save
			pendingChunks = payload.totalChunks ?? 0;
			pendingSourceId = ingested.id;
		} catch (err) {
			sourceError = err instanceof Error ? err.message : t('library.pdfParseFailed', $language);
		} finally {
			ingesting = false;
		}
	};

	let indexingStatus: string | null = null;
	let pendingChunks = 0;
	let pendingSourceId = '';

	const saveSourceToPack = () => {
		if (!selectedPack || !previewDoc) return;
		const doc = {
			...previewDoc,
			title: sourceTitle.trim() || previewDoc.title,
			description: sourceDescription.trim() || previewDoc.description
		};
		legalPacksStore.addSourceToPack(selectedPack.id, doc);
		closeSourceModal();

		// Start batch embedding if chunks were stored
		if (pendingChunks > 0 && pendingSourceId) {
			markIndexing(pendingSourceId);
			runBatchEmbedding(pendingSourceId, pendingChunks);
		}
	};

	const runBatchEmbedding = async (sourceId: string, totalChunks: number) => {
		let embedded = 0;
		let batchNum = 0;

		indexingStatus = t('library.indexing', $language);
		updateProgress(sourceId, 0);

		while (true) {
			try {
				const res = await fetch('/api/library/embed-batch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ sourceId })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data?.message ?? 'Embedding failed');

				embedded += data.embedded;
				batchNum++;

				// Use server's remaining count as the source of truth for progress
				const total = embedded + data.remaining;
				updateProgress(sourceId, Math.min((embedded / Math.max(total, 1)) * 100, 100));

				if (data.remaining <= 0 || data.embedded === 0) break;

				indexingStatus = t('library.indexing', $language);
			} catch {
				indexingStatus = t('library.indexError', $language);
				setTimeout(() => (indexingStatus = null), 5000);
				markIndexed(sourceId);
				return;
			}
		}

		updateProgress(sourceId, 100);
		indexingStatus = t('library.indexed', $language).replace('{count}', String(embedded));
		setTimeout(() => (indexingStatus = null), 4000);
		markIndexed(sourceId);
	};

	const removeSourceFromPack = (sourceId: string) => {
		if (!selectedPack) return;
		legalPacksStore.removeSourceFromPack(selectedPack.id, sourceId);
		// Clean up indexed chunks
		fetch(`/api/library/index?sourceId=${encodeURIComponent(sourceId)}`, { method: 'DELETE' }).catch(() => {});
	};

	const loadDocument = async (doc: LibraryDocument) => {
		loading = true;
		error = null;
		try {
			if (doc.content?.trim()) {
				content = doc.content;
				return;
			}
			if (doc.filePath) {
				const response = await fetch(doc.filePath);
				if (!response.ok) throw new Error();
				content = await response.text();
				return;
			}
			if (doc.sourceUrl) {
				content = `${t('library.sourceUrl', $language)}: ${doc.sourceUrl}`;
				return;
			}
			throw new Error();
		} catch {
			error = t('library.unavailable', $language);
		} finally {
			loading = false;
		}
	};

	const openReader = async (doc: LibraryDocument) => {
		selectedDoc = doc;
		readerOpen = true;
		await loadDocument(doc);
	};

	const closeReader = () => {
		readerOpen = false;
	};

	const onOverlayClick = (event: MouseEvent) => {
		if (event.target === event.currentTarget) closeReader();
	};
</script>

<section class="h-full grid grid-rows-[auto_1fr] gap-0">
	<!-- Header -->
	<header class="border-b border-white/10 bg-black/20 px-6 py-5 flex items-center justify-end">
		<button
			type="button"
			on:click={() => (helpModalOpen = true)}
			class="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/20 transition font-medium shrink-0"
			title={t('library.helpTitle', $language)}
		>
			<span class="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold">?</span>
			{t('library.helpBtn', $language)}
		</button>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="grid gap-5 lg:grid-cols-[280px_1fr] px-6 py-5">
			<!-- Packs sidebar -->
			<aside class="border border-white/10 rounded-xl p-4 space-y-3 self-start">
				<div class="flex items-center justify-between">
					<h3 class="text-xs font-bold uppercase tracking-widest text-white/60">{t('library.myPacks', $language)}</h3>
					<button type="button" on:click={openCreatePack} class="px-2.5 py-1.5 border border-white/15 rounded text-xs font-bold uppercase tracking-widest text-white/70 hover:bg-white/10">
						{t('library.createPack', $language)}
					</button>
				</div>

				<div class="space-y-2 max-h-[480px] overflow-y-auto pr-1">
					{#each packs as pack}
						<div
							role="button"
							tabindex="0"
							on:click={() => selectPack(pack.id)}
							on:keydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									selectPack(pack.id);
								}
							}}
							class={`w-full text-left border rounded-lg p-3 transition cursor-pointer ${selectedPack?.id === pack.id ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5'}`}
						>
							<p class="text-sm font-semibold text-white">{pack.name}</p>
							<p class="text-xs text-white/50 mt-0.5">{pack.jurisdiction} · {pack.domain}</p>
							<div class="flex items-center justify-between mt-2">
								<p class="text-xs text-white/40">{pack.sources.length} {t('library.documents', $language)}</p>
								<div class="flex gap-1.5">
									<button type="button" on:click|stopPropagation={() => openEditPack(pack)} class="text-xs px-2 py-0.5 border border-white/15 rounded text-white/60 hover:text-white">{t('library.edit', $language)}</button>
									{#if !pack.isDefault}
										<button type="button" on:click|stopPropagation={() => removePack(pack)} class="text-xs px-2 py-0.5 border border-white/15 rounded text-white/60 hover:text-white">{t('library.delete', $language)}</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</aside>

			<!-- Sources panel -->
			<div class="border border-white/10 rounded-xl p-5 space-y-5">
				{#if selectedPack}
					<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div>
							<h3 class="text-base font-bold text-white">{selectedPack.name}</h3>
							<p class="text-sm text-white/50 mt-0.5">{selectedPack.jurisdiction} · {selectedPack.domain}</p>
							{#if selectedPack.description}
								<p class="text-sm text-white/60 mt-1">{selectedPack.description}</p>
							{/if}
						</div>
						<button type="button" on:click={() => openSourceModal()} class="px-4 py-2 border border-white/15 rounded text-xs font-bold uppercase tracking-widest text-white/70 hover:bg-white/10">{t('library.uploadPdf', $language)}</button>
					</div>

					{#if selectedPack.sources.length === 0}
						<div class="border border-dashed border-white/15 rounded-xl p-8 text-center">
							<p class="text-sm text-white/50">{t('library.emptyPack', $language)}</p>
						</div>
					{/if}

					<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each selectedPack.sources as doc}
						<div class="border border-white/10 rounded-lg p-4 bg-white/[0.02] space-y-2 {$indexingSourceIds.has(doc.id) ? 'opacity-60' : ''}">
							<div class="flex items-start justify-between gap-2">
								<button type="button" class="text-left flex-1 min-w-0" on:click={() => openReader(doc)}>
									<p class="text-sm font-semibold text-white leading-snug truncate">{doc.title}</p>
								</button>
								{#if $indexingSourceIds.has(doc.id)}
									<span class="inline-flex items-center gap-1 text-xs text-flare/80 font-mono shrink-0">
										<span class="inline-block w-2.5 h-2.5 border-2 border-flare/30 border-t-flare rounded-full animate-spin"></span>
										{t('library.indexingBadge', $language)}
									</span>
								{:else if doc.isCustom}
										<button type="button" class="text-xs px-2 py-0.5 border border-white/15 rounded text-white/60 hover:text-white" on:click={() => removeSourceFromPack(doc.id)}>{t('library.remove', $language)}</button>
									{/if}
								</div>
								{#if $indexingSourceIds.has(doc.id)}
									<div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
										<div class="h-full bg-flare/70 rounded-full transition-all duration-500 ease-out" style="width: {$indexingProgress[doc.id] ?? 0}%"></div>
									</div>
								{/if}
								<p class="text-sm text-white/60 leading-relaxed line-clamp-2">{doc.description}</p>
								{#if doc.content && doc.content.length > 0}
									<details class="mt-1">
										<summary class="text-xs text-flare/70 hover:text-flare cursor-pointer select-none">View extracted text</summary>
										<pre class="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-white/50 leading-relaxed bg-black/30 rounded p-2.5">{doc.content.slice(0, 2000)}{doc.content.length > 2000 ? '\n\n… (click title to view full text)' : ''}</pre>
									</details>
								{/if}
								{#if doc.sourceUrl}
									<a href={doc.sourceUrl.startsWith('http') ? doc.sourceUrl : undefined} target="_blank" rel="noreferrer" class="text-xs text-flare hover:underline break-all line-clamp-1">{doc.sourceUrl}</a>
								{/if}
								<div class="flex gap-2 flex-wrap">
									{#if doc.docType}
										<span class="text-[11px] px-2 py-0.5 border border-white/15 rounded-full text-white/60 uppercase">{doc.docType}</span>
									{/if}
									{#if doc.trustLevel}
										<span class={`text-[11px] px-2 py-0.5 border rounded-full uppercase ${doc.trustLevel === 'official' ? 'border-emerald-400/40 text-emerald-300' : doc.trustLevel === 'recognized' ? 'border-amber-400/40 text-amber-300' : 'border-red-400/40 text-red-300'}`}>{doc.trustLevel}</span>
									{/if}
									{#if doc.content}
										<span class="text-[11px] px-2 py-0.5 border border-sky-400/30 rounded-full text-sky-300" title="{Math.round(doc.content.length / 1000)}k chars extracted">{Math.round(doc.content.length / 1000)}k chars</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-white/50 text-sm">{t('library.noPackSelected', $language)}</p>
				{/if}
			</div>
		</div>
	</div>
</section>

{#if helpModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={(event) => { if (event.target === event.currentTarget) helpModalOpen = false; }}
		on:keydown={(event) => { if (event.key === 'Escape') helpModalOpen = false; }}
	>
		<div class="bg-[#111] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-6">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-display font-bold text-white">{t('library.helpTitle', $language)}</h2>
				<button type="button" on:click={() => (helpModalOpen = false)} class="text-white/40 hover:text-white text-xl leading-none">&times;</button>
			</div>

			<!-- What is a Pack? -->
			<div class="space-y-2">
				<h3 class="text-sm font-bold uppercase tracking-widest text-white/70">📁 {t('library.helpWhatPackTitle', $language)}</h3>
				<p class="text-sm text-white/60 leading-relaxed">{t('library.helpWhatPackDesc', $language)}</p>
			</div>

			<!-- How to Create a Pack -->
			<div class="space-y-2">
				<h3 class="text-sm font-bold uppercase tracking-widest text-white/70">➕ {t('library.helpCreatePackTitle', $language)}</h3>
				<div class="text-sm text-white/60 leading-relaxed space-y-1">
					<p>{t('library.helpCreateStep1', $language)}</p>
					<p>{t('library.helpCreateStep2', $language)}</p>
					<p>{t('library.helpCreateStep3', $language)}</p>
				</div>
			</div>

			<!-- How to Upload a PDF -->
			<div class="space-y-2">
				<h3 class="text-sm font-bold uppercase tracking-widest text-white/70">📄 {t('library.helpUploadTitle', $language)}</h3>
				<div class="text-sm text-white/60 leading-relaxed space-y-1">
					<p>{t('library.helpUploadStep1', $language)}</p>
					<p>{t('library.helpUploadStep2', $language)}</p>
					<p>{t('library.helpUploadStep3', $language)}</p>
					<p>{t('library.helpUploadStep4', $language)}</p>
				</div>
			</div>

			<!-- Example Pack -->
			<div class="space-y-3">
				<h3 class="text-sm font-bold uppercase tracking-widest text-white/70">⚖️ {t('library.helpExampleTitle', $language)}</h3>
				<div class="border border-white/10 rounded-xl p-4 bg-white/[0.03] space-y-3">
					<div class="flex items-center gap-2">
						<span class="text-sm font-bold text-white">{t('library.helpExamplePackName', $language)}</span>
						<span class="text-[10px] px-2 py-0.5 border border-white/15 rounded-full text-white/50">Canada · Federal</span>
					</div>
					<div class="grid gap-2 sm:grid-cols-3">
						<div class="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
							<p class="text-xs font-semibold text-white">Criminal Code</p>
							<div class="flex gap-1.5 mt-1.5">
								<span class="text-[9px] px-1.5 py-0.5 border border-emerald-400/40 rounded-full text-emerald-300 uppercase">official</span>
								<span class="text-[9px] px-1.5 py-0.5 border border-sky-400/30 rounded-full text-sky-300">620k chars</span>
							</div>
						</div>
						<div class="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
							<p class="text-xs font-semibold text-white">Canada Labour Code</p>
							<div class="flex gap-1.5 mt-1.5">
								<span class="text-[9px] px-1.5 py-0.5 border border-emerald-400/40 rounded-full text-emerald-300 uppercase">official</span>
								<span class="text-[9px] px-1.5 py-0.5 border border-sky-400/30 rounded-full text-sky-300">340k chars</span>
							</div>
						</div>
						<div class="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
							<p class="text-xs font-semibold text-white">Human Rights Act</p>
							<div class="flex gap-1.5 mt-1.5">
								<span class="text-[9px] px-1.5 py-0.5 border border-emerald-400/40 rounded-full text-emerald-300 uppercase">official</span>
								<span class="text-[9px] px-1.5 py-0.5 border border-sky-400/30 rounded-full text-sky-300">280k chars</span>
							</div>
						</div>
					</div>
					<p class="text-xs text-white/40 italic">{t('library.helpExampleNote', $language)}</p>
				</div>
			</div>

			<button
				type="button"
				on:click={() => (helpModalOpen = false)}
				class="w-full py-2.5 rounded-lg bg-white/10 border border-white/15 text-sm font-bold uppercase tracking-wider text-white/70 hover:bg-white/20 transition"
			>{t('library.helpGotIt', $language)}</button>
		</div>
	</div>
{/if}

{#if packModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={(event) => {
			if (event.target === event.currentTarget) closePackModal();
		}}
		on:keydown={(event) => {
			if (event.key === 'Escape') closePackModal();
		}}
	>
		<div class="w-full max-w-xl bg-ink border border-white/15 rounded-xl p-5 space-y-2.5">
			<h3 class="text-base font-bold uppercase tracking-widest text-white">{editingPackId ? t('library.editPack', $language) : t('library.createPack', $language)}</h3>
			<input bind:value={packName} placeholder={t('library.packName', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-base text-white" />
			<input bind:value={packJurisdiction} placeholder={t('library.packJurisdiction', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-base text-white" />
			<input bind:value={packDomain} placeholder={t('library.packDomain', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-base text-white" />
			<textarea bind:value={packDescription} placeholder={t('library.packDescription', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-base text-white min-h-[90px]"></textarea>
			<div class="flex justify-end gap-2 pt-1">
				<button type="button" on:click={closePackModal} class="px-4 py-2 border border-white/20 rounded text-sm font-bold uppercase tracking-widest text-white/70">{t('library.cancel', $language)}</button>
				<button type="button" on:click={savePack} class="px-4 py-2 bg-white text-ink rounded text-sm font-bold uppercase tracking-widest">{t('library.save', $language)}</button>
			</div>
		</div>
	</div>
{/if}

{#if sourceModalOpen && selectedPack}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={(event) => {
			if (event.target === event.currentTarget) closeSourceModal();
		}}
		on:keydown={(event) => {
			if (event.key === 'Escape') closeSourceModal();
		}}
	>
		<div class="w-full max-w-2xl bg-ink border border-white/15 rounded-xl p-5 space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-base font-bold uppercase tracking-widest text-white">{t('library.addSourceToPack', $language)} — {selectedPack.name}</h3>
				<button type="button" class="text-white/60 hover:text-white text-lg" on:click={closeSourceModal}>×</button>
			</div>

			<input bind:value={sourceTitle} placeholder={t('library.sourceTitle', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-base text-white" />
			<input bind:value={sourceDescription} placeholder={t('library.sourceDescription', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-base text-white" />
			<input type="file" accept=".pdf" on:change={(e) => (sourceFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} class="w-full text-sm text-white/70" />
			<p class="text-sm text-white/40">{t('library.pdfSupported', $language)}</p>
			<button type="button" on:click={prepareUploadSource} disabled={ingesting} class="px-4 py-2 border border-white/20 rounded text-sm font-bold uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-50">{ingesting ? t('library.parsingPdf', $language) : t('library.preview', $language)}</button>

			{#if sourceError}
				<p class="text-sm text-red-300">{sourceError}</p>
			{/if}

			{#if previewDoc}
				<div class="border border-white/15 rounded-xl p-4 space-y-2 bg-white/5">
					<p class="text-base font-semibold text-white">{previewDoc.title}</p>
					{#if previewDoc.sourceUrl}<p class="text-sm text-white/70 break-all">{previewDoc.sourceUrl}</p>{/if}
					<p class="text-sm text-white/80 line-clamp-3">{previewDoc.description}</p>
					{#if previewDoc.content}
						<div class="flex gap-3 text-xs text-white/50 mt-1 pt-1 border-t border-white/10">
							<span>{Math.round(previewDoc.content.length / 1000)}k {t('library.statsChars', $language)}</span>
							<span>~{Math.ceil(previewDoc.content.length / 3000)} {t('library.statsPages', $language)}</span>
							<span>~{Math.ceil(previewDoc.content.length / 3200)} {t('library.statsChunks', $language)}</span>
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-2">
					<button type="button" on:click={closeSourceModal} class="px-4 py-2 border border-white/20 rounded text-sm font-bold uppercase tracking-widest text-white/70">{t('library.cancel', $language)}</button>
					<button type="button" on:click={saveSourceToPack} class="px-4 py-2 bg-white text-ink rounded text-sm font-bold uppercase tracking-widest">{t('library.saveSource', $language)}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if readerOpen && selectedDoc}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 py-8"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={onOverlayClick}
		on:keydown={(event) => {
			if (event.key === 'Escape') closeReader();
		}}
	>
		<div class="relative w-full max-w-5xl bg-ink border border-white/15 rounded-2xl flex flex-col max-h-[90vh]">
			<button type="button" on:click={closeReader} class="absolute top-3 right-3 text-white/60 hover:text-white rounded-full border border-white/20 w-8 h-8 flex items-center justify-center text-sm" aria-label="Close reader">×</button>
			<header class="p-6 pb-0">
				<p class="text-[10px] uppercase tracking-[0.3em] text-white/40">{selectedDoc.jurisdiction}</p>
				<h3 class="text-lg font-bold text-white mt-1">{selectedDoc.title}</h3>
				<p class="text-white/50 text-xs mt-1">{selectedDoc.description}</p>
				{#if selectedDoc.sourceUrl}
					<p class="text-xs text-flare mt-2 break-all">{selectedDoc.sourceUrl}</p>
				{/if}
			</header>
			<section class="flex-1 overflow-y-auto px-6 py-4">
				{#if loading}
					<p class="text-white/60 text-sm">{t('library.loading', $language)}</p>
				{:else if error}
					<p class="text-red-300 text-sm">{error}</p>
				{:else}
					<pre class="whitespace-pre-wrap text-white/80 text-sm leading-7 font-sans">{content}</pre>
				{/if}
			</section>
		</div>
	</div>
{/if}

<!-- Indexing status toast -->
{#if indexingStatus}
	<div class="fixed bottom-6 right-6 z-50 bg-black/90 border border-white/15 rounded-lg px-4 py-3 text-sm text-white/80 shadow-xl backdrop-blur-sm flex items-center gap-2">
		{#if indexingStatus.includes('...')}
			<span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white/80 rounded-full animate-spin"></span>
		{:else}
			<span class="text-green-400">&#10003;</span>
		{/if}
		{indexingStatus}
	</div>
{/if}
