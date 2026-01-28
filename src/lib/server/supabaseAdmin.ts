import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
	throw new Error('VITE_SUPABASE_URL (or SUPABASE_URL) is required to reach Supabase.');
}

if (!serviceRoleKey) {
	console.warn('SUPABASE_SERVICE_ROLE_KEY is missing. Server-side persistence will be disabled.');
}

const client = serviceRoleKey
	? createClient(supabaseUrl, serviceRoleKey, {
			auth: { persistSession: false },
			global: { headers: { 'x-client-info': 'verdict-admin' } }
	  })
	: null;

export const assertSupabaseAdmin = () => {
	if (!client) {
		throw new Error('Set SUPABASE_SERVICE_ROLE_KEY to enable server persistence.');
	}
	return client;
};
