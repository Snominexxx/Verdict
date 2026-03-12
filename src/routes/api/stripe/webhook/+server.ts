import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const supabaseAdmin = createClient(
	env.VITE_SUPABASE_URL ?? '',
	env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

const resolveTier = (subscription: Stripe.Subscription): 'pro' | 'pro_plus' => {
	const priceId = subscription.items?.data?.[0]?.price?.id;
	if (priceId && priceId === env.STRIPE_PRICE_ID_PLUS) return 'pro_plus';
	return 'pro';
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) return json({ error: 'Missing signature' }, { status: 400 });

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET ?? '') as Stripe.Event;
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object as Stripe.Checkout.Session;
			const userId = session.metadata?.supabase_user_id;
			const subscriptionId = session.subscription as string;
			const customerId = session.customer as string;

			if (!userId) break;

			const subscriptionResponse = await stripe.subscriptions.retrieve(subscriptionId);
			const tier = resolveTier(subscriptionResponse);

			const periodEnd = subscriptionResponse.items?.data?.[0]?.current_period_end;

			await supabaseAdmin.from('subscriptions').upsert({
				user_id: userId,
				stripe_customer_id: customerId,
				stripe_subscription_id: subscriptionId,
				tier,
				status: subscriptionResponse.status,
				current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
				updated_at: new Date().toISOString()
			});
			break;
		}

		case 'customer.subscription.updated': {
			const subscription = event.data.object as Stripe.Subscription;
			const customerId = subscription.customer as string;

			const { data: sub } = await supabaseAdmin
				.from('subscriptions')
				.select('user_id')
				.eq('stripe_customer_id', customerId)
				.single();

			if (!sub) break;

			const isActive = ['active', 'trialing'].includes(subscription.status);
			const tier = isActive ? resolveTier(subscription) : 'free';

			const periodEndUpdated = subscription.items?.data?.[0]?.current_period_end;

			await supabaseAdmin.from('subscriptions').update({
				status: subscription.status,
				tier,
				current_period_end: periodEndUpdated
					? new Date(periodEndUpdated * 1000).toISOString()
					: null,
				updated_at: new Date().toISOString()
			}).eq('user_id', sub.user_id);
			break;
		}

		case 'customer.subscription.deleted': {
			const subscription = event.data.object as Stripe.Subscription;
			const customerId = subscription.customer as string;

			const { data: sub } = await supabaseAdmin
				.from('subscriptions')
				.select('user_id')
				.eq('stripe_customer_id', customerId)
				.single();

			if (!sub) break;

			await supabaseAdmin.from('subscriptions').update({
				tier: 'free',
				status: 'canceled',
				updated_at: new Date().toISOString()
			}).eq('user_id', sub.user_id);
			break;
		}
	}

	return json({ received: true });
};
