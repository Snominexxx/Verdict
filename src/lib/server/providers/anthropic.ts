import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import type { LLMProvider, LLMRequest } from './types';

let client: Anthropic | null = null;

const genericReasoningModel = (): string | null => {
	const model = env.ANTHROPIC_MODEL?.trim();
	if (!model || /haiku/i.test(model)) return null;
	return model;
};

const reasoningModelForTask = (taskModel: string | undefined): string =>
	taskModel ?? env.ANTHROPIC_SONNET_MODEL ?? genericReasoningModel() ?? 'claude-sonnet-4-5';

const getClient = (): Anthropic => {
	if (!env.ANTHROPIC_API_KEY) {
		throw new Error('ANTHROPIC_API_KEY is not configured.');
	}
	if (!client) {
		client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	}
	return client;
};

const modelForTask = (task: LLMRequest['task']): string => {
	if (task === 'bench') {
		return reasoningModelForTask(env.ANTHROPIC_BENCH_MODEL);
	}
	if (task === 'coaching') {
		return reasoningModelForTask(env.ANTHROPIC_COACHING_MODEL);
	}
	if (task === 'create-chat') {
		return reasoningModelForTask(env.ANTHROPIC_CHAT_MODEL);
	}
	return env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
};

export const anthropicProvider: LLMProvider = {
	name: 'anthropic',
	async call(req: LLMRequest): Promise<string> {
		const model = modelForTask(req.task);
		const c = getClient();

		// We rely on a strict "return JSON only" instruction in the system prompt
		// plus our extractJson helper. We deliberately do NOT use an assistant
		// prefill ("{") because it occasionally confuses Claude into emitting
		// nested or stringified JSON, which then renders as raw JSON in the UI.
		const systemPrompt =
			req.jsonMode !== false
				? `${req.systemPrompt}\n\nCRITICAL OUTPUT RULES:\n- Respond with raw JSON ONLY — no prose, no greetings, no code fences, no markdown.\n- The first character of your response MUST be \`{\`. The last character MUST be \`}\`.\n- Do NOT wrap your response in \`\`\`json or any other formatting.\n- All field values must be plain strings/arrays/objects — never embed a stringified JSON inside a string field.`
				: req.systemPrompt;

		const resp = await c.messages.create({
			model,
			max_tokens: req.maxTokens ?? 1200,
			temperature: req.temperature,
			system: systemPrompt,
			messages: [{ role: 'user', content: req.userPrompt }]
		});

		const block = resp.content?.[0];
		return block && block.type === 'text' ? block.text : '';
	}
};
