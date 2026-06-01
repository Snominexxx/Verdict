create table if not exists public.saved_drafts (
	id text primary key,
	user_id uuid not null references auth.users(id) on delete cascade,
	title text not null default '',
	draft_data jsonb not null default '{}'::jsonb,
	selected_option jsonb not null default '{}'::jsonb,
	paper_snapshot jsonb not null default '{}'::jsonb,
	analysis jsonb,
	workflow jsonb,
	pack_id text,
	pack_context jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table if exists public.saved_drafts enable row level security;

create policy "Users can read own drafts"
	on public.saved_drafts for select
	using (auth.uid() = user_id);

create policy "Users can insert own drafts"
	on public.saved_drafts for insert
	with check (auth.uid() = user_id);

create policy "Users can update own drafts"
	on public.saved_drafts for update
	using (auth.uid() = user_id);

create policy "Users can delete own drafts"
	on public.saved_drafts for delete
	using (auth.uid() = user_id);