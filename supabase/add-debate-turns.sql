-- Run this in Supabase SQL Editor to add the debate_turns table.

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
