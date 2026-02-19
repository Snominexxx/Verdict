<script>
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<div class="max-w-4xl mx-auto p-12 space-y-16">
	<header class="space-y-4 border-b border-white/10 pb-8">
		<h1 class="text-4xl font-display text-white">{t('about.title', $language)}</h1>
		<p class="text-lg text-white/70 leading-relaxed max-w-2xl">
			{t('about.description', $language)}
		</p>
	</header>

	<section class="space-y-6">
		<h2 class="text-xl font-bold text-white uppercase tracking-widest text-sm">{t('about.mission', $language)}</h2>
		<p class="text-base text-white/80 leading-relaxed bg-white/5 p-8 rounded border border-white/10">
			{t('about.missionText', $language)}
		</p>
	</section>

    <div class="pt-8 flex justify-center">
        <a href="/" class="px-8 py-3 rounded bg-white text-black font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-colors">
            {t('about.return', $language)}
        </a>
    </div>
</div>
