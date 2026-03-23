<script lang="ts">
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<section class="min-h-[70vh] flex items-center justify-center">
	<div class="text-center space-y-8">
		<p class="text-white/80 uppercase tracking-[0.4em] text-sm font-semibold">{t('home.subtitle', $language)}</p>
		<h1 class="text-5xl font-display text-white">{t('home.headline', $language)}</h1>
		<p class="text-white/80 text-base max-w-xl mx-auto leading-relaxed">
			{t('home.description', $language)}
		</p>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
			<a href="/cases" class="px-7 py-3 rounded bg-white text-black font-semibold text-sm uppercase tracking-wider hover:bg-white/90 transition-colors">{t('home.initCase', $language)}</a>
			<a href="/library" class="px-7 py-3 rounded border border-white/40 text-white font-semibold text-sm uppercase tracking-wider hover:bg-white/10 transition-colors">{t('home.browseLibrary', $language)}</a>
		</div>
	</div>
</section>
