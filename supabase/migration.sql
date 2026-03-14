-- ============================================================
-- Verdict: Per-user data tables + RLS
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Legal Packs
create table if not exists legal_packs (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  jurisdiction text not null default 'Other',
  domain     text not null default 'General',
  description text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table legal_packs enable row level security;

create policy "Users can read own packs"
  on legal_packs for select
  using (auth.uid() = user_id);

create policy "Users can insert own packs"
  on legal_packs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own packs"
  on legal_packs for update
  using (auth.uid() = user_id);

create policy "Users can delete own packs"
  on legal_packs for delete
  using (auth.uid() = user_id);

-- 2. Pack Sources (documents inside a pack)
create table if not exists pack_sources (
  id          text not null,
  pack_id     text not null references legal_packs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  jurisdiction text not null default '',
  description text not null default '',
  source_url  text,
  file_path   text,
  content     text,
  doc_type    text,
  trust_level text,
  is_custom   boolean not null default true,
  last_updated text,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (id, pack_id)
);

alter table pack_sources enable row level security;

create policy "Users can read own sources"
  on pack_sources for select
  using (auth.uid() = user_id);

create policy "Users can insert own sources"
  on pack_sources for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sources"
  on pack_sources for update
  using (auth.uid() = user_id);

create policy "Users can delete own sources"
  on pack_sources for delete
  using (auth.uid() = user_id);

-- 3. Case History
create table if not exists cases (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  synopsis    text not null default '',
  issues      text not null default '',
  remedy      text not null default '',
  role        text not null default 'plaintiff',
  sources     jsonb not null default '[]',
  pack_id     text,
  court_type  text not null default 'jury',
  status      text not null default 'ongoing',
  started_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  performance jsonb,
  created_at  timestamptz not null default now()
);

alter table cases enable row level security;

create policy "Users can read own cases"
  on cases for select
  using (auth.uid() = user_id);

create policy "Users can insert own cases"
  on cases for insert
  with check (auth.uid() = user_id);

create policy "Users can update own cases"
  on cases for update
  using (auth.uid() = user_id);

create policy "Users can delete own cases"
  on cases for delete
  using (auth.uid() = user_id);

-- 4. Subscriptions (Stripe)
create table if not exists subscriptions (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id  text,
  stripe_subscription_id text,
  tier                text not null default 'free',
  status              text not null default 'active',
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy "Users can read own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);

-- Note: The service_role key bypasses RLS by default in Supabase.
-- No additional permissive policy is needed for webhook writes.

-- 5. Staged Cases (temporary pre-debate cases)
create table if not exists staged_cases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  synopsis    text not null,
  issues      text,
  remedy      text,
  role        text not null check (role in ('plaintiff','defendant')),
  sources     jsonb default '[]'::jsonb,
  court_type  text not null default 'jury',
  created_at  timestamptz default now()
);

alter table staged_cases enable row level security;

create policy "Users can read own staged cases"
  on staged_cases for select
  using (auth.uid() = user_id);

create policy "Users can insert own staged cases"
  on staged_cases for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own staged cases"
  on staged_cases for delete
  using (auth.uid() = user_id);

-- 6. Debate Turns (conversation history per case)
create table if not exists debate_turns (
  id          uuid primary key default gen_random_uuid(),
  case_id     text not null references cases(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null,
  speaker     text not null,
  message     text not null,
  citations   jsonb default '[]'::jsonb,
  created_at  timestamptz default now()
);

create index if not exists idx_debate_turns_case on debate_turns(case_id, created_at);

alter table debate_turns enable row level security;

create policy "Users can read own debate turns"
  on debate_turns for select
  using (auth.uid() = user_id);

create policy "Users can insert own debate turns"
  on debate_turns for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own debate turns"
  on debate_turns for delete
  using (auth.uid() = user_id);

-- 7. RAG: Document Chunks with pgvector embeddings
create extension if not exists vector with schema extensions;

create table if not exists document_chunks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   text not null,
  pack_id     text,
  chunk_index int not null default 0,
  heading     text not null default '',
  content     text not null,
  token_count int not null default 0,
  embedding   vector(1536),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_chunks_embedding
  on document_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists idx_chunks_user_source
  on document_chunks(user_id, source_id);

create index if not exists idx_chunks_user
  on document_chunks(user_id);

alter table document_chunks enable row level security;

create policy "Users can read own chunks"
  on document_chunks for select
  using (auth.uid() = user_id);

create policy "Users can insert own chunks"
  on document_chunks for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own chunks"
  on document_chunks for delete
  using (auth.uid() = user_id);

create or replace function match_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 15,
  match_pack_id text default null
)
returns table (
  id uuid,
  source_id text,
  chunk_index int,
  heading text,
  content text,
  token_count int,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.source_id,
    dc.chunk_index,
    dc.heading,
    dc.content,
    dc.token_count,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.user_id = match_user_id
    and (match_pack_id is null or dc.pack_id = match_pack_id)
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 8. Usage Log — tracks credit consumption per billing period
create table if not exists usage_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null default 'debate',
  case_id     text,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_usage_log_user_case
  on usage_log(user_id, case_id);

create index if not exists idx_usage_log_user_date
  on usage_log(user_id, created_at desc);

alter table usage_log enable row level security;

create policy "Users can read own usage"
  on usage_log for select
  using (auth.uid() = user_id);

-- Insert & delete via service_role only (bypasses RLS)

-- Helper: count usage in current billing period
create or replace function get_usage_count(
  p_user_id uuid,
  p_action  text default null,
  p_since   timestamptz default (date_trunc('month', now()))
)
returns int
language sql
stable
security definer
as $$
  select count(*)::int
  from usage_log
  where user_id = p_user_id
    and created_at >= p_since
    and (p_action is null or action = p_action);
$$;
