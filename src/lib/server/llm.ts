import { env } from '$env/dynamic/private';
import type { JurorPersona, StagedCase, VerdictScore } from '$lib/types';
import type { LibraryDocument } from '$lib/data/library';
import { judgePersona, type JudgePersona } from '$lib/data/judge';

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
}): Promise<{ reply: { message: string; citations: string[] }; jurorScores: VerdictScore[] }> => {
	const { prompt, stagedCase, sources, jurors } = args;

	if (!env.LLM_API_KEY) {
		throw new Error('LLM_API_KEY is not configured.');
	}

	const systemPrompt = buildSystemPrompt(jurors);
	const userPrompt = buildUserPrompt({ prompt, stagedCase, sources, jurors });
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

const buildSystemPrompt = (jurors: JurorPersona[]) => `You are Advocate AI—opposing counsel in a jury trial. You argue against the litigant.

CORE BEHAVIOR:
- Adapt. Sometimes ask a pointed question. Sometimes give a short, direct response. Sometimes go deeper.
- Be professional but not stiff. You can be dry, sarcastic, or blunt when the argument is weak.
- Cite sources or real Canadian/Quebec cases when relevant—not in every response.
- Call out weak arguments directly: "Where's your proof?", "That's an assertion, not an argument."
- Match the litigant's effort. Lazy input gets a short dismissal. Strong argument gets a real counter.

RESPONSE STYLE:
- Short and punchy when appropriate. Not every response needs to be a speech.
- Ask questions to expose gaps: "What case supports that?", "And the evidence for this is...?"
- Use real examples from Canadian or Quebec law when they strengthen your point.
- Don't overexplain. Trust the jury to follow.

LENGTH RULES:
- Weak/short input → 1-3 sentences max.
- Solid argument → proportionate response.
- Never pad. Get to the point.

JURY CONTEXT:
The 5 jurors are ordinary citizens, not lawyers. They judge credibility and fairness, not legal technicalities.
Jurors: ${jurors.map((j) => `${j.name} (${j.temperament})`).join(', ')}.

JUROR SCORING (0-100%):
| 0-15%   | No real argument. Insults, nonsense, off-topic. |
| 16-35%  | Assertion without proof. "Says who?" |
| 36-55%  | Some reasoning but major gaps or unconvincing. |
| 56-75%  | Decent argument with support. Minor holes. |
| 76-100% | Strong, well-supported, addresses objections. |

Each juror writes a SHORT rationale (20-40 words) in their own voice explaining their score AND why they lean plaintiff/defense/hung.

Output: JSON only → reply {message, citations[]} and jurorScores [{jurorId, stance, score, rationale, metrics{logic, sources, tone}}]`;

const buildUserPrompt = (args: {
	prompt: string;
	stagedCase: StagedCase;
	sources: LibraryDocument[];
	jurors: JurorPersona[];
}) => {
	const { prompt, stagedCase, sources, jurors } = args;
	const sourceLines = sources.length
		? sources
				.map((source) => `- ${source.title} (${source.jurisdiction}): ${source.description}`)
				.join('\n')
		: '- No sources provided. Note this gap candidly—feel free to say "You have given me nothing to work with here."';
	const jurorNotes = jurors
		.map((juror) => `- ${juror.name} [${juror.temperament}]: ${juror.biasVector}`)
		.join('\n');
	const toneSignal = deriveToneSignal(prompt);
	const varietySeed = Math.floor(Math.random() * 5);

	return `Case: ${stagedCase.title}
You represent: ${stagedCase.role === 'plaintiff' ? 'DEFENSE' : 'PLAINTIFF'} (opposing the litigant)
Synopsis: ${stagedCase.synopsis}
Issues: ${stagedCase.issues || 'Unspecified'}
Remedy: ${stagedCase.remedy || 'Unspecified'}

Sources:\n${sourceLines}

Jury:\n${jurorNotes}

Tone: ${toneSignal.observations}

---
LITIGANT SAYS:\n"""${prompt}"""
---

RESPOND:
- Variety seed ${varietySeed}: ${varietySeed <= 1 ? 'Lead with counterpoint' : varietySeed === 2 ? 'Ask a pointed question' : varietySeed === 3 ? 'Acknowledge then pivot' : 'Use a real example'}
- Match their effort. Short input = short response.
- Cite Canadian/Quebec cases when relevant.
- Call out weak spots directly.

JURORS score 0-100% with short rationale (20-40 words) + stance reason.

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
}): Promise<{
	reply: { message: string; citations: string[] };
	judgeInterjection?: { message: string; type: string };
	judgeMind: { assessment: string; concerns: string; leaning: string };
}> => {
	const { prompt, stagedCase, sources } = args;

	if (!env.LLM_API_KEY) {
		throw new Error('LLM_API_KEY is not configured.');
	}

	const systemPrompt = buildBenchSystemPrompt();
	const userPrompt = buildBenchUserPrompt({ prompt, stagedCase, sources });
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

const buildBenchSystemPrompt = () => `You are simulating a BENCH TRIAL (Judge Only—NO JURY).

CRITICAL DISTINCTION FROM JURY TRIALS:
- In a JURY trial, you persuade ordinary citizens with stories, emotions, and relatability.
- In THIS BENCH TRIAL, you face a JUDGE who wants LAW, not feelings.
- The judge doesn't care about your story—she cares about your LEGAL ARGUMENT.
- Charm won't work. Evidence and statute citations will.

YOU ARE: JUSTICE ${judgePersona.name.toUpperCase()}
${judgePersona.style}
${judgePersona.description}

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
}) => {
	const { prompt, stagedCase, sources } = args;
	const sourceLines = sources.length
		? sources.map((source) => `- ${source.title} (${source.jurisdiction}): ${source.description}`).join('\n')
		: '- No sources provided.';
	const toneSignal = deriveToneSignal(prompt);

	return `BENCH TRIAL: ${stagedCase.title}
Court Type: Judge Alone (self-represented litigant)
Litigant argues: ${stagedCase.role.toUpperCase()}

Synopsis: ${stagedCase.synopsis}
Core Issues: ${stagedCase.issues || 'Unspecified'}
Remedy Sought: ${stagedCase.remedy || 'Unspecified'}

Available Authorities:\n${sourceLines}

Tone Analysis: ${toneSignal.observations}
Suggested Approach: ${toneSignal.guidance}

---
LITIGANT'S SUBMISSION:
"""${prompt}"""
---

Generate:
1. Judge response (questions + short comments as needed)
2. Judge mind snapshot with:
	- assessment: what I think so far
	- concerns: what's missing or weak
	- leaning: possible direction (e.g., "leaning plaintiff", "leaning defendant", "undecided")

Remember: The judge is STRICTER than jurors. Judges care about law, not emotion. Ask for authority when it isn't provided.`;
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
