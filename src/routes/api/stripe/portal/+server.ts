import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { rateLimit } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ locals, url }) => {
	const { session } = await locals.safeGetSession();
	if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

	// Rate limit: 5 portal requests per 60 seconds
	const rl = rateLimit(session.user.id, 'stripe_portal', 5, 60_000);
	if (!rl.allowed) return json({ error: 'Too many requests' }, { status: 429 });

	const { data: sub } = await locals.supabase
		.from('subscriptions')
		.select('stripe_customer_id')
		.eq('user_id', session.user.id)
		.single();

	if (!sub?.stripe_customer_id) {
		return json({ error: 'No active subscription found' }, { status: 400 });
	}

	const portalSession = await stripe.billingPortal.sessions.create({
		customer: sub.stripe_customer_id,
		return_url: `${url.origin}/pricing`
	});

	return json({ url: portalSession.url });
};
