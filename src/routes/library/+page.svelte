<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import type { LibraryDocument } from '$lib/data/library';
	import { legalPacksStore, selectedLegalPackId, type LegalPack } from '$lib/stores/legalPacks';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';

	let selectedDoc: LibraryDocument | null = null;
	let content = '';
	let contentIsMarkdown = false;
	let loading = false;
	let error: string | null = null;
	let readerOpen = false;
	const READER_STEP_CHARS = 120_000;
	let readerVisibleChars = READER_STEP_CHARS;

	// Inline preview modal for uploaded original PDF / DOCX
	let previewOpen = false;
	let previewKind: 'pdf' | 'docx' | null = null;
	let previewUrl = ''; // signed URL to original file (used by iframe + download)
	let previewObjectUrl = ''; // blob: URL for PDF (avoids cross-origin iframe issues)
	let previewHtml = ''; // rendered DOCX HTML
	let previewName = '';
	let previewLoading = false;
	let previewError: string | null = null;

	// Configure marked for safe, clean rendering of legal markdown
	marked.setOptions({ gfm: true, breaks: false });

	let packModalOpen = false;
	let editingPackId = '';
	let packName = '';
	let sourcePackMetadataLabel = '';
	let packLanguage: 'en' | 'fr' = 'en';
	let packDomain = '';
	let packDescription = '';

	let helpModalOpen = false;
	let ingesting = false;
	let sourceFile: File | null = null;
	let sourceError: string | null = null;
	let parseProgress = '';
	let fileInputEl: HTMLInputElement;

	const fetchWithAuthRetry = async (resource: string, init?: RequestInit): Promise<Response> => {
		const response = await fetch(resource, init);
		if (response.status !== 401) return response;

		// Immediately retry once: right after sign-in there can be a brief race
		// before auth cookies are visible to server endpoints.
		return fetch(resource, init);
	};

	// Inline rename state
	let renamingId = '';
	let renameValue = '';
	let renameInputEl: HTMLInputElement | null = null;

	/** Strip junk suffixes from filenames and apply Title Case for display. */
	const prettifyFilename = (filename: string): string => {
		let name = filename.replace(/\.(pdf|docx)$/i, '');
		// Replace separators with spaces
		name = name.replace(/[_\-.]+/g, ' ');
		// Strip parenthetical / bracketed numbers and version markers
		name = name.replace(/\(\s*\d+\s*\)/g, '');
		name = name.replace(/\[\s*\d+\s*\]/g, '');
		// Strip common junk tokens (case-insensitive, whole words only)
		const junk = /\b(final|finale|cleaned|clean|copy|copie|draft|brouillon|v\d+|version\s*\d+|rev\d+|revision\s*\d+|\d{8}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})\b/gi;
		name = name.replace(junk, '');
		// Collapse whitespace
		name = name.replace(/\s+/g, ' ').trim();
		if (!name) return filename;
		// Title Case (preserve all-caps acronyms of 2+ chars)
		return name
			.split(' ')
			.map((word) => {
				if (/^[A-Z]{2,}$/.test(word)) return word;
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			})
			.join(' ');
	};

	const formatFileSize = (bytes?: number): string => {
		if (!bytes || bytes <= 0) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const normalizePdfArtifactLine = (line: string): string =>
		line
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.replace(/[0-9]+/g, '#')
			.replace(/[|•·]/g, ' ')
			.trim();

	const looksLikePageCounter = (line: string): boolean => {
		const value = line.trim().toLowerCase();
		if (!value) return false;
		if (/^(?:p\.?|page|pages?)\s*\d+(?:\s*(?:\/|of|sur)\s*\d+)?$/.test(value)) return true;
		if (/^\d+\s*(?:\/|of|sur)\s*\d+$/.test(value)) return true;
		if (/^\d{1,4}$/.test(value)) return true;
		return false;
	};

	const stripRepeatedPdfArtifacts = (pageTexts: string[]): string[] => {
		if (pageTexts.length < 2) return pageTexts;
		const topLineCounts = new Map<string, number>();
		const bottomLineCounts = new Map<string, number>();

		for (const pageText of pageTexts) {
			const lines = pageText
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean);
			if (!lines.length) continue;

			const topLine = normalizePdfArtifactLine(lines[0]);
			const bottomLine = normalizePdfArtifactLine(lines[lines.length - 1]);
			if (topLine && topLine.length <= 140) {
				topLineCounts.set(topLine, (topLineCounts.get(topLine) ?? 0) + 1);
			}
			if (bottomLine && bottomLine.length <= 140) {
				bottomLineCounts.set(bottomLine, (bottomLineCounts.get(bottomLine) ?? 0) + 1);
			}
		}

		const repeatedThreshold = Math.max(2, Math.ceil(pageTexts.length * 0.5));
		const repeatedTopLines = new Set(
			Array.from(topLineCounts.entries())
				.filter(([, count]) => count >= repeatedThreshold)
				.map(([line]) => line)
		);
		const repeatedBottomLines = new Set(
			Array.from(bottomLineCounts.entries())
				.filter(([, count]) => count >= repeatedThreshold)
				.map(([line]) => line)
		);

		return pageTexts.map((pageText) => {
			const lines = pageText
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean);
			if (!lines.length) return '';

			let start = 0;
			let end = lines.length;
			const topLine = normalizePdfArtifactLine(lines[0]);
			const bottomLine = normalizePdfArtifactLine(lines[lines.length - 1]);

			if (looksLikePageCounter(lines[0]) || repeatedTopLines.has(topLine)) start = 1;
			if (end - start > 0 && (looksLikePageCounter(lines[end - 1]) || repeatedBottomLines.has(bottomLine))) {
				end -= 1;
			}

			return lines.slice(start, end).join('\n').trim();
		});
	};

	const extractPdfPageText = async (page: any): Promise<string> => {
		const content = await page.getTextContent();
		type PdfTextItem = { str?: string; transform?: number[] };
		type PositionedPdfText = { text: string; x: number; y: number };
		const rawItems = content.items as PdfTextItem[];
		const positionedItems: PositionedPdfText[] = rawItems
			.filter((item) => typeof item.str === 'string' && item.str.trim().length > 0)
			.map((item) => {
				const transform = item.transform;
				return {
					text: item.str!.trim(),
					x: transform?.[4] ?? 0,
					y: transform?.[5] ?? 0
				};
			})
			.filter((item) => item.text.length > 0)
			.sort((left, right) => {
				const yDiff = right.y - left.y;
				if (Math.abs(yDiff) > 2.4) return yDiff;
				return left.x - right.x;
			});

		const lines: string[] = [];
		let currentY: number | null = null;
		let lineBuffer: string[] = [];
		const flushLine = () => {
			if (!lineBuffer.length) return;
			const line = lineBuffer.join(' ').replace(/\s+/g, ' ').trim();
			if (line) lines.push(line);
			lineBuffer = [];
		};

		for (const item of positionedItems) {
			if (currentY === null) {
				currentY = item.y;
				lineBuffer.push(item.text);
				continue;
			}
			if (Math.abs(item.y - currentY) > 2.4) {
				flushLine();
				currentY = item.y;
			}
			lineBuffer.push(item.text);
		}
		flushLine();

		return lines.join('\n');
	};

	const fileExtensionOf = (doc: LibraryDocument): 'pdf' | 'docx' | 'url' | 'doc' => {
		const name = (doc.originalFileName || doc.sourceUrl || '').toLowerCase();
		if (name.endsWith('.pdf') || doc.mimeType?.includes('pdf')) return 'pdf';
		if (name.endsWith('.docx') || doc.mimeType?.includes('wordprocessingml')) return 'docx';
		if (doc.sourceUrl?.startsWith('http')) return 'url';
		return 'doc';
	};

	const startRename = (doc: LibraryDocument) => {
		renamingId = doc.id;
		renameValue = doc.title;
		setTimeout(() => {
			renameInputEl?.focus();
			renameInputEl?.select();
		}, 0);
	};

	const commitRename = () => {
		if (!renamingId || !selectedPack) {
			renamingId = '';
			return;
		}
		const next = renameValue.trim();
		if (next) legalPacksStore.renameSource(selectedPack.id, renamingId, next);
		renamingId = '';
		renameValue = '';
	};

	const cancelRename = () => {
		renamingId = '';
		renameValue = '';
	};

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
		sourcePackMetadataLabel = '';
		packLanguage = $language;
		packDomain = '';
		packDescription = '';
		packModalOpen = true;
	};

	const openEditPack = (pack: LegalPack) => {
		editingPackId = pack.id;
		packName = pack.name;
		sourcePackMetadataLabel = pack.jurisdiction;
		packLanguage = pack.language ?? 'en';
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
				jurisdiction: sourcePackMetadataLabel.trim() || 'Source materials',
				language: packLanguage,
				domain: packDomain.trim() || 'General',
				description: packDescription.trim()
			});
		} else {
			legalPacksStore.createPack({
				name: packName.trim(),
				jurisdiction: sourcePackMetadataLabel.trim() || 'Source materials',
				language: packLanguage,
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

		// Auto-fill title from filename — strip common junk suffixes and apply Title Case
		const autoTitle = prettifyFilename(file.name);

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
					const pageText = await extractPdfPageText(page);
					pageTexts.push(pageText);
				}
				const cleanedPageTexts = stripRepeatedPdfArtifacts(pageTexts).filter(Boolean);
				extractedText = cleanedPageTexts.join('\n\n').trim();
				if (extractedText.length < 80) {
					extractedText = pageTexts.join('\n\n').trim();
				}
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
				const uploadRes = await fetchWithAuthRetry('/api/library/upload-file', {
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
			let ingestionAudit: LibraryDocument['ingestionAudit'] | null = null;

			for (let i = 0; i < segments.length; i++) {
				parseProgress = segments.length > 1
					? `${t('library.storingChunks', $language)} (${i + 1}/${segments.length})`
					: t('library.storingChunks', $language);

				const response = await fetchWithAuthRetry('/api/library/ingest-text', {
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
				if (payload.ingestionAudit) ingestionAudit = payload.ingestionAudit as LibraryDocument['ingestionAudit'];
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
				ingestionAudit: ingestionAudit ?? ingested.ingestionAudit,
				content: text.slice(0, 1000)
			};
			legalPacksStore.addSourceToPack(selectedPack.id, doc);
		} catch (err) {
			sourceError = err instanceof Error ? err.message : t('library.pdfParseFailed', $language);
			parseProgress = '';
		} finally {
			ingesting = false;
		}
	};

	const removeSourceFromPack = (sourceId: string) => {
		if (!selectedPack) return;
		legalPacksStore.removeSourceFromPack(selectedPack.id, sourceId);
		// Clean up indexed chunks
		fetchWithAuthRetry(`/api/library/index?sourceId=${encodeURIComponent(sourceId)}`, { method: 'DELETE' }).catch(() => {});
	};

	const openOriginalDocument = async (doc: LibraryDocument) => {
		// Uploaded custom docs: try inline preview of original PDF/DOCX
		if (doc.isCustom) {
			const ok = await openInlinePreview(doc);
			if (ok) return;
			// Fallback: open the styled reader modal with extracted text + warning
			selectedDoc = doc;
			readerOpen = true;
			content = '';
			error = doc.storagePath ? t('library.previewFailed', $language) : t('library.legacyNoOriginal', $language);
			await loadDocument(doc);
			return;
		}

		// Built-in docs: keep current reader (markdown placeholders)
		await openReader(doc);
	};

	/**
	 * Inline preview of an uploaded PDF or DOCX inside a styled modal.
	 * - PDF → fetched as blob, displayed via blob: URL in an <iframe> (native browser viewer).
	 * - DOCX → fetched as ArrayBuffer, rendered to HTML via mammoth.
	 * Returns false if no original file is available so the caller can fall back.
	 */
	const openInlinePreview = async (doc: LibraryDocument): Promise<boolean> => {
		// Reset previous preview
		closePreview();
		selectedDoc = doc;
		previewName = doc.originalFileName || doc.title;
		previewLoading = true;
		previewError = null;
		previewOpen = true;

		try {
			const res = await fetchWithAuthRetry(`/api/library/source-file-url?sourceId=${encodeURIComponent(doc.id)}`);
			if (!res.ok) {
				previewOpen = false;
				return false;
			}
			const payload = await res.json().catch(() => null);
			const signedUrl: string | undefined = payload?.url;
			if (!signedUrl) {
				previewOpen = false;
				return false;
			}
			previewUrl = signedUrl;

			const mime: string = payload?.mimeType || '';
			const name: string = payload?.originalFileName || doc.originalFileName || doc.title;
			const isDocx = mime.includes('wordprocessingml') || /\.docx$/i.test(name);
			const isPdf = mime.includes('pdf') || /\.pdf$/i.test(name);

			if (isPdf) {
				previewKind = 'pdf';
				// Fetch as blob to allow blob: URL → avoids any cross-origin iframe oddities
				try {
					const fileRes = await fetch(signedUrl);
					if (fileRes.ok) {
						const blob = await fileRes.blob();
						previewObjectUrl = URL.createObjectURL(blob);
					}
				} catch {
					// If fetch fails, iframe will try the signed URL directly
				}
				previewLoading = false;
				return true;
			}

			if (isDocx) {
				previewKind = 'docx';
				const fileRes = await fetch(signedUrl);
				if (!fileRes.ok) throw new Error('docx fetch failed');
				const arrayBuffer = await fileRes.arrayBuffer();
				const mammoth = await import('mammoth');
				const result = await mammoth.convertToHtml({ arrayBuffer });
				previewHtml = result.value || '';
				previewLoading = false;
				return true;
			}

			// Unknown type: just expose the signed URL with a download button
			previewKind = 'pdf';
			previewLoading = false;
			return true;
		} catch (err) {
			console.warn('Inline preview failed:', err);
			previewError = t('library.previewFailed', $language);
			previewLoading = false;
			previewOpen = false;
			return false;
		}
	};

	const closePreview = () => {
		previewOpen = false;
		previewKind = null;
		previewHtml = '';
		previewName = '';
		previewError = null;
		previewLoading = false;
		if (previewObjectUrl) {
			URL.revokeObjectURL(previewObjectUrl);
			previewObjectUrl = '';
		}
		previewUrl = '';
	};

	const onPreviewOverlayClick = (event: MouseEvent) => {
		if (event.target === event.currentTarget) closePreview();
	};

	const loadDocument = async (doc: LibraryDocument) => {
		loading = true;
		error = null;
		readerVisibleChars = READER_STEP_CHARS;
		contentIsMarkdown = false;
		try {
			const isUploadedDoc = !!doc.isCustom || doc.sourceUrl?.startsWith('uploaded://');
			if (isUploadedDoc) {
				const response = await fetchWithAuthRetry(`/api/library/source-text?sourceId=${encodeURIComponent(doc.id)}`);
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
				contentIsMarkdown = doc.filePath.toLowerCase().endsWith('.md');
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
	$: renderedMarkdown = contentIsMarkdown ? (marked.parse(visibleContent) as string) : '';

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
							<p class="text-sm text-white/60 mt-0.5">{pack.domain} · {pack.language.toUpperCase()}</p>
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
							<p class="text-sm text-white/60 mt-0.5">{selectedPack.domain} · {selectedPack.language.toUpperCase()}</p>
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

					<div class="grid gap-3 sm:grid-cols-2">
						{#each selectedPack.sources as doc}
						{@const ext = fileExtensionOf(doc)}
						<div class="group border border-white/15 rounded-lg p-4 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/25 transition flex gap-3">
							<!-- File-type icon -->
							<div class="shrink-0">
								{#if ext === 'pdf'}
									<div class="w-10 h-12 rounded bg-red-500/15 border border-red-400/30 flex items-center justify-center text-red-300 text-[10px] font-bold tracking-tight">PDF</div>
								{:else if ext === 'docx'}
									<div class="w-10 h-12 rounded bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 text-[10px] font-bold tracking-tight">DOCX</div>
								{:else if ext === 'url'}
									<div class="w-10 h-12 rounded bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 text-[10px] font-bold tracking-tight">URL</div>
								{:else}
									<div class="w-10 h-12 rounded bg-white/10 border border-white/20 flex items-center justify-center text-white/60 text-[10px] font-bold tracking-tight">DOC</div>
								{/if}
							</div>

							<!-- Body -->
							<div class="flex-1 min-w-0 flex flex-col gap-1.5">
								<!-- Title row (rename-on-click) -->
								<div class="flex items-start justify-between gap-2">
									{#if renamingId === doc.id}
										<input
											bind:this={renameInputEl}
											bind:value={renameValue}
											on:blur={commitRename}
											on:keydown={(e) => {
												if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
												else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
											}}
											class="flex-1 min-w-0 text-sm font-semibold text-white bg-black/30 border border-flare/40 rounded px-2 py-1 outline-none"
										/>
									{:else}
										<button
											type="button"
											class="text-left flex-1 min-w-0 group/title"
											on:click={() => openOriginalDocument(doc)}
											title={t('library.openDocument', $language)}
										>
											<p class="text-sm font-semibold text-white leading-snug line-clamp-2 group-hover/title:text-flare transition">{doc.title}</p>
										</button>
									{/if}
								</div>

								<!-- Filename + size meta line -->
								{#if doc.originalFileName || doc.fileSize}
									<p class="text-[11px] text-white/45 font-mono truncate" title={doc.originalFileName ?? ''}>
										{#if doc.originalFileName}{doc.originalFileName}{/if}{#if doc.originalFileName && doc.fileSize} · {/if}{#if doc.fileSize}{formatFileSize(doc.fileSize)}{/if}
									</p>
								{:else if doc.sourceUrl && doc.sourceUrl.startsWith('http')}
									<a href={doc.sourceUrl} target="_blank" rel="noreferrer" class="text-[11px] text-white/45 hover:text-flare hover:underline truncate font-mono" title={doc.sourceUrl}>{doc.sourceUrl}</a>
								{/if}

								<!-- Actions -->
								{#if renamingId !== doc.id}
									<div class="flex items-center gap-1.5 pt-1.5 mt-auto opacity-70 group-hover:opacity-100 transition">
										<button
											type="button"
											on:click={() => openOriginalDocument(doc)}
											class="text-[11px] px-2.5 py-1 border border-flare/40 rounded text-flare hover:bg-flare/10 font-bold uppercase tracking-wider"
										>
											{t('library.openDocument', $language)}
										</button>
										<button
											type="button"
											on:click={() => startRename(doc)}
											class="text-[11px] px-2 py-1 border border-white/20 rounded text-white/65 hover:text-white hover:bg-white/10"
											title={t('library.renameTitle', $language)}
											aria-label={t('library.renameTitle', $language)}
										>
											{t('library.rename', $language)}
										</button>
										{#if doc.isCustom}
											<button
												type="button"
												on:click={() => removeSourceFromPack(doc.id)}
												class="text-[11px] px-2 py-1 border border-red-400/40 rounded text-red-300 hover:text-white hover:bg-red-500/20 ml-auto font-bold uppercase tracking-wider"
											>
												{t('library.remove', $language)}
											</button>
										{/if}
									</div>
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
			<header class="p-6 pb-4 border-b border-white/10">
				<h3 class="text-lg font-bold text-white">{selectedDoc.title}</h3>
				<p class="text-white/50 text-xs mt-1">{selectedDoc.description}</p>
				{#if selectedDoc.storagePath && selectedDoc.isCustom}
					<button
						type="button"
						on:click={() => {
							if (selectedDoc) {
								closeReader();
								openInlinePreview(selectedDoc);
							}
						}}
						class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 border border-flare/40 rounded text-xs font-bold uppercase tracking-widest text-flare hover:bg-flare/10"
					>
						{t('library.openDocument', $language)}
					</button>
				{/if}
				{#if selectedDoc.sourceUrl && !selectedDoc.sourceUrl.startsWith('uploaded://')}
					<p class="text-xs text-flare mt-2 break-all">{selectedDoc.sourceUrl}</p>
				{/if}
			</header>
			<section class="flex-1 overflow-y-auto px-8 py-6">
				{#if loading}
					<p class="text-white/60 text-sm">{t('library.loading', $language)}</p>
				{:else if error}
					<p class="text-red-300 text-sm">{error}</p>
				{:else if contentIsMarkdown}
					<article class="reader-prose text-white/85 max-w-3xl mx-auto">
						{@html renderedMarkdown}
					</article>
					{#if content.length > 0}
						<p class="mt-6 text-xs text-white/50 max-w-3xl mx-auto">
							{t('library.readerShowing', $language)
								.replace('{shown}', String(Math.min(readerVisibleChars, content.length)))
								.replace('{total}', String(content.length))}
						</p>
					{/if}
					{#if hasMoreContent}
						<div class="mt-3 max-w-3xl mx-auto">
							<button
								type="button"
								on:click={loadMoreReaderContent}
								class="px-3 py-1.5 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10"
							>
								{t('library.readerLoadMore', $language)}
							</button>
						</div>
					{/if}
				{:else}
					<pre class="whitespace-pre-wrap text-white/85 text-[15px] leading-[1.9] font-sans max-w-3xl mx-auto">{visibleContent}</pre>
					{#if content.length > 0}
						<p class="mt-6 text-xs text-white/50 max-w-3xl mx-auto">
							{t('library.readerShowing', $language)
								.replace('{shown}', String(Math.min(readerVisibleChars, content.length)))
								.replace('{total}', String(content.length))}
						</p>
					{/if}
					{#if hasMoreContent}
						<div class="mt-3 max-w-3xl mx-auto">
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

<!-- Inline original-file preview (PDF iframe / DOCX rendered HTML) -->
{#if previewOpen && selectedDoc}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 py-6"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={onPreviewOverlayClick}
		on:keydown={(event) => {
			if (event.key === 'Escape') closePreview();
		}}
	>
		<div class="relative w-full max-w-6xl bg-ink border border-white/15 rounded-2xl flex flex-col h-[92vh]">
			<header class="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
				<div class="min-w-0 flex-1">
					<h3 class="text-sm font-bold text-white truncate" title={previewName || selectedDoc.title}>{previewName || selectedDoc.title}</h3>
				</div>
				<div class="flex items-center gap-2 shrink-0">
					{#if previewUrl}
						<a
							href={previewUrl}
							download={previewName}
							target="_blank"
							rel="noopener noreferrer"
							class="px-3 py-1.5 border border-flare/40 rounded text-xs font-bold uppercase tracking-widest text-flare hover:bg-flare/10"
						>
							{t('library.downloadOriginal', $language)}
						</a>
					{/if}
					<button type="button" on:click={closePreview} class="text-white/60 hover:text-white rounded-full border border-white/20 w-8 h-8 flex items-center justify-center text-sm" aria-label="Close preview">×</button>
				</div>
			</header>

			<section class="flex-1 min-h-0 overflow-hidden">
				{#if previewLoading}
					<div class="h-full flex items-center justify-center text-white/60 text-sm">
						<span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white/80 rounded-full animate-spin mr-2"></span>
						{t('library.preparingPreview', $language)}
					</div>
				{:else if previewError}
					<p class="p-6 text-red-300 text-sm">{previewError}</p>
				{:else if previewKind === 'pdf'}
					<iframe
						src={previewObjectUrl || previewUrl}
						title={previewName}
						class="w-full h-full bg-white"
					></iframe>
				{:else if previewKind === 'docx'}
					<div class="h-full overflow-y-auto bg-white">
						<article class="docx-preview max-w-3xl mx-auto px-10 py-10 text-[#1f2933]">
							{@html previewHtml}
						</article>
					</div>
				{/if}
			</section>
		</div>
	</div>
{/if}

<style>
	/* DOCX preview — Word-like document rendering */
	.docx-preview :global(h1) { font-size: 1.8rem; font-weight: 700; margin: 1.5rem 0 1rem; line-height: 1.25; }
	.docx-preview :global(h2) { font-size: 1.4rem; font-weight: 700; margin: 1.25rem 0 0.75rem; line-height: 1.3; }
	.docx-preview :global(h3) { font-size: 1.15rem; font-weight: 600; margin: 1rem 0 0.5rem; }
	.docx-preview :global(h4),
	.docx-preview :global(h5),
	.docx-preview :global(h6) { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
	.docx-preview :global(p) { font-size: 1rem; line-height: 1.7; margin: 0.6rem 0; }
	.docx-preview :global(ul),
	.docx-preview :global(ol) { margin: 0.6rem 0 0.6rem 1.5rem; }
	.docx-preview :global(ul) { list-style: disc; }
	.docx-preview :global(ol) { list-style: decimal; }
	.docx-preview :global(li) { margin: 0.25rem 0; line-height: 1.6; }
	.docx-preview :global(strong) { font-weight: 700; }
	.docx-preview :global(em) { font-style: italic; }
	.docx-preview :global(table) { border-collapse: collapse; margin: 1rem 0; width: 100%; }
	.docx-preview :global(td),
	.docx-preview :global(th) { border: 1px solid #d1d5db; padding: 0.4rem 0.6rem; vertical-align: top; }
	.docx-preview :global(th) { background: #f3f4f6; font-weight: 600; }
	.docx-preview :global(a) { color: #1d4ed8; text-decoration: underline; }
	.docx-preview :global(img) { max-width: 100%; height: auto; }
	.docx-preview :global(blockquote) { border-left: 3px solid #cbd5e1; margin: 0.75rem 0; padding: 0.25rem 0 0.25rem 1rem; color: #475569; }

	/* Typography for rendered markdown in the document reader */
	.reader-prose :global(h1) {
		font-size: 1.75rem;
		font-weight: 700;
		color: #fff;
		margin: 2rem 0 1rem;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}
	.reader-prose :global(h2) {
		font-size: 1.35rem;
		font-weight: 700;
		color: #fff;
		margin: 1.75rem 0 0.75rem;
		line-height: 1.3;
	}
	.reader-prose :global(h3) {
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.92);
		margin: 1.5rem 0 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.reader-prose :global(h4),
	.reader-prose :global(h5),
	.reader-prose :global(h6) {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.85);
		margin: 1.25rem 0 0.5rem;
	}
	.reader-prose :global(p) {
		font-size: 0.95rem;
		line-height: 1.85;
		margin: 0 0 1rem;
	}
	.reader-prose :global(ul),
	.reader-prose :global(ol) {
		padding-left: 1.5rem;
		margin: 0 0 1rem;
	}
	.reader-prose :global(ul) { list-style: disc; }
	.reader-prose :global(ol) { list-style: decimal; }
	.reader-prose :global(li) {
		font-size: 0.95rem;
		line-height: 1.75;
		margin-bottom: 0.35rem;
	}
	.reader-prose :global(strong) {
		color: #fff;
		font-weight: 600;
	}
	.reader-prose :global(em) { font-style: italic; }
	.reader-prose :global(blockquote) {
		border-left: 3px solid rgba(255, 255, 255, 0.25);
		padding: 0.25rem 0 0.25rem 1rem;
		margin: 1rem 0;
		color: rgba(255, 255, 255, 0.7);
		font-style: italic;
	}
	.reader-prose :global(code) {
		background: rgba(255, 255, 255, 0.08);
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		font-size: 0.85em;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	.reader-prose :global(pre) {
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 0.85rem 1rem;
		border-radius: 6px;
		overflow-x: auto;
		margin: 1rem 0;
	}
	.reader-prose :global(pre code) {
		background: transparent;
		padding: 0;
	}
	.reader-prose :global(hr) {
		border: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		margin: 2rem 0;
	}
	.reader-prose :global(a) {
		color: #ffb347;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.reader-prose :global(a:hover) {
		color: #ffc876;
	}
	.reader-prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 1rem 0;
		font-size: 0.9rem;
	}
	.reader-prose :global(th),
	.reader-prose :global(td) {
		border: 1px solid rgba(255, 255, 255, 0.12);
		padding: 0.5rem 0.75rem;
		text-align: left;
	}
	.reader-prose :global(th) {
		background: rgba(255, 255, 255, 0.05);
		font-weight: 600;
		color: #fff;
	}
</style>
