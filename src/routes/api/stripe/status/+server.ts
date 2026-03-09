import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) return json({ tier: 'free', status: 'active' });

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
