<script lang="ts">
	import { page } from '$app/state';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<svelte:head>
	<title>Error {page.status} — Verdict</title>
</svelte:head>

<div class="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
	<p class="text-6xl font-display font-bold text-flare mb-4">{page.status}</p>
	<h1 class="text-2xl font-display font-semibold text-white mb-2">
		{#if page.status === 404}
			{t('error.notFound', $language)}
		{:else}
			{t('error.generic', $language)}
		{/if}
	</h1>
	<p class="text-white/60 max-w-md mb-8">
		{page.error?.message ?? ''}
	</p>
	<a
		href="/"
		class="px-6 py-2.5 rounded-lg bg-flare text-ink font-semibold hover:brightness-110 transition"
	>
		{t('error.backHome', $language)}
	</a>
</div>
