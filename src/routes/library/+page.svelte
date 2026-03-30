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
	const READER_STEP_CHARS = 120_000;
	let readerVisibleChars = READER_STEP_CHARS;

	let packModalOpen = false;
	let editingPackId = '';
	let packName = '';
	let packJurisdiction = '';
	let packDomain = '';
	let packDescription = '';

	let helpModalOpen = false;
	let ingesting = false;
	let sourceFile: File | null = null;
	let sourceError: string | null = null;
	let parseProgress = '';
	let fileInputEl: HTMLInputElement;

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

	const triggerFileUpload = () => {
		ingesting = false;
		sourceFile = null;
		sourceError = null;
		parseProgress = '';
		fileInputEl?.click();
	};

	const handleFileInputChange = (e: Event) => {
		const file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		if (file) onFileSelected(file);
		// Reset so the same file can be re-selected
		if (fileInputEl) fileInputEl.value = '';
	};

	/** File pick triggers the full pipeline: extract → chunk → store → save → embed */
	const onFileSelected = async (file: File) => {
		sourceFile = file;
		sourceError = null;
		parseProgress = '';

		if (!selectedPack) {
			sourceError = t('library.noPackSelected', $language);
			return;
		}

		const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
		if (ext !== '.pdf' && ext !== '.docx') {
			sourceError = t('library.unsupportedFormat', $language);
			return;
		}

		// Auto-fill title from filename
		const autoTitle = file.name.replace(/\.(pdf|docx)$/i, '').replace(/[_-]+/g, ' ').trim();

		ingesting = true;
		try {
			const sourceId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			let originalFileMeta: {
				storagePath?: string;
				mimeType?: string;
				originalFileName?: string;
				fileSize?: number;
			} = {};

			let extractedText = '';

			if (ext === '.pdf') {
				parseProgress = t('library.extractingPages', $language);
				const arrayBuffer = await file.arrayBuffer();
				const pdfjsLib = await import('pdfjs-dist');
				pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
					'pdfjs-dist/build/pdf.worker.min.mjs',
					import.meta.url
				).href;
				const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
				const totalPages = pdf.numPages;
				const pageTexts: string[] = [];
				for (let i = 1; i <= totalPages; i++) {
					if (i % 50 === 0 || i === totalPages) {
						parseProgress = t('library.extractingPageN', $language)
							.replace('{current}', String(i))
							.replace('{total}', String(totalPages));
					}
					const page = await pdf.getPage(i);
					const content = await page.getTextContent();
					let pageText = '';
					let lastY: number | null = null;
					for (const item of content.items) {
						if (!('str' in item) || !item.str) continue;
						const y = (item as any).transform?.[5] ?? null;
						if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
							pageText += '\n';
						} else if (pageText) {
							pageText += ' ';
						}
						pageText += item.str;
						if (y !== null) lastY = y;
					}
					pageTexts.push(pageText);
				}
				extractedText = pageTexts.join('\n');
			} else {
				parseProgress = t('library.extractingWord', $language);
				const arrayBuffer = await file.arrayBuffer();
				const mammoth = await import('mammoth');
				const result = await mammoth.extractRawText({ arrayBuffer });
				extractedText = result.value ?? '';
			}

			const text = extractedText
				.replace(/[^\S\n]+/g, ' ')
				.replace(/\n{3,}/g, '\n\n')
				.trim();
			if (!text || text.length < 20) {
				throw new Error(t('library.noTextExtracted', $language));
			}

			// Store original file so users can open PDF/DOCX directly later
			parseProgress = t('library.uploadingOriginal', $language);
			try {
				const uploadForm = new FormData();
				uploadForm.set('file', file);
				uploadForm.set('sourceId', sourceId);
				const uploadRes = await fetch('/api/library/upload-file', {
					method: 'POST',
					body: uploadForm
				});
				const uploadPayload = await uploadRes.json().catch(() => null);
				if (uploadRes.ok && uploadPayload) {
					originalFileMeta = {
						storagePath: uploadPayload.storagePath,
						mimeType: uploadPayload.mimeType,
						originalFileName: uploadPayload.originalFileName,
						fileSize: uploadPayload.fileSize
					};
				}
			} catch (uploadErr) {
				console.warn('Original file upload failed, continuing with text indexing only:', uploadErr);
			}

			// Split large texts into segments for Netlify body limit
			const SEGMENT_LIMIT = 3_000_000;
			const segments: string[] = [];
			if (text.length <= SEGMENT_LIMIT) {
				segments.push(text);
			} else {
				let remaining = text;
				while (remaining.length > 0) {
					if (remaining.length <= SEGMENT_LIMIT) {
						segments.push(remaining);
						break;
					}
					let splitAt = remaining.lastIndexOf('\n\n', SEGMENT_LIMIT);
					if (splitAt < SEGMENT_LIMIT * 0.5) splitAt = remaining.lastIndexOf('\n', SEGMENT_LIMIT);
					if (splitAt < SEGMENT_LIMIT * 0.5) splitAt = SEGMENT_LIMIT;
					segments.push(remaining.slice(0, splitAt));
					remaining = remaining.slice(splitAt).replace(/^\n+/, '');
				}
			}

			let totalChunksAll = 0;
			let linkedSourceId = sourceId;
			let ingested: LibraryDocument | null = null;

			for (let i = 0; i < segments.length; i++) {
				parseProgress = segments.length > 1
					? `${t('library.storingChunks', $language)} (${i + 1}/${segments.length})`
					: t('library.storingChunks', $language);

				const response = await fetch('/api/library/ingest-text', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text: segments[i],
						filename: file.name,
						packId: selectedPack.id,
						sourceId: linkedSourceId,
						...originalFileMeta
					})
				});
				const payload = await response.json().catch(() => null);
				if (!response.ok || !payload?.document) {
					throw new Error(payload?.message ?? t('library.pdfParseFailed', $language));
				}
				if (i === 0) {
					ingested = payload.document as LibraryDocument;
					linkedSourceId = ingested.id;
				}
				totalChunksAll += payload.totalChunks ?? 0;
			}

			if (!ingested) throw new Error(t('library.pdfParseFailed', $language));

			// Auto-save to pack immediately
			const doc: LibraryDocument = {
				...ingested,
				title: autoTitle || ingested.title,
				description: ingested.description,
				storagePath: originalFileMeta.storagePath ?? ingested.storagePath,
				mimeType: originalFileMeta.mimeType ?? ingested.mimeType,
				originalFileName: originalFileMeta.originalFileName ?? ingested.originalFileName,
				fileSize: originalFileMeta.fileSize ?? ingested.fileSize,
				content: text.slice(0, 1000)
			};
			legalPacksStore.addSourceToPack(selectedPack.id, doc);

			// Start embedding
			parseProgress = t('library.indexing', $language);
			if (totalChunksAll > 0 && linkedSourceId) {
				markIndexing(linkedSourceId);
				runBatchEmbedding(linkedSourceId, totalChunksAll);
			}
		} catch (err) {
			sourceError = err instanceof Error ? err.message : t('library.pdfParseFailed', $language);
			parseProgress = '';
		} finally {
			ingesting = false;
		}
	};

	let indexingStatus: string | null = null;

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

	const openOriginalDocument = async (doc: LibraryDocument) => {
		// Built-in local markdown docs
		if (doc.filePath) {
			window.open(doc.filePath, '_blank', 'noopener,noreferrer');
			return;
		}

		// Uploaded custom docs: open stored original PDF/DOCX when available
		if (doc.isCustom) {
			try {
				const res = await fetch(`/api/library/source-file-url?sourceId=${encodeURIComponent(doc.id)}`);
				const payload = await res.json().catch(() => null);
				if (res.ok && payload?.url) {
					window.open(payload.url, '_blank', 'noopener,noreferrer');
					return;
				}
			} catch {
				// Fallback below
			}
		}

		// Fallback to extracted text reader if original file cannot be opened
		await openReader(doc);
	};

	const loadDocument = async (doc: LibraryDocument) => {
		loading = true;
		error = null;
		readerVisibleChars = READER_STEP_CHARS;
		try {
			const isUploadedDoc = !!doc.isCustom || doc.sourceUrl?.startsWith('uploaded://');
			if (isUploadedDoc) {
				const response = await fetch(`/api/library/source-text?sourceId=${encodeURIComponent(doc.id)}`);
				if (response.ok) {
					const payload = await response.json().catch(() => null);
					if (payload?.text && typeof payload.text === 'string') {
						content = payload.text;
						return;
					}
				}
			}

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
		content = '';
		await loadDocument(doc);
	};

	const closeReader = () => {
		readerOpen = false;
		readerVisibleChars = READER_STEP_CHARS;
	};

	const loadMoreReaderContent = () => {
		readerVisibleChars = Math.min(content.length, readerVisibleChars + READER_STEP_CHARS);
	};

	$: visibleContent = content.slice(0, readerVisibleChars);
	$: hasMoreContent = content.length > readerVisibleChars;

	const onOverlayClick = (event: MouseEvent) => {
		if (event.target === event.currentTarget) closeReader();
	};
</script>

<section class="h-full grid grid-rows-[auto_1fr] gap-0">
	<!-- Header -->
	<header class="border-b border-white/15 bg-black/20 px-6 py-5 flex items-center justify-end">
		<button
			type="button"
			on:click={() => (helpModalOpen = true)}
			class="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/20 transition font-medium shrink-0"
			title={t('library.helpTitle', $language)}
		>
			<span class="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">?</span>
			{t('library.helpBtn', $language)}
		</button>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="grid gap-5 lg:grid-cols-[280px_1fr] px-6 py-5">
			<!-- Packs sidebar -->
			<aside class="border border-white/15 rounded-xl p-4 space-y-3 self-start">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold uppercase tracking-widest text-white/70">{t('library.myPacks', $language)}</h3>
					<button type="button" on:click={openCreatePack} class="px-2.5 py-1.5 border border-white/20 rounded text-sm font-bold uppercase tracking-widest text-white/80 hover:bg-white/10">
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
							class={`w-full text-left border rounded-lg p-3 transition cursor-pointer ${selectedPack?.id === pack.id ? 'border-white/40 bg-white/15' : 'border-white/15 hover:bg-white/10'}`}
						>
							<p class="text-sm font-semibold text-white">{pack.name}</p>
							<p class="text-sm text-white/60 mt-0.5">{pack.jurisdiction} · {pack.domain}</p>
							<div class="flex items-center justify-between mt-2">
								<p class="text-sm text-white/50">{pack.sources.length} {t('library.documents', $language)}</p>
								<div class="flex gap-1.5">
									<button type="button" on:click|stopPropagation={() => openEditPack(pack)} class="text-sm px-2 py-0.5 border border-white/20 rounded text-white/70 hover:text-white">{t('library.edit', $language)}</button>
									{#if !pack.isDefault}
										<button type="button" on:click|stopPropagation={() => removePack(pack)} class="text-sm px-2 py-0.5 border border-white/20 rounded text-white/70 hover:text-white">{t('library.delete', $language)}</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</aside>

			<!-- Sources panel -->
			<div class="border border-white/15 rounded-xl p-5 space-y-5">
				{#if selectedPack}
					<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div>
							<h3 class="text-lg font-bold text-white">{selectedPack.name}</h3>
							<p class="text-sm text-white/60 mt-0.5">{selectedPack.jurisdiction} · {selectedPack.domain}</p>
							{#if selectedPack.description}
								<p class="text-sm text-white/60 mt-1">{selectedPack.description}</p>
							{/if}
						</div>
						<input type="file" accept=".pdf,.docx" class="hidden" bind:this={fileInputEl} on:change={handleFileInputChange} />
						<button type="button" on:click={triggerFileUpload} disabled={ingesting} class="px-4 py-2 border border-white/25 rounded text-sm font-bold uppercase tracking-widest text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed">{t('library.uploadDoc', $language)}</button>
					</div>

					{#if ingesting || sourceError}
						<div class="border border-white/15 rounded-lg p-3 bg-white/[0.04] space-y-1">
							{#if ingesting}
								<div class="flex items-center gap-2">
									<span class="inline-block w-3 h-3 border-2 border-flare/30 border-t-flare rounded-full animate-spin"></span>
									<p class="text-sm text-white/80">{parseProgress || t('library.parsingPdf', $language)}</p>
								</div>
							{/if}
							{#if sourceError}
								<p class="text-sm text-red-300">{sourceError}</p>
							{/if}
						</div>
					{/if}

					{#if selectedPack.sources.length === 0}
						<div class="border border-dashed border-white/20 rounded-xl p-8 text-center">
							<p class="text-sm text-white/60">{t('library.emptyPack', $language)}</p>
						</div>
					{/if}

					<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each selectedPack.sources as doc}
						<div class="border border-white/15 rounded-lg p-4 bg-white/[0.04] space-y-2 {$indexingSourceIds.has(doc.id) ? 'opacity-60' : ''}">
							<div class="flex items-start justify-between gap-2">
								<button type="button" class="text-left flex-1 min-w-0" on:click={() => openOriginalDocument(doc)}>
									<p class="text-sm font-semibold text-white leading-snug truncate">{doc.title}</p>
								</button>
								{#if $indexingSourceIds.has(doc.id)}
									<span class="inline-flex items-center gap-1 text-xs text-flare/80 font-mono shrink-0">
										<span class="inline-block w-2.5 h-2.5 border-2 border-flare/30 border-t-flare rounded-full animate-spin"></span>
										{t('library.indexingBadge', $language)}
									</span>
								{:else if doc.isCustom}
										<button type="button" class="text-sm px-2 py-0.5 border border-white/20 rounded text-white/70 hover:text-white" on:click={() => removeSourceFromPack(doc.id)}>{t('library.remove', $language)}</button>
									{/if}
								</div>
								{#if $indexingSourceIds.has(doc.id)}
									<div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
										<div class="h-full bg-flare/70 rounded-full transition-all duration-500 ease-out" style="width: {$indexingProgress[doc.id] ?? 0}%"></div>
									</div>
								{/if}
								<p class="text-sm text-white/70 leading-relaxed line-clamp-2">{doc.description}</p>
								<div class="pt-1">
									<button
										type="button"
										on:click={() => openOriginalDocument(doc)}
										class="text-xs px-2.5 py-1 border border-flare/40 rounded text-flare hover:bg-flare/10"
									>
										{t('library.openDocument', $language)}
									</button>
								</div>
								{#if doc.sourceUrl}
									<a href={doc.sourceUrl.startsWith('http') ? doc.sourceUrl : undefined} target="_blank" rel="noreferrer" class="text-xs text-flare hover:underline break-all line-clamp-1">{doc.sourceUrl}</a>
								{/if}
								<div class="flex gap-2 flex-wrap">
									{#if doc.docType}
										<span class="text-xs px-2 py-0.5 border border-white/20 rounded-full text-white/70 uppercase">{doc.docType}</span>
									{/if}
									{#if doc.trustLevel}
										<span class={`text-xs px-2 py-0.5 border rounded-full uppercase ${doc.trustLevel === 'official' ? 'border-emerald-400/40 text-emerald-300' : doc.trustLevel === 'recognized' ? 'border-amber-400/40 text-amber-300' : 'border-red-400/40 text-red-300'}`}>{doc.trustLevel}</span>
									{/if}
									{#if doc.content && !doc.isCustom}
										<span class="text-xs px-2 py-0.5 border border-sky-400/30 rounded-full text-sky-300" title="{Math.round(doc.content.length / 1000)}k chars extracted">{Math.round(doc.content.length / 1000)}k chars</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-white/60 text-sm">{t('library.noPackSelected', $language)}</p>
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
		<div class="bg-[#111] border border-white/20 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-6">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-display font-bold text-white">{t('library.helpTitle', $language)}</h2>
				<button type="button" on:click={() => (helpModalOpen = false)} class="text-white/40 hover:text-white text-xl leading-none">&times;</button>
			</div>

			<!-- What is a Pack? -->
			<div class="space-y-2">
				<h3 class="text-sm font-bold uppercase tracking-widest text-white/80">📁 {t('library.helpWhatPackTitle', $language)}</h3>
				<p class="text-sm text-white/70 leading-relaxed">{t('library.helpWhatPackDesc', $language)}</p>
			</div>

			<!-- How to Create a Pack -->
			<div class="space-y-2">
				<h3 class="text-sm font-bold uppercase tracking-widest text-white/80">➕ {t('library.helpCreatePackTitle', $language)}</h3>
				<div class="text-sm text-white/70 leading-relaxed space-y-1">
					<p>{t('library.helpCreateStep1', $language)}</p>
					<p>{t('library.helpCreateStep2', $language)}</p>
					<p>{t('library.helpCreateStep3', $language)}</p>
				</div>
			</div>

			<!-- How to Upload a PDF -->
			<div class="space-y-2">
				<h3 class="text-sm font-bold uppercase tracking-widest text-white/80">📄 {t('library.helpUploadTitle', $language)}</h3>
				<div class="text-sm text-white/70 leading-relaxed space-y-1">
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
					<pre class="whitespace-pre-wrap text-white/80 text-sm leading-7 font-sans">{visibleContent}</pre>
					{#if content.length > 0}
						<p class="mt-3 text-xs text-white/50">
							{t('library.readerShowing', $language)
								.replace('{shown}', String(Math.min(readerVisibleChars, content.length)))
								.replace('{total}', String(content.length))}
						</p>
					{/if}
					{#if hasMoreContent}
						<div class="mt-3">
							<button
								type="button"
								on:click={loadMoreReaderContent}
								class="px-3 py-1.5 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10"
							>
								{t('library.readerLoadMore', $language)}
							</button>
						</div>
					{/if}
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
