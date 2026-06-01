<script lang="ts">
	import type { VerifiedCitation } from '$lib/types';

	export let citations: VerifiedCitation[] = [];

	let expandedIndex: number | null = null;

	const toggle = (i: number) => {
		expandedIndex = expandedIndex === i ? null : i;
	};

	$: verified = citations.filter((c) => c.status === 'verified');
	$: unverified = citations.filter((c) => c.status === 'unverified');
</script>

{#if citations.length}
	<div class="mt-3 w-full max-w-xl text-xs">
		<div class="flex items-center gap-3 mb-2 font-mono uppercase tracking-widest text-[10px]">
			{#if verified.length}
				<span class="flex items-center gap-1 text-emerald-300">
					<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
					{verified.length} verified
				</span>
			{/if}
			{#if unverified.length}
				<span class="flex items-center gap-1 text-rose-300">
					<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
					{unverified.length} unverified
				</span>
			{/if}
		</div>

		<ul class="space-y-1.5">
			{#each citations as cite, i}
				<li>
					<button
						type="button"
						on:click={() => toggle(i)}
						class="w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded border transition-colors font-mono
							{cite.status === 'verified'
								? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100 hover:bg-emerald-500/10'
								: 'border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20'}"
					>
						<span class="mt-0.5 text-[10px] leading-none">
							{cite.status === 'verified' ? '✓' : '✕'}
						</span>
						<span class="flex-1 break-words">{cite.text}</span>
						{#if cite.status === 'verified' && cite.sourceTitle}
							<span class="opacity-60 hidden sm:inline truncate max-w-[12rem]">{cite.sourceTitle}</span>
						{/if}
					</button>

					{#if expandedIndex === i}
						<div class="mt-1 ml-4 px-3 py-2 border-l-2
							{cite.status === 'verified'
								? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-50/90'
								: 'border-rose-500/50 bg-rose-500/5 text-rose-50/90'}">
							{#if cite.status === 'verified'}
								<p class="text-[10px] uppercase tracking-widest opacity-60 mb-1">
									{cite.sourceTitle}
								</p>
								<p class="font-serif text-sm leading-snug whitespace-pre-wrap">
									{cite.excerpt ?? '(no excerpt available)'}
								</p>
							{:else}
								<p class="text-[10px] uppercase tracking-widest opacity-60 mb-1">
									Citation not located
								</p>
								<p class="leading-snug">
									This reference was not found verbatim in the sources you attached to this case.
									Treat it as unverified — the AI may have produced it from training memory.
									Re-import the official text or remove the source from the case.
								</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
