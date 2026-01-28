<script lang="ts">
	import { libraryDocuments, type LibraryDocument } from '$lib/data/library';

	let selectedDoc: LibraryDocument | null = null;
	let content = '';
	let loading = false;
	let error: string | null = null;
	let readerOpen = false;

	// Group documents by jurisdiction
	const jurisdictions = [
		{ key: 'Quebec', label: 'Quebec', description: 'Provincial statutes and codes' },
		{ key: 'Canada', label: 'Canada', description: 'Federal legislation' }
	];

	const groupedDocs = jurisdictions.map((j) => ({
		...j,
		docs: libraryDocuments.filter((doc) => doc.jurisdiction === j.key)
	}));

	let expandedSections: Record<string, boolean> = {
		Quebec: true,
		Canada: true
	};

	const toggleSection = (key: string) => {
		expandedSections[key] = !expandedSections[key];
	};

	const loadDocument = async (doc: LibraryDocument) => {
		loading = true;
		error = null;
		try {
			const response = await fetch(doc.filePath);
			if (!response.ok) throw new Error(`Unable to load ${doc.title}`);
			content = await response.text();
		} catch (err) {
			console.error(err);
			error = 'Document unavailable. Ensure the source file exists in static/library.';
		} finally {
			loading = false;
		}
	};

	const handleSelect = async (doc: LibraryDocument) => {
		selectedDoc = doc;
		readerOpen = true;
		await loadDocument(doc);
	};

	const closeReader = () => {
		readerOpen = false;
	};

	const handleOverlayClick = (event: MouseEvent) => {
		if (event.target === event.currentTarget) {
			closeReader();
		}
	};

	const handleOverlayKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			closeReader();
		}
	};
</script>

<section class="space-y-6">
	<div class="glass-panel rounded-3xl p-6 space-y-2">
		<p class="text-xs uppercase tracking-[0.4em] text-white/80 font-bold">Library</p>
		<h2 class="text-3xl font-display text-white">Authoritative Sources</h2>
		<p class="text-white/90 text-sm max-w-2xl leading-relaxed">
			Browse foundational Canadian authorities organized by jurisdiction.
		</p>
	</div>

	{#each groupedDocs as group}
		<div class="glass-panel rounded-3xl overflow-hidden">
			<!-- Section Header -->
			<button
				type="button"
				on:click={() => toggleSection(group.key)}
				class="w-full px-6 py-6 flex items-center justify-between hover:bg-white/5 transition-colors group"
			>
				<div class="flex flex-col items-start gap-1">
					<h3 class="text-xl font-display text-white group-hover:text-amber-400 transition-colors">{group.label}</h3>
					<p class="text-sm text-white/80 font-medium">{group.description} <span class="text-white/40 mx-2">|</span> {group.docs.length} documents</p>
				</div>
				<div class="text-white/70 text-xl transition-transform duration-200" class:rotate-180={expandedSections[group.key]}>
					▼
				</div>
			</button>

			<!-- Documents Grid -->
			{#if expandedSections[group.key]}
				<div class="px-6 pb-6 pt-2 border-t border-white/10">
					<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{#each group.docs as doc}
							<button
								type="button"
								on:click={() => handleSelect(doc)}
								class={`text-left px-5 py-4 rounded-xl border transition-all duration-150 flex flex-col gap-2 ${
									doc.id === selectedDoc?.id
										? 'border-white text-white bg-white/10 shadow-card'
										: 'border-white/20 text-white/90 hover:border-white/50 hover:bg-white/5 hover:text-white'
								}`}
							>
								<p class="text-base font-bold text-white leading-snug">{doc.title}</p>
								<p class="text-sm text-white/80 leading-relaxed line-clamp-2">{doc.description}</p>
								{#if doc.note}
									<span class="text-xs text-amber-400 font-mono font-medium mt-1">⚠ Placeholder content</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/each}

	{#if !readerOpen}
		<p class="text-center text-white/60 text-sm font-mono py-4">Select a document to open the reader.</p>
	{/if}
</section>

{#if readerOpen && selectedDoc}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 py-8"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={handleOverlayClick}
		on:keydown={handleOverlayKeyDown}
	>
		<div
			class="relative w-full max-w-5xl bg-ink border border-white/15 rounded-[32px] shadow-card flex flex-col max-h-[90vh]"
		>
			<button
				type="button"
				on:click={closeReader}
				class="absolute top-4 right-4 text-white/60 hover:text-white rounded-full border border-white/20 w-9 h-9 flex items-center justify-center"
				aria-label="Close reader"
			>
				×
			</button>
			<header class="p-8 pb-0">
				<p class="text-xs uppercase tracking-[0.4em] text-white/40">{selectedDoc.jurisdiction}</p>
				<h3 class="text-3xl font-display text-white mt-2">{selectedDoc.title}</h3>
				<p class="text-white/60 text-sm mt-1">{selectedDoc.description}</p>
				{#if selectedDoc.note}
					<p class="text-xs text-amber/70 mt-2">{selectedDoc.note}</p>
				{/if}
			</header>
			<section class="flex-1 overflow-y-auto px-8 py-6">
				{#if loading}
					<p class="text-white/60 text-sm">Loading document…</p>
				{:else if error}
					<p class="text-red-300 text-sm">{error}</p>
				{:else}
					<pre class="whitespace-pre-wrap text-white/90 text-[15px] leading-8 font-sans">
						{content}
					</pre>
				{/if}
			</section>
		</div>
	</div>
{/if}
