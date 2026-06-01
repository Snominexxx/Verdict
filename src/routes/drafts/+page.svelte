<script lang="ts">
	import { goto } from '$app/navigation';
	import { language } from '$lib/stores/language';
	import { draftsStore } from '$lib/stores/drafts';
	import { t } from '$lib/i18n';
	import ExercisePaperPreview from '$lib/components/ExercisePaperPreview.svelte';
	import type { SavedDraft } from '$lib/types';

	let previewDraft: SavedDraft | null = $state(null);

	const sortedDrafts = $derived(
		[...$draftsStore].sort(
			(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
		)
	);

	const formatDate = (value: string) =>
		new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const openDraft = (draftId: string) => {
		void goto(`/create?draft=${encodeURIComponent(draftId)}`);
	};

	const deleteDraft = (draftId: string) => {
		draftsStore.removeDraft(draftId);
		if (previewDraft?.id === draftId) previewDraft = null;
	};
</script>

<section class="min-h-full px-4 py-6 sm:px-6 sm:py-8">
	<div class="mx-auto max-w-7xl space-y-6">
		<header class="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_22px_60px_rgba(0,0,0,0.24)]">
			<p class="text-[11px] font-bold uppercase tracking-[0.24em] text-white/45">{t('nav.drafts', $language)}</p>
			<h1 class="mt-3 text-3xl font-display text-white">{t('drafts.title', $language)}</h1>
			<p class="mt-3 max-w-3xl text-sm leading-relaxed text-white/68">{t('drafts.subtitle', $language)}</p>
		</header>

		{#if sortedDrafts.length === 0}
			<div class="rounded-[1.8rem] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
				<h2 class="text-xl font-display text-white">{t('drafts.emptyTitle', $language)}</h2>
				<p class="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/60">{t('drafts.emptyDesc', $language)}</p>
				<div class="mt-6 flex justify-center">
					<a href="/create" class="inline-flex rounded-full bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-ink transition hover:bg-[#f4ebde]">{t('home.initCase', $language)}</a>
				</div>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each sortedDrafts as draft (draft.id)}
					<article class="flex h-full flex-col rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_20px_44px_rgba(0,0,0,0.22)]">
						<div class="space-y-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 space-y-2">
									<h2 class="truncate text-lg font-display text-white">{draft.title}</h2>
									<div class="flex flex-wrap gap-2">
										{#if draft.paperSnapshot.targetSkill}
											<span class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/62">{draft.paperSnapshot.targetSkill}</span>
										{/if}
										<span class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/62">{t('drafts.savedRole', $language)}: {draft.paperSnapshot.selectedRole === 'defendant' ? t('cases.defendant', $language) : t('cases.plaintiff', $language)}</span>
									</div>
								</div>
								<span class="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">{formatDate(draft.updatedAt)}</span>
							</div>

							<div class="space-y-2 text-sm leading-relaxed text-white/72">
								<p>{draft.paperSnapshot.objective || draft.draftData.objective || draft.paperSnapshot.synopsis}</p>
								{#if draft.packContext?.name}
									<p class="text-xs uppercase tracking-[0.16em] text-white/45">{t('drafts.savedPack', $language)}: {draft.packContext.name}</p>
								{/if}
								<p class="text-xs uppercase tracking-[0.16em] text-white/45">{t('drafts.updated', $language)}: {formatDate(draft.updatedAt)}</p>
							</div>
						</div>

						<div class="mt-5 flex flex-wrap gap-2 pt-4 border-t border-white/10">
							<button type="button" onclick={() => (previewDraft = draft)} class="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:border-white/30 hover:bg-white/[0.08]">{t('drafts.preview', $language)}</button>
							<button type="button" onclick={() => openDraft(draft.id)} class="inline-flex flex-1 items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-[#f4ebde]">{t('drafts.openInCreate', $language)}</button>
							<button type="button" onclick={() => deleteDraft(draft.id)} class="inline-flex items-center justify-center rounded-full border border-red-400/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-red-200 transition hover:border-red-300/50 hover:bg-red-500/10">{t('drafts.delete', $language)}</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</div>
</section>

{#if previewDraft}
	<div
		class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 sm:p-5"
		role="dialog"
		aria-modal="true"
		aria-label={t('cases.documentPreview', $language)}
		tabindex="0"
		onclick={(event) => {
			if (event.target === event.currentTarget) previewDraft = null;
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') previewDraft = null;
		}}
	>
		<div class="mx-auto max-w-5xl space-y-3">
			<div class="flex justify-end gap-2">
				<button type="button" class="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80 transition hover:border-white/30 hover:bg-black/40 hover:text-white" onclick={() => (previewDraft = null)}>{t('cases.closeExercisePaper', $language)}</button>
			</div>
			<ExercisePaperPreview paper={previewDraft.paperSnapshot} />
		</div>
	</div>
{/if}