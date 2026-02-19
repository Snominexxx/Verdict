<script>
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<div class="max-w-4xl mx-auto p-12 space-y-12">
	<header class="space-y-4 border-b border-white/10 pb-8">
		<h1 class="text-4xl font-display text-white">{t('how.title', $language)}</h1>
		<p class="text-lg text-white/70 leading-relaxed max-w-2xl">
			{t('how.subtitle', $language)}
		</p>
	</header>

	<section class="space-y-6">
		<h2 class="text-xl font-bold text-white uppercase tracking-widest text-sm">{t('how.workflow', $language)}</h2>
		<ul class="text-base text-white/80 space-y-4 leading-relaxed bg-white/5 p-8 rounded-lg border border-white/10">
			<li class="flex gap-4">
				<span class="text-white font-bold text-lg">01.</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step1Title', $language)}</strong>
					<span>{t('how.step1Desc', $language)}</span>
				</div>
			</li>
			<li class="flex gap-4">
				<span class="text-white font-bold text-lg">02.</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step2Title', $language)}</strong>
					<span>{t('how.step2Desc', $language)}</span>
				</div>
			</li>
			<li class="flex gap-4">
				<span class="text-white font-bold text-lg">03.</span>
				<div>
					<strong class="text-white block mb-1">{t('how.step3Title', $language)}</strong>
					<span>{t('how.step3Desc', $language)}</span>
				</div>
			</li>
		</ul>
	</section>

	<div class="grid md:grid-cols-2 gap-8 pt-8">
		<div class="bg-white/5 p-8 rounded border border-white/10">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-2 h-2 bg-white rounded-full"></div>
				<h3 class="text-sm font-bold text-white uppercase tracking-widest text-base">{t('how.aiDebater', $language)}</h3>
			</div>
			<p class="text-sm text-white/70 leading-relaxed">
				{t('how.aiDebaterDesc', $language)}
			</p>
		</div>

		<div class="bg-white/5 p-8 rounded border border-white/10">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-2 h-2 bg-white rounded-full opacity-50"></div>
				<h3 class="text-sm font-bold text-white uppercase tracking-widest text-base">{t('how.aiJury', $language)}</h3>
			</div>
			<p class="text-sm text-white/70 leading-relaxed">
				{t('how.aiJuryDesc', $language)}
			</p>
		</div>
	</div>

    <div class="pt-8 flex justify-center">
        <a href="/" class="px-8 py-3 rounded bg-white text-black font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-colors">
            {t('how.return', $language)}
        </a>
    </div>
</div>
