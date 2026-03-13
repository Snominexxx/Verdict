import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';

export const POST: RequestHandler = async ({ request }) => {
	const { name, email, message } = await request.json();

	if (
		typeof name !== 'string' || !name.trim() ||
		typeof email !== 'string' || !email.trim() ||
		typeof message !== 'string' || !message.trim()
	) {
		throw error(400, 'Name, email, and message are required.');
	}

	const supabase = assertSupabaseAdmin();

	const { error: dbError } = await supabase
		.from('contact_requests')
		.insert({
			name: name.trim().slice(0, 200),
			email: email.trim().slice(0, 320),
			message: message.trim().slice(0, 5000)
		});

	if (dbError) {
		console.error('Failed to save contact request:', dbError);
		throw error(500, 'Failed to save your message.');
	}

	return json({ ok: true });
};
