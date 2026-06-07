import { env } from '$env/dynamic/private';
import type { LLMProvider, LLMRequest, LLMTask } from './types';
import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';

export type { LLMRequest, LLMTask } from './types';

export const isNewStackEnabled = (): boolean => {
	const flag = (env.USE_NEW_AI_STACK ?? '').toLowerCase();
	return flag === 'true' || flag === '1' || flag === 'yes';
};

/**
 * Routes a task to the appropriate LLM provider.
 *
 * When USE_NEW_AI_STACK=true:
	 *   - generate-case / create-dossier / create-build / create-chat / bench / coaching
	 *                           → Gemini 2.5 Pro by default as the single legal/source-aware reasoning model
 *
 * Otherwise: legacy OpenAI gpt-4o-mini path.
 */
export const getProvider = (task: LLMTask): LLMProvider => {
	if (!isNewStackEnabled()) {
		return openaiProvider;
	}
	switch (task) {
		case 'generate-case':
		case 'create-dossier':
		case 'create-build':
		case 'create-chat':
		case 'retrieval-plan':
		case 'bench':
		case 'coaching':
		default:
			return geminiProvider;
	}
};

export const callLLM = async (req: LLMRequest): Promise<string> => {
	const provider = getProvider(req.task);
	try {
		return await provider.call(req);
	} catch (primaryErr) {
		// New-stack resilience: if Gemini/Anthropic fails (key missing, quota,
		// transient provider outage), fall back to OpenAI when available so the
		// conversation does not hard-stop for the user.
		if (provider.name === 'openai') {
			throw primaryErr;
		}

		const hasOpenAIFallback = Boolean(env.LLM_API_KEY ?? env.OPENAI_API_KEY);
		if (!hasOpenAIFallback) {
			throw primaryErr;
		}

		console.error(
			`Primary LLM provider failed (provider=${provider.name}, task=${req.task}); attempting OpenAI fallback.`,
			primaryErr
		);

		try {
			return await openaiProvider.call(req);
		} catch (fallbackErr) {
			const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
			const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
			throw new Error(
				`Primary provider failed (${provider.name}): ${primaryMsg}. OpenAI fallback failed: ${fallbackMsg}`
			);
		}
	}
};
