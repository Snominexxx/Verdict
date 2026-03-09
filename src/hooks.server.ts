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
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) return { session: null, user: null };

		return { session, user };
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
	const isApiRoute = event.url.pathname.startsWith('/api/');

	if (!session && !isLoginPage && !isAuthCallback && !isPublicPage && !isApiRoute) {
		throw redirect(303, '/login');
	}

	if (session && isLoginPage) {
		throw redirect(303, '/court');
	}

	return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
