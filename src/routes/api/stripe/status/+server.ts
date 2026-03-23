import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) return json({ tier: 'free', status: 'active' });

	// Admin bypass: emails in ADMIN_EMAILS env var get enterprise tier
	const adminEmails = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
	const userEmail = session.user.email?.toLowerCase() ?? '';
	if (userEmail && adminEmails.includes(userEmail)) {
		return json({ tier: 'enterprise', status: 'active', currentPeriodEnd: null });
	}

	const { data: sub } = await locals.supabase
		.from('subscriptions')
		.select('tier, status, current_period_end')
		.eq('user_id', session.user.id)
		.single();

	return json({
		tier: sub?.tier ?? 'free',
		status: sub?.status ?? 'active',
		currentPeriodEnd: sub?.current_period_end ?? null
	});
};
