<script>
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<div class="max-w-5xl mx-auto p-8 sm:p-12 space-y-10">
	<header class="space-y-4 border border-white/10 bg-white/[0.03] rounded-2xl p-8">
		<p class="text-[10px] uppercase tracking-[0.3em] text-white/45">{t('about.kicker', $language)}</p>
		<h1 class="text-4xl font-display text-white">{t('about.title', $language)}</h1>
		<p class="text-lg text-white/70 leading-relaxed max-w-3xl">
			{t('about.description', $language)}
		</p>
	</header>

	<section class="space-y-4">
		<h2 class="text-xl font-bold text-white uppercase tracking-widest text-sm">{t('about.mission', $language)}</h2>
		<p class="text-base text-white/80 leading-relaxed bg-white/5 p-6 rounded-xl border border-white/10">
			{t('about.missionText', $language)}
		</p>
	</section>

	<section class="space-y-4">
		<h2 class="text-xl font-bold text-white uppercase tracking-widest text-sm">{t('about.highlightsTitle', $language)}</h2>
		<div class="grid md:grid-cols-3 gap-4">
			<div class="border border-white/10 bg-white/[0.02] rounded-xl p-5">
				<p class="text-xs uppercase tracking-[0.2em] text-white/45">{t('about.highlightPacksLabel', $language)}</p>
				<p class="text-sm text-white/75 mt-3 leading-relaxed">{t('about.highlightPacksText', $language)}</p>
			</div>
			<div class="border border-white/10 bg-white/[0.02] rounded-xl p-5">
				<p class="text-xs uppercase tracking-[0.2em] text-white/45">{t('about.highlightDebateLabel', $language)}</p>
				<p class="text-sm text-white/75 mt-3 leading-relaxed">{t('about.highlightDebateText', $language)}</p>
			</div>
			<div class="border border-white/10 bg-white/[0.02] rounded-xl p-5">
				<p class="text-xs uppercase tracking-[0.2em] text-white/45">{t('about.highlightScoreLabel', $language)}</p>
				<p class="text-sm text-white/75 mt-3 leading-relaxed">{t('about.highlightScoreText', $language)}</p>
			</div>
		</div>
	</section>

	<div class="pt-2 flex justify-center">
		<a href="/" class="px-8 py-3 rounded bg-white text-black font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-colors">
			{t('about.return', $language)}
		</a>
	</div>
</div>
