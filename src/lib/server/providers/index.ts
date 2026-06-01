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
	return provider.call(req);
};
