<script lang="ts">
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';

	let { data } = $props();

	let mode: 'login' | 'signup' = $state('login');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	const signInWithGoogle = async () => {
		loading = true;
		errorMsg = '';
		const { error } = await data.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${window.location.origin}/auth/callback` }
		});
		if (error) errorMsg = error.message;
		loading = false;
	};

	const handleEmailAuth = async () => {
		if (!email.trim() || !password.trim()) return;
		loading = true;
		errorMsg = '';
		successMsg = '';

		if (mode === 'signup') {
			if (password !== confirmPassword) {
				errorMsg = t('auth.passwordMismatch', $language);
				loading = false;
				return;
			}
			if (password.length < 6) {
				errorMsg = t('auth.passwordTooShort', $language);
				loading = false;
				return;
			}
			const { data: signUpData, error } = await data.supabase.auth.signUp({
				email: email.trim(),
				password
			});
			if (error) {
				errorMsg = error.message;
			} else if (signUpData.session) {
				window.location.href = '/court';
			} else {
				successMsg = t('auth.checkEmail', $language);
			}
		} else {
			const { error } = await data.supabase.auth.signInWithPassword({
				email: email.trim(),
				password
			});
			if (error) {
				errorMsg = error.message;
			} else {
				window.location.href = '/court';
			}
		}
		loading = false;
	};
</script>

<svelte:head>
	<title>{t('auth.pageTitle', $language)} — Verdict</title>
</svelte:head>

{#if loading}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
		<div class="flex flex-col items-center gap-4 p-8 rounded-xl bg-white/10 border border-white/20">
			<svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
			</svg>
			<p class="text-sm font-semibold text-white">{t('auth.signingIn', $language)}</p>
		</div>
	</div>
{/if}

<div class="h-full flex items-center justify-center px-4">
	<div class="w-full max-w-sm space-y-6">
		<!-- Logo -->
		<div class="text-center space-y-2">
			<h1 class="text-3xl font-display font-bold text-white">Verdict</h1>
			<p class="text-sm text-white/60">{t('auth.tagline', $language)}</p>
		</div>

		<!-- Google button -->
		<button
			type="button"
			onclick={signInWithGoogle}
			disabled={loading}
			class="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition disabled:opacity-50"
		>
			<svg class="w-5 h-5" viewBox="0 0 24 24">
				<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
				<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
				<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
				<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
			</svg>
			{t('auth.continueWithGoogle', $language)}
		</button>

		<!-- Divider -->
		<div class="flex items-center gap-3">
			<div class="flex-1 h-px bg-white/15"></div>
			<span class="text-xs uppercase tracking-widest text-white/50">{t('auth.or', $language)}</span>
			<div class="flex-1 h-px bg-white/15"></div>
		</div>

		<!-- Email form -->
		<form class="space-y-3" onsubmit={(e) => { e.preventDefault(); handleEmailAuth(); }}>
			<input
				type="email"
				bind:value={email}
				placeholder={t('auth.email', $language)}
				required
				class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition"
			/>
			<input
				type="password"
				bind:value={password}
				placeholder={t('auth.password', $language)}
				required
				class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition"
			/>
			{#if mode === 'signup'}
				<input
					type="password"
					bind:value={confirmPassword}
					placeholder={t('auth.confirmPassword', $language)}
					required
					class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition"
				/>
			{/if}
			<button
				type="submit"
				disabled={loading}
				class="w-full py-2.5 bg-white text-black text-sm font-bold uppercase tracking-widest rounded-lg hover:bg-white/90 transition disabled:opacity-50"
			>
				{mode === 'login' ? t('auth.signIn', $language) : t('auth.createAccount', $language)}
			</button>
		</form>

		{#if errorMsg}
			<p class="text-sm text-red-400 text-center">{errorMsg}</p>
		{/if}
		{#if successMsg}
			<p class="text-sm text-emerald-400 text-center">{successMsg}</p>
		{/if}

		<!-- Toggle mode -->
		<p class="text-center text-sm text-white/60">
			{mode === 'login' ? t('auth.noAccount', $language) : t('auth.haveAccount', $language)}
			<button type="button" onclick={() => { mode = mode === 'login' ? 'signup' : 'login'; errorMsg = ''; successMsg = ''; }} class="text-white underline underline-offset-2 hover:text-white/80">
				{mode === 'login' ? t('auth.signUpLink', $language) : t('auth.signInLink', $language)}
			</button>
		</p>
	</div>
</div>
