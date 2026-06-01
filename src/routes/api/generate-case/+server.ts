import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	loadFullSources,
	assertWithinBudget,
	SourcesOverBudgetError
} from '$lib/server/sources';
import { rateLimit } from '$lib/server/rateLimit';
import { callLLM, isNewStackEnabled } from '$lib/server/providers';

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

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	// Rate limit: 15 requests per 60 seconds per user
	const rl = rateLimit(session.user.id, 'generate_case', 15, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many requests. Please wait a moment and try again.');
	}

	if (isNewStackEnabled()) {
		if (!env.GOOGLE_API_KEY) throw error(500, 'GOOGLE_API_KEY is not configured.');
	} else if (!env.LLM_API_KEY) {
		throw error(500, 'LLM_API_KEY is not configured.');
	}

	let language = 'en';
	let pack: {
		packId?: string;
		packName?: string;
		jurisdiction?: string;
		language?: 'en' | 'fr';
		domain?: string;
		jurisdictions?: string[];
		sourceTitles?: string[];
		sourceIds?: string[];
	} | null = null;
	let recentTitles: string[] = [];
	try {
		const body = await request.json();
		language = body?.language === 'fr' ? 'fr' : 'en';
		pack = body?.pack ?? null;
		if (pack?.language === 'fr' || pack?.language === 'en') language = pack.language;
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

	// Build jurisdiction context from the selected pack
	const jurisdictions = pack?.jurisdictions?.filter(Boolean) ?? [];
	const jurisdictionLabel = pack?.jurisdiction || (jurisdictions.length ? jurisdictions.join(' / ') : 'the selected legal pack jurisdiction');
	const packContextLine = pack
		? `Selected pack: ${pack.packName ?? 'Custom Pack'} | Jurisdiction: ${jurisdictionLabel} | Domain: ${pack.domain ?? 'General'} | Language: ${language}.`
		: `No pack metadata supplied. Language: ${language}.`;
	// Full-context: load every selected source's complete text. The model picks
	// the legal crux itself from the actual statutes/jurisprudence — no chunk
	// pre-selection. If the selection blows the budget we surface a 413 so the
	// UI can prompt the user to narrow the pack.
	let sourcesContext = '';
	try {
		const selectedIds = pack?.sourceIds?.filter(Boolean) ?? [];
		if (selectedIds.length) {
			const sources = await loadFullSources({
				supabase: locals.supabase,
				userId: session.user.id,
				sourceIds: selectedIds,
				packId: pack?.packId ? String(pack.packId) : undefined
			});
			assertWithinBudget(sources, 'generate-case');
			if (sources.length) {
				const sourceBlock = sources
					.map((src) => {
						const body = src.content?.trim() || src.description || '';
						return `═══ ${src.title}${src.jurisdiction ? ` — ${src.jurisdiction}` : ''} ═══\n${body}`;
					})
					.join('\n\n');
				sourcesContext = `\n\n${packContextLine}\n\nThe user has provided the following legal sources IN FULL. Build the case scenario directly from these actual provisions:\n\n${sourceBlock}\n\nCITATION RULES (MANDATORY):\n- You may ONLY reference article numbers, section numbers, case names or provision identifiers that appear VERBATIM in the sources above.\n- NEVER extrapolate, infer, or invent identifiers — even if they seem logically sequential (e.g., if sources contain articles 3165-3168, article 3169 does NOT exist unless explicitly shown).\n- If no specific provision fits, describe the legal concept in general terms without citing a number.\n- Jurisdiction metadata guides vocabulary and setting only. It is not legal authority. Do not cite any law that is absent from the sources.`;
			}
		} else if (pack?.sourceTitles?.length) {
			// No sources hydrated (legacy pack with titles only) — give the model the titles for context.
			sourcesContext = `\n${packContextLine}\nThe user has selected these source titles:\n${pack.sourceTitles.map((t) => `- ${t}`).join('\n')}\nGenerate a case that would naturally involve these legal instruments. Do not cite specific article/section numbers unless they appear in the supplied source titles.`;
		}
	} catch (err) {
		if (err instanceof SourcesOverBudgetError) throw error(413, err.message);
		console.error('Failed to load full sources for case generation:', err);
		throw error(500, 'Could not load legal sources for case generation.');
	}

	const langInstruction = language === 'fr'
		? `Generate a realistic case scenario for a court simulation set in ${jurisdictionLabel}. Output JSON only. ALL text values MUST be in French.`
		: `Generate a realistic case scenario for a court simulation set in ${jurisdictionLabel}. Output JSON only. ALL text values MUST be in English.`;

	// If we hydrated full source content, let the AI pick the case type from that content.
	// Otherwise, fall back to a random universal case type.
	const caseTypeInstruction = sourcesContext
		? `Based on the legal provisions below, create a SPECIFIC, TIGHTLY SCOPED case scenario.

DIVERSITY MANDATE (READ BEFORE WRITING):
- Legal codes cover MANY topics. A labour code includes hiring, dismissal, wages, vacation, harassment, union certification, strike rights, occupational health, jurisdiction of tribunals, prescription delays, etc.
- A civil code includes contracts, torts, property, family, succession, prescription, prescription, mandate, lease, sale, etc.
- DO NOT default to the most common dispute type (wrongful dismissal for labour codes, contract breach for civil codes). PICK A LESS OBVIOUS angle.
- Before drafting, mentally list 5 different legal angles supported by the source text, then pick one you have NOT used recently. Vary aggressively between requests.

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

	// Inject a random creativity seed so two consecutive identical requests still
	// produce different scenarios. The model sees this as a free-form hint and
	// uses it to vary names, settings, and the legal angle picked from the sources.
	const entropy = Math.random().toString(36).slice(2, 10);
	const creativitySeed = `\n\nCREATIVITY SEED: ${entropy}. Use this seed to ensure this scenario is unique — different parties, different fact pattern, different legal angle than any case you would generate without it.`;

	const userPrompt = `${caseTypeInstruction} The user is the plaintiff.${language === 'fr' ? ' Respond entirely in French (Canadian French).' : ''}
${sourcesContext}${recentExclusion}${creativitySeed}

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
		const content = await callLLM({
			task: 'generate-case',
			systemPrompt: langInstruction,
			userPrompt,
			temperature: 0.95,
			maxTokens: 2000,
			jsonMode: true
		});

		// Robust JSON extraction — strips code fences, walks balanced braces.
		let cleaned = (content ?? '').trim();
		if (cleaned.startsWith('```')) {
			cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
		}
		const start = cleaned.indexOf('{');
		const end = cleaned.lastIndexOf('}');
		if (start === -1 || end === -1) {
			console.error('[generate-case] No JSON braces found. Raw response:', cleaned.slice(0, 500));
			throw error(500, 'Model returned no JSON. Try again.');
		}

		let parsed: { title?: string; synopsis?: string; issues?: string; remedy?: string; defendantPosition?: string };
		try {
			parsed = JSON.parse(cleaned.slice(start, end + 1));
		} catch (parseErr) {
			console.error('[generate-case] JSON.parse failed:', parseErr, '\nRaw response:', cleaned.slice(0, 1000));
			throw error(500, 'Model returned malformed JSON. Try again.');
		}

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
		console.error('[generate-case] LLM call failed:', err);
		const detail = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to generate case: ${detail}`);
	}
};
