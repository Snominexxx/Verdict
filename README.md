# Verdict — AI Litigation Simulator

Verdict is an MVP training cockpit where lawyers and law students can debate a case against an AI advocate while five AI jurors react with distinct scoring styles.

## Stack

- **SvelteKit + TypeScript** for the UI and routing
- **Tailwind CSS** with a bespoke cockpit theme
- **Supabase** (auth, Postgres, storage) for persisting cases, uploads, and transcripts
- **Netlify adapter** to deploy the whole app (UI + server endpoints) as Edge/Functions

## Getting Started

```sh
npm install
npm run dev -- --open
```

Environment variables (copy `.env.example` → `.env`):

```
VITE_SUPABASE_URL=your-project.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key (server-side only)
LLM_PROVIDER=openai|anthropic|azure-openai
LLM_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-02-15-preview
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
LLM_TEMPERATURE=0.2
```

- The service-role key is only read on the server (Netlify function) to persist staged cases.
- Pick one provider (`LLM_PROVIDER`) and fill in the accompanying fields.
- Temperature can be nudged if you want looser or stricter arguments.

## Available Pages

- **/** — overview with primary call-to-action buttons
- **/cases** — staging area for official sample cases or custom uploads
- **/debate** — chat-style arena plus juror console and scorecards (wired to a stub API)
- **/jury** — deeper view of juror psychology and scoring rubric
- **/library** — minimal reader for foundational sources (drop Markdown files into `static/library`)

## Development Workflow

1. Stage cases + sources (Supabase Storage + Postgres)
2. Start a debate; frontend hits `POST /api/debate`
3. Server endpoint pushes prompt + sources to your configured LLM (OpenAI, Azure OpenAI, or Anthropic)
4. Juror personas get scored via the same response (JSON enforced) and fed back to the UI
5. Persist verdict + transcript for later review/export

### Library content

- `static/library/canadian-charter-of-rights-and-freedoms.md` ships with the full Charter text.
- `static/library/civil-code-of-quebec.md` currently holds a placeholder + sample articles—replace with the official consolidated code to expose every article in-app.

- `src/routes/api/cases/+server.ts` writes staged cases to the `staged_cases` table and stores the ID in the `verdict_case_id` cookie so `/debate` can reload the context after a refresh.
- `src/routes/debate/+page.server.ts` hydrates the current case from Supabase before rendering.
- `src/routes/api/debate/+server.ts` now calls your actual LLM and synthesizes juror scorecards from the same response payload.

### Supabase schema

Create the backing table with RLS rules of your choice (example):

```sql
create table if not exists public.staged_cases (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	synopsis text not null,
	issues text,
	remedy text,
	role text not null check (role in ('plaintiff','defendant')),
	sources jsonb default '[]'::jsonb,
	created_at timestamptz default now()
);
```

Grant insert/select to the service role key (already implied) and configure RLS if you later add user auth.

## Production Build & Deploy

```sh
npm run build
```

Netlify reads `netlify.toml`, runs the build, and serves the generated server bundle via Edge/Functions. Supabase keys should be added as Netlify environment variables (never committed).

## Next Steps

- Replace the mock `/api/debate` logic with your LLM provider of choice
- Wire Supabase auth/storage for uploads and private workspaces
- Add PDF/CSV export of the juror scorecards for coaching feedback

Happy litigating! ✨
