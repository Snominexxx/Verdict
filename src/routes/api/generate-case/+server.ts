import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const universalCaseTypes = [
	'wrongful dismissal from employment',
	'landlord-tenant dispute',
	'breach of contract for services',
	'unpaid wages or overtime',
	'consumer protection complaint',
	'small claims debt collection',
	'property damage dispute between neighbours',
	'failed renovation or construction contract',
	'insurance claim denial',
	'professional negligence'
];

export const POST: RequestHandler = async ({ request }) => {
	if (!env.LLM_API_KEY) {
		throw error(500, 'LLM_API_KEY is not configured.');
	}

	let language = 'en';
	let pack: { packName?: string; jurisdictions?: string[]; sourceTitles?: string[] } | null = null;
	try {
		const body = await request.json();
		language = body?.language ?? 'en';
		pack = body?.pack ?? null;
	} catch {
		// No body or invalid JSON — defaults apply
	}

	const caseType = universalCaseTypes[Math.floor(Math.random() * universalCaseTypes.length)];
	const model = env.OPENAI_MODEL ?? 'gpt-4o-mini';

	// Build jurisdiction context from the selected pack
	const jurisdictions = pack?.jurisdictions?.filter(Boolean) ?? [];
	const jurisdictionLabel = jurisdictions.length ? jurisdictions.join(' / ') : 'a common-law or civil-law jurisdiction';
	const sourcesContext = pack?.sourceTitles?.length
		? `\nThe user has selected a legal pack called "${pack.packName ?? 'Custom Pack'}" with these sources:\n${pack.sourceTitles.map((t) => `- ${t}`).join('\n')}\nGenerate a case that would naturally involve these laws or legal instruments.`
		: '';

	const langInstruction = language === 'fr'
		? `Generate a realistic case scenario for a civil court simulation set in ${jurisdictionLabel}. Output JSON only. ALL text values MUST be in French (Canadian French).`
		: `Generate a realistic case scenario for a civil court simulation set in ${jurisdictionLabel}. Output JSON only.`;

	const userPrompt = `Create a ${caseType} case. The user is the plaintiff.${language === 'fr' ? ' Respond entirely in French (Canadian French).' : ''}
${sourcesContext}

The case must be realistic and grounded in ${jurisdictionLabel} law. Use names, dates, and amounts appropriate for that jurisdiction.

Return JSON with these exact keys:
{
  "title": "Lastname v. Defendant Name (max 40 chars)",
	"synopsis": "2-3 sentences describing what happened in neutral factual terms (max 300 chars)",
  "issues": "The main legal question the court must decide (max 100 chars)",
	"remedy": "What the plaintiff wants as outcome (max 100 chars)",
	"defendantPosition": "What the defendant asks the court to do (dismiss/reduce/deny etc.) (max 120 chars)"
}`;

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
					{ role: 'system', content: langInstruction },
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

		return json(
			{
			title: parsed.title ?? 'Sample Case',
			synopsis: parsed.synopsis ?? 'No synopsis generated.',
			issues: parsed.issues ?? 'What are the legal issues?',
			remedy: parsed.remedy ?? 'Compensation.',
			defendantPosition: parsed.defendantPosition ?? 'Dismiss or reduce the claim.'
		},
		{
			headers: {
				'Cache-Control': 'no-store, max-age=0'
			}
		}
		);
	} catch (err) {
		console.error('Generate case failed:', err);
		throw error(500, 'Failed to generate case.');
	}
};
