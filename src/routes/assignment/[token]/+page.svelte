<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { dossierStore } from '$lib/stores/dossier';
	import { assignmentContext } from '$lib/stores/assignment';
	import { focusMode } from '$lib/stores/ui';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import type { CaseDossier } from '$lib/verdict/contracts';

	let { data }: { data: PageData } = $props();

	const assignment = $derived(data.assignment);
	const dossier = $derived(data.assignment.dossier as CaseDossier);
	const lang = $derived(data.assignment.language);

	let studentName = $state('');
	let studentEmail = $state('');
	let starting = $state(false);
	let errorMessage = $state('');

	const role = $derived(dossier?.selectedRole === 'defendant' ? 'defendant' : 'plaintiff');
	const yourSideText = $derived(
		role === 'defendant' ? t('v2.defendant', lang) : t('v2.plaintiff', lang)
	);

	onMount(() => {
		language.set(lang);
	});

	const emailLooksValid = (value: string) => /.+@.+\..+/.test(value.trim());

	const begin = () => {
		errorMessage = '';
		const name = studentName.trim();
		const email = studentEmail.trim();
		if (!name) {
			errorMessage = t('assignment.nameRequired', lang);
			return;
		}
		if (!email || !emailLooksValid(email)) {
			errorMessage = t('assignment.emailRequired', lang);
			return;
		}
		if (!dossier?.title) {
			errorMessage = t('v2.error', lang);
			return;
		}
		starting = true;
		dossierStore.start(dossier);
		assignmentContext.begin({
			token: assignment.token,
			studentName: name,
			studentEmail: email,
			role,
			instructions: assignment.instructions ?? '',
			startedAt: new Date().toISOString()
		});
		focusMode.set(true);
		goto('/create');
	};
</script>

<svelte:head>
	<title>{assignment.title} · Verdict</title>
</svelte:head>

<div class="min-h-screen bg-ink px-6 py-12">
	<div class="mx-auto max-w-2xl">
		<p class="font-mono text-xs uppercase tracking-[0.2em] text-accent/70">
			{t('assignment.label', lang)}
		</p>
		<h1 class="mt-2 font-display text-3xl font-semibold text-white">{assignment.title}</h1>

		<div class="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.07] px-3 py-1 text-sm text-white/80">
			<span class="font-mono text-xs uppercase tracking-wide text-white/50">{t('assignment.youRepresent', lang)}</span>
			<span class="font-medium text-white">{yourSideText}</span>
		</div>

		{#if assignment.instructions?.trim()}
			<section class="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
				<h2 class="font-mono text-xs uppercase tracking-wide text-white/40">{t('assignment.guidelines', lang)}</h2>
				<p class="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-white/85">{assignment.instructions}</p>
			</section>
		{/if}

		{#if dossier?.facts}
			<section class="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
				<h2 class="font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.facts', lang)}</h2>
				<p class="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-white/80">{dossier.facts}</p>
				{#if dossier.issues?.length}
					<h2 class="mt-4 font-mono text-xs uppercase tracking-wide text-white/40">{t('v2.issues', lang)}</h2>
					<ul class="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-7 text-white/80">
						{#each dossier.issues as issue}
							<li>{issue}</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<section class="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
			<h2 class="font-mono text-xs uppercase tracking-wide text-white/40">{t('assignment.identify', lang)}</h2>
			<p class="mt-1 text-sm text-white/60">{t('assignment.identifyHint', lang)}</p>
			<div class="mt-4 space-y-3">
				<input
					type="text"
					bind:value={studentName}
					placeholder={t('assignment.fullName', lang)}
					class="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:border-accent/50 focus:outline-none"
				/>
				<input
					type="email"
					bind:value={studentEmail}
					placeholder={t('assignment.email', lang)}
					class="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:border-accent/50 focus:outline-none"
				/>
			</div>

			{#if errorMessage}
				<p class="mt-3 text-sm text-rose-300">{errorMessage}</p>
			{/if}

			<button
				type="button"
				onclick={begin}
				disabled={starting}
				class="mt-5 w-full rounded-xl bg-white px-5 py-3 font-medium text-ink transition hover:bg-white/90 disabled:opacity-60"
			>
				{starting ? t('assignment.entering', lang) : t('assignment.enterHearing', lang)}
			</button>
		</section>

		<p class="mt-4 text-center text-xs text-white/40">{t('assignment.recordedNotice', lang)}</p>
	</div>
</div>
