import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import type { LLMProvider, LLMRequest } from './types';

let client: GoogleGenAI | null = null;

const genericReasoningModel = (): string | null => {
	const model = env.GEMINI_MODEL?.trim();
	if (!model || /flash/i.test(model)) return null;
	return model;
};

const reasoningModelForTask = (taskModel: string | undefined): string =>
	taskModel ?? env.GEMINI_PRO_MODEL ?? genericReasoningModel() ?? 'gemini-2.5-pro';

const conversationModelForTask = (taskModel: string | undefined): string =>
	taskModel ?? env.GEMINI_JUDGE_MODEL ?? env.GEMINI_FLASH_MODEL ?? 'gemini-2.5-flash';

const getClient = (): GoogleGenAI => {
	if (!env.GOOGLE_API_KEY) {
		throw new Error('GOOGLE_API_KEY is not configured.');
	}
	if (!client) {
		client = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });
	}
	return client;
};

const modelForTask = (task: LLMRequest['task']): string => {
	if (task === 'retrieval-plan') {
		// Planning only decides WHAT to search for — a fast Flash model is enough.
		return conversationModelForTask(env.GEMINI_PLAN_MODEL);
	}
	if (task === 'create-chat') {
		return reasoningModelForTask(env.GEMINI_CHAT_MODEL);
	}
	if (task === 'create-dossier') {
		return reasoningModelForTask(env.GEMINI_DOSSIER_MODEL);
	}
	if (task === 'create-build') {
		return reasoningModelForTask(env.GEMINI_BUILD_MODEL);
	}
	if (task === 'bench') {
		return conversationModelForTask(env.GEMINI_BENCH_MODEL);
	}
	if (task === 'coaching') {
		return reasoningModelForTask(env.GEMINI_COACHING_MODEL);
	}
	if (task === 'generate-case') {
		return reasoningModelForTask(env.GEMINI_GENERATE_CASE_MODEL);
	}
	return reasoningModelForTask(undefined);
};

export const geminiProvider: LLMProvider = {
	name: 'gemini',
	async call(req: LLMRequest): Promise<string> {
		const model = modelForTask(req.task);
		const c = getClient();
		const useFlash = /flash/i.test(model);

		// Gemini 2.5 *reasoning* models (Pro) think before answering, and the
		// thinking tokens are drawn from the SAME maxOutputTokens budget as the
		// visible answer. If we cap the budget at just the visible size, the model
		// can spend it all thinking and return an EMPTY response (finishReason
		// MAX_TOKENS) — which is exactly what broke the chat/dossier JSON parsing.
		// So for Pro we (a) cap the thinking budget and (b) add that headroom on
		// top of the requested visible budget. Flash keeps thinking disabled.
		const visibleBudget = req.maxTokens ?? 1200;
		const thinkingBudget = useFlash ? 0 : 4096;
		const maxOutputTokens = visibleBudget + thinkingBudget;

		const resp = await c.models.generateContent({
			model,
			contents: req.userPrompt,
			config: {
				systemInstruction: req.systemPrompt,
				...(req.cachedContent ? { cachedContent: req.cachedContent } : {}),
				temperature: req.temperature,
				maxOutputTokens,
				thinkingConfig: { thinkingBudget },
				...(req.jsonMode !== false ? { responseMimeType: 'application/json' } : {}),
				...(req.jsonMode !== false && req.schema ? { responseJsonSchema: req.schema } : {})
			}
		});

		const text = resp.text ?? '';
		if (!text.trim()) {
			const reason = resp.candidates?.[0]?.finishReason ?? 'unknown';
			throw new Error(`Gemini returned empty output (model=${model}, task=${req.task}, finishReason=${reason})`);
		}
		return text;
	}
};
