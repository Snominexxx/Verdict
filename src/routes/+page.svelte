<script lang="ts">
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<section class="min-h-[70vh] flex items-center justify-center">
	<div class="text-center space-y-8">
		<p class="text-white/70 uppercase tracking-[0.4em] text-xs font-semibold">{t('home.subtitle', $language)}</p>
		<h1 class="text-5xl font-display text-white">{t('home.headline', $language)}</h1>
		<p class="text-white/80 text-sm max-w-xl mx-auto">
			{t('home.description', $language)}
		</p>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
			<a href="/cases" class="px-6 py-2 rounded bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-white/90 transition-colors">{t('home.initCase', $language)}</a>
			<a href="/library" class="px-6 py-2 rounded border border-white/20 text-white/70 font-semibold text-xs uppercase tracking-wider hover:bg-white/5 transition-colors">{t('home.browseLibrary', $language)}</a>
		</div>
	</div>
</section>
