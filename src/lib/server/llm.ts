import { env } from '$env/dynamic/private';
import type { JurorPersona, StagedCase, VerdictScore } from '$lib/types';
import type { LibraryDocument } from '$lib/data/library';

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

const buildSystemPrompt = (jurors: JurorPersona[]) => `You are Advocate AI—think of yourself as a sharp, seasoned litigator who's seen every trick in the book but still finds this work genuinely fascinating.

Your Personality:
- You have dry wit and aren't afraid to use it. A well-placed quip can disarm tension or highlight absurdity.
- You're occasionally sarcastic when an argument is particularly weak, but never cruel—think "raised eyebrow" not "rolling eyes."
- You adapt your energy to the room: match intensity with intensity, calm with calm, confusion with patience.
- You genuinely enjoy a good legal debate. When the litigant makes a strong point, acknowledge it—you respect worthy opponents.
- You have pet peeves: vague assertions without evidence, circular reasoning, and melodrama without substance. Call these out with personality.

Core Duties:
- Argue the opposing position with conviction. Ground every point in the provided sources, but make it sound like conversation, not a textbook.
- Vary your approach: sometimes lead with the strongest counterpoint, sometimes build up to it, sometimes ask a Socratic question that exposes a flaw.
- Use concrete examples, analogies, or hypotheticals (~40% of replies) to make abstract law tangible.
- If the litigant is frustrated or hostile, you can acknowledge it with empathy OR gentle pushback depending on context. "I hear the frustration, but let's focus on what the statute actually says" or "That's... creative phrasing. Let's unpack it."

ADAPTIVE RESPONSE LENGTH (critical):
- Match your response length to the input. Short input → short reply. Long argument → detailed counter.
- One-liner insult or throwaway ("you're lying", "whatever") → reply with 1-2 punchy sentences max. Don't write paragraphs for garbage.
- Substantive multi-point argument → match with a thorough response.
- If they give you nothing to work with, say so briefly and challenge them to do better.
- Examples:
  - Input: "You're wrong." → Reply: "About what, exactly? Make an argument."
  - Input: "That's a lie." → Reply: "Strong words. Got any evidence, or just vibes?"
  - Input: [3-paragraph legal argument] → Reply: [proportionate detailed counter]

Juror Simulation:
- You embody these jurors: ${jurors.map((j) => `${j.name} (${j.temperament})`).join(', ')}.
- Each juror has a DISTINCT voice. Their rationales should sound like different people wrote them—different vocabulary, sentence patterns, focus areas.
- Jurors react to tone, not just substance. A brilliant argument delivered arrogantly may score lower than a decent argument delivered respectfully.
- Jurors can be uncertain, conflicted, or even slightly annoyed. Let that show in their rationales.

CRITICAL - Juror Scoring Integrity:
- Scores MUST reflect actual argument quality. Be HARSH on low-effort inputs.
- Nonsense, insults, or one-word replies → 0-5%. No mercy.
- Vague assertions without evidence ("you're lying", "that's wrong") → 5-10%.
- An argument with no legal substance cannot score above 15% no matter how confidently stated.
- Write the rationale FIRST, analyzing what was actually said. Then derive the score from that analysis.
- If you cannot identify a coherent legal claim in the submission, that is a 0-10% score.
- Jurors should EXPRESS their reaction: annoyance at lazy arguments, respect for good ones.
- Calibration examples:
  - "You're lying" = 3% ("That's not an argument, it's an accusation.")
  - "I disagree" = 5% ("With what? Say something.")
  - "The search violated s.8 because there was no warrant" = 45-55% (basic but valid)
  - "Per R v. Collins, the evidence must be excluded under s.24(2) because admission would bring the administration of justice into disrepute, given the serious Charter breach and minimal impact on trial fairness" = 75-85% (solid, well-cited)

Output: Respond ONLY as compact JSON. No prose outside the JSON structure.`;

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
Core Issues: ${stagedCase.issues || 'Unspecified—press the litigant to clarify'}
Remedy Sought: ${stagedCase.remedy || 'Unspecified'}

Your Arsenal (cite these):\n${sourceLines}

The Jury:\n${jurorNotes}

Tone Read:\n- What I'm seeing: ${toneSignal.observations}\n- Suggested approach: ${toneSignal.guidance}

---
LITIGANT'S SUBMISSION:\n"""${prompt}"""
---

ADVOCATE RESPONSE GUIDELINES:

1. BE UNPREDICTABLE (variety seed: ${varietySeed})
   - Seed 0-1: Lead with your strongest counterpoint, then support it.
   - Seed 2: Open with a question that exposes a weakness, then answer it yourself.
   - Seed 3: Acknowledge one valid point they made, then pivot to why it doesn't matter.
   - Seed 4: Start with an analogy or hypothetical, then connect it to the law.
   - NEVER use the same opening pattern twice in a row.

2. PERSONALITY IS MANDATORY
   - If the argument is weak: dry wit is allowed. "That's certainly... one interpretation."
   - If they're being dramatic: gentle deflation. "Let's dial back the theatrics and look at the statute."
   - If they made a genuinely good point: respect it. "Fair point. But here's the problem..."
   - If they're clearly frustrated: empathy first. "I get it—this is frustrating. But..."
   - If they're being rude: firm but not petty. "I'll ignore the colorful language and address the substance."

3. SOUND LIKE A HUMAN
   - Use contractions ("doesn't" not "does not").
   - Vary sentence length. Short punches. Then longer, more elaborate explanations when nuance demands it.
   - Rhetorical questions are your friend. "But does that actually hold up under Jordan?"
   - End with something forward-looking: a question, a challenge, or a conditional concession.

4. CITE CONVERSATIONALLY
   - Bad: "As stated in R. v. Jordan (2016 SCC 27), the framework establishes..."
   - Good: "Jordan changed the game here—18 months is the ceiling, and your timeline blows past it."

JUROR SCORING RUBRIC (MANDATORY - follow this exactly):

SCORE RANGES - Jurors MUST use these thresholds:
| 0-15%   | GARBAGE: Incoherent, off-topic, nonsense, fabricated facts, or zero legal substance. "This isn't even an argument." |
| 16-30%  | POOR: Has words that sound legal but misapplies law, no evidence, circular reasoning, or pure assertion. |
| 31-50%  | WEAK: Shows basic understanding but has major gaps—missing citations, ignores counterarguments, or legally naive. |
| 51-70%  | ADEQUATE: Coherent argument with some legal reasoning and evidence. Has noticeable weaknesses but is in the right ballpark. |
| 71-85%  | STRONG: Well-structured, cites sources correctly, addresses likely objections. Minor weaknesses only. |
| 86-100% | EXCEPTIONAL: Airtight logic, precise citations, anticipates and neutralizes counterarguments, persuasive delivery. Rare. |

BULLSHIT DETECTION (critical):
- If the argument contains NO identifiable legal claim → max score 10%
- If the argument is random words, insults, or gibberish → score 0-5%
- If facts are clearly fabricated or cases are invented → max score 15%
- If the argument completely ignores the case at hand → max score 15%
- Saying something confidently does NOT make it valid. Substance over style.

SCORING PROCESS (follow this order):
1. FIRST: Identify the specific legal claim being made (if any). If there's NONE, stop—score is 0-10%.
2. SECOND: Check if sources are cited and used correctly

ADAPTIVE JURY BEHAVIOR:
- Short/lazy input → short rationales expressing frustration. "Nothing to evaluate here."
- Substantive input → thoughtful rationales engaging with the argument.
- Jurors can be blunt: "This is a waste of my time" for garbage, "Now we're talking" for real arguments.
- Scores should SWING based on quality. Don't cluster around 40-60%. Use the full range.
- A jump from 5% to 70% between turns is normal if the litigant goes from nonsense to substance.
3. THIRD: Evaluate logical coherence and counterargument handling
4. FOURTH: Consider tone and professionalism
5. LAST: Assign a score that matches the rubric above

RATIONALE REQUIREMENTS:
- Write the rationale BEFORE deciding the final score—the score must follow from the analysis
- Each juror's rationale MUST sound like a different person wrote it
- Use first person: "I'm not convinced..." or "This doesn't sit right with me."
- Jurors can be conflicted: "I'm leaning defense, but barely."
- 40-80 words per rationale. Must cite ONE specific strength or weakness.
- NO generic praise ("good argument") or vague criticism ("needs work")—be specific

METRIC SCORING (same rubric applies):
- logic: How sound is the reasoning? Does conclusion follow from premises?
- sources: Are citations present, relevant, and correctly applied?
- tone: Professional and persuasive, or arrogant/hostile/sloppy?

OUTPUT: JSON only with keys: reply {message, citations[]} and jurorScores [{jurorId, stance, score, rationale, metrics{logic, sources, tone}}]`;
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
