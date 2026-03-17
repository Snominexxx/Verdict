import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// Rate limit by IP: 3 contact submissions per 5 minutes
	const ip = getClientAddress();
	const rl = rateLimit(ip, 'contact', 3, 5 * 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many submissions. Please try again later.');
	}

	const { name, email, message } = await request.json();

	if (
		typeof name !== 'string' || !name.trim() ||
		typeof email !== 'string' || !email.trim() ||
		typeof message !== 'string' || !message.trim()
	) {
		throw error(400, 'Name, email, and message are required.');
	}

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
		throw error(400, 'Please provide a valid email address.');
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
