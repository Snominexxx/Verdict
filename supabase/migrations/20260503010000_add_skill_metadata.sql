alter table public.cases
	add column if not exists objective text not null default '';

alter table public.cases
	add column if not exists target_skill text not null default '';

alter table public.cases
	add column if not exists practice_points jsonb not null default '[]'::jsonb;

alter table public.staged_cases
	add column if not exists objective text not null default '';

alter table public.staged_cases
	add column if not exists target_skill text not null default '';

alter table public.staged_cases
	add column if not exists practice_points jsonb not null default '[]'::jsonb;