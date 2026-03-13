<script>
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<div class="max-w-5xl mx-auto p-8 sm:p-12 space-y-10">
	<header class="space-y-4 border border-white/10 bg-white/[0.03] rounded-2xl p-8">
		<p class="text-[10px] uppercase tracking-[0.3em] text-white/45">{t('how.kicker', $language)}</p>
		<h1 class="text-4xl font-display text-white">{t('how.title', $language)}</h1>
		<p class="text-lg text-white/70 leading-relaxed max-w-3xl">
			{t('how.subtitle', $language)}
		</p>
	</header>

	<!-- Section 1: Library -->
	<section class="space-y-4">
		<h2 class="text-sm font-bold text-white uppercase tracking-widest">{t('how.sectionLibrary', $language)}</h2>
		<div class="bg-white/5 p-8 rounded-xl border border-white/10 space-y-6">
			<div class="flex gap-4">
				<span class="text-white font-bold text-lg shrink-0">📁</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step1Title', $language)}</strong>
					<span class="text-base text-white/80 leading-relaxed">{t('how.step1Desc', $language)}</span>
				</div>
			</div>
			<div class="flex gap-4">
				<span class="text-white font-bold text-lg shrink-0">📄</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step2Title', $language)}</strong>
					<span class="text-base text-white/80 leading-relaxed">{t('how.step2Desc', $language)}</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 2: Case -->
	<section class="space-y-4">
		<h2 class="text-sm font-bold text-white uppercase tracking-widest">{t('how.sectionCase', $language)}</h2>
		<div class="bg-white/5 p-8 rounded-xl border border-white/10 space-y-6">
			<div class="flex gap-4">
				<span class="text-white font-bold text-lg shrink-0">⚖️</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step3Title', $language)}</strong>
					<span class="text-base text-white/80 leading-relaxed">{t('how.step3Desc', $language)}</span>
				</div>
			</div>
			<div class="flex gap-4">
				<span class="text-white font-bold text-lg shrink-0">✨</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step4Title', $language)}</strong>
					<span class="text-base text-white/80 leading-relaxed">{t('how.step4Desc', $language)}</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 3: Debate -->
	<section class="space-y-4">
		<h2 class="text-sm font-bold text-white uppercase tracking-widest">{t('how.sectionDebate', $language)}</h2>
		<div class="bg-white/5 p-8 rounded-xl border border-white/10 space-y-6">
			<div class="flex gap-4">
				<span class="text-white font-bold text-lg shrink-0">🗣️</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step5Title', $language)}</strong>
					<span class="text-base text-white/80 leading-relaxed">{t('how.step5Desc', $language)}</span>
				</div>
			</div>
			<div class="flex gap-4">
				<span class="text-white font-bold text-lg shrink-0">🏛️</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step6Title', $language)}</strong>
					<span class="text-base text-white/80 leading-relaxed">{t('how.step6Desc', $language)}</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Pro Tips -->
	<section class="space-y-4">
		<h2 class="text-sm font-bold text-white uppercase tracking-widest">{t('how.tipTitle', $language)}</h2>
		<div class="grid md:grid-cols-3 gap-4">
			<div class="border border-white/10 bg-white/[0.02] rounded-xl p-5">
				<p class="text-sm text-white/80 leading-relaxed">💡 {t('how.tip1', $language)}</p>
			</div>
			<div class="border border-white/10 bg-white/[0.02] rounded-xl p-5">
				<p class="text-sm text-white/80 leading-relaxed">⚡ {t('how.tip2', $language)}</p>
			</div>
			<div class="border border-white/10 bg-white/[0.02] rounded-xl p-5">
				<p class="text-sm text-white/80 leading-relaxed">🔄 {t('how.tip3', $language)}</p>
			</div>
		</div>
	</section>

	<div class="pt-2 flex justify-center">
		<a href="/" class="px-8 py-3 rounded bg-white text-black font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-colors">
			{t('how.return', $language)}
		</a>
	</div>
</div>
