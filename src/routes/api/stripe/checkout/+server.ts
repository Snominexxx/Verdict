import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { env } from '$env/dynamic/private';
import { rateLimit } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ locals, url, request }) => {
	const { session } = await locals.safeGetSession();
	if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

	// Rate limit: 5 checkout attempts per 60 seconds
	const rl = rateLimit(session.user.id, 'stripe_checkout', 5, 60_000);
	if (!rl.allowed) return json({ error: 'Too many requests' }, { status: 429 });

	const body = await request.json().catch(() => ({}));
	const requestedTier = (body as { tier?: string }).tier ?? 'pro';

	const priceId = requestedTier === 'pro_plus'
		? (env.STRIPE_PRICE_ID_PLUS ?? '')
		: (env.STRIPE_PRICE_ID ?? '');

	if (!priceId) return json({ error: 'Stripe not configured' }, { status: 500 });

	// Look up or create Stripe customer
	const { data: sub } = await locals.supabase
		.from('subscriptions')
		.select('stripe_customer_id')
		.eq('user_id', session.user.id)
		.single();

	let customerId = sub?.stripe_customer_id;

	if (!customerId) {
		const customer = await stripe.customers.create({
			email: session.user.email,
			metadata: { supabase_user_id: session.user.id }
		});
		customerId = customer.id;
	}

	const checkoutSession = await stripe.checkout.sessions.create({
		customer: customerId,
		line_items: [{ price: priceId, quantity: 1 }],
		mode: 'subscription',
		success_url: `${url.origin}/pricing?success=true`,
		cancel_url: `${url.origin}/pricing?canceled=true`,
		metadata: { supabase_user_id: session.user.id, tier: requestedTier }
	});

	return json({ url: checkoutSession.url });
};
