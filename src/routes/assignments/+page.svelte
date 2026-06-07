<script lang="ts">
	import type { PageData } from './$types';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import type { ExerciseSubmission } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let expanded = $state<string | null>(null);
	let loading = $state(false);
	let loadError = $state('');
	let submissions = $state<ExerciseSubmission[]>([]);
	let openSubmission = $state<ExerciseSubmission | null>(null);

	const origin = $derived(typeof window !== 'undefined' ? window.location.origin : 'https://tryverdict.net');

	const toggle = async (token: string) => {
		openSubmission = null;
		if (expanded === token) {
			expanded = null;
			return;
		}
		expanded = token;
		submissions = [];
		loadError = '';
		loading = true;
		try {
			const res = await fetch(`/api/assignments/${token}/submissions`);
			if (!res.ok) throw new Error(`failed: ${res.status}`);
			const body = await res.json();
			submissions = body.submissions as ExerciseSubmission[];
		} catch (err) {
			console.error(err);
			loadError = t('v2.error', $language);
		} finally {
			loading = false;
		}
	};

	const copyLink = async (token: string) => {
		try {
			await navigator.clipboard.writeText(`${origin}/assignment/${token}`);
		} catch {
			/* clipboard may be blocked */
		}
	};

	const fmt = (iso: string) => {
		try {
			return new Date(iso).toLocaleString($language === 'fr' ? 'fr-CA' : 'en-CA');
		} catch {
			return iso;
		}
	};
</script>

<svelte:head>
	<title>{t('assignment.rosterTitle', $language)} · Verdict</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-10">
	<header class="mb-6">
		<h1 class="font-display text-2xl font-semibold text-white">{t('assignment.rosterTitle', $language)}</h1>
		<p class="mt-1 text-sm text-white/60">{t('assignment.rosterHint', $language)}</p>
	</header>

	{#if data.assignments.length === 0}
		<div class="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/65">
			{t('assignment.rosterEmpty', $language)}
		</div>
	{:else}
		<ul class="space-y-3">
			{#each data.assignments as a (a.token)}
				<li class="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
					<div class="flex flex-wrap items-center justify-between gap-3 p-4">
						<div class="min-w-0">
							<p class="truncate font-medium text-white">{a.title}</p>
							<p class="mt-0.5 text-xs text-white/45">
								{t('assignment.submissionsCount', $language).replace('{n}', String(a.submissionCount))}
								· {fmt(a.createdAt)}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<button
								type="button"
								onclick={() => copyLink(a.token)}
								class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/5"
							>
								{t('assignment.copyLink', $language)}
							</button>
							<button
								type="button"
								onclick={() => toggle(a.token)}
								class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white/90"
							>
								{expanded === a.token ? t('assignment.hide', $language) : t('assignment.review', $language)}
							</button>
						</div>
					</div>

					{#if expanded === a.token}
						<div class="border-t border-white/10 p-4">
							{#if loading}
								<p class="text-sm text-white/50">{t('assignment.loading', $language)}</p>
							{:else if loadError}
								<p class="text-sm text-rose-300">{loadError}</p>
							{:else if submissions.length === 0}
								<p class="text-sm text-white/50">{t('assignment.noSubmissions', $language)}</p>
							{:else}
								<ul class="space-y-2">
									{#each submissions as s (s.id)}
										<li>
											<button
												type="button"
												onclick={() => (openSubmission = openSubmission?.id === s.id ? null : s)}
												class="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.05]"
											>
												<span class="min-w-0">
													<span class="block truncate font-medium text-white">{s.studentName}</span>
													<span class="block truncate text-xs text-white/45">{s.studentEmail}</span>
												</span>
												<span class="shrink-0 text-right text-xs text-white/50">
													<span class="block">{s.role === 'defendant' ? t('v2.defendant', $language) : t('v2.plaintiff', $language)}</span>
													<span class="block">{t('assignment.turns', $language).replace('{n}', String(s.turnCount))}</span>
												</span>
											</button>

											{#if openSubmission?.id === s.id}
												<div class="mt-2 space-y-3 rounded-xl border border-white/10 bg-ink/60 p-4">
													<p class="font-mono text-[11px] uppercase tracking-wide text-white/40">
														{t('assignment.submittedAt', $language)} {fmt(s.submittedAt)}
													</p>
													{#each s.transcript as entry, i (i)}
														<div class="flex {entry.role === 'litigant' ? 'justify-end' : 'justify-start'}">
															<div class="max-w-[85%]">
																<p class="mb-1 font-mono text-[10px] uppercase tracking-wide {entry.role === 'judge' ? 'text-accent' : 'text-white/40'}">{entry.speaker}</p>
																<div
																	class="whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-7 {entry.role === 'litigant'
																		? 'bg-white/10 text-white'
																		: 'border border-accent/20 bg-accent/[0.07] text-white/90'}"
																>
																	{entry.message}
																</div>
															</div>
														</div>
													{/each}
												</div>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
