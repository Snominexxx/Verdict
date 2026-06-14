# Verdict — Source-Bound AI Litigation Studio

Verdict is a legal training platform where users build hearings from selected sources, argue before an AI judge, and review outcomes. The current architecture is source-bound: the model can only reason over retrieved authority from the user's selected materials.

## What Is Live Now

- V2 Create flow: conversation-first case building at /create
- Source-bound CaseDossier pipeline (intent -> retrieval -> dossier -> hearing)
- Teacher Assignments workflow with per-student identity and recorded submissions
- Hybrid retrieval (lexical + optional semantic vector retrieval)
- FR/EN UI and language-aware prompting
- Supabase-backed persistence for packs, sources, cases, drafts, assignments, and submissions

## Tech Stack

- SvelteKit 2 + Svelte 5 + TypeScript
- Tailwind CSS
- Supabase (Auth, Postgres, Storage)
- Netlify adapter for deployment
- Vitest for tests

## Quick Start

```sh
npm install
npm run dev
```

Run quality checks:

```sh
npm run check
npm run test
```

## Environment Variables

Minimum required:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=verdict-sources
```

AI stack (recommended current setup):

```dotenv
USE_NEW_AI_STACK=true
GOOGLE_API_KEY=your-gemini-key

# OpenAI is used for fallback and embeddings
LLM_API_KEY=your-openai-key
# or OPENAI_API_KEY=your-openai-key

OPENAI_MODEL=gpt-4o-mini
```

Semantic retrieval (optional but recommended):

```dotenv
ENABLE_SEMANTIC_RETRIEVAL=true
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIM=1536
```

Model overrides (optional):

```dotenv
GEMINI_PRO_MODEL=gemini-2.5-pro
GEMINI_CHAT_MODEL=gemini-2.5-pro
GEMINI_DOSSIER_MODEL=gemini-2.5-pro
GEMINI_BUILD_MODEL=gemini-2.5-pro
GEMINI_PLAN_MODEL=gemini-2.5-flash
GEMINI_BENCH_MODEL=gemini-2.5-flash
```

Notes:

- If Gemini/Anthropic fails at runtime and an OpenAI key is present, Verdict now attempts an OpenAI fallback for LLM calls.
- Never commit real secrets.

## Database Setup (Supabase)

For a fresh project, run:

- supabase/migration.sql

For existing projects or incremental rollout, also run:

- supabase/add-assignments.sql
- supabase/add-document-chunks.sql

The document chunk script is rerun-safe for policies (it drops/recreates existing policy names).

## Core Product Flows

### 1) Library and Source Packs

- Create/manage packs in /library
- Upload PDF or DOCX
- Text is parsed, quality-checked, chunked, and stored in document_chunks
- Original file is stored in Supabase Storage for preview/download

### 2) Create and Hearing

- Chat in /create to define the exercise
- Build a CaseDossier grounded in retrieved source passages
- Enter hearing mode and submit turns to the AI judge
- Judge responses are citation-checked against the dossier packet

### 3) Drafts

- Save in-progress work for later refinement
- Reopen and continue from /drafts

### 4) Assignments (Teacher Workflow)

- Publish a frozen dossier as a shareable assignment link
- Students open /assignment/[token], enter identity, and complete the same exercise
- Student submissions are recorded in exercise_submissions
- Teachers review all submissions at /assignments

## Semantic Retrieval

When ENABLE_SEMANTIC_RETRIEVAL=true:

- Ingest stores embeddings for chunks (best-effort)
- Retrieval augments lexical results with vector matches from match_chunks
- Lexical retrieval remains the floor and fallback

Backfill existing text-only chunks:

- POST /api/library/embed while authenticated
- Repeat until remaining = 0

Example body:

```json
{ "maxChunks": 500 }
```

## Important Routes

- /create - V2 case build + hearing
- /library - packs and uploads
- /drafts - saved work
- /court - hearing history/management
- /assignments - teacher assignment roster and submissions
- /assignment/[token] - student entry page (public)

Legacy routes (/cases, /debate, /share) still exist for compatibility but are no longer the primary path.

## Troubleshooting

### Upload says "Authentication required" even after login

- Hard refresh and sign in again
- Confirm Supabase Auth Site URL and redirect URLs match your domain
- Check browser Network for failing /api/library/* or /api/user-data calls
- Verify VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set in the running environment

### Uploaded docs appear, then disappear after refresh

- This usually means /api/user-data sync failed
- Check Network response body for /api/user-data
- Ensure legal_packs and pack_sources tables exist (run migration.sql)

### AI conversation fails

- Verify GOOGLE_API_KEY when USE_NEW_AI_STACK=true
- Verify LLM_API_KEY or OPENAI_API_KEY for fallback
- Confirm deploy environment has the updated keys and redeploy after changes

## Deployment

```sh
npm run build
```

Deploy with Netlify using netlify.toml. Add all environment variables in Netlify Site Configuration -> Environment Variables.
