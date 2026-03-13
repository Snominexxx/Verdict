-- ============================================================
-- Verdict RAG: document_chunks table with pgvector embeddings
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Enable pgvector extension
create extension if not exists vector with schema extensions;

-- 2. Document chunks table
create table if not exists document_chunks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   text not null,                -- matches pack_sources.id or LibraryDocument.id
  pack_id     text,                          -- optional: which pack this source belongs to
  chunk_index int not null default 0,        -- ordering within the source document
  heading     text not null default '',      -- section/article heading (e.g. "Art. 1457")
  content     text not null,                 -- the chunk text
  token_count int not null default 0,        -- approximate token count for budgeting
  embedding   vector(1536),                  -- OpenAI text-embedding-3-small dimension
  metadata    jsonb not null default '{}'::jsonb,  -- jurisdiction, docType, trustLevel, title, etc.
  created_at  timestamptz not null default now()
);

-- 3. Indexes
-- HNSW index for fast similarity search
create index if not exists idx_chunks_embedding
  on document_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Fast lookup by user + source
create index if not exists idx_chunks_user_source
  on document_chunks(user_id, source_id);

-- Fast lookup by user (for RAG queries)
create index if not exists idx_chunks_user
  on document_chunks(user_id);

-- 4. RLS
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

-- 5. Semantic search function (called from the app)
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
