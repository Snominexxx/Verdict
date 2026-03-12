-- Tighten the subscriptions RLS policy.
-- The old "Service role can manage subscriptions" policy used `using(true)`
-- which let ANY authenticated user read ALL subscription rows.
--
-- This is safe to run:
--   • DROP POLICY only removes an access rule — no data is deleted.
--   • The webhook uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely,
--     so it will keep working without this policy.
--   • The "Users can read own subscription" policy stays and correctly enforces
--     auth.uid() = user_id for normal users.

drop policy if exists "Service role can manage subscriptions" on subscriptions;
