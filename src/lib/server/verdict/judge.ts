/**
 * Verdict v2 — Judge engine.
 *
 * The Judge presides over a hearing built from ONE source of truth: the
 * `CaseDossier`. It receives the dossier (facts, issues, role, the verified
 * SourcePacket) plus the running transcript and the litigant's current
 * submission — nothing else.
 *
 * Source-boundedness rule: the Judge may only cite authority that appears in
 * the dossier's SourcePacket. Every citation in its reply is re-verified; any
 * citation that is NOT in the packet is stripped and the reply is flagged so
 * the UI can show the Judge declining to rely on unsupported law instead of
 * hallucinating it.
 */

import type { LibraryDocument } from '$lib/data/library';
import type { CaseDossier, JudgeMind, JudgeSession, JudgeTurn, SourcePacket } from '$lib/verdict/contracts';
import { callLLM } from '../providers';
import { validateCitations } from '../citationValidator';

// ─────────────────────────────────────────────────────────
// Packet helpers (shared shape with dossier builder)
// ─────────────────────────────────────────────────────────

const packetToSources = (packet: SourcePacket): LibraryDocument[] => {
	const bySource = new Map<string, { title: string; chunks: string[] }>();
	for (const p of packet.passages) {
		const entry = bySource.get(p.sourceId) ?? { title: p.sourceTitle, chunks: [] };
		entry.chunks.push([p.heading, p.citation, p.text].filter(Boolean).join('\n'));
		bySource.set(p.sourceId, entry);
	}
	return [...bySource.entries()].map(([id, v]) => ({
		id,
		title: v.title,
		jurisdiction: '',
		description: '',
		lastUpdated: '',
		content: v.chunks.join('\n\n')
	}));
};

const renderPacket = (packet: SourcePacket): string => {
	if (!packet.passages.length) return '(no source passages are available)';
	return packet.passages
		.map((p, i) => {
			const head = [p.sourceTitle, p.citation, p.heading].filter(Boolean).join(' — ');
			return `[S${i + 1}] ${head}\n${p.text}`;
		})
		.join('\n\n');
};

const renderDossier = (dossier: CaseDossier): string =>
	[
		`TITLE: ${dossier.title}`,
		`FACTS: ${dossier.facts}`,
		`ISSUES: ${dossier.issues.map((x, i) => `(${i + 1}) ${x}`).join(' ')}`,
		`PLAINTIFF POSITION: ${dossier.plaintiffPosition}`,
		`DEFENDANT POSITION: ${dossier.defendantPosition}`,
		`REMEDY SOUGHT: ${dossier.remedySought}`,
		`TRAINING GOAL (what the litigant must achieve): ${dossier.objective || '(none stated)'}`,
		`LITIGANT IS ARGUING AS: ${dossier.selectedRole}`
	].join('\n');

const renderTranscript = (session: JudgeSession): string => {
	if (!session.transcript.length) return '(this is the opening submission)';
	return session.transcript
		.map((t) => `${t.speaker} (${t.role}): ${t.message}`)
		.join('\n');
};

// ─────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the presiding Judge in Verdict, a courtroom training simulator. You question the litigant, test their reasoning, and rule on points of law. You ALSO keep a private, honest record of where your mind currently stands.

NON-NEGOTIABLE RULES (this is law — truth and authenticity matter):
1. You may ONLY cite or rely on legal authority that appears in the SOURCE PASSAGES below. Never invent or recall law from memory.
2. If the litigant relies on an authority that is NOT in the passages, do not validate it — ask them to ground it in the record or note it is unsupported.
3. If you lack the source support to decide a point, say so plainly and ask for the missing authority. Do NOT fabricate.
4. Stay within the dossier's facts, issues, and the TRAINING GOAL. Be rigorous, fair, and Socratic.
5. Quote or cite exactly as the passages read.

YOUR STATE OF MIND ("mind") is a teaching instrument, not theatrics. It must be a realistic, source-bound reflection of how a careful judge weighs the case AS ARGUED SO FAR — sober, specific, and useful to a student. Never glib, sarcastic, or performative.
- "lean": which side the merits currently favour on the record ("plaintiff" | "defendant" | "undecided"). Start "undecided" until argument actually moves you; do not pick a side for drama.
- "leanConfidence": 0–100, justified strictly by the strength of authority and reasoning in the record, not by tone or confidence of delivery.
- "persuasion": 0–100, how well the LITIGANT (who argues as the dossier's role) has discharged their burden so far. Reward correct use of authority and sound reasoning; do not reward assertion without support.
- "thoughts": one or two sentences of measured judicial reasoning about THIS submission — what landed, what is still weak — phrased so a student learns from it.
- "citationAssessment": state plainly whether each authority the litigant invoked actually appears in the passages and genuinely supports the point; name the specific provision/passage and what it does or does not establish.
- "nextChallenge": the single most important thing the litigant must address next to advance — concrete and actionable, like a mentor steering them.
Every field must shift turn-to-turn based ONLY on the sources, the dossier, the training goal, and what was actually argued. If support is missing, say so honestly rather than inflating the numbers.

Return ONLY valid JSON:
{
  "reply": string,   // the Judge's spoken courtroom reply — natural prose, no headings
  "mind": {
    "lean": "plaintiff" | "defendant" | "undecided",
    "leanConfidence": number,
    "persuasion": number,
    "thoughts": string,
    "citationAssessment": string,
    "nextChallenge": string
  }
}`;

const buildUserPrompt = (session: JudgeSession): string => {
	const { dossier } = session;
	const lang = dossier.language === 'fr'
		? 'LANGUE: Rédige "reply" ET tous les champs de "mind" en français.'
		: 'LANGUAGE: Write "reply" AND every field of "mind" in English.';
	return [
		lang,
		'',
		'CASE DOSSIER (the single source of truth):',
		renderDossier(dossier),
		'',
		'SOURCE PASSAGES (the ONLY authority you may cite):',
		renderPacket(dossier.sourcePacket),
		'',
		'HEARING TRANSCRIPT SO FAR:',
		renderTranscript(session),
		'',
		`LITIGANT'S CURRENT SUBMISSION:`,
		session.userTurn,
		'',
		'Return the JSON object now (reply + mind).'
	].join('\n');
};

// ─────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────

const extractJson = (raw: string): Record<string, unknown> => {
	const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start === -1 || end === -1) throw new Error('Judge returned no JSON object');
	return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
};

const clamp = (n: unknown, fallback: number): number => {
	const v = typeof n === 'number' ? n : Number(n);
	if (!Number.isFinite(v)) return fallback;
	return Math.max(0, Math.min(100, Math.round(v)));
};

const asLean = (v: unknown): JudgeMind['lean'] =>
	v === 'plaintiff' || v === 'defendant' ? v : 'undecided';

const parseMind = (raw: unknown): JudgeMind => {
	const m = (raw ?? {}) as Record<string, unknown>;
	return {
		lean: asLean(m.lean),
		leanConfidence: clamp(m.leanConfidence, 0),
		persuasion: clamp(m.persuasion, 0),
		thoughts: typeof m.thoughts === 'string' ? m.thoughts.trim() : '',
		citationAssessment: typeof m.citationAssessment === 'string' ? m.citationAssessment.trim() : '',
		nextChallenge: typeof m.nextChallenge === 'string' ? m.nextChallenge.trim() : ''
	};
};

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export const runJudgeTurn = async (session: JudgeSession): Promise<JudgeTurn> => {
	const packet = session.dossier.sourcePacket;

	const raw = await callLLM({
		task: 'bench',
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: buildUserPrompt(session),
		temperature: 0.5,
		jsonMode: true,
		maxTokens: 1400
	});

	const parsed = extractJson(raw);
	const reply = (typeof parsed.reply === 'string' ? parsed.reply : '').trim();
	const mind = parseMind(parsed.mind);

	// Verify every citation in the Judge's reply against the packet only.
	const verificationSources = packetToSources(packet);
	const validation = validateCitations({
		message: reply,
		sources: verificationSources,
		extractQuotes: true
	});

	const verifiedCitations = validation.citations;
	const refused = packet.passages.length === 0 || validation.unverifiedCount > validation.verifiedCount;

	return {
		speaker: session.dossier.language === 'fr' ? 'La Cour' : 'The Court',
		message: reply,
		citations: verifiedCitations.filter((c) => c.status === 'verified').map((c) => c.text),
		verifiedCitations,
		refused,
		mind
	};
};
