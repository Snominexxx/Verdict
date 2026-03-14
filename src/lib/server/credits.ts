/**
 * Credit enforcement — checks usage against tier limits and logs consumption.
 * 1 credit = 1 case/debate. Messages within a debate are free.
 * Uses the service-role Supabase client to bypass RLS.
 */

import { assertSupabaseAdmin } from './supabaseAdmin';

const TIER_LIMITS: Record<string, number> = {
	free: 3,
	pro: 20,
	pro_plus: 60,
	enterprise: 999
};

/**
 * Get the user's tier from the subscriptions table.
 * Falls back to 'free' if no row exists.
 */
async function getUserTier(userId: string): Promise<string> {
	const admin = assertSupabaseAdmin();
	const { data } = await admin
		.from('subscriptions')
		.select('tier, status')
		.eq('user_id', userId)
		.single();

	if (!data || data.status !== 'active') return 'free';
	return data.tier ?? 'free';
}

/**
 * Count how many cases/debates the user has started this calendar month.
 */
async function getMonthlyUsage(userId: string): Promise<number> {
	const admin = assertSupabaseAdmin();
	const startOfMonth = new Date();
	startOfMonth.setUTCDate(1);
	startOfMonth.setUTCHours(0, 0, 0, 0);

	const { count } = await admin
		.from('usage_log')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', userId)
		.gte('created_at', startOfMonth.toISOString());

	return count ?? 0;
}

/**
 * Check if the user has credits remaining. Returns { allowed, used, limit }.
 */
export async function checkCredits(userId: string): Promise<{
	allowed: boolean;
	used: number;
	limit: number;
	tier: string;
}> {
	const tier = await getUserTier(userId);
	const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
	const used = await getMonthlyUsage(userId);

	return { allowed: used < limit, used, limit, tier };
}

/**
 * Check if a credit was already consumed for this case.
 */
export async function isCaseCharged(userId: string, caseId: string): Promise<boolean> {
	const admin = assertSupabaseAdmin();
	const { count } = await admin
		.from('usage_log')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('case_id', caseId);

	return (count ?? 0) > 0;
}

/**
 * Record a credit for starting a new case/debate.
 * Uses upsert with unique(user_id, case_id) to prevent race-condition double-charges.
 * Returns true if a NEW row was inserted (= credit consumed), false if already existed.
 */
export async function recordUsage(userId: string, caseId: string): Promise<boolean> {
	const admin = assertSupabaseAdmin();
	const { data } = await admin
		.from('usage_log')
		.upsert(
			{ user_id: userId, action: 'debate', case_id: caseId },
			{ onConflict: 'user_id,case_id', ignoreDuplicates: true }
		)
		.select('id');
	// If data has a row, it was newly inserted; if empty array, it was a duplicate
	return (data?.length ?? 0) > 0;
}
