import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import type { LayoutLoad } from './$types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	const supabase = isBrowser()
		? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
				global: { fetch }
			})
		: createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
				global: { fetch },
				cookies: { getAll: () => [] }
			});

	const {
		data: { session }
	} = await supabase.auth.getSession();

	return { supabase, session: data.session ?? session };
};
