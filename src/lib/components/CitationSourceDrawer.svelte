<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { LibraryDocument } from '$lib/data/library';
	import type { VerifiedCitation } from '$lib/types';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';

	export let open = false;
	export let citation: VerifiedCitation | null = null;
	export let source: LibraryDocument | null = null;
	export let sourceText = '';
	export let sourceTextVisible = false;
	export let sourceTextLoading = false;
	export let sourceTextError = '';
	export let originalLoading = false;

	const dispatch = createEventDispatcher<{
		close: void;
		toggleFullSource: void;
		openOriginal: void;
	}>();
</script>

{#if open && citation}
	<div
		class="citation-drawer-shell"
		role="dialog"
		aria-modal="true"
		aria-label={t('debate.sourceDrawerTitle', $language)}
		tabindex="0"
		on:click|self={() => dispatch('close')}
		on:keydown={(event) => {
			if (event.key === 'Escape') dispatch('close');
		}}
	>
		<aside class="citation-drawer">
			<header class="citation-drawer__header">
				<div>
					<p class="citation-drawer__eyebrow">{t('debate.sourceDrawerTitle', $language)}</p>
					<h2 class="citation-drawer__title">{source?.title ?? citation.sourceTitle ?? t('debate.sourceUnavailable', $language)}</h2>
					<p class="citation-drawer__desc">{t('debate.sourceDrawerDesc', $language)}</p>
				</div>
				<button type="button" class="citation-drawer__close" on:click={() => dispatch('close')} aria-label={t('cases.closeExercisePaper', $language)}>×</button>
			</header>

			<section class="citation-drawer__section">
				<p class="citation-drawer__label">{t('debate.citedPassage', $language)}</p>
				<div class="citation-drawer__pill">{citation.text}</div>
			</section>

			<section class="citation-drawer__section">
				<p class="citation-drawer__label">{t('debate.matchedExcerpt', $language)}</p>
				<blockquote class="citation-drawer__excerpt">{citation.excerpt ?? t('debate.noSourceExcerpt', $language)}</blockquote>
			</section>

			<div class="citation-drawer__actions">
				<button
					type="button"
					class="citation-drawer__action citation-drawer__action--primary"
					on:click={() => dispatch('toggleFullSource')}
					disabled={!source && !sourceText && !sourceTextVisible}
				>
					{sourceTextVisible ? t('debate.hideFullSource', $language) : t('debate.openFullSource', $language)}
				</button>
				{#if source?.storagePath || source?.filePath || (source?.sourceUrl && !source.sourceUrl.startsWith('uploaded://'))}
					<button
						type="button"
						class="citation-drawer__action"
						on:click={() => dispatch('openOriginal')}
						disabled={originalLoading}
					>
						{originalLoading ? t('debate.loadingSourceText', $language) : t('debate.openOriginalSource', $language)}
					</button>
				{/if}
			</div>

			{#if sourceTextVisible}
				<section class="citation-drawer__section citation-drawer__section--fill">
					<p class="citation-drawer__label">{t('debate.fullSource', $language)}</p>
					{#if sourceTextLoading}
						<p class="citation-drawer__meta">{t('debate.loadingSourceText', $language)}</p>
					{:else if sourceTextError}
						<p class="citation-drawer__error">{sourceTextError}</p>
					{:else if sourceText}
						<div class="citation-drawer__source-text">
							<pre>{sourceText}</pre>
						</div>
					{:else}
						<p class="citation-drawer__meta">{t('debate.sourceTextUnavailable', $language)}</p>
					{/if}
				</section>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.citation-drawer-shell {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		justify-content: flex-end;
		background: rgba(2, 6, 23, 0.72);
		backdrop-filter: blur(8px);
		padding: 1rem;
	}

	.citation-drawer {
		width: min(100%, 34rem);
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 1.35rem;
		background: rgba(4, 11, 24, 0.96);
		box-shadow: 0 28px 70px rgba(0, 0, 0, 0.34);
		padding: 1.15rem;
		color: rgba(255, 255, 255, 0.92);
	}

	.citation-drawer__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.95rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.citation-drawer__eyebrow,
	.citation-drawer__label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.45);
	}

	.citation-drawer__title {
		margin-top: 0.35rem;
		font-size: 1.2rem;
		font-weight: 700;
		line-height: 1.25;
		color: rgba(255, 255, 255, 0.96);
	}

	.citation-drawer__desc {
		margin-top: 0.35rem;
		font-size: 0.88rem;
		line-height: 1.45;
		color: rgba(255, 255, 255, 0.58);
	}

	.citation-drawer__close {
		width: 2rem;
		height: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.72);
		font-size: 1.25rem;
		line-height: 1;
	}

	.citation-drawer__section {
		display: grid;
		gap: 0.55rem;
	}

	.citation-drawer__section--fill {
		min-height: 0;
		flex: 1 1 auto;
	}

	.citation-drawer__pill {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		width: fit-content;
		padding: 0.5rem 0.72rem;
		border: 1px solid rgba(125, 211, 252, 0.22);
		border-radius: 999px;
		background: rgba(125, 211, 252, 0.1);
		font-size: 0.84rem;
		font-weight: 650;
		color: rgba(224, 242, 254, 0.98);
	}

	.citation-drawer__excerpt {
		margin: 0;
		border-left: 3px solid rgba(125, 211, 252, 0.4);
		border-radius: 0.2rem;
		background: rgba(255, 255, 255, 0.03);
		padding: 0.85rem 0.95rem;
		font-size: 0.95rem;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.9);
		white-space: pre-wrap;
	}

	.citation-drawer__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.citation-drawer__action {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		padding: 0.65rem 0.9rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.78);
		transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
	}

	.citation-drawer__action--primary {
		border-color: rgba(125, 211, 252, 0.28);
		background: rgba(125, 211, 252, 0.12);
		color: rgba(224, 242, 254, 0.96);
	}

	.citation-drawer__action:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.24);
		color: rgba(255, 255, 255, 0.96);
	}

	.citation-drawer__action:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.citation-drawer__meta,
	.citation-drawer__error {
		font-size: 0.86rem;
		line-height: 1.5;
	}

	.citation-drawer__meta {
		color: rgba(255, 255, 255, 0.58);
	}

	.citation-drawer__error {
		color: rgba(252, 165, 165, 0.96);
	}

	.citation-drawer__source-text {
		min-height: 0;
		flex: 1 1 auto;
		overflow: auto;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.95rem;
		background: rgba(0, 0, 0, 0.22);
		padding: 1rem;
	}

	.citation-drawer__source-text pre {
		white-space: pre-wrap;
		font-size: 0.88rem;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.82);
	}

	@media (max-width: 768px) {
		.citation-drawer-shell {
			align-items: flex-end;
			padding: 0.5rem;
		}

		.citation-drawer {
			width: 100%;
			height: min(78vh, 46rem);
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
		}
	}
</style>