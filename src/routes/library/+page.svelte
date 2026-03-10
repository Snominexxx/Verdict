<script lang="ts">
	import { onMount } from 'svelte';
	import type { LibraryDocument } from '$lib/data/library';
	import { legalPacksStore, selectedLegalPackId, type LegalPack } from '$lib/stores/legalPacks';
	import { language } from '$lib/stores/language';
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
	let sourceMode: 'url' | 'upload' | 'paste' = 'url';
	let ingesting = false;
	let sourceUrl = '';
	let sourceTitle = '';
	let sourceDescription = '';
	let sourceText = '';
	let sourceFile: File | null = null;
	let sourceError: string | null = null;
	let previewDoc: LibraryDocument | null = null;

	onMount(() => {
		legalPacksStore.hydrate();
		selectedLegalPackId.hydrate();
	});

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

	const openSourceModal = (mode: 'url' | 'upload' | 'paste') => {
		sourceMode = mode;
		ingesting = false;
		sourceUrl = '';
		sourceTitle = '';
		sourceDescription = '';
		sourceText = '';
		sourceFile = null;
		sourceError = null;
		previewDoc = null;
		sourceModalOpen = true;
	};

	const closeSourceModal = () => {
		sourceModalOpen = false;
	};

	const ingestUrl = async () => {
		ingesting = true;
		sourceError = null;
		previewDoc = null;
		try {
			const response = await fetch('/api/library/ingest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: sourceUrl })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || !payload?.document) {
				throw new Error(payload?.message ?? t('library.ingestFailed', $language));
			}
			const ingested = payload.document as LibraryDocument;
			sourceTitle = sourceTitle.trim() || ingested.title;
			sourceDescription = sourceDescription.trim() || ingested.description;
			previewDoc = {
				...ingested,
				title: sourceTitle.trim() || ingested.title,
				description: sourceDescription.trim() || ingested.description
			};
		} catch (err) {
			sourceError = err instanceof Error ? err.message : t('library.ingestFailed', $language);
		} finally {
			ingesting = false;
		}
	};

	const prepareUploadSource = async () => {
		sourceError = null;
		previewDoc = null;
		if (!sourceFile) {
			sourceError = t('library.fileRequired', $language);
			return;
		}

		const isPdf = sourceFile.name.toLowerCase().endsWith('.pdf');

		if (isPdf) {
			ingesting = true;
			try {
				const formData = new FormData();
				formData.append('file', sourceFile);
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
			} catch (err) {
				sourceError = err instanceof Error ? err.message : t('library.pdfParseFailed', $language);
			} finally {
				ingesting = false;
			}
			return;
		}

		// Non-PDF: read as text client-side
		let extracted = '';
		try {
			extracted = await sourceFile.text();
		} catch {
			extracted = '';
		}

		previewDoc = {
			id: `source-upload-${Date.now()}`,
			title: sourceTitle.trim() || sourceFile.name,
			jurisdiction: selectedPack?.jurisdiction ?? 'Other',
			description: sourceDescription.trim() || extracted.slice(0, 200) || 'Uploaded source file.',
			lastUpdated: new Date().toISOString().slice(0, 10),
			sourceUrl: `uploaded://${sourceFile.name}`,
			content: extracted,
			docType: 'secondary',
			trustLevel: 'unverified',
			isCustom: true
		};
	};

	const preparePastedSource = () => {
		sourceError = null;
		previewDoc = null;
		if (!sourceTitle.trim() || !sourceText.trim()) {
			sourceError = t('library.pasteRequired', $language);
			return;
		}

		previewDoc = {
			id: `source-paste-${Date.now()}`,
			title: sourceTitle.trim(),
			jurisdiction: selectedPack?.jurisdiction ?? 'Other',
			description: sourceDescription.trim() || sourceText.trim().slice(0, 200),
			lastUpdated: new Date().toISOString().slice(0, 10),
			sourceUrl: 'pasted://manual-entry',
			content: sourceText.trim(),
			docType: 'secondary',
			trustLevel: 'unverified',
			isCustom: true
		};
	};

	const saveSourceToPack = () => {
		if (!selectedPack || !previewDoc) return;
		legalPacksStore.addSourceToPack(selectedPack.id, {
			...previewDoc,
			title: sourceTitle.trim() || previewDoc.title,
			description: sourceDescription.trim() || previewDoc.description
		});
		closeSourceModal();
	};

	const removeSourceFromPack = (sourceId: string) => {
		if (!selectedPack) return;
		legalPacksStore.removeSourceFromPack(selectedPack.id, sourceId);
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
	<header class="border-b border-white/10 bg-black/20 px-6 py-4 flex items-center justify-between">
		<div>
			<h2 class="text-sm font-bold uppercase tracking-wider text-white">{t('library.subtitle', $language)}</h2>
			<p class="text-xs text-white/50 mt-0.5">{t('library.description', $language)}</p>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="grid gap-4 lg:grid-cols-[260px_1fr] px-6 py-5">
			<!-- Packs sidebar -->
			<aside class="border border-white/10 rounded-xl p-3 space-y-3 self-start">
				<div class="flex items-center justify-between">
					<h3 class="text-[11px] font-bold uppercase tracking-widest text-white/60">{t('library.myPacks', $language)}</h3>
					<button type="button" on:click={openCreatePack} class="px-2 py-1 border border-white/15 rounded text-[10px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10">
						{t('library.createPack', $language)}
					</button>
				</div>

				<div class="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
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
							class={`w-full text-left border rounded-lg p-2.5 transition cursor-pointer ${selectedPack?.id === pack.id ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5'}`}
						>
							<p class="text-xs font-semibold text-white">{pack.name}</p>
							<p class="text-[10px] text-white/50 mt-0.5">{pack.jurisdiction} · {pack.domain}</p>
							<div class="flex items-center justify-between mt-1.5">
								<p class="text-[10px] text-white/40">{pack.sources.length} {t('library.documents', $language)}</p>
								<div class="flex gap-1">
									<button type="button" on:click|stopPropagation={() => openEditPack(pack)} class="text-[10px] px-1.5 py-0.5 border border-white/15 rounded text-white/60 hover:text-white">{t('library.edit', $language)}</button>
									{#if !pack.isDefault}
										<button type="button" on:click|stopPropagation={() => removePack(pack)} class="text-[10px] px-1.5 py-0.5 border border-white/15 rounded text-white/60 hover:text-white">{t('library.delete', $language)}</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</aside>

			<!-- Sources panel -->
			<div class="border border-white/10 rounded-xl p-4 space-y-4">
				{#if selectedPack}
					<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
						<div>
							<h3 class="text-sm font-bold text-white">{selectedPack.name}</h3>
							<p class="text-[11px] text-white/50 mt-0.5">{selectedPack.jurisdiction} · {selectedPack.domain}</p>
							{#if selectedPack.description}
								<p class="text-xs text-white/60 mt-1">{selectedPack.description}</p>
							{/if}
						</div>
						<div class="flex gap-1.5">
							<button type="button" on:click={() => openSourceModal('url')} class="px-2.5 py-1.5 border border-white/15 rounded text-[10px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10">{t('library.addUrl', $language)}</button>
							<button type="button" on:click={() => openSourceModal('upload')} class="px-2.5 py-1.5 border border-white/15 rounded text-[10px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10">{t('library.uploadPdf', $language)}</button>
							<button type="button" on:click={() => openSourceModal('paste')} class="px-2.5 py-1.5 border border-white/15 rounded text-[10px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10">{t('library.pasteText', $language)}</button>
						</div>
					</div>

					<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each selectedPack.sources as doc}
							<div class="border border-white/10 rounded-lg p-3 bg-white/[0.02] space-y-1.5">
								<div class="flex items-start justify-between gap-2">
									<button type="button" class="text-left flex-1 min-w-0" on:click={() => openReader(doc)}>
										<p class="text-xs font-semibold text-white leading-snug truncate">{doc.title}</p>
									</button>
									{#if doc.isCustom}
										<button type="button" class="text-[10px] px-1.5 py-0.5 border border-white/15 rounded text-white/60 hover:text-white" on:click={() => removeSourceFromPack(doc.id)}>{t('library.remove', $language)}</button>
									{/if}
								</div>
								<p class="text-[11px] text-white/60 leading-relaxed line-clamp-2">{doc.description}</p>
								{#if doc.content && doc.content.length > 0}
									<details class="mt-1">
										<summary class="text-[10px] text-flare/70 hover:text-flare cursor-pointer select-none">View extracted text</summary>
										<pre class="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] text-white/50 leading-relaxed bg-black/30 rounded p-2">{doc.content.slice(0, 2000)}{doc.content.length > 2000 ? '\n\n… (click title to view full text)' : ''}</pre>
									</details>
								{/if}
								{#if doc.sourceUrl}
									<a href={doc.sourceUrl.startsWith('http') ? doc.sourceUrl : undefined} target="_blank" rel="noreferrer" class="text-[10px] text-flare hover:underline break-all line-clamp-1">{doc.sourceUrl}</a>
								{/if}
								<div class="flex gap-1.5 flex-wrap">
									{#if doc.docType}
										<span class="text-[9px] px-1.5 py-0.5 border border-white/15 rounded-full text-white/60 uppercase">{doc.docType}</span>
									{/if}
									{#if doc.trustLevel}
										<span class={`text-[9px] px-1.5 py-0.5 border rounded-full uppercase ${doc.trustLevel === 'official' ? 'border-emerald-400/40 text-emerald-300' : doc.trustLevel === 'recognized' ? 'border-amber-400/40 text-amber-300' : 'border-red-400/40 text-red-300'}`}>{doc.trustLevel}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-white/50 text-xs">{t('library.noPackSelected', $language)}</p>
				{/if}
			</div>
		</div>
	</div>
</section>

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
			<h3 class="text-sm font-bold uppercase tracking-widest text-white">{editingPackId ? t('library.editPack', $language) : t('library.createPack', $language)}</h3>
			<input bind:value={packName} placeholder={t('library.packName', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
			<input bind:value={packJurisdiction} placeholder={t('library.packJurisdiction', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
			<input bind:value={packDomain} placeholder={t('library.packDomain', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
			<textarea bind:value={packDescription} placeholder={t('library.packDescription', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white min-h-[90px]"></textarea>
			<div class="flex justify-end gap-2 pt-1">
				<button type="button" on:click={closePackModal} class="px-4 py-2 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white/70">{t('library.cancel', $language)}</button>
				<button type="button" on:click={savePack} class="px-4 py-2 bg-white text-ink rounded text-xs font-bold uppercase tracking-widest">{t('library.save', $language)}</button>
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
				<h3 class="text-sm font-bold uppercase tracking-widest text-white">{t('library.addSourceToPack', $language)} — {selectedPack.name}</h3>
				<button type="button" class="text-white/60 hover:text-white" on:click={closeSourceModal}>×</button>
			</div>

			{#if sourceMode === 'url'}
				<input type="url" bind:value={sourceUrl} placeholder="https://..." class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
				<input bind:value={sourceTitle} placeholder={t('library.sourceTitle', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
				<input bind:value={sourceDescription} placeholder={t('library.sourceDescription', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
				<button type="button" on:click={ingestUrl} disabled={!sourceUrl.trim() || ingesting} class="px-4 py-2 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-50">{ingesting ? t('library.ingesting', $language) : t('library.preview', $language)}</button>
			{:else if sourceMode === 'upload'}
				<input bind:value={sourceTitle} placeholder={t('library.sourceTitle', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
				<input bind:value={sourceDescription} placeholder={t('library.sourceDescription', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
				<input type="file" accept=".pdf,.txt,.md" on:change={(e) => (sourceFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} class="w-full text-sm text-white/70" />
				<p class="text-xs text-white/40">{t('library.pdfSupported', $language)}</p>
				<button type="button" on:click={prepareUploadSource} disabled={ingesting} class="px-4 py-2 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10 disabled:opacity-50">{ingesting ? t('library.parsingPdf', $language) : t('library.preview', $language)}</button>
			{:else}
				<input bind:value={sourceTitle} placeholder={t('library.sourceTitle', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
				<input bind:value={sourceDescription} placeholder={t('library.sourceDescription', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white" />
				<textarea bind:value={sourceText} placeholder={t('library.sourceText', $language)} class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white min-h-[140px]"></textarea>
				<button type="button" on:click={preparePastedSource} class="px-4 py-2 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10">{t('library.preview', $language)}</button>
			{/if}

			{#if sourceError}
				<p class="text-sm text-red-300">{sourceError}</p>
			{/if}

			{#if previewDoc}
				<div class="border border-white/15 rounded-xl p-4 space-y-2 bg-white/5">
					<p class="text-sm font-semibold text-white">{previewDoc.title}</p>
					{#if previewDoc.sourceUrl}<p class="text-xs text-white/70 break-all">{previewDoc.sourceUrl}</p>{/if}
					<p class="text-sm text-white/80 line-clamp-3">{previewDoc.description}</p>
				</div>
				<div class="flex justify-end gap-2">
					<button type="button" on:click={closeSourceModal} class="px-4 py-2 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white/70">{t('library.cancel', $language)}</button>
					<button type="button" on:click={saveSourceToPack} class="px-4 py-2 bg-white text-ink rounded text-xs font-bold uppercase tracking-widest">{t('library.saveSource', $language)}</button>
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
