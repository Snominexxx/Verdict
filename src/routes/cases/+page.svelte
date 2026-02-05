<script lang="ts">
	import { goto } from '$app/navigation';
	import { libraryDocuments } from '$lib/data/library';
	import { stageCase } from '$lib/stores/stagedCase';
	import { seedTranscript } from '$lib/stores/debate';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import type { StagedCase, CourtType } from '$lib/types';

	type FormSubmission = Omit<StagedCase, 'id' | 'createdAt'>;

	let formData: FormSubmission = {
		title: '',
		synopsis: '',
		issues: '',
		remedy: '',
		role: 'plaintiff',
		sources: libraryDocuments.map((doc) => doc.id),
		courtType: 'jury' as CourtType
	};

	let submission: StagedCase | null = null;
	let submitting = false;
	let errorMessage = '';
	let generating = false;

	const autoFill = async () => {
		generating = true;
		try {
			const response = await fetch('/api/generate-case');
			if (!response.ok) throw new Error('Failed to generate case');
			const data = await response.json();
			formData = {
				...formData,
				title: data.title,
				synopsis: data.synopsis,
				issues: data.issues,
				remedy: data.remedy
			};
		} catch (err) {
			console.error('Auto-fill failed:', err);
			// Fallback to hardcoded example
			formData = {
				...formData,
				title: 'Tremblay v. QuickServe Inc.',
				synopsis: 'I worked at QuickServe for 3 years as a shift manager. On January 15, I was called into the office and told I was being let go effective immediately. They said it was "restructuring" but hired someone new for my position two weeks later.',
				issues: 'Was I wrongfully dismissed? Am I entitled to notice or severance pay?',
				remedy: 'Compensation for lost wages, severance pay, and a letter of reference.'
			};
		} finally {
			generating = false;
		}
	};

	const toggleSource = (id: string) => {
		if (formData.sources.includes(id)) {
			formData = { ...formData, sources: formData.sources.filter((src) => src !== id) };
		} else {
			formData = { ...formData, sources: [...formData.sources, id] };
		}
	};

	const handleSubmit = async () => {
		if (!formData.title.trim() || !formData.synopsis.trim()) return;
		submitting = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || !payload) {
				throw new Error(payload?.message ?? 'Unable to stage the case.');
			}
			const staged = stageCase(payload as StagedCase);
			seedTranscript(staged);
			caseHistoryStore.registerCase(staged);
			submission = staged;
			await goto('/debate');
		} catch (err) {
			console.error('Case creation failed', err);
			errorMessage = err instanceof Error ? err.message : 'Something went wrong while staging the case.';
		} finally {
			submitting = false;
		}
	};
</script>


<div class="h-full grid grid-rows-[auto_1fr] gap-0">
	<!-- Module Header -->
	<header class="border-b border-white/10 bg-black/20 px-6 py-4 flex items-center justify-between">
		<div>
			<h2 class="text-sm font-bold uppercase tracking-wider text-white">Start a Case</h2>
			<p class="text-xs text-white/50 mt-1">Keep it simple. Tell the story in plain words.</p>
		</div>
		<div class="flex gap-2">
			<!-- Toolbar placeholders -->
			<button class="px-3 py-1.5 border border-white/10 hover:bg-white/5 text-xs text-white/70 rounded">Reset Form</button>
		</div>
	</header>

	<div class="grid lg:grid-cols-[1.5fr_1fr] h-full overflow-hidden">
		<!-- Left Panel: Input Configuration -->
		<div class="p-6 overflow-y-auto border-r border-white/10 scrollbar-hide">
			<form class="space-y-6 max-w-3xl" on:submit|preventDefault={handleSubmit}>
				
				<!-- Court Configuration -->
				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<p class="text-xs font-bold uppercase tracking-widest text-white/70 font-mono">Mode</p>
						<div class="flex gap-2">
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="courtType" value="jury" bind:group={formData.courtType} class="sr-only peer" />
								<div class="text-center py-3 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									Jury
								</div>
							</label>
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="courtType" value="bench" bind:group={formData.courtType} class="sr-only peer" />
								<div class="text-center py-3 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									Judge
								</div>
							</label>
						</div>
					</div>
				<div class="flex items-end">
					<button
						type="button"
						on:click={autoFill}
						disabled={generating}
						class="px-4 py-3 border border-flare/50 text-flare text-xs font-bold uppercase rounded hover:bg-flare/10 transition-all disabled:opacity-50 disabled:cursor-wait"
					>
						{generating ? 'Generating...' : 'Auto-fill'}
					</button>
				</div>
				</div>

				<!-- Primary Identifiers -->
				<div class="grid gap-4 md:grid-cols-3">
					<div class="md:col-span-2 space-y-2">
						<p class="text-xs font-bold uppercase tracking-widest text-white/70 font-mono">Case Title</p>
						<input
							type="text"
							class="w-full bg-white/10 rounded border border-white/20 px-4 py-3 text-base font-medium text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-colors placeholder-white/50 font-display"
							bind:value={formData.title}
							placeholder="e.g. Smith v. Jones"
						/>
					</div>
					<div class="space-y-2">
						<p class="text-xs font-bold uppercase tracking-widest text-white/70 font-mono">Your Side</p>
						<div class="flex gap-2 pt-0">
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="role" value="plaintiff" bind:group={formData.role} class="sr-only peer" />
								<div class="text-center py-3 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									Plaintiff
								</div>
							</label>
							<label class="flex-1 cursor-pointer">
								<input type="radio" name="role" value="defendant" bind:group={formData.role} class="sr-only peer" />
								<div class="text-center py-3 border border-white/20 text-xs font-bold uppercase text-white/70 bg-white/5 rounded peer-checked:bg-white peer-checked:text-black peer-checked:border-white transition-all hover:bg-white/10">
									Defendant
								</div>
							</label>
						</div>
					</div>
				</div>

				<!-- Text Areas (Side by Side) -->
				<div class="grid gap-6 md:grid-cols-2">
					<div class="space-y-2">
						<p class="text-xs font-bold uppercase tracking-widest text-white/70 font-mono">What Happened</p>
						<textarea
							class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white min-h-[160px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none font-mono leading-relaxed placeholder-white/50"
							bind:value={formData.synopsis}
							placeholder="> Short, clear summary of the facts."
						></textarea>
					</div>

					<div class="space-y-4">
						<div class="space-y-2">
							<p class="text-xs font-bold uppercase tracking-widest text-white/70 font-mono">Main Question</p>
							<textarea
								class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white min-h-[70px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none font-mono placeholder-white/50"
								bind:value={formData.issues}
								placeholder="> What should the court decide?"
							></textarea>
						</div>
						<div class="space-y-2">
							<p class="text-xs font-bold uppercase tracking-widest text-white/70 font-mono">What You Want</p>
							<textarea
								class="w-full bg-white/10 border border-white/20 rounded px-4 py-3 text-sm text-white min-h-[50px] focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none font-mono placeholder-white/50"
								bind:value={formData.remedy}
								placeholder="> The outcome you want."
							></textarea>
						</div>
					</div>
				</div>

				<!-- Sources Grid -->
				<div class="space-y-4 pt-4 border-t border-white/20">
					<div class="flex justify-between items-baseline mb-2">
						<p class="text-xs font-bold uppercase tracking-widest text-white/70 font-mono">Sources (Optional)</p>
						<span class="text-xs font-bold text-white/50">{formData.sources.length} Selected</span>
					</div>
					
					<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
						{#each libraryDocuments as doc}
							<label class={`
								group relative flex items-start gap-2 p-2 border transition-all cursor-pointer rounded-sm hover:bg-white/5
								${formData.sources.includes(doc.id) ? 'border-white/40 bg-white/5' : 'border-white/5 text-white/40'}
							`}>
								<input
									type="checkbox"
									checked={formData.sources.includes(doc.id)}
									on:change={() => toggleSource(doc.id)}
									class="mt-0.5"
								/>
								<div class="min-w-0">
									<div class={`text-xs font-medium truncate ${formData.sources.includes(doc.id) ? 'text-white' : 'text-white/50'}`}>
										{doc.title}
									</div>
								</div>
							</label>
						{/each}
					</div>
				</div>

				<!-- Actions -->
				<div class="pt-6 flex items-center justify-end gap-4 border-t border-white/10">
					<div class="text-[10px] text-white/30 font-mono text-right hidden sm:block">
						SYSTEM_READY // WAITING_FOR_INPUT
					</div>
					<button
						type="submit"
						class="px-8 py-2 bg-white hover:bg-white/90 text-black text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						disabled={!formData.title.trim() || !formData.synopsis.trim() || submitting}
					>
						{submitting ? 'PROCESSING...' : 'INITIALIZE CASE'}
					</button>
				</div>
			</form>
		</div>

		<!-- Right Panel: Context & History -->
		<div class="hidden lg:flex flex-col bg-black/20 overflow-hidden">
			<!-- Upload Zone -->
			<div class="p-6 border-b border-white/10">
				<div class="border border-dashed border-white/20 bg-white/5 rounded-sm p-6 text-center transition-colors hover:border-white/40 hover:bg-white/10 cursor-pointer">
					<div class="text-white/40 mb-2">
						<svg class="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
					</div>
					<p class="text-xs text-white/60 font-medium">Upload Evidence / Packet</p>
					<p class="text-[10px] text-white/30 mt-1 font-mono">PDF, DOCX, TXT // SHA-256 VERIFIED</p>
				</div>
			</div>

			<!-- Sample Cases List -->
			<div class="flex-1 overflow-y-auto p-0">
				<div class="sticky top-0 bg-[#05030b] border-b border-white/10 px-6 py-2 z-10">
					<span class="text-[10px] uppercase tracking-widest text-white/40 font-mono">Example</span>
				</div>
				<div class="p-6 space-y-6">
					<div>
						<p class="text-[10px] uppercase tracking-widest text-white/30 font-mono mb-1.5">Title</p>
						<p class="text-sm font-bold text-white">Tremblay v. TechNova Inc.</p>
					</div>

					<div>
						<p class="text-[10px] uppercase tracking-widest text-white/30 font-mono mb-1.5">What Happened</p>
						<p class="text-xs text-white/60 leading-relaxed">
							After 15 years at the company, the employee was fired by an automated system with no human review or appeal.
						</p>
					</div>

					<div>
						<p class="text-[10px] uppercase tracking-widest text-white/30 font-mono mb-1.5">Main Question</p>
						<div class="text-xs text-white/60 leading-relaxed font-mono bg-white/5 p-2 rounded border border-white/5">
							1. Was this firing fair without any human review?<br/>
							2. Was 2 weeks of severance enough after 15 years?
						</div>
					</div>

					<div>
						<p class="text-[10px] uppercase tracking-widest text-white/30 font-mono mb-1.5">What They Want</p>
						<p class="text-xs text-white/60 leading-relaxed">
							24 months notice • damages for unfair treatment • job restored
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>