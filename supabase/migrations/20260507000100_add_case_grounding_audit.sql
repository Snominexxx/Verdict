alter table if exists public.cases
  add column if not exists judge_brief jsonb,
  add column if not exists grounding_audit jsonb;

alter table if exists public.staged_cases
  add column if not exists judge_brief jsonb,
  add column if not exists grounding_audit jsonb;