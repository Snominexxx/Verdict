import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';

const supabase: Handle = async ({ event, resolve }) => {
	const supabaseUrl = env.VITE_SUPABASE_URL ?? '';
	const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? '';

	event.locals.supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	event.locals.safeGetSession = async () => {
		try {
			const {
				data: { session }
			} = await event.locals.supabase.auth.getSession();
			if (!session) return { session: null, user: null };

			const {
				data: { user },
				error
			} = await event.locals.supabase.auth.getUser();
			if (error) {
				// Some environments intermittently fail the user re-validation call
				// even with a valid session cookie. Keep the current session instead
				// of hard-failing to logged-out, so authenticated API calls (uploads,
				// create chat, etc.) do not randomly return 401.
				console.warn('safeGetSession: getUser failed, falling back to session user:', error.message);
				return { session, user: session.user ?? null };
			}

			return { session, user: user ?? session.user ?? null };
		} catch {
			// Stale / invalid refresh token in dev cookies — treat as logged out
			// instead of letting the AuthApiError spam the server console.
			return { session: null, user: null };
		}
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session } = await event.locals.safeGetSession();
	const isLoginPage = event.url.pathname === '/login';
	const isAuthCallback = event.url.pathname.startsWith('/auth/');
	const isPublicPage = event.url.pathname === '/' || event.url.pathname === '/about' || event.url.pathname === '/how-it-works' || event.url.pathname === '/pricing';
	// Students open assignments without an account: the entry page and the
	// hearing studio must be reachable anonymously. The teacher roster
	// (/assignments) and all mutating studio endpoints stay protected.
	const isAssignmentEntry = event.url.pathname.startsWith('/assignment/');
	const isStudentHearing = event.url.pathname === '/create';
	const isApiRoute = event.url.pathname.startsWith('/api/');

	if (!session && !isLoginPage && !isAuthCallback && !isPublicPage && !isAssignmentEntry && !isStudentHearing && !isApiRoute) {
		throw redirect(303, '/login');
	}

	if (session && isLoginPage) {
		throw redirect(303, '/create');
	}

	return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
