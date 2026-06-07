/**
 * Verdict v2 — Embedding provider (semantic retrieval, Workstream 2).
 *
 * Source-bound philosophy: embeddings only decide WHICH of the user's own
 * passages to surface — they never state, summarise, or invent law. Every
 * citation the engine relies on is still re-verified against the retrieved
 * text downstream (validateCitations / passageMentionsCitation).
 *
 * Model choice: OpenAI `text-embedding-3-large` requested at `dimensions: 1536`.
 * The large model truncated to 1536 dims beats `text-embedding-3-small` at the
 * same width and is noticeably stronger on multilingual EN/FR legal text, while
 * still matching the existing `vector(1536)` schema + `match_chunks` RPC — no
 * database migration required. Everything is overridable via env.
 *
 * Fail-open: semantic retrieval is an ADDITIVE enhancement layered on top of the
 * deterministic lexical retriever. If the provider is misconfigured or the call
 * fails, these helpers return empty results rather than throwing, so the engine
 * silently degrades to its proven lexical behaviour.
 */

import { env } from '$env/dynamic/private';

/** Whether semantic (vector) retrieval is enabled. Defaults to OFF. */
export const semanticRetrievalEnabled = (): boolean => {
	const flag = (env.ENABLE_SEMANTIC_RETRIEVAL ?? '').toString().trim().toLowerCase();
	return flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes';
};

/** The embedding model to use. */
const embeddingModel = (): string => env.EMBEDDING_MODEL ?? 'text-embedding-3-large';

/** The embedding dimensionality. Must match the `vector(N)` column + RPC. */
export const embeddingDimensions = (): number => {
	const raw = Number(env.EMBEDDING_DIM ?? 1536);
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1536;
};

const apiKey = (): string | undefined => env.LLM_API_KEY ?? env.OPENAI_API_KEY;

/** Hard cap on characters per input to stay well under the model token limit. */
const MAX_INPUT_CHARS = 24_000;
/** Inputs per request (OpenAI allows large batches; keep memory bounded). */
const BATCH_SIZE = 96;

const sanitize = (text: string): string =>
	(text ?? '').replace(/\u0000/g, ' ').trim().slice(0, MAX_INPUT_CHARS) || ' ';

type EmbeddingResponse = {
	data?: { embedding?: number[] }[];
};

/**
 * Embed a batch of texts. Returns one vector per input (same order). On any
 * failure or when disabled/unconfigured, returns an empty array so callers can
 * fall back to lexical-only behaviour.
 */
export const embedTexts = async (texts: string[]): Promise<number[][]> => {
	if (!semanticRetrievalEnabled()) return [];
	const key = apiKey();
	if (!key || !texts.length) return [];

	const model = embeddingModel();
	const dimensions = embeddingDimensions();
	const out: number[][] = [];

	for (let i = 0; i < texts.length; i += BATCH_SIZE) {
		const batch = texts.slice(i, i + BATCH_SIZE).map(sanitize);
		try {
			const response = await fetch('https://api.openai.com/v1/embeddings', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${key}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ model, input: batch, dimensions })
			});
			if (!response.ok) {
				console.warn(`Embedding request failed (${response.status}):`, await response.text());
				return [];
			}
			const data = (await response.json()) as EmbeddingResponse;
			const vectors = (data.data ?? []).map((d) => d.embedding ?? []);
			if (vectors.length !== batch.length) {
				console.warn('Embedding response length mismatch; falling back to lexical.');
				return [];
			}
			out.push(...vectors);
		} catch (err) {
			console.warn('Embedding request errored:', err instanceof Error ? err.message : err);
			return [];
		}
	}

	return out;
};

/** Embed a single query string. Returns null when unavailable. */
export const embedQuery = async (text: string): Promise<number[] | null> => {
	const [vector] = await embedTexts([text]);
	return vector && vector.length ? vector : null;
};
