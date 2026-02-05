import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const caseTypes = [
	'wrongful dismissal from employment',
	'landlord-tenant dispute over security deposit',
	'breach of contract for services',
	'unpaid wages or overtime',
	'consumer protection complaint',
	'small claims debt collection',
	'neighbour dispute over property damage',
	'failed home renovation contract'
];

export const GET: RequestHandler = async () => {
	if (!env.LLM_API_KEY) {
		throw error(500, 'LLM_API_KEY is not configured.');
	}

	const caseType = caseTypes[Math.floor(Math.random() * caseTypes.length)];
	const model = env.OPENAI_MODEL ?? 'gpt-4o-mini';

	const systemPrompt = `Generate a realistic case scenario for a Canadian/Quebec civil court simulation. Output JSON only.`;

	const userPrompt = `Create a ${caseType} case. The user is the plaintiff.

Return JSON with these exact keys:
{
  "title": "Lastname v. Defendant Name (max 40 chars)",
  "synopsis": "2-3 sentences describing what happened from plaintiff's view (max 300 chars)",
  "issues": "The main legal question the court must decide (max 100 chars)",
  "remedy": "What the plaintiff wants as outcome (max 100 chars)"
}

Make it realistic, specific with names/dates/amounts, and based in Quebec or Canada.`;

	try {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.LLM_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model,
				temperature: 0.9,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				max_tokens: 300
			})
		});

		if (!response.ok) {
			const err = await response.text();
			throw error(500, `OpenAI error: ${err}`);
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content ?? '';

		// Extract JSON from response
		const start = content.indexOf('{');
		const end = content.lastIndexOf('}');
		if (start === -1 || end === -1) {
			throw error(500, 'Failed to parse generated case.');
		}

		const parsed = JSON.parse(content.slice(start, end + 1));

		return json({
			title: parsed.title ?? 'Sample Case',
			synopsis: parsed.synopsis ?? 'No synopsis generated.',
			issues: parsed.issues ?? 'What are the legal issues?',
			remedy: parsed.remedy ?? 'Compensation.'
		});
	} catch (err) {
		console.error('Generate case failed:', err);
		throw error(500, 'Failed to generate case.');
	}
};
