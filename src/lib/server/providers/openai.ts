import { env } from '$env/dynamic/private';
import type { LLMProvider, LLMRequest } from './types';

/**
 * OpenAI provider — preserves the existing behaviour (gpt-4o-mini + json_schema).
 * Used as the legacy/fallback when USE_NEW_AI_STACK is not enabled.
 */
export const openaiProvider: LLMProvider = {
	name: 'openai',
	async call(req: LLMRequest): Promise<string> {
		const model = env.OPENAI_MODEL ?? 'gpt-4o-mini';
		if (!env.LLM_API_KEY) {
			throw new Error('LLM_API_KEY is not configured.');
		}

		const body: Record<string, unknown> = {
			model,
			temperature: req.temperature,
			messages: [
				{ role: 'system', content: req.systemPrompt },
				{ role: 'user', content: req.userPrompt }
			],
			max_tokens: req.maxTokens ?? 900
		};

		if (req.jsonMode !== false) {
			if (req.schema) {
				body.response_format = {
					type: 'json_schema',
					json_schema: { name: 'verdict_debate', schema: req.schema }
				};
			} else {
				body.response_format = { type: 'json_object' };
			}
		}

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.LLM_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorPayload = await response.text();
			throw new Error(`OpenAI request failed: ${errorPayload}`);
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;
		return Array.isArray(content)
			? content.map((chunk: any) => chunk.text ?? '').join('\n')
			: content ?? '';
	}
};
