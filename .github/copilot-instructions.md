# Verdict — Copilot Instructions

## Project
- **Stack:** SvelteKit + Tailwind CSS + Supabase + Netlify
- **Language:** TypeScript
- **LLM:** OpenAI gpt-4o-mini (configurable via env vars)

## Architecture
- `src/lib/stores/` — Svelte writable stores (debate, stagedCase, caseHistory, language, ui)
- `src/lib/server/llm.ts` — LLM prompt construction + API dispatch (jury + bench modes)
- `src/lib/i18n.ts` — All translation keys (EN/FR) with `t(key, lang)` helper
- `src/lib/data/` — Static data (juror personas, judge persona, library documents)
- `src/routes/api/` — Server endpoints (debate, generate-case, cases)
- `src/routes/` — Pages (home, cases, court, debate, jury, library, about, how-it-works)

## Conventions
- All UI strings use `t()` from `$lib/i18n` — never hardcode user-visible text
- Language state lives in `$lib/stores/language` (persisted to localStorage)
- AI prompts include a LANGUAGE INSTRUCTION block matching the user's selected language
- Tailwind config uses custom colors: `ink`, `flare`, `pulse`
- Use `font-display` for headings, `font-mono` for data/labels
- Keep responses concise and focused
- Follow development best practices
