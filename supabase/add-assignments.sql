-- Verdict — Teacher assignments + recorded student submissions
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Model:
--   assignments            = a frozen, source-bound CaseDossier a teacher
--                            publishes once and hands to every group. The
--                            dossier_snapshot is immutable so the exercise is
--                            byte-identical for every student (uniform across
--                            groups).
--   exercise_submissions   = one student's recorded hearing: their identity,
--                            the side they argued, the full transcript and the
--                            bench's final read. Students are anonymous (no
--                            account), so rows are written by the server using
--                            the service-role key; RLS denies all direct access
--                            and the teacher reads them through ownership-checked
--                            server code.

-- 1. Assignments (frozen exercise capsules) ---------------------------------
create table if not exists assignments (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references auth.users(id) on delete cascade,
  token             text not null unique,
  title             text not null default '',
  instructions      text not null default '',
  dossier_snapshot  jsonb not null default '{}'::jsonb,
  language          text not null default 'en',
  status            text not null default 'active',
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_assignments_token
  on assignments(token);

create index if not exists idx_assignments_teacher
  on assignments(teacher_id, created_at desc);

alter table assignments enable row level security;

create policy "Teachers can read own assignments"
  on assignments for select
  using (auth.uid() = teacher_id);

create policy "Teachers can insert own assignments"
  on assignments for insert
  with check (auth.uid() = teacher_id);

create policy "Teachers can update own assignments"
  on assignments for update
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "Teachers can delete own assignments"
  on assignments for delete
  using (auth.uid() = teacher_id);

-- 2. Exercise submissions (recorded student hearings) -----------------------
create table if not exists exercise_submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references assignments(id) on delete cascade,
  token          text not null,
  student_name   text not null default '',
  student_email  text not null default '',
  role           text not null default 'plaintiff',
  transcript     jsonb not null default '[]'::jsonb,
  final_mind     jsonb,
  turn_count     integer not null default 0,
  started_at     timestamptz,
  submitted_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_submissions_assignment
  on exercise_submissions(assignment_id, submitted_at desc);

create index if not exists idx_submissions_token
  on exercise_submissions(token);

-- Students have no account: rows are written and read only through the
-- service-role key in server code (which enforces teacher ownership). RLS is
-- enabled with no public policies, so direct client access is denied.
alter table exercise_submissions enable row level security;
