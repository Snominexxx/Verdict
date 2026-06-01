/**
 * LLM provider abstraction — lets us swap between OpenAI, Anthropic, Gemini
 * based on task type and the USE_NEW_AI_STACK feature flag.
 */

export type LLMTask =
	| 'bench'
	| 'coaching'
	| 'generate-case'
	| 'retrieval-plan'
	| 'create-chat'
	| 'create-dossier'
	| 'create-build';

export type LLMRequest = {
	task: LLMTask;
	systemPrompt: string;
	userPrompt: string;
	temperature: number;
	maxTokens?: number;
	/** JSON schema for structured outputs. Providers adapt this to their native schema API where available. */
	schema?: Record<string, unknown>;
	/** When true, response_format is JSON. Default true for our use cases. */
	jsonMode?: boolean;
	/** Provider-specific cached context handle, currently used by Gemini explicit source caches. */
	cachedContent?: string;
};

export interface LLMProvider {
	readonly name: string;
	call(req: LLMRequest): Promise<string>;
}
