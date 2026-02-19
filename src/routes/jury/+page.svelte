<script lang="ts">
	import { jurorPersonas } from '$lib/data/jurors';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
</script>

<section class="space-y-10">
	<header class="glass-panel rounded-3xl p-8">
		<p class="text-xs uppercase tracking-[0.4em] text-white/60">{t('jury.title', $language)}</p>
		<h2 class="text-3xl font-display">{t('jury.subtitle', $language)}</h2>
		<p class="text-white/70 text-sm mt-3">
			{t('jury.description', $language)}
		</p>
	</header>

	<div class="grid gap-8 lg:grid-cols-2">
		{#each jurorPersonas as juror}
			<div class="glass-panel rounded-3xl p-6 flex flex-col gap-4">
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-xs uppercase tracking-[0.4em] text-white/50">{juror.temperament}</p>
						<h3 class="text-2xl font-display">{juror.name}</h3>
					</div>
					<span class="text-xs px-3 py-1 rounded-full border border-white/20 text-white/60">{juror.biasVector}</span>
				</div>
				<p class="text-white/70 text-sm">{juror.description}</p>
				<div class="text-xs text-white/60">
					<strong class="text-white/80">{t('jury.signatureMove', $language)}</strong> {juror.signatureMove}
				</div>
				<div class="text-xs text-white/60">
					<strong class="text-white/80">{t('jury.telemetryFeed', $language)}</strong> {t('jury.telemetryPlaceholder', $language)}
				</div>
			</div>
		{/each}
	</div>

	<section class="glass-panel rounded-3xl p-8">
		<h3 class="text-2xl font-display">{t('jury.scoringRubric', $language)}</h3>
		<div class="grid gap-6 mt-6 md:grid-cols-3">
			<div>
				<p class="text-sm text-white/60">{t('jury.scoringDesc', $language)}</p>
			</div>
			<ul class="space-y-3 text-sm text-white/70">
				<li>Weight persuasive clarity (40%) — track concessions and reframed issues.</li>
				<li>Weight citation discipline (35%) — penalize references outside uploaded packets.</li>
				<li>Weight realism (25%) — how practical is the remedy or defence.</li>
			</ul>
			<div class="text-xs text-white/60">
				Scores + rationales are POSTed back to Supabase for dashboards and PDF exports.
			</div>
		</div>
	</section>
</section>
