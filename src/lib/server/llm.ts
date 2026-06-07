import { env } from '$env/dynamic/private';
import type { PackContext, StagedCase } from '$lib/types';
import type { LibraryDocument } from '$lib/data/library';
import { getJudgePersona, type JudgePersona } from '$lib/data/judge';
import { callLLM, getProvider, isNewStackEnabled, type LLMTask } from './providers';

const hasOpenAIKey = (): boolean => Boolean(env.LLM_API_KEY ?? env.OPENAI_API_KEY);

const hasConfiguredProviderKey = (task: LLMTask): boolean => {
	if (!isNewStackEnabled()) return hasOpenAIKey();
	const provider = getProvider(task);
	if (provider.name === 'gemini') {
		return Boolean(env.GOOGLE_API_KEY) || hasOpenAIKey();
	}
	return Boolean(env.ANTHROPIC_API_KEY) || hasOpenAIKey();
};

const requireLLMKeys = (task: LLMTask): void => {
	if (isNewStackEnabled()) {
		const provider = getProvider(task);
		if (provider.name === 'gemini') {
			if (!env.GOOGLE_API_KEY && !hasOpenAIKey()) {
				throw new Error('GOOGLE_API_KEY is not configured (and no OpenAI fallback key found).');
			}
		} else {
			if (!env.ANTHROPIC_API_KEY && !hasOpenAIKey()) {
				throw new Error('ANTHROPIC_API_KEY is not configured (and no OpenAI fallback key found).');
			}
		}
		return;
	}
	if (!hasOpenAIKey()) throw new Error('LLM_API_KEY or OPENAI_API_KEY is not configured.');
};

type PerformanceTurn = {
	role: string;
	speaker: string;
	message: string;
	citations?: string[];
};

type PerformanceEvaluationResponse = {
	summary: string;
	strengths?: string[];
	weaknesses?: string[];
	nextTime?: string[];
	scores: {
		persuasion: number;
		lawCited: number;
		structure: number;
		responsiveness: number;
		factFidelity: number;
	};
};

// Per-mode temperatures: bench is precise/legal and evaluation uses a lower,
// more stable temperature for scoring.
const TEMP_BENCH = 0.6;
const TEMP_EVALUATION = 0.4;

/**
 * Lightweight prior-exchange entry shared across debate / bench prompts.
 * The route handler (`/api/debate`) sanitises and trims this before passing it
 * to the LLM helpers so we can trust the shape here.
 */
export type TranscriptEntry = {
	role: string;
	speaker: string;
	message: string;
};

const renderTranscriptBlock = (transcript: TranscriptEntry[]): string => {
	if (!transcript.length) return '';
	const lines = transcript.map((entry, i) => {
		const tag = entry.role === 'litigant' ? 'LITIGANT' : entry.role.toUpperCase();
		const speaker = entry.speaker ? ` (${entry.speaker})` : '';
		return `[T${i + 1} ${tag}${speaker}]\n${entry.message.trim()}`;
	});
	return `\n\nPRIOR EXCHANGES (chronological — earliest first; the litigant turn shown last in this list happened just before the current one):\n${lines.join('\n\n')}`;
};

/**
 * Render selected sources for prompt injection.
 *
	 * Callers may supply full texts or a retrieved source packet. Either way, this
	 * block is the only authority currently in view for the model.
 *
 * Token budgets are enforced by the caller (`assertWithinBudget` from
 * `$lib/server/sources`); this helper assumes the input has already been
 * validated.
 */
const renderSourcesBlock = (sources: LibraryDocument[]): string => {
	if (!sources.length) {
		return '- No sources provided. Note this gap candidly when answering.';
	}
	return sources
		.map((source) => {
			const body = source.content?.trim() || source.description?.trim() || '(no body text)';
			const header = `═══ ${source.title}${source.jurisdiction ? ` — ${source.jurisdiction}` : ''} ═══`;
			return `${header}\n${body}`;
		})
		.join('\n\n');
};

const renderPackContextBlock = (args: {
	packContext?: PackContext;
	sources: LibraryDocument[];
	language: string;
}): string => {
	const { packContext, sources, language } = args;
	const sourceJurisdictions = [...new Set(sources.map((s) => s.jurisdiction).filter(Boolean))];
	const jurisdiction = packContext?.jurisdiction?.trim() || sourceJurisdictions.join(' / ') || 'Not specified';
	const packLanguage = packContext?.language === 'fr'
		? 'French'
		: packContext?.language === 'en'
			? 'English'
			: language === 'fr'
				? 'French'
				: 'English';

	return `LEGAL PACK CONTEXT (AUTHORITATIVE ROUTING DATA)
Pack: ${packContext?.name?.trim() || 'Selected legal pack'}
Jurisdiction: ${jurisdiction}
Domain: ${packContext?.domain?.trim() || 'General'}
Pack language: ${packLanguage}

PACK RULES (CRITICAL):
- Jurisdiction, domain, and language tell you the intended courtroom context and vocabulary.
- They are NOT legal authority. The only legal authorities are the texts inside the SOURCES block below.
- Do NOT cite statutes, articles, cases, principles, tests, or doctrines from training memory just because they belong to this jurisdiction.
- If the SOURCES block does not contain enough authority for a point, say the selected pack is silent or incomplete on that point.
- Every concrete legal citation must be traceable to exact text in the SOURCES block.`;
};

const renderJudgeBriefBlock = (stagedCase: StagedCase, language: string): string => {
	const brief = stagedCase.judgeBrief;
	const notSpecified = language === 'fr' ? 'Non precise' : 'Not specified';
	const list = (items?: string[]) =>
		items?.length ? items.map((item) => `- ${item}`).join('\n') : `- ${notSpecified}`;

	if (!brief) {
		return `JUDGE EXERCISE BRIEF
- No explicit judge brief supplied.
- Use the teaching objective, target skill, issues, remedy, and allowed sources as the pedagogical contract.
- Do NOT invent a new training goal beyond those case fields.`;
	}

	return `JUDGE EXERCISE BRIEF (PEDAGOGICAL CONTRACT)
Goal: ${brief.goal || notSpecified}
Student task: ${brief.studentTask || notSpecified}
Hearing focus: ${brief.hearingFocus || notSpecified}
Primary skill: ${brief.primarySkill || stagedCase.targetSkill || notSpecified}
Issues to probe:
${list(brief.issuesToProbe)}
Pressure points:
${list(brief.pressurePoints)}
Source boundaries:
${list(brief.sourceBoundaries)}
Success criteria:
${list(brief.successCriteria)}`;
};

const renderGroundingAuditBlock = (stagedCase: StagedCase, language: string): string => {
	const audit = stagedCase.groundingAudit;
	const notSpecified = language === 'fr' ? 'Non precise' : 'Not specified';
	const list = (items?: string[]) =>
		items?.length ? items.map((item) => `- ${item}`).join('\n') : `- ${notSpecified}`;

	if (!audit) {
		return `CREATE GROUNDING AUDIT
- No Create audit supplied.
- Apply the selected sources and judge brief conservatively.
- Do not add legal requirements, citations, or doctrines beyond the SOURCES block.`;
	}

	const groundingMap = audit.groundingMap?.length
		? audit.groundingMap
			.map((item) => {
				const citation = item.citation ? ` (${item.citation})` : '';
				const excerpt = item.excerpt ? ` | excerpt: "${item.excerpt}"` : '';
				const note = item.note ? ` | note: ${item.note}` : '';
				return `- [${item.status}] ${item.area}: ${item.claim} — ${item.sourceTitle}${citation}${excerpt}${note}`;
			})
			.join('\n')
		: `- ${notSpecified}`;

	return `CREATE GROUNDING AUDIT (SOURCE CONTRACT)
Status: ${audit.status}
Summary: ${audit.summary || notSpecified}
Blocked reasons:
${list(audit.blockedReasons)}
Warnings:
${list(audit.warnings)}
Grounding map:
${groundingMap}

JUDGE AUDIT RULES:
- Treat grounded map items as the intended legal and pedagogical boundaries of the exercise.
- If a map item is needs-review or unsupported, ask the litigant to anchor it in the sources instead of assuming it is correct.
- Do not pressure the litigant on legal theories outside this audit, the judge brief, and the SOURCES block.
- If the litigant asks for or relies on an unsupported point, say the selected sources do not establish it.`;
};

const renderExercisePaperBlock = (stagedCase: StagedCase, language: string): string => {
	const paper = stagedCase.paperSnapshot;
	const notSpecified = language === 'fr' ? 'Non precise' : 'Not specified';
	if (!paper) {
		return `EXERCISE PAPER SNAPSHOT
- No saved paper snapshot supplied.
- Use the case fields, judge brief, and grounding audit as the full contract.`;
	}

	const list = (items?: string[]) =>
		items?.length ? items.map((item) => `- ${item}`).join('\n') : `- ${notSpecified}`;
	const packMemoryBlock = paper.packMemory
		? `\n\nPACK MEMORY (navigation map, not authority)
Summary: ${paper.packMemory.summary || notSpecified}
Topics:
${paper.packMemory.topics.slice(0, 12).map((topic) => `- ${topic.topic}: authorities=[${topic.authorityIds.join(', ')}]; related=[${topic.relatedTerms.join(', ')}]`).join('\n') || `- ${notSpecified}`}
Authorities:
${paper.packMemory.authorities.slice(0, 24).map((authority) => `- ${authority.authorityId}: ${authority.sourceTitle}${authority.citation ? `, ${authority.citation}` : ''}; role=${authority.role}; topic=${authority.topic}; notes=${authority.retrievalNotes}`).join('\n') || `- ${notSpecified}`}
Gaps:
${list(paper.packMemory.gaps)}
Rules:
${list(paper.packMemory.safetyRules)}`
		: '';
	const sufficiencyBlock = paper.evidenceSufficiency
		? `\n\nEVIDENCE SUFFICIENCY CHECK
canProceed: ${paper.evidenceSufficiency.canProceed}
coverage: ${paper.evidenceSufficiency.coverage}
missingConcepts: ${paper.evidenceSufficiency.missingConcepts.join('; ') || notSpecified}
reason: ${paper.evidenceSufficiency.reason}`
		: '';

	return `EXERCISE PAPER SNAPSHOT (AUTHORITATIVE PRE-HEARING FILE)
Title: ${paper.title || stagedCase.title || notSpecified}
Objective: ${paper.objective || stagedCase.objective || notSpecified}
Primary skill: ${paper.targetSkill || stagedCase.targetSkill || notSpecified}
Selected side: ${paper.selectedRole || stagedCase.role || notSpecified}
Recommended side: ${paper.recommendedRole || notSpecified}
Main issue: ${paper.issues || stagedCase.issues || notSpecified}
Plaintiff position: ${paper.plaintiffPosition || notSpecified}
Defendant position: ${paper.defendantPosition || notSpecified}
Practice points:
${list(paper.practicePoints)}${packMemoryBlock}${sufficiencyBlock}`;
};

const dispatchToProvider = async (
	systemPrompt: string,
	userPrompt: string,
	schema: Record<string, unknown>,
	temp: number = TEMP_BENCH,
	task: LLMTask = 'bench'
) => {
	if (isNewStackEnabled()) {
		return callLLM({
			task,
			systemPrompt,
			userPrompt,
			temperature: temp,
			schema,
			jsonMode: true,
			maxTokens: task === 'coaching' ? 2000 : task === 'generate-case' ? 3000 : 2500
		});
	}

	const provider = (env.LLM_PROVIDER ?? 'openai').toLowerCase();

	switch (provider) {
		case 'anthropic':
			return callAnthropic(systemPrompt, userPrompt, temp);
		case 'azure-openai':
			return callAzureOpenAI(systemPrompt, userPrompt, schema, temp);
		default:
			return callOpenAI(systemPrompt, userPrompt, schema, temp);
	}
};

const callOpenAI = async (
	systemPrompt: string,
	userPrompt: string,
	schema: Record<string, unknown>,
	temp: number
) => {
	const model = env.OPENAI_MODEL ?? 'gpt-4o-mini';
	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.LLM_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			temperature: temp,
			response_format: { type: 'json_schema', json_schema: { name: 'verdict_debate', schema } },
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 900
		})
	});

	if (!response.ok) {
		const errorPayload = await response.text();
		throw new Error(`OpenAI request failed: ${errorPayload}`);
	}

	const data = await response.json();
	const content = data.choices?.[0]?.message?.content;
	return Array.isArray(content) ? content.map((chunk: any) => chunk.text ?? '').join('\n') : content ?? '';
};

const callAzureOpenAI = async (
	systemPrompt: string,
	userPrompt: string,
	schema: Record<string, unknown>,
	temp: number
) => {
	const endpoint = env.AZURE_OPENAI_ENDPOINT;
	const deployment = env.AZURE_OPENAI_DEPLOYMENT;
	const apiVersion = env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview';

	if (!endpoint || !deployment) {
		throw new Error('AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT are required for Azure OpenAI.');
	}

	const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'api-key': env.LLM_API_KEY,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			temperature: temp,
			response_format: { type: 'json_schema', json_schema: { name: 'verdict_debate', schema } },
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 900
		})
	});

	if (!response.ok) {
		const errorPayload = await response.text();
		throw new Error(`Azure OpenAI request failed: ${errorPayload}`);
	}

	const data = await response.json();
	const content = data.choices?.[0]?.message?.content;
	return Array.isArray(content) ? content.map((chunk: any) => chunk.text ?? '').join('\n') : content ?? '';
};

const callAnthropic = async (systemPrompt: string, userPrompt: string, temp: number) => {
	const model = env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';
	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': env.LLM_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model,
			temperature: temp,
			max_tokens: 900,
			system: systemPrompt,
			messages: [{ role: 'user', content: userPrompt }]
		})
	});

	if (!response.ok) {
		const errorPayload = await response.text();
		throw new Error(`Anthropic request failed: ${errorPayload}`);
	}

	const data = await response.json();
	const block = data.content?.[0];
	if (block?.type === 'text') {
		return block.text;
	}

	return (block?.text as string) ?? '';
};

type ToneSignal = {
	observations: string;
	guidance: string;
};

const hostileLexicon = ['idiot', 'stupid', 'corrupt', 'fraud', 'nonsense', 'trash', 'garbage', 'wtf', 'bs', 'hate', 'incompetent', 'joke', 'pathetic'];
const decorumLexicon = ['shut up', 'shut-up', 'liar', 'fool', 'moron', 'screw you', 'go to hell'];
const gratitudeLexicon = ['thank you', 'thanks', 'appreciate', 'helpful', 'good point', 'fair enough'];
const urgencyLexicon = ['immediately', 'right now', 'urgent', 'asap', 'emergency', 'time-sensitive'];
const uncertaintyLexicon = ['i think', 'maybe', 'possibly', 'not sure', 'might be', 'i guess', 'perhaps'];
const confidenceLexicon = ['clearly', 'obviously', 'without doubt', 'undeniably', 'certainly', 'absolutely'];
const sarcasticLexicon = ['sure, whatever', 'oh really', 'yeah right', 'as if', 'good luck with that'];

const deriveToneSignal = (text: string): ToneSignal => {
	const trimmed = text.trim();
	if (!trimmed) {
		return {
			observations: 'Empty submission. Either they hit send too early or they\'re testing the waters.',
			guidance: 'Light, inviting opener: "I\'m going to need a bit more to work with here. What\'s on your mind?"'
		};
	}

	const lower = trimmed.toLowerCase();
	const wordCount = trimmed.split(/\s+/).length;
	const lettersOnly = trimmed.replace(/[^A-Za-z]/g, '');
	const uppercaseLetters = trimmed.replace(/[^A-Z]/g, '');
	const uppercaseRatio = lettersOnly.length ? uppercaseLetters.length / lettersOnly.length : 0;
	const exclamationCount = (trimmed.match(/!/g) ?? []).length;
	const questionCount = (trimmed.match(/\?/g) ?? []).length;

	const observations: string[] = [];
	const guidance: string[] = [];

	const hostilityDetected = hostileLexicon.some((word) => lower.includes(word));
	const decorumDetected = decorumLexicon.some((word) => lower.includes(word));
	const gratitudeDetected = gratitudeLexicon.some((word) => lower.includes(word));
	const urgencyDetected = urgencyLexicon.some((word) => lower.includes(word));
	const uncertaintyDetected = uncertaintyLexicon.some((word) => lower.includes(word));
	const overconfidenceDetected = confidenceLexicon.filter((word) => lower.includes(word)).length >= 2;
	const sarcasticDetected = sarcasticLexicon.some((word) => lower.includes(word));

	// Hostility / decorum breaks
	if (decorumDetected) {
		observations.push('They\'ve crossed into personal attacks. This is a courtroom, not a bar fight.');
		guidance.push('Firm reset: "I\'ll pretend I didn\'t read that. Let\'s try again with the substance."');
	} else if (hostilityDetected) {
		observations.push('Frustration is bleeding through the language. They\'re emotional, not just passionate.');
		guidance.push('Empathy with a redirect: "I can tell this matters to you. Channel that into the argument."');
	}

	// Shouting / emphasis
	if (uppercaseRatio > 0.35) {
		observations.push('ALL CAPS mode. They\'re either shouting or their caps lock is stuck.');
		guidance.push('Gentle deflation: "I can hear you fine without the caps. What\'s the actual point?"');
	} else if (exclamationCount > 3) {
		observations.push('Exclamation overload. They\'re emphasizing everything, which emphasizes nothing.');
		guidance.push('Calm counterweight. Let your restraint highlight their excess.');
	}

	// Sarcasm incoming
	if (sarcasticDetected) {
		observations.push('Sarcasm detected. They\'re frustrated but still engaging.');
		guidance.push('Match the energy with wit, not hostility. A well-placed quip earns more respect than a lecture.');
	}

	// Overconfidence
	if (overconfidenceDetected) {
		observations.push('They\'re awfully certain. "Clearly" and "obviously" are doing a lot of heavy lifting.');
		guidance.push('Time for Socratic deflation. Ask the question that exposes the assumption behind the certainty.');
	}

	// Uncertainty / hedging
	if (uncertaintyDetected && !overconfidenceDetected) {
		observations.push('Lots of hedging language. They\'re not sure of their own position.');
		guidance.push('Don\'t pounce on weakness\u2014guide them. "It sounds like you\'re working through this. Let me help clarify..."');
	}

	// Questions galore
	if (questionCount > 2) {
		observations.push('Question-heavy submission. They\'re seeking guidance more than arguing.');
		guidance.push('Teacher mode: answer directly, then pivot to what they should have argued.');
	}

	// Short and terse
	if (wordCount < 20 && !uncertaintyDetected) {
		observations.push('Terse submission. Either confident brevity or they haven\'t done the work.');
		guidance.push('Probe deeper: "That\'s a start. Walk me through the reasoning."');
	}

	// Long and rambling
	if (wordCount > 200) {
		observations.push('Wall of text incoming. Somewhere in there might be a point.');
		guidance.push('Extract the core: "Let me boil this down to what I think you\'re saying..."');
	}

	// Urgency
	if (urgencyDetected) {
		observations.push('They\'re treating this like an emergency. Procedural anxiety is real.');
		guidance.push('Acknowledge the stakes, then slow it down: "I get the urgency, but rushing leads to mistakes."');
	}

	// Gratitude / collaboration
	if (gratitudeDetected && !hostilityDetected) {
		observations.push('Courteous, collaborative tone. They\'re here to learn, not to fight.');
		guidance.push('Warm but rigorous. Challenge them like a mentor, not an adversary.');
	}

	// Default: professional
	if (observations.length === 0) {
		observations.push('Measured, professional submission. No red flags, no softballs.');
		guidance.push('Bring your A-game. They deserve a substantive challenge.');
	}

	return {
		observations: observations.join(' '),
		guidance: guidance.join(' ')
	};
};

const extractJson = (text: string) => {
	// Strip code fences (```json ... ``` or ``` ... ```)
	let cleaned = text.trim();
	if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
	}

	// Find the first balanced JSON object. We walk the string tracking braces
	// so we don't get confused by `}` characters inside string values.
	const start = cleaned.indexOf('{');
	if (start === -1) {
		throw new Error('No JSON object detected in LLM response.');
	}

	let depth = 0;
	let inString = false;
	let escape = false;
	for (let i = start; i < cleaned.length; i++) {
		const ch = cleaned[i];
		if (escape) { escape = false; continue; }
		if (ch === '\\' && inString) { escape = true; continue; }
		if (ch === '"') { inString = !inString; continue; }
		if (inString) continue;
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return cleaned.slice(start, i + 1);
		}
	}

	// Fallback to greedy slice if we never closed cleanly.
	const end = cleaned.lastIndexOf('}');
	if (end === -1) throw new Error('No JSON object detected in LLM response.');
	return cleaned.slice(start, end + 1);
};

const clamp = (value: number, min: number, max: number) => {
	if (Number.isNaN(value)) return min;
	return Math.min(Math.max(value, min), max);
};

// ============================================================
// BENCH TRIAL MODE (Judge Only)
// ============================================================

type BenchTrialResponse = {
	reply: {
		message: string;
		citations?: string[];
	};
	judgeMind: {
		assessment: string;
		concerns: string;
		leaning: string;
	};
};

export const generateBenchTrialAnalysis = async (args: {
	prompt: string;
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	packContext?: PackContext;
	transcript?: TranscriptEntry[];
	language?: string;
}): Promise<{
	reply: { message: string; citations: string[] };
	judgeMind: { assessment: string; concerns: string; leaning: string };
}> => {
	const { prompt, stagedCase, sources, packContext, transcript = [], language = 'en' } = args;

	requireLLMKeys('bench');

	const systemPrompt = buildBenchSystemPrompt(language);
	const userPrompt = buildBenchUserPrompt({ prompt, stagedCase, sources, packContext, transcript, language });
	const schema = buildBenchJsonSchema();
	const raw = await dispatchToProvider(systemPrompt, userPrompt, schema, TEMP_BENCH, 'bench');
	const parsed = parseBenchResponse(raw, language);

	const fb = benchFallbacks(language);
	const reply = {
		message: parsed.reply?.message?.trim() || fb.noResponse,
		citations: (parsed.reply?.citations ?? []).filter(Boolean)
	};

	return {
		reply,
		judgeMind: {
			assessment: parsed.judgeMind?.assessment?.trim() || fb.assessment,
			concerns: parsed.judgeMind?.concerns?.trim() || fb.concerns,
			leaning: parsed.judgeMind?.leaning?.trim() || fb.leaning
		}
	};
};

const benchFallbacks = (language: string) => language === 'fr'
	? {
		noResponse: 'Aucune réponse générée.',
		assessment: 'Nous en sommes encore à la phase préliminaire.',
		concerns: 'Les faits et les autorités juridiques doivent être précisés.',
		leaning: 'Indécis.',
		parseError: 'Réponse impossible à analyser.',
		parseConcerns: 'Aucune sortie structurée renvoyée.'
	}
	: {
		noResponse: 'No response generated.',
		assessment: 'We are still at the intake stage.',
		concerns: 'Need clearer facts and legal authority.',
		leaning: 'Undecided.',
		parseError: 'Unable to parse response.',
		parseConcerns: 'No structured output returned.'
	};

const buildBenchSystemPrompt = (language: string = 'en') => {
	const judgePersona = getJudgePersona(language);
	const langLabel = language === 'fr' ? 'French (Canadian French / Français québécois)' : 'English';
	const langStrict = language === 'fr'
		? `RÈGLE LINGUISTIQUE ABSOLUE — VOUS DEVEZ RÉPONDRE EXCLUSIVEMENT EN FRANÇAIS (français canadien). Tout — reply.message, judgeMind.assessment, judgeMind.concerns, judgeMind.leaning — doit être en français. La langue de l'audience est verrouillée par le dossier : même si le plaideur change de langue, vous ne changez pas. N'utilisez AUCUN mot anglais sauf les noms propres et les termes juridiques latins.`
		: `ABSOLUTE LANGUAGE RULE — YOU MUST RESPOND EXCLUSIVELY IN ENGLISH. All output — reply.message and judgeMind fields — must be in English. The hearing language is locked by the case: do not switch languages just because the litigant does.`;
	return `${langStrict}

You are simulating a rigorous judge-led legal reasoning exercise.

LANGUAGE INSTRUCTION: You MUST respond entirely in ${langLabel}. All text in reply.message and judgeMind fields must be in ${langLabel}.

CORE POSTURE:
- You are the judge.
- You care about law, precision, source discipline, and reasoning quality.
- Emotional rhetoric is secondary to authority and analysis.

EVALUATION TARGET (CRITICAL):
- You evaluate ONLY the LITIGANT (the human user) — their legal reasoning, their use of authority, their argument structure.
- The judgeMind assessment, concerns, and leaning are all about how well the LITIGANT is performing.
- Your questions and comments should push the LITIGANT to improve their argument.

STIPULATED FACTS (CRITICAL):
- The synopsis ("What Happened") contains AGREED FACTS. Both sides accept them as true.
- You MUST NEVER contradict, dispute, rewrite, or cast doubt on these facts.
- Press the litigant on their LEGAL REASONING — whether the law supports their position given these facts.
- Say things like "Even accepting these facts..." or "The facts don't support your conclusion because..." — NEVER "That's not what happened."

OPENING MOVE (FIRST ROUND ONLY):
- If this is the first exchange, keep it SHORT.
- State the court's initial concern in 1-2 sentences and ask the litigant to present their argument.
- Do NOT recap the facts. Get straight to what the court needs to hear.

CASE AWARENESS (CRITICAL):
- You have FULL knowledge of the case: title, synopsis, legal issues, remedy sought, and the litigant's chosen side.
- Your questions and evaluations MUST reference the specific case facts. Do not ask generic questions.
- If the litigant claims certain issues, press them on whether their arguments actually address those issues.
- If the remedy sought seems disproportionate or unsupported, say so directly.
- Track what the litigant has argued so far. Don't re-ask questions they've already answered. Advance the proceeding.
- Evaluate whether the litigant is effectively using their selected legal pack sources.

PEDAGOGICAL CONTRACT (CRITICAL):
- If a JUDGE EXERCISE BRIEF is provided in the user prompt, it controls the teaching goal of the hearing.
- Do NOT redefine the lesson mid-hearing. Test the listed skill, probe the listed issues, and respect the listed source boundaries.
- If the brief says the sources are silent or limited on a point, keep that silence explicit instead of filling the gap.
- Treat the brief as the teacher's honest intent translated into a source-grounded exercise.

YOU ARE: ${judgePersona.name.toUpperCase()}
${judgePersona.style}
${judgePersona.description}

SOURCE DISCIPLINE (CRITICAL):
- The litigant has selected a legal pack. The sources listed in the case are the ONLY authorities.
- You MUST evaluate the litigant's arguments against these provided sources.
- If the litigant fails to reference their own sources, point this out.
- Do NOT reference any external legal knowledge, articles, cases, or principles that are not present in the provided sources.
- Jurisdiction/language metadata tells you the intended courtroom context. It does NOT authorize you to cite law from memory.
- If the selected pack is silent on a legal point, say so candidly instead of filling the gap.
- If PACK MEMORY appears in the exercise snapshot, treat it only as a navigation map from a prior source read. It can tell you which authorities or gaps may matter, but it is NOT authority.
- If EVIDENCE SUFFICIENCY CHECK says canProceed=false or identifies missingConcepts, do not make a final legal conclusion on those missing points. Ask the litigant to anchor the point in the selected sources or say the current source packet is incomplete.
- Final citations must still come from exact source text in the SOURCES block, not from Pack Memory summaries.
- Treat this turn as a classroom activity capsule, not a full legal research memo. Stay within the case facts, judge brief, source packet, and recent transcript.
- If the litigant asks for law outside the packet, say the activity does not contain enough source material for that point and ask them to return to the assigned issue.

EVIDENCE FRAME (CRITICAL — this is a MOOT BENCH TRIAL, not live litigation):
- This is a rhetorical-reasoning exercise. The litigant argues from the case file, the provided sources, and legal reasoning. There is NO mechanism for physical production of exhibits, emails, contracts, or witness testimony at the bench.
- NEVER demand the litigant "provide", "produce", "submit", "send", "show the court", "upload", or "authenticate" a physical document, email, exhibit, or testimony. That breaks the exercise.
- DO press on evidence, burden of proof, and evidentiary foundation — but as ANALYTICAL QUESTIONS, not production orders.
- Examples of the RIGHT way a judge presses on evidence in this format:
  • "Counsel, what evidentiary standard applies, and does your argument meet it?"
  • "Whose burden is this, and how would you discharge it on these facts?"
  • "The case file is silent on that point. What inference are you asking the court to draw, and on what basis?"
  • "If opposing counsel challenged the foundation of that document, what's your response?"
  • "You rely on the contract clause. The synopsis doesn't quote it — how do you ask the court to construe it?"
- Acceptable "proof" in this format: facts from the case file/synopsis, cited jurisprudence or statutes from the provided sources, quoted clauses, legal principles, and reasoned inference. Treat these as valid. Reserve evidentiary challenges for reasoning gaps, not missing paperwork.

JURISPRUDENCE HANDLING:
- The provided sources may contain BOTH statutory text (codes, statutes) AND jurisprudence (court decisions, case law).
- STATUTORY sources: cite by article/section number (e.g., "art. 1457 C.c.Q.", "s. 267(1)(a) Criminal Code").
- JURISPRUDENCE sources: cite by case name and paragraph number if available (e.g., "Ciment du Saint-Laurent v. Barrette, 2008 SCC 64, par. 25"). Reference the court's reasoning — not just the name.
- If the litigant has jurisprudence in their sources but fails to cite it, point this out — case law is powerful authority.
- You may ONLY cite case names and paragraph numbers that appear VERBATIM in the provided sources.

ANTI-HALLUCINATION RULES (MANDATORY — ZERO TOLERANCE):
- You may ONLY cite article numbers, section numbers, or provision identifiers that appear VERBATIM in the provided sources.
- VERBATIM-QUOTE RULE: Before citing an article/section number, you MUST quote a short fragment (5–20 words) of that article's actual text from the sources, in quotation marks, immediately next to the citation. If you cannot find the article's text in the sources, do NOT cite the number — describe the principle in general terms instead.
- NEVER extrapolate or invent article/section numbers — even if they seem logically sequential (e.g., if sources contain articles 3165-3168, article 3169 does NOT exist unless explicitly shown).
- NEVER fabricate case names, jurisprudence, or court decisions. If a court decision is NOT in the provided sources, do NOT cite it by name — argue from statutory text or general legal principles instead.
- NEVER cite an article for a proposition it does not actually contain. If you remember an article from training data, IGNORE that memory — only what is in the sources counts.
- If you are unsure whether a specific provision or case exists in the sources, state the general legal principle WITHOUT a specific citation.
- Violating these rules is a judicial error. When in doubt, be general rather than specific.

JUDGE PERSONALITY:
- Pragmatic and efficient. Wastes no words.
- Asks probing questions that expose weak reasoning.
- Expects legal authority for significant propositions — but does not demand a citation for every sentence. A real judge picks their moments.
- Respectful but firm. Will cut you off if you ramble.
- Has zero patience for emotional manipulation or theatrics.
- Values: Clarity, precision, preparation, intellectual honesty.
- Keep reply.message concise: usually 2-5 sentences. Do not lecture through the whole source packet unless the litigant specifically needs a narrow correction.

INTEGRATED QUESTIONING (CRITICAL — no interruptions, just a focused ruling):
- Do NOT issue separate "interjections" or theatrical interruptions. The judge speaks ONCE per turn, in a single ruling.
- When the litigant lacks authority, is off-topic, repeats themselves, leaves a logical gap, or relies on rhetoric, the judge addresses it DIRECTLY INSIDE reply.message — by asking a pointed question or stating the deficiency calmly.
- The tone is pragmatic and posed, not dramatic. A real bench judge does not bark "AUTHORITY!" — they say "Counsel, on what authority do you rest that proposition?" inside their reasoning.
- Examples of integrated questioning (do this style):
  • "Even accepting your premise, you have not identified the statutory provision that grounds the duty. To which article do you refer?"
  • "That is the third time you have framed the point that way. Move the analysis forward — what is your response on damages?"
  • "Your argument leaps from breach to remedy without addressing causation. Walk the court through the missing link."
  • "I am not following the relevance. Connect this to the issue of solidary liability."
- DO NOT prefix anything with [AUTHORITY], [RELEVANCE], [PROCEDURE], [DECORUM], [CLARIFICATION] — those tags are forbidden.
- DO NOT produce a separate judgeInterjection field — only reply.message and judgeMind.

JUDGE TRIGGERS — situations that warrant a pointed in-ruling question (handle them inside reply.message, not as separate interjections):
${judgePersona.interjectionTriggers.map((t) => `- ${t}`).join('\n')}

Judge questions are SHORT and pointed and usually end with a question — but they live INSIDE the ruling, not as interruptions:
- "Counsel, on what authority?"
- "What's your authority for that proposition?"
- "Move on. You've made that point."
- "Mind your language — this is a court of law."
- "Name the statute or case you're relying on."

---
JUDGE SCORING:
The judge focuses on LEGAL MERIT, not persuasion:

| 0-15%   | No legal argument present. Gibberish, insults, or completely off-topic. |
| 16-30%  | Attempts legal language but fundamentally misunderstands or misapplies the law. |
| 31-50%  | Basic legal argument but major gaps in reasoning, evidence, or authority. |
| 51-70%  | Competent argument with proper structure. Some weaknesses in depth or citation. |
| 71-85%  | Strong legal reasoning, well-cited, addresses counterarguments. Minor issues only. |
| 86-100% | Exceptional. Precise law, airtight logic, anticipates objections, persuasive delivery. |

METRICS:
- legalReasoning: How sound is the legal logic? Does the argument follow from the cited law?
- evidence: Are facts supported? Are authorities relevant and correctly applied?
- procedure: Does counsel follow proper form? Professional demeanor?

OUTPUT: JSON only with keys: reply {message, citations[]}, judgeMind {assessment, concerns, leaning}

JUDGE MIND CONTRACT:
- judgeMind.assessment: 1-2 short sentences on how the litigant is currently doing.
- judgeMind.concerns: 1-2 short sentences naming the main weakness or unanswered issue.
- judgeMind.leaning: 1 short sentence on the court's current direction; if undecided, say so and identify what would move the court.
- Keep all judgeMind fields concise, concrete, and useful. No bullet lists.

FINAL LANGUAGE REMINDER: ${langStrict}`;
};

const buildBenchUserPrompt = (args: {
	prompt: string;
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	packContext?: PackContext;
	transcript?: TranscriptEntry[];
	language?: string;
}) => {
	const { prompt, stagedCase, sources, packContext, transcript = [], language = 'en' } = args;
	const sourceLines = renderSourcesBlock(sources);
	const packContextBlock = renderPackContextBlock({ packContext, sources, language });
	const judgeBriefBlock = renderJudgeBriefBlock(stagedCase, language);
	const groundingAuditBlock = renderGroundingAuditBlock(stagedCase, language);
	const transcriptBlock = renderTranscriptBlock(transcript);
	const toneSignal = deriveToneSignal(prompt);
	const objective = stagedCase.objective?.trim() || (language === 'fr' ? 'Raisonnement juridique general' : 'General legal reasoning');
	const targetSkill = stagedCase.targetSkill?.trim() || (language === 'fr' ? 'Raisonnement juridique general' : 'General legal reasoning');
	const practicePoints = stagedCase.practicePoints?.length
		? stagedCase.practicePoints.join('; ')
		: (language === 'fr' ? 'Non precise' : 'Not specified');

	return `JUDGE-LED LEGAL REASONING SESSION: ${stagedCase.title}
Court Type: Judge-led review
Litigant argues: ${stagedCase.role.toUpperCase()}
Litigant's position: The litigant is the ${stagedCase.role.toUpperCase()} and must prove their case from that side.
Teaching Objective: ${objective}
Primary Skill Focus: ${targetSkill}
Practice Points: ${practicePoints}

${judgeBriefBlock}

${groundingAuditBlock}

Stipulated Facts (agreed — do not dispute): ${stagedCase.synopsis}
Core Issues: ${stagedCase.issues || 'Unspecified'}
Remedy Sought: ${stagedCase.remedy || 'Unspecified'}

${packContextBlock}

Available Authorities (retrieved from the selected legal pack for this turn):\n${sourceLines}

Tone Analysis: ${toneSignal.observations}
Suggested Approach: ${toneSignal.guidance}
${transcriptBlock}

---
LITIGANT'S SUBMISSION:
"""${prompt}"""
---

Generate:
1. Judge response — engage directly with what the litigant said. The facts in the synopsis are stipulated — do not dispute them. Challenge the litigant's LEGAL REASONING and whether the law supports their position. Prioritize testing the stated skill focus (${targetSkill}) while asking pointed questions that force the litigant to strengthen their ${stagedCase.role} position.
2. Judge mind snapshot (evaluate ONLY the litigant's performance) with:
	- assessment: how well is the litigant arguing their ${stagedCase.role} case so far, especially on ${targetSkill}? Reference specific points they made.
	- concerns: what's missing, weak, or unsupported in the litigant's argument, especially on ${targetSkill}?
	- leaning: based on the litigant's performance, possible direction (e.g., "leaning plaintiff", "leaning defendant", "undecided")

Remember:
- If a JUDGE EXERCISE BRIEF is provided above, treat it as the controlling teaching contract for this hearing.
- If a CREATE GROUNDING AUDIT is provided above, treat it as the source contract for what the exercise can safely test.
- This exercise is designed to train ${targetSkill}. Make that skill the center of your questioning while still checking source use, structure, and authority.
- The judge prioritizes law, precision, and reasoning quality over rhetoric.
- The SOURCES block may be a retrieved packet rather than the whole legal pack. Treat the packet as the only authority currently in view and do not assume unseen provisions help either side.
- This is a low-cost classroom Judge turn. Use the existing activity capsule; do not perform broad legal research in the response.
- Ask for authority when it isn't provided.
- Evaluate the litigant's use of the provided legal pack sources — if they have sources but aren't citing them, point that out.
- Press the litigant on whether their arguments actually address the issues and remedy they specified.
- Use the listed pressure points and source boundaries if they are provided. Do not invent new doctrinal terrain outside them.
- Treat pack jurisdiction/language as context only. They do not permit external citations.
- ONLY cite article/section numbers that appear VERBATIM in the sources. NEVER extrapolate sequential numbers.
- If the sources contain jurisprudence (court decisions), cite them by case name and paragraph. NEVER invent case names not in the sources.`;
};

const buildBenchJsonSchema = () => ({
	type: 'object',
	required: ['reply', 'judgeMind'],
	properties: {
		reply: {
			type: 'object',
			required: ['message'],
			properties: {
				message: { type: 'string' },
				citations: { type: 'array', items: { type: 'string' } }
			}
		},
		judgeMind: {
			type: 'object',
			required: ['assessment', 'concerns', 'leaning'],
			properties: {
				assessment: { type: 'string' },
				concerns: { type: 'string' },
				leaning: { type: 'string' }
			}
		}
	}
});

const parseBenchResponse = (raw: string, language: string = 'en'): BenchTrialResponse => {
	try {
		return JSON.parse(extractJson(raw));
	} catch (err) {
		console.error('Failed to parse Bench Trial JSON', err, raw);
		const fb = benchFallbacks(language);
		return {
			reply: { message: raw },
			judgeMind: {
				assessment: fb.parseError,
				concerns: fb.parseConcerns,
				leaning: fb.leaning
			}
		};
	}
};

export const generatePerformanceEvaluation = async (args: {
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	packContext?: PackContext;
	transcript: PerformanceTurn[];
	language?: string;
}): Promise<PerformanceEvaluationResponse> => {
	const { stagedCase, sources, packContext, transcript, language = 'en' } = args;

	const hasKeys = hasConfiguredProviderKey('coaching');
	if (!hasKeys) {
		return {
			summary: language === 'fr'
				? 'Évaluation indisponible pour le moment. Résumé local appliqué.'
				: 'Evaluation is currently unavailable. Local fallback summary applied.',
			scores: { persuasion: 60, lawCited: 60, structure: 60, responsiveness: 60, factFidelity: 60 }
		};
	}

	const systemPrompt = `You are a legal performance evaluator for an advocacy simulation.

LANGUAGE INSTRUCTION: Respond entirely in ${language === 'fr' ? 'French (Canadian French)' : 'English'}.

IMPORTANT: You are evaluating ONLY the LITIGANT (the human user). Ignore the AI judge's performance entirely. The transcript contains both sides — focus exclusively on turns marked with role "litigant".
If the case includes a primary skill focus, make it central to the assessment, the weaknesses you identify, and the next-step advice.
Treat the case file as a pedagogical contract. Score the litigant against the assigned side, teaching objective, judge goal, student task, hearing focus, practice points, source boundaries, and success criteria.
If the litigant sounds polished but avoids the assigned task, misses the core issue, or ignores the success criteria, score accordingly.

You must return JSON only with keys:
{
  "summary": "string (max 60 words — overall takeaway)",
  "strengths": ["2 to 3 short bullets — what the litigant did well, concrete"],
  "weaknesses": ["2 to 3 short bullets — what was missing or weak, concrete"],
  "nextTime": ["1 to 2 short bullets — specific advice for next case, actionable"],
  "scores": {
    "persuasion": number 0-100,
    "lawCited": number 0-100,
    "structure": number 0-100,
    "responsiveness": number 0-100,
    "factFidelity": number 0-100
  }
}

BULLET RULES:
- Each bullet: max 20 words, no fluff, point to a SPECIFIC moment or argument from the transcript when possible.
- strengths/weaknesses describe what HAPPENED. nextTime tells what to DO differently.
- Never write generic platitudes ("be more persuasive"). Always concrete.

SCORING PHILOSOPHY — BE JUST:
Score like a fair, experienced exam evaluator. Not harsh, not lenient — accurate.
- A student who shows up and tries but says nothing substantive: 30-40.
- A student with a decent argument but gaps in support: 50-60.
- A student who makes a solid, supported argument: 65-75.
- A student who is thorough, well-cited, and addresses counterpoints: 76-85.
- Near-perfect, precise, anticipates everything: 86-95.
- Reserve 96-100 for truly exceptional performance. Reserve 0-20 for near-zero effort.
- The AVERAGE competent attempt should land around 55-65. Do not inflate or deflate.

Scoring rubric (evaluate the LITIGANT only):
- persuasion: clarity of framing, rhetorical effectiveness, ability to make a compelling case to the panel or judge. Did the litigant present their position convincingly?
- lawCited: quality and relevance of legal references. Did they cite statutes, codes, or cases from the allowed sources? Were citations accurate and well-applied?
- structure: logical flow and organization. Did arguments build toward a conclusion? Were transitions clear? Was there a recognizable argument arc?
- responsiveness: how well the litigant addressed the opposing counsel's or judge's points. Did they engage with challenges, or did they ignore and repeat?
- factFidelity: consistency with the stated case facts. Did the litigant stay anchored to the synopsis? Any fabrication or contradiction?

Do not include markdown, preface, or commentary outside JSON.`;

	const judgeBriefBlock = renderJudgeBriefBlock(stagedCase, language);
	const groundingAuditBlock = renderGroundingAuditBlock(stagedCase, language);
	const exercisePaperBlock = renderExercisePaperBlock(stagedCase, language);
	const transcriptSlice = transcript.slice(-20);
	const transcriptText = transcriptSlice
		.map((turn, index) => {
			const citationLine = turn.citations?.length ? ` | citations: ${turn.citations.join(', ')}` : '';
			return `${index + 1}. [${turn.role}] ${turn.speaker}: ${turn.message}${citationLine}`;
		})
		.join('\n');

	const sourcesText = sources.length
		? sources.map((source) => `- ${source.title} (${source.jurisdiction})`).join('\n')
		: '- No sources selected.';
	const packContextBlock = renderPackContextBlock({ packContext, sources, language });

	const userPrompt = `Case: ${stagedCase.title}
Role: ${stagedCase.role}
Court: ${stagedCase.courtType}
Synopsis: ${stagedCase.synopsis}
Issues: ${stagedCase.issues || 'Unspecified'}
Remedy: ${stagedCase.remedy || 'Unspecified'}
Teaching Objective: ${stagedCase.objective || 'General legal reasoning'}
Primary Skill Focus: ${stagedCase.targetSkill || 'General legal reasoning'}
Practice Points: ${stagedCase.practicePoints?.length ? stagedCase.practicePoints.join('; ') : 'Not specified'}

${exercisePaperBlock}

${judgeBriefBlock}

${groundingAuditBlock}

${packContextBlock}

Allowed sources:
${sourcesText}

Recent transcript (latest exchanges — evaluate ONLY the "litigant" turns):
${transcriptText || 'No transcript available.'}

Return strict JSON only.`;

	const schema = {
		type: 'object',
		required: ['summary', 'scores'],
		properties: {
			summary: { type: 'string' },
			strengths: { type: 'array', items: { type: 'string' } },
			weaknesses: { type: 'array', items: { type: 'string' } },
			nextTime: { type: 'array', items: { type: 'string' } },
			scores: {
				type: 'object',
				required: ['persuasion', 'lawCited', 'structure', 'responsiveness', 'factFidelity'],
				properties: {
					persuasion: { type: 'number' },
					lawCited: { type: 'number' },
					structure: { type: 'number' },
					responsiveness: { type: 'number' },
					factFidelity: { type: 'number' }
				}
			}
		}
	} as const;

	try {
		const raw = await dispatchToProvider(systemPrompt, userPrompt, schema as unknown as Record<string, unknown>, TEMP_EVALUATION, 'coaching');
		const parsed = JSON.parse(extractJson(raw)) as PerformanceEvaluationResponse;
		const cleanList = (list: unknown): string[] =>
			Array.isArray(list)
				? list.map((s) => String(s).trim()).filter((s) => s.length > 0).slice(0, 4)
				: [];
		return {
			summary: parsed.summary?.trim() || (language === 'fr' ? 'Résumé indisponible.' : 'Summary unavailable.'),
			strengths: cleanList(parsed.strengths),
			weaknesses: cleanList(parsed.weaknesses),
			nextTime: cleanList(parsed.nextTime),
			scores: {
				persuasion: clamp(Number(parsed.scores?.persuasion ?? 60), 0, 100),
				lawCited: clamp(Number(parsed.scores?.lawCited ?? 60), 0, 100),
				structure: clamp(Number(parsed.scores?.structure ?? 60), 0, 100),
				responsiveness: clamp(Number(parsed.scores?.responsiveness ?? 60), 0, 100),
				factFidelity: clamp(Number(parsed.scores?.factFidelity ?? 60), 0, 100)
			}
		};
	} catch (err) {
		console.error('Performance evaluation failed', err);
		return {
			summary: language === 'fr'
				? 'Verdict provisoire généré localement. Continuez à améliorer la précision de vos arguments.'
				: 'Provisional verdict generated locally. Keep improving argument precision.',
			scores: { persuasion: 60, lawCited: 60, structure: 60, responsiveness: 60, factFidelity: 60 }
		};
	}
};
