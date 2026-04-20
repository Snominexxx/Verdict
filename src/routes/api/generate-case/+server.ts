import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { searchChunks, formatChunksForPrompt } from '$lib/server/rag';
import { rateLimit } from '$lib/server/rateLimit';

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
	'professional negligence',
	'defamation or libel',
	'product liability',
	'intellectual property infringement',
	'medical malpractice',
	'fraud or misrepresentation',
	'partnership dissolution',
	'non-compete clause violation',
	'discrimination in housing',
	'environmental contamination liability',
	'inheritance or succession dispute',
	'custody or parental rights dispute',
	'breach of fiduciary duty',
	'wrongful eviction',
	'unjust enrichment claim',
	'boundary or easement dispute',
	'breach of non-disclosure agreement',
	'unpaid contractor or subcontractor',
	'denial of disability benefits',
	'harassment or hostile work environment',
	'consumer debt dispute'
];

const ragQueryTopics = [
	'obligations contracts breach damages',
	'property ownership rights boundaries',
	'family custody parental support',
	'succession inheritance estate will',
	'civil liability fault negligence',
	'lease rental housing tenant landlord',
	'employment dismissal wages labour',
	'sale purchase warranty defect',
	'mandate agency representation authority',
	'security hypothec surety guarantee',
	'prescription limitation period delay',
	'privacy rights defamation reputation',
	'insurance claim indemnity coverage',
	'partnership association dissolution',
	'unjust enrichment restitution',
	'publication of rights registration',
	'administration property trust',
	'evidence proof burden testimony'
];

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	// Rate limit: 5 requests per 60 seconds per user
	const rl = rateLimit(session.user.id, 'generate_case', 5, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many requests. Please wait a moment and try again.');
	}

	if (!env.LLM_API_KEY) {
		throw error(500, 'LLM_API_KEY is not configured.');
	}

	let language = 'en';
	let pack: { packId?: string; packName?: string; jurisdictions?: string[]; sourceTitles?: string[]; sourceIds?: string[] } | null = null;
	let recentTitles: string[] = [];
	try {
		const body = await request.json();
		language = body?.language ?? 'en';
		pack = body?.pack ?? null;
		recentTitles = Array.isArray(body?.recentTitles) ? body.recentTitles.slice(0, 5) : [];
	} catch {
		// No body or invalid JSON — defaults apply
	}

	// Pick 2 random case types, excluding any that match recent titles
	const recentLower = recentTitles.map((t: string) => (t ?? '').toLowerCase());
	const available = universalCaseTypes.filter((ct) => !recentLower.some((rt: string) => rt.includes(ct.split(' ')[0])));
	const pool = available.length >= 2 ? available : universalCaseTypes;
	const shuffled = pool.sort(() => Math.random() - 0.5);
	const caseTypeA = shuffled[0];
	const caseTypeB = shuffled[1];
	const model = env.OPENAI_MODEL ?? 'gpt-4o-mini';

	// Build jurisdiction context from the selected pack
	const jurisdictions = pack?.jurisdictions?.filter(Boolean) ?? [];
	const jurisdictionLabel = jurisdictions.length ? jurisdictions.join(' / ') : 'a common-law or civil-law jurisdiction';
	const sourcesContext = pack?.sourceTitles?.length
		? `\nThe user has selected a legal pack called "${pack.packName ?? 'Custom Pack'}" with these sources:\n${pack.sourceTitles.map((t) => `- ${t}`).join('\n')}\nGenerate a case that would naturally involve these laws or legal instruments.`
		: '';

	// RAG: try to get relevant legal text from the user's indexed documents
	let ragContext = '';
	try {
		const ragTopic = ragQueryTopics[Math.floor(Math.random() * ragQueryTopics.length)];
		const ragQuery = `${ragTopic} ${jurisdictionLabel}`;
		const allChunks = await searchChunks({
			supabase: locals.supabase,
			userId: session.user.id,
			query: ragQuery,
			packId: pack?.packId ? String(pack.packId) : undefined,
			maxChunks: 20,
			maxTokens: 6000
		});
		// Filter to only the sources the user selected (if specified)
		const selectedIds = pack?.sourceIds?.filter(Boolean);
		const chunks = selectedIds?.length
			? allChunks.filter((c) => selectedIds.includes(c.sourceId)).slice(0, 8)
			: allChunks.slice(0, 8);
		if (chunks.length > 0) {
			ragContext = `\n\nThe user has indexed the following legal documents. Base the case scenario on these ACTUAL legal provisions:\n${formatChunksForPrompt(chunks)}\n\nCITATION RULES (MANDATORY):\n- You may ONLY reference article numbers, section numbers, or provision identifiers that appear VERBATIM in the text above.\n- NEVER extrapolate, infer, or invent article/section numbers — even if they seem logically sequential (e.g., if you see articles 3165-3168, do NOT assume 3169 exists).\n- If no specific article fits the scenario, describe the legal concept in GENERAL TERMS without citing any specific number.\n- If the text above contains court decisions or jurisprudence (e.g., case names like "Ciment du Saint-Laurent v. Barrette"), you MAY reference those case names VERBATIM. NEVER invent case names that do not appear in the text.\n\nMake the scenario naturally arise from these specific legal provisions. Infer the correct jurisdiction from the document content — do NOT assume Quebec or Canada unless the documents explicitly reference them.`;
		}
	} catch {
		// RAG is optional — skip silently if not available
	}

	const langInstruction = language === 'fr'
		? `Generate a realistic case scenario for a court simulation set in ${jurisdictionLabel}. Output JSON only. ALL text values MUST be in French (Canadian French).`
		: `Generate a realistic case scenario for a court simulation set in ${jurisdictionLabel}. Output JSON only.`;

	// If RAG found content from user's documents, let the AI pick the case type from that content.
	// Otherwise, fall back to a random universal case type.
	const caseTypeInstruction = ragContext
		? `Based on the legal provisions below, create a SPECIFIC, TIGHTLY SCOPED case scenario.

SPECIFICITY RULES:
- Pick exactly 1 or 2 specific articles/sections from the provided text as the legal crux of the dispute.
- Build the fact pattern so the outcome DEPENDS on the interpretation of those specific provisions — not on vague "general principles."
- The synopsis must name the specific articles in play (e.g., "The dispute turns on article 1457 C.c.Q." or "The Crown relies on s. 267(1)(a) of the Criminal Code").
- The issues field must frame a precise legal question, not a broad topic (BAD: "liability issues" — GOOD: "Whether the defendant's failure to salt the walkway constitutes fault under art. 1457 C.c.Q.").
- If the provided text includes court decisions or jurisprudence, you MAY reference the case name in the issues or synopsis to ground the scenario.
- You may ONLY reference article numbers, case names, or section numbers that appear VERBATIM in the provided text.
- If no specific article fits, describe the legal concept in general terms without citing any specific number.`
		: `Create a case about one of these two dispute types: (A) ${caseTypeA}, or (B) ${caseTypeB}. Pick whichever would make the most interesting scenario.

SPECIFICITY RULES:
- Invent a concrete fact pattern with specific names, dates, dollar amounts, and a clear triggering event.
- The synopsis must describe WHAT HAPPENED — not legal theory (BAD: "A contract dispute arose" — GOOD: "On March 3, 2024, Dubois paid $12,000 for a kitchen renovation that Lemieux abandoned after demolishing the existing cabinets.").
- The issues field must be a precise legal question, not a broad topic.
- Do NOT cite specific article numbers, statute sections, or case names.`;

	const recentExclusion = recentTitles.length
		? `\n\nIMPORTANT: The user has already generated these cases — you MUST generate something COMPLETELY DIFFERENT in topic, parties, and facts:\n${recentTitles.map((t: string) => `- ${t}`).join('\n')}`
		: '';

	const userPrompt = `${caseTypeInstruction} The user is the plaintiff.${language === 'fr' ? ' Respond entirely in French (Canadian French).' : ''}
${sourcesContext}${ragContext}${recentExclusion}

The case must be realistic and grounded in ${jurisdictionLabel} law. Use names, dates, and amounts appropriate for that jurisdiction.
Be creative and original — do NOT reuse common example names like "Smith", "Johnson" or "Tremblay". Vary the facts, amounts, dates, and legal issues each time.

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
				temperature: 0.4,
				messages: [
					{ role: 'system', content: langInstruction },
					{ role: 'user', content: userPrompt }
				],
				max_tokens: 500
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
