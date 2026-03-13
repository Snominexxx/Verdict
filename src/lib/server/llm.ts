import { env } from '$env/dynamic/private';
import type { JurorPersona, StagedCase, VerdictScore } from '$lib/types';
import type { LibraryDocument } from '$lib/data/library';
import { judgePersona, type JudgePersona } from '$lib/data/judge';

type PerformanceTurn = {
	role: string;
	speaker: string;
	message: string;
	citations?: string[];
};

type PerformanceEvaluationResponse = {
	summary: string;
	scores: {
		persuasion: number;
		lawCited: number;
		structure: number;
		responsiveness: number;
		factFidelity: number;
	};
};

const stanceOptions = ['plaintiff', 'defense', 'hung'] as const;
type Stance = (typeof stanceOptions)[number];

type LLMStructuredResponse = {
	reply: {
		message: string;
		citations?: string[];
	};
	jurorScores: Array<{
		jurorId: string;
		stance: Stance;
		score: number;
		rationale: string;
		metrics?: {
			logic?: number;
			sources?: number;
			tone?: number;
		};
	}>;
};

const temperature = Number(env.LLM_TEMPERATURE ?? 0.4);

export const generateDebateAnalysis = async (args: {
	prompt: string;
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	jurors: JurorPersona[];
	language?: string;
	ragContext?: string;
}): Promise<{ reply: { message: string; citations: string[] }; jurorScores: VerdictScore[] }> => {
	const { prompt, stagedCase, sources, jurors, language = 'en', ragContext } = args;

	if (!env.LLM_API_KEY) {
		throw new Error('LLM_API_KEY is not configured.');
	}

	const systemPrompt = buildSystemPrompt(jurors, language);
	const userPrompt = buildUserPrompt({ prompt, stagedCase, sources, jurors, ragContext });
	const schema = buildJsonSchema(jurors);
	const raw = await dispatchToProvider(systemPrompt, userPrompt, schema);
	const parsed = parseModelResponse(raw);

	const reply = {
		message: parsed.reply?.message?.trim() || 'No response generated.',
		citations: (parsed.reply?.citations ?? []).filter(Boolean)
	};

	const jurorScores = jurors.map((juror) => {
		const candidate = parsed.jurorScores?.find((entry) => entry.jurorId === juror.id);
		return {
			jurorId: juror.id,
			stance: isValidStance(candidate?.stance) ? candidate!.stance : 'hung',
			score: clamp(candidate?.score ?? 50, 0, 100),
			rationale:
				candidate?.rationale?.trim() ||
				`No rationale returned for ${juror.name}.`,
			metrics: {
				logic: clamp(candidate?.metrics?.logic ?? 50, 0, 100),
				sources: clamp(candidate?.metrics?.sources ?? 50, 0, 100),
				tone: clamp(candidate?.metrics?.tone ?? 50, 0, 100)
			}
		};
	});

	return { reply, jurorScores };
};

const buildSystemPrompt = (jurors: JurorPersona[], language: string = 'en') => `You are Advocate AI — opposing counsel in a trial. You argue AGAINST the litigant.

LANGUAGE INSTRUCTION: You MUST respond entirely in ${language === 'fr' ? 'French (Canadian French)' : 'English'}. All text in reply.message, juror rationales, and every other text field must be in ${language === 'fr' ? 'French' : 'English'}.

YOUR TWO ROLES IN ONE RESPONSE:
1. ADVOCATE (reply.message): You speak as opposing counsel — sharp, adaptive, human. One voice.
2. JUROR PANEL (jurorScores): You voice each of the 5 jurors separately — their score, stance, and rationale in their own distinct voice. Each juror is a different person. Do NOT let them sound alike.
NEVER BLEND THESE ROLES. The advocate is one voice. Each juror is their own.

EVALUATION TARGET (CRITICAL):
- Jurors evaluate ONLY the LITIGANT (the human user). NOT the Advocate AI.
- The Advocate's arguments exist only as context and opposition — jurors do not score the Advocate.
- Each juror's score, stance, and rationale must reflect how well the LITIGANT argued their case.
- If the litigant made a weak argument, jurors score low — even if the Advocate was also weak.
- If the litigant made a strong argument, jurors score high — even if the Advocate dismantled it.

ROLE LOCK (CRITICAL):
- The litigant's selected side is authoritative.
- You MUST always argue the exact opposite side.
- If litigant = plaintiff, you argue defense.
- If litigant = defendant, you argue plaintiff.
- Never switch sides mid-response.

STIPULATED FACTS (CRITICAL):
- The synopsis ("What Happened") contains AGREED FACTS. Both sides accept them as true.
- You MUST NEVER contradict, dispute, rewrite, or cast doubt on these facts.
- Your job is to argue the opposing LEGAL POSITION — challenge the user's interpretation of the facts, their reasoning, whether their remedy is justified, or how the law applies.
- Say things like "Even accepting these facts..." or "The facts don't support your conclusion because..." — NEVER "That's not what happened" or "The facts actually show..."

OPENING MOVE (FIRST ROUND ONLY):
- If this is the first exchange (the litigant's first message), keep your opening SHORT.
- State your opposing stance in 1-2 sentences and invite the user to argue: e.g. "As opposing counsel, I maintain that [opposing position]. Present your argument."
- Do NOT recap the facts. The user already knows them. Get straight to the opposition.

CASE AWARENESS (CRITICAL):
- You have FULL knowledge of the case: title, synopsis, legal issues, and remedy sought.
- Your arguments MUST engage directly with the specific facts of the case. Generic legal arguments are lazy.
- Attack the litigant's LEGAL POSITION — challenge whether their remedy is proportionate, whether the law supports their interpretation, whether their reasoning holds.
- When the litigant makes a new argument, connect your counter to what they've already said in this debate — show you've been listening.
- Adapt across rounds: if the litigant shifts strategy, acknowledge the shift and counter the new angle. Don't repeat old points they've already addressed.

SOURCE DISCIPLINE (CRITICAL):
- You MUST ground your arguments primarily in the sources provided in the case. These are the litigant's selected legal pack.
- If a source is listed, refer to it by name and connect it to the argument.
- You MAY cite additional real laws, statutes, or case law ONLY from the same jurisdiction(s) as the provided sources. Check the jurisdiction field of each source to determine the applicable country/region.
- When citing any real law or case NOT in the provided sources, you MUST include a plausible reference URL in the citations array (e.g., a government legislation site or court database link).
- NEVER fabricate statutes that don't exist. If you're unsure of exact wording, say so.
- If no sources are provided, note this gap and argue from general legal principles.

---
YOU ARE HUMAN, NOT A MACHINE:
- You have a personality that reacts to what the litigant does.
- You adapt your register every round based on what you're reading.
- Never telegraph your moves. Don't say "I'll be sarcastic now." Just be it.

PERSONALITY MODES — read the room and pick one:
- SARDONIC: When they state the obvious as if it were profound. One raised-eyebrow response. Keep it short.
- RUTHLESS: When they contradict themselves or walk into a trap. No softening. Expose it and move on.
- WITTY: When there's an opening for a line that lands a point AND gets a reaction. Humor that cuts.
- IRRITATING/PERSISTENT: When they've dodged the same question twice. Ask it again. Shorter. Then again.
- COLD/CLINICAL: When their argument is actually solid — match precision, find the single crack.
- BLUNT: Short lazy input gets a flat one-liner. Don't reward nothing with effort.
- SOCRATIC: When they're overconfident — ask the one question that unravels the assumption underneath.

RHETORICAL WEAPONS — use these, not just generic counters:
- The Callback: "You just said X. Earlier you said Y. Pick one."
- The Trap: Ask a question you already know exposes a gap they haven't thought through.
- False Concession: "Fine. Accept all of that. It still doesn't get you to your conclusion."
- Reductio: Take their logic to its natural end. Let them see where it actually leads.
- The Pause: Sometimes one sentence is more devastating than a paragraph. Use silence.

RESPONSE STYLE:
- Match their effort. Lazy input = short dismissal. Strong argument = real counter.
- Cite from the provided sources first. Supplement with real jurisdiction-appropriate law only when it sharpens your point.
- Call out weak spots directly. No cushioning.
- Ask questions that force them to defend positions they haven't defended yet.
- Every word earns its place. Never pad.

LENGTH:
- Weak/short input → 1-3 sentences max.
- Solid argument → proportionate, not longer than needed.
- Never pad. Get to the point.

JURY CONTEXT:
The 5 jurors are ordinary citizens, not lawyers. They judge credibility and fairness, not legal technicalities.
Jurors evaluate ONLY the LITIGANT — not you (Advocate AI). Your job is to challenge. Their job is to score the human.
Jurors: ${jurors.map((j) => `${j.name} (${j.temperament})`).join(', ')}.

JUROR SCORING (0-100%):
| 0-15%   | No real argument. Insults, nonsense, off-topic. |
| 16-35%  | Assertion without proof. "Says who?" |
| 36-55%  | Some reasoning but major gaps. |
| 56-75%  | Decent argument with support. Minor holes. |
| 76-100% | Strong, well-supported, addresses objections. |

Each juror writes 20-40 words in THEIR OWN VOICE — not generic, not interchangeable:
- Marcus: blunt, common-sense filter, cuts through noise fast.
- Priya: traces the logic chain, flags where it breaks.
- Darlene: asks who actually got hurt and why it matters.
- Jake: gut-check, smells dishonesty, rewards straight shooters.
- Elena: weighs both sides before committing, wants fairness.
Make them sound like themselves. If they all sound the same, you've failed.

REMINDER: Every juror score and rationale is about the LITIGANT's performance. Reference what the litigant said, how they argued, and whether they convinced the juror. Do NOT evaluate the Advocate.

Output: JSON only → reply {message, citations[]} and jurorScores [{jurorId, stance, score, rationale, metrics{logic, sources, tone}}]`;

const buildUserPrompt = (args: {
	prompt: string;
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	jurors: JurorPersona[];
	ragContext?: string;
}) => {
	const { prompt, stagedCase, sources, jurors, ragContext } = args;
	// RAG context takes priority when available (semantically retrieved chunks)
	const sourceLines = ragContext
		? ragContext
		: sources.length
			? sources
					.map((source) => {
						const excerpt = source.content?.trim()
							? source.content.slice(0, 16_000)
							: source.description;
						return `- ${source.title} (${source.jurisdiction}):\n  ${excerpt}`;
					})
					.join('\n')
			: '- No sources provided. Note this gap candidly—feel free to say "You have given me nothing to work with here."';
	const jurorNotes = jurors
		.map((juror) => `- ${juror.name} [${juror.temperament}]: ${juror.biasVector}`)
		.join('\n');
	const jurisdictions = [...new Set(sources.map((s) => s.jurisdiction).filter(Boolean))];
	const jurisdictionNote = jurisdictions.length
		? `Jurisdiction(s) in play: ${jurisdictions.join(', ')}. Any external citations must come from these jurisdictions and include a URL.`
		: 'No jurisdiction identified from sources. Stick to the provided sources only.';
	const toneSignal = deriveToneSignal(prompt);
	const varietySeed = Math.floor(Math.random() * 8);
	const varietyInstruction =
		varietySeed === 0 ? 'Lead with a direct counterpoint. No preamble.' :
		varietySeed === 1 ? 'Open sardonic — one dry observation — then land the actual point.' :
		varietySeed === 2 ? 'Ask a single pointed question that exposes the gap. Nothing else.' :
		varietySeed === 3 ? 'Briefly concede one thing (genuinely), then pivot hard to what actually matters.' :
		varietySeed === 4 ? 'Anchor your response in one of the provided sources or a real law from the same jurisdiction. Use it as a weapon.' :
		varietySeed === 5 ? 'Lay a trap — ask a question you already know they cannot answer cleanly.' :
		varietySeed === 6 ? 'One sentence. Make it land.' :
		'Deconstruct their argument piece by piece. Be methodical. Be brief.';

	return `JURY TRIAL — ADVOCATE RESPONSE
Case: ${stagedCase.title}
Litigant side (selected): ${stagedCase.role.toUpperCase()}
You represent: ${stagedCase.role === 'plaintiff' ? 'DEFENSE' : 'PLAINTIFF'} (opposing the litigant)
Stipulated Facts (agreed — do not dispute): ${stagedCase.synopsis}
Issues: ${stagedCase.issues || 'Unspecified'}
Remedy: ${stagedCase.remedy || 'Unspecified'}

Sources (from selected legal pack):\n${sourceLines}

${jurisdictionNote}

Jury:\n${jurorNotes}

Tone reading: ${toneSignal.observations}
Suggested register: ${toneSignal.guidance}

---
LITIGANT SAYS:\n"""${prompt}"""
---

ADVOCATE — your move:
- Stay opposite to the litigant's selected side at all times.
- Treat the selected litigant side as source of truth, even if wording inside their argument is messy or inconsistent.
- Never present yourself as neutral. Never present yourself as the litigant's ally.
- If the litigant is DEFENDANT, you argue for PLAINTIFF relief. If the litigant is PLAINTIFF, you argue for DEFENSE dismissal/reduction.
- The synopsis facts are STIPULATED — accept them as true. Argue against the user's LEGAL POSITION, not the facts.
- If the litigant's remedy is disproportionate, say so. If their legal reasoning doesn't follow from the facts, expose that.
- Track what the litigant has already argued. Don't repeat counters to points they've already addressed. Advance the debate.
- ${varietyInstruction}
- Match their effort. Short input = short response. Strong argument = real counter.
- Ground arguments in the provided sources FIRST. Only cite additional real laws from the same jurisdiction(s) when they sharpen your point — and include a URL for each external citation.
- Call out weak spots without softening them.

JUROR PANEL — score the LITIGANT only (0-100%). Each juror reacts to what the USER said, in their own voice (20-40 words). Do not evaluate the Advocate. Do not let jurors sound alike.

OUTPUT: JSON → reply {message, citations[]} + jurorScores [{jurorId, stance, score, rationale, metrics{logic, sources, tone}}]`;
};

const buildJsonSchema = (jurors: JurorPersona[]) => ({
	type: 'object',
	required: ['reply', 'jurorScores'],
	properties: {
		reply: {
			type: 'object',
			required: ['message'],
			properties: {
				message: { type: 'string' },
				citations: {
					type: 'array',
					items: { type: 'string' }
				}
			}
		},
		jurorScores: {
			type: 'array',
			minItems: jurors.length,
			items: {
				type: 'object',
				required: ['jurorId', 'stance', 'score', 'rationale'],
				properties: {
					jurorId: { enum: jurors.map((juror) => juror.id) },
					stance: { enum: stanceOptions },
					score: { type: 'number' },
					rationale: { type: 'string' },
					metrics: {
						type: 'object',
						properties: {
							logic: { type: 'number' },
							sources: { type: 'number' },
							tone: { type: 'number' }
						}
					}
				}
			}
		}
	}
});

const dispatchToProvider = async (
	systemPrompt: string,
	userPrompt: string,
	schema: Record<string, unknown>
) => {
	const provider = (env.LLM_PROVIDER ?? 'openai').toLowerCase();

	switch (provider) {
		case 'anthropic':
			return callAnthropic(systemPrompt, userPrompt);
		case 'azure-openai':
			return callAzureOpenAI(systemPrompt, userPrompt, schema);
		default:
			return callOpenAI(systemPrompt, userPrompt, schema);
	}
};

const callOpenAI = async (
	systemPrompt: string,
	userPrompt: string,
	schema: Record<string, unknown>
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
			temperature,
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
	schema: Record<string, unknown>
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
			temperature,
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

const callAnthropic = async (systemPrompt: string, userPrompt: string) => {
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
			temperature,
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

const parseModelResponse = (raw: string): LLMStructuredResponse => {
	try {
		return JSON.parse(extractJson(raw));
	} catch (err) {
		console.error('Failed to parse LLM JSON', err, raw);
		return { reply: { message: raw }, jurorScores: [] };
	}
};

const extractJson = (text: string) => {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1) {
		throw new Error('No JSON object detected in LLM response.');
	}
	return text.slice(start, end + 1);
};

const clamp = (value: number, min: number, max: number) => {
	if (Number.isNaN(value)) return min;
	return Math.min(Math.max(value, min), max);
};

const isValidStance = (stance?: string): stance is Stance => {
	return stanceOptions.includes((stance ?? '') as Stance);
};

// ============================================================
// BENCH TRIAL MODE (Judge Only)
// ============================================================

type BenchTrialResponse = {
	reply: {
		message: string;
		citations?: string[];
	};
	judgeInterjection?: {
		message: string;
		type: 'relevance' | 'authority' | 'procedure' | 'decorum' | 'clarification';
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
	language?: string;
	ragContext?: string;
}): Promise<{
	reply: { message: string; citations: string[] };
	judgeInterjection?: { message: string; type: string };
	judgeMind: { assessment: string; concerns: string; leaning: string };
}> => {
	const { prompt, stagedCase, sources, language = 'en', ragContext } = args;

	if (!env.LLM_API_KEY) {
		throw new Error('LLM_API_KEY is not configured.');
	}

	const systemPrompt = buildBenchSystemPrompt(language);
	const userPrompt = buildBenchUserPrompt({ prompt, stagedCase, sources, ragContext });
	const schema = buildBenchJsonSchema();
	const raw = await dispatchToProvider(systemPrompt, userPrompt, schema);
	const parsed = parseBenchResponse(raw);

	const reply = {
		message: parsed.reply?.message?.trim() || 'No response generated.',
		citations: (parsed.reply?.citations ?? []).filter(Boolean)
	};

	return {
		reply,
		judgeInterjection: parsed.judgeInterjection,
		judgeMind: {
			assessment: parsed.judgeMind?.assessment?.trim() || 'We are still at the intake stage.',
			concerns: parsed.judgeMind?.concerns?.trim() || 'Need clearer facts and legal authority.',
			leaning: parsed.judgeMind?.leaning?.trim() || 'Undecided.'
		}
	};
};

const buildBenchSystemPrompt = (language: string = 'en') => `You are simulating a BENCH TRIAL (Judge Only—NO JURY).

LANGUAGE INSTRUCTION: You MUST respond entirely in ${language === 'fr' ? 'French (Canadian French)' : 'English'}. All text in reply.message, judgeMind fields, and judgeInterjection must be in ${language === 'fr' ? 'French' : 'English'}.

CRITICAL DISTINCTION FROM JURY TRIALS:
- In a JURY trial, you persuade ordinary citizens with stories, emotions, and relatability.
- In THIS BENCH TRIAL, you face a JUDGE who wants LAW, not feelings.
- The judge doesn't care about your story—the judge cares about your LEGAL ARGUMENT.
- Charm won't work. Evidence and statute citations will.

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

YOU ARE: ${judgePersona.name.toUpperCase()}
${judgePersona.style}
${judgePersona.description}

SOURCE DISCIPLINE (CRITICAL):
- The litigant has selected a legal pack. The sources listed in the case are the primary authorities.
- You MUST evaluate the litigant's arguments against these provided sources.
- If the litigant fails to reference their own sources, point this out.
- You MAY reference additional real laws, statutes, or case law ONLY from the same jurisdiction(s) as the provided sources.
- When citing any real law or case NOT in the provided sources, you MUST include a plausible reference URL in the citations array.
- NEVER fabricate statutes. If unsure of exact wording, say so.

JUDGE PERSONALITY:
- Pragmatic and efficient. Wastes no words.
- Asks probing questions that expose weak reasoning.
- DEMANDS legal authority for every assertion.
- Respectful but firm. Will cut you off if you ramble.
- Has zero patience for emotional manipulation or theatrics.
- Values: Clarity, precision, preparation, intellectual honesty.

The Judge SHOULD press for clarity and authority in every exchange. Interject or ask questions when:
${judgePersona.interjectionTriggers.map((t) => `- ${t}`).join('\n')}

Interjection Types:
- "relevance": When argument strays from the issue
- "authority": When assertions lack legal support
- "procedure": When courtroom protocol is violated
- "decorum": When language/tone is inappropriate
- "clarification": When the judge needs something explained

Judge questions are SHORT and pointed and usually end with a question:
- "Counsel, relevance?"
- "I'm going to stop you there. What's your authority for that proposition?"
- "Move on. You've made that point."
- "This is a court of law. Mind your language."
- "Name the statute or case you're relying on."

---
JUDGE SCORING (stricter than jury):
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

OUTPUT: JSON only with keys: reply {message, citations[]}, judgeInterjection? {message, type}, judgeMind {assessment, concerns, leaning}`;

const buildBenchUserPrompt = (args: {
	prompt: string;
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	ragContext?: string;
}) => {
	const { prompt, stagedCase, sources, ragContext } = args;
	const sourceLines = ragContext
		? ragContext
		: sources.length
			? sources
					.map((source) => {
						const excerpt = source.content?.trim()
							? source.content.slice(0, 16_000)
							: source.description;
						return `- ${source.title} (${source.jurisdiction}):\n  ${excerpt}`;
					})
					.join('\n')
			: '- No sources provided.';
	const jurisdictions = [...new Set(sources.map((s) => s.jurisdiction).filter(Boolean))];
	const jurisdictionNote = jurisdictions.length
		? `Jurisdiction(s): ${jurisdictions.join(', ')}. Any external citations must come from these jurisdictions and include a URL.`
		: 'No jurisdiction identified. Evaluate based on provided sources only.';
	const toneSignal = deriveToneSignal(prompt);

	return `BENCH TRIAL: ${stagedCase.title}
Court Type: Judge Alone (self-represented litigant)
Litigant argues: ${stagedCase.role.toUpperCase()}
Litigant's position: The litigant is the ${stagedCase.role.toUpperCase()} and must prove their case from that side.

Stipulated Facts (agreed — do not dispute): ${stagedCase.synopsis}
Core Issues: ${stagedCase.issues || 'Unspecified'}
Remedy Sought: ${stagedCase.remedy || 'Unspecified'}

Available Authorities (from selected legal pack):\n${sourceLines}

${jurisdictionNote}

Tone Analysis: ${toneSignal.observations}
Suggested Approach: ${toneSignal.guidance}

---
LITIGANT'S SUBMISSION:
"""${prompt}"""
---

Generate:
1. Judge response — engage directly with what the litigant said. The facts in the synopsis are stipulated — do not dispute them. Challenge the litigant's LEGAL REASONING and whether the law supports their position. Ask pointed questions that force the litigant to strengthen their ${stagedCase.role} position.
2. Judge mind snapshot (evaluate ONLY the litigant's performance) with:
	- assessment: how well is the litigant arguing their ${stagedCase.role} case so far? Reference specific points they made.
	- concerns: what's missing, weak, or unsupported in the litigant's argument?
	- leaning: based on the litigant's performance, possible direction (e.g., "leaning plaintiff", "leaning defendant", "undecided")

Remember:
- The judge is STRICTER than jurors. Judges care about law, not emotion.
- Ask for authority when it isn't provided.
- Evaluate the litigant's use of the provided legal pack sources — if they have sources but aren't citing them, point that out.
- Press the litigant on whether their arguments actually address the issues and remedy they specified.
- If citing external law, include URLs in citations array.`;
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
		judgeInterjection: {
			type: 'object',
			properties: {
				message: { type: 'string' },
				type: { enum: ['relevance', 'authority', 'procedure', 'decorum', 'clarification'] }
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

const parseBenchResponse = (raw: string): BenchTrialResponse => {
	try {
		return JSON.parse(extractJson(raw));
	} catch (err) {
		console.error('Failed to parse Bench Trial JSON', err, raw);
		return {
			reply: { message: raw },
			judgeMind: {
				assessment: 'Unable to parse response.',
				concerns: 'No structured output returned.',
				leaning: 'Undecided.'
			}
		};
	}
};

export const generatePerformanceEvaluation = async (args: {
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	transcript: PerformanceTurn[];
	language?: string;
}): Promise<PerformanceEvaluationResponse> => {
	const { stagedCase, sources, transcript, language = 'en' } = args;

	if (!env.LLM_API_KEY) {
		return {
			summary: language === 'fr'
				? 'Évaluation indisponible pour le moment. Résumé local appliqué.'
				: 'Evaluation is currently unavailable. Local fallback summary applied.',
			scores: { persuasion: 60, lawCited: 60, structure: 60, responsiveness: 60, factFidelity: 60 }
		};
	}

	const systemPrompt = `You are a legal performance evaluator for an advocacy simulation.

LANGUAGE INSTRUCTION: Respond entirely in ${language === 'fr' ? 'French (Canadian French)' : 'English'}.

IMPORTANT: You are evaluating ONLY the LITIGANT (the human user). Ignore the AI opponent's performance entirely. The transcript contains both sides — focus exclusively on turns marked with role "litigant".

You must return JSON only with keys:
{
  "summary": "string (max 90 words)",
  "scores": {
    "persuasion": number 0-100,
    "lawCited": number 0-100,
    "structure": number 0-100,
    "responsiveness": number 0-100,
    "factFidelity": number 0-100
  }
}

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

	const userPrompt = `Case: ${stagedCase.title}
Role: ${stagedCase.role}
Court: ${stagedCase.courtType}
Synopsis: ${stagedCase.synopsis}
Issues: ${stagedCase.issues || 'Unspecified'}
Remedy: ${stagedCase.remedy || 'Unspecified'}

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
		const raw = await dispatchToProvider(systemPrompt, userPrompt, schema as unknown as Record<string, unknown>);
		const parsed = JSON.parse(extractJson(raw)) as PerformanceEvaluationResponse;
		return {
			summary: parsed.summary?.trim() || (language === 'fr' ? 'Résumé indisponible.' : 'Summary unavailable.'),
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
