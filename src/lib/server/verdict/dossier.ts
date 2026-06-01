/**
 * Verdict v2 — Dossier builder.
 *
 * Turns an `IntentPlan` + verified `SourcePacket` into the ONE source of
 * truth: a `CaseDossier`. The LLM is given ONLY the retrieved passages and is
 * forbidden from inventing law. Every citation it returns is re-verified
 * against the packet with the existing citation validator; anything that does
 * not actually appear in the sources is dropped and recorded as a warning.
 */

import type { LibraryDocument } from '$lib/data/library';
import type {
	CaseDossier,
	IntentPlan,
	LitigantRole,
	SourcePacket,
	VerdictLanguage
} from '$lib/verdict/contracts';
import { callLLM } from '../providers';
import { validateCitations } from '../citationValidator';

export type BuildDossierArgs = {
	intent: IntentPlan;
	packet: SourcePacket;
	sourceIds: string[];
	packId?: string;
	/** Preferred litigant role for the exercise. Defaults to plaintiff. */
	selectedRole?: LitigantRole;
};

// ─────────────────────────────────────────────────────────
// Packet → prompt + verification material
// ─────────────────────────────────────────────────────────

/** Materialize packet passages into LibraryDocument-shaped records for the validator. */
const packetToSources = (packet: SourcePacket): LibraryDocument[] => {
	const bySource = new Map<string, { title: string; chunks: string[] }>();
	for (const p of packet.passages) {
		const entry = bySource.get(p.sourceId) ?? { title: p.sourceTitle, chunks: [] };
		const piece = [p.heading, p.citation, p.text].filter(Boolean).join('\n');
		entry.chunks.push(piece);
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
	if (!packet.passages.length) return '(no source passages were retrieved)';
	return packet.passages
		.map((p, i) => {
			const head = [p.sourceTitle, p.citation, p.heading].filter(Boolean).join(' — ');
			return `[S${i + 1}] ${head}\n${p.text}`;
		})
		.join('\n\n');
};

const LANGUAGE_BLOCK = (language: VerdictLanguage): string =>
	language === 'fr'
		? 'LANGUE: Rédige TOUT le contenu du dossier en français.'
		: 'LANGUAGE: Write ALL dossier content in English.';

// ─────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Verdict's case architect. You build a single, self-consistent legal exercise (a "dossier") for a litigation training simulator. The dossier is PEDAGOGIC: the learner will step into the hearing and be tested by a Judge on whether they can turn the theory in the sources into practice.

NON-NEGOTIABLE RULES (this is law — truth and authenticity matter):
1. You may ONLY rely on the SOURCE PASSAGES provided. Never invent statutes, articles, cases, or quotes.
2. Every legal citation you include MUST appear verbatim in the SOURCE PASSAGES. If you are unsure, omit it.
3. If the passages do not support a full case on the requested topic, say so honestly in "warnings" and build the most defensible partial exercise from what IS supported.
4. Facts may be hypothetical, but the LEGAL FRAMEWORK (articles/rules invoked) must come only from the passages, and the facts must be REALISTIC and consistent with the materials.
5. Do not contradict the source text.

PEDAGOGIC DESIGN:
6. Choose the litigant role ("plaintiff" or "defendant") that gives the BEST learning exercise for the user's request and the available authority — put it in "selectedRole". Build the facts and positions so that side has a genuine, arguable (not trivial, not hopeless) case to defend before the Judge.
7. "objective" MUST be a concrete, testable goal the learner will be assessed on in the hearing (e.g. "Prove the defendant's fault under art. 1457 caused the plaintiff's damage"). It is the bridge from theory to practice.

Return ONLY valid JSON matching the requested schema. No prose outside the JSON.`;

const buildUserPrompt = (args: BuildDossierArgs): string => {
	const { intent, packet } = args;
	const mandatory = intent.targets.filter((t) => t.mandatory).map((t) => t.raw);
	return [
		LANGUAGE_BLOCK(intent.language),
		'',
		`USER REQUEST:\n${intent.rawRequest}`,
		'',
		mandatory.length
			? `MUST BE GROUNDED IN (the user explicitly named these): ${mandatory.join(', ')}`
			: 'No specific authority was named; ground the case in the most relevant passages below.',
		packet.missingTargets.length
			? `NOT FOUND IN SOURCES (be honest about these in "warnings", do not fabricate them): ${packet.missingTargets.join(', ')}`
			: '',
		'',
		'SOURCE PASSAGES (the ONLY authority you may use):',
		renderPacket(packet),
		'',
		'Produce a JSON object with exactly these fields:',
		`{
  "title": string,
  "facts": string,                // 1-3 short paragraphs of stipulated, realistic facts
  "issues": string[],             // 1-4 legal issues in dispute
  "plaintiffPosition": string,
  "defendantPosition": string,
  "remedySought": string,
  "selectedRole": "plaintiff" | "defendant",  // the side the learner will argue (you choose the best teaching role)
  "objective": string,            // the concrete, testable goal the learner must achieve in the hearing
  "targetSkill": string,          // e.g. "oral argument on causation"
  "practicePoints": string[],     // 2-5 concrete coaching cues
  "citationsUsed": string[],      // every legal reference used, EXACTLY as written in the passages
  "sourceBoundaries": string[],   // what the sources DO and DO NOT cover
  "warnings": string[]            // honest gaps; [] if none
}`
	]
		.filter((l) => l !== '')
		.join('\n');
};

// ─────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────

const extractJson = (raw: string): Record<string, unknown> => {
	const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start === -1 || end === -1) throw new Error('Dossier LLM returned no JSON object');
	return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
};

const asString = (v: unknown, fallback = ''): string =>
	typeof v === 'string' ? v.trim() : fallback;

const asStringArray = (v: unknown): string[] =>
	Array.isArray(v) ? v.map((x) => asString(x)).filter(Boolean) : [];

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export const buildDossier = async (args: BuildDossierArgs): Promise<CaseDossier> => {
	const { intent, packet } = args;
	const fallbackRole: LitigantRole = args.selectedRole ?? 'plaintiff';

	const raw = await callLLM({
		task: 'create-dossier',
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: buildUserPrompt(args),
		temperature: 0.4,
		jsonMode: true,
		maxTokens: 4000
	});

	const parsed = extractJson(raw);

	// The AI picks the role that makes the best teaching exercise; fall back if absent.
	const selectedRole: LitigantRole = parsed.selectedRole === 'defendant'
		? 'defendant'
		: parsed.selectedRole === 'plaintiff'
			? 'plaintiff'
			: fallbackRole;

	// Verify every citation the model claims to have used against the packet only.
	const verificationSources = packetToSources(packet);
	const declared = asStringArray(parsed.citationsUsed);
	const factsText = asString(parsed.facts);
	const issuesText = asStringArray(parsed.issues).join('\n');
	const positions = `${asString(parsed.plaintiffPosition)}\n${asString(parsed.defendantPosition)}`;
	const validation = validateCitations({
		message: `${declared.join('\n')}\n${factsText}\n${issuesText}\n${positions}`,
		declaredCitations: declared,
		sources: verificationSources,
		extractQuotes: false
	});

	const verifiedCitations = validation.citations.filter((c) => c.status === 'verified');
	const unverified = validation.citations.filter((c) => c.status === 'unverified');

	const warnings = asStringArray(parsed.warnings);
	if (packet.missingTargets.length) {
		warnings.push(
			intent.language === 'fr'
				? `Introuvable dans les sources fournies: ${packet.missingTargets.join(', ')}.`
				: `Not found in the provided sources: ${packet.missingTargets.join(', ')}.`
		);
	}
	if (unverified.length) {
		warnings.push(
			intent.language === 'fr'
				? `Références non vérifiées et donc retirées: ${unverified.map((c) => c.text).join(', ')}.`
				: `References that could not be verified were removed: ${unverified.map((c) => c.text).join(', ')}.`
		);
	}

	const grounded = verifiedCitations.length > 0 && packet.passages.length > 0;

	return {
		version: 'verdict-dossier-v1',
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		language: intent.language,
		userRequest: intent.rawRequest,
		title: asString(parsed.title, intent.language === 'fr' ? 'Exercice juridique' : 'Legal exercise'),
		facts: factsText,
		issues: asStringArray(parsed.issues),
		selectedRole,
		plaintiffPosition: asString(parsed.plaintiffPosition),
		defendantPosition: asString(parsed.defendantPosition),
		remedySought: asString(parsed.remedySought),
		objective: asString(parsed.objective),
		targetSkill: asString(parsed.targetSkill),
		practicePoints: asStringArray(parsed.practicePoints),
		sourceIds: args.sourceIds,
		packId: args.packId,
		sourcePacket: packet,
		citationsUsed: verifiedCitations,
		sourceBoundaries: asStringArray(parsed.sourceBoundaries),
		grounded,
		warnings: [...new Set(warnings)]
	};
};
