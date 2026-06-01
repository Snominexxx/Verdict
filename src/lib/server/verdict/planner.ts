/**
 * Verdict v2 — AI retrieval planner.
 *
 * Gemini Flash sits between the user and the retriever as a GUIDE, never as a
 * source of law. Given the user's request and a label-only table of contents
 * of their sources, it decides WHAT to search for — exact article numbers when
 * the user is specific, legal-topic concepts when the user is vague.
 *
 * Hard boundary: the planner must NOT state, interpret, summarize, confirm or
 * invent law. It only emits search targets. If it fails or returns nothing, we
 * fall back to an empty plan and the deterministic retriever still runs — the
 * pipeline never depends on the planner being available.
 */

import type { RetrievalPlan, VerdictLanguage } from '$lib/verdict/contracts';
import { callLLM } from '../providers';

export type PlanRetrievalArgs = {
	/** The user's latest request / question. */
	request: string;
	/** Optional recent conversation for context (chat mode). */
	conversation?: string;
	/** Label-only table of contents of the selected sources. */
	sourceMapText: string;
	language: VerdictLanguage;
};

const SYSTEM_PROMPT = `You are a legal RESEARCH PLANNER for a strictly source-bound legal training tool. Your ONLY job is to decide WHAT to search for inside the user's uploaded legal sources. You are a guide for the search engine — you are NOT a lawyer and you do NOT answer.

ABSOLUTE RULES (this is law — truth and authenticity are non-negotiable):
1. NEVER state, explain, interpret, summarize, confirm, or invent what any law says. You only list things to look for.
2. NEVER invent an article/section number. Only use numbers the user explicitly named, or numbers that appear in the TABLE OF CONTENTS.
3. When the request is specific (names an article), put that number in "citations".
4. When the request is conceptual/vague, put short legal-topic phrases in "concepts" (e.g. "latent defect", "good faith", "prescription period"). The system follows cross-references on its own afterwards.
5. Keep it tight: at most ~8 citations and ~6 concepts.

Return ONLY valid JSON, no prose:
{
  "citations": string[],   // exact article/section numbers, e.g. ["1457","1726"]
  "concepts": string[],    // topic phrases to search for
  "rationale": string      // ONE short sentence on the search strategy (not legal advice)
}`;

const LANGUAGE_BLOCK = (language: VerdictLanguage): string =>
	language === 'fr'
		? 'LANGUE: La conversation est en français. Les concepts peuvent être en français.'
		: 'LANGUAGE: The conversation is in English.';

const extractJson = (raw: string): Record<string, unknown> | null => {
	const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start === -1 || end === -1) return null;
	try {
		return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
	} catch {
		return null;
	}
};

const asStringArray = (v: unknown, max: number): string[] =>
	Array.isArray(v)
		? Array.from(
				new Set(
					v
						.map((x) => String(x ?? '').trim())
						.filter(Boolean)
				)
			).slice(0, max)
		: [];

const EMPTY_PLAN: RetrievalPlan = { citations: [], concepts: [], rationale: '' };

export const planRetrieval = async (args: PlanRetrievalArgs): Promise<RetrievalPlan> => {
	const userPrompt = [
		LANGUAGE_BLOCK(args.language),
		'',
		'TABLE OF CONTENTS OF AVAILABLE SOURCES (labels only — never the law itself):',
		args.sourceMapText || '(no structured table of contents — rely on concepts)',
		'',
		args.conversation ? `CONVERSATION SO FAR:\n${args.conversation}\n` : '',
		`USER REQUEST:\n${args.request}`,
		'',
		'Produce the retrieval plan now as JSON.'
	]
		.filter((l) => l !== '')
		.join('\n');

	try {
		const raw = await callLLM({
			task: 'retrieval-plan',
			systemPrompt: SYSTEM_PROMPT,
			userPrompt,
			temperature: 0.2,
			jsonMode: true,
			maxTokens: 500
		});
		const parsed = extractJson(raw);
		if (!parsed) return EMPTY_PLAN;
		return {
			citations: asStringArray(parsed.citations, 8).map((c) => {
				const m = c.match(/\d+(?:\.\d+)*/);
				return m ? m[0] : c;
			}),
			concepts: asStringArray(parsed.concepts, 6),
			rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim() : ''
		};
	} catch (err) {
		// Planner is best-effort: never let it break retrieval.
		console.error('Retrieval planner failed, falling back to empty plan:', err);
		return EMPTY_PLAN;
	}
};
