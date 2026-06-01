/**
 * Verdict v2 — Core contracts.
 *
 * The whole engine has ONE source of truth: the `CaseDossier`. Everything the
 * Judge ever sees is derived from it. Nothing in the legal reasoning may exist
 * outside what was retrieved from the user's uploaded sources — truth,
 * authenticity and source-boundedness are non-negotiable.
 *
 * Pipeline:
 *   userRequest → IntentPlan → SourcePacket → CaseDossier → JudgeSession → JudgeTurn
 *
 * This file is shared (no server-only imports) so it can be used by the UI,
 * the server engine and the tests alike.
 */

import type { VerifiedCitation } from '$lib/types';

export type VerdictLanguage = 'en' | 'fr';

export type LitigantRole = 'plaintiff' | 'defendant';

// ─────────────────────────────────────────────────────────
// 1. Intent — what the user actually asked for
// ─────────────────────────────────────────────────────────

/** A single thing the user wants the engine to ground itself in. */
export type RetrievalTarget = {
	kind: 'citation' | 'concept' | 'page' | 'title';
	/** Normalized, comparable value, e.g. "1457", "bonne foi". */
	value: string;
	/** As the user wrote it, e.g. "l'article 1457". */
	raw: string;
	/** Hard constraint (must be retrieved or we say why not) vs soft hint. */
	mandatory: boolean;
};

export type IntentPlan = {
	rawRequest: string;
	language: VerdictLanguage;
	/** Conversation vs. produce a full case. */
	action: 'chat' | 'build';
	/** True when the request is bound to the user's uploaded sources. */
	sourceBound: boolean;
	targets: RetrievalTarget[];
	/** Convenience view: normalized canonical citation values. */
	citations: string[];
	/** Convenience view: legal/concept terms to search for. */
	concepts: string[];
};

// ─────────────────────────────────────────────────────────
// 2. SourcePacket — verified, retrieved authority
// ─────────────────────────────────────────────────────────

export type SourcePassage = {
	sourceId: string;
	sourceTitle: string;
	citation?: string;
	heading?: string;
	text: string;
	/** True when this passage was pulled because another retrieved passage referenced it (1-hop cross-reference). */
	crossReferenced?: boolean;
};

/**
 * A retrieval plan produced by the AI planner. The planner decides WHAT to
 * search for in the user's sources — it never states, interprets or invents
 * law. The plan only guides the deterministic retriever.
 */
export type RetrievalPlan = {
	/** Exact article/section numbers to pull (e.g. "1457"). */
	citations: string[];
	/** Legal-topic phrases to search for when the request is conceptual. */
	concepts: string[];
	/** One short sentence on why these targets — for logging, never shown as law. */
	rationale: string;
};

export type SourcePacket = {
	version: 'verdict-packet-v1';
	createdAt: string;
	query: string;
	passages: SourcePassage[];
	/** Mandatory targets that were actually found in the retrieved passages. */
	satisfiedTargets: string[];
	/** Mandatory targets demanded but NOT found — surfaced honestly, never faked. */
	missingTargets: string[];
	coverage: 'high' | 'medium' | 'low' | 'empty';
};

// ─────────────────────────────────────────────────────────
// 3. CaseDossier — the single source of truth
// ─────────────────────────────────────────────────────────

export type CaseDossier = {
	version: 'verdict-dossier-v1';
	id: string;
	createdAt: string;
	language: VerdictLanguage;

	/** Provenance: exactly what the user asked for. */
	userRequest: string;

	// The case itself
	title: string;
	facts: string;
	issues: string[];
	selectedRole: LitigantRole;
	plaintiffPosition: string;
	defendantPosition: string;
	remedySought: string;

	// Pedagogy
	objective: string;
	targetSkill: string;
	practicePoints: string[];

	// Grounding
	sourceIds: string[];
	packId?: string;
	sourcePacket: SourcePacket;
	/** Citations referenced by the dossier — every one verified against the packet. */
	citationsUsed: VerifiedCitation[];
	/** What the sources do and do not cover. */
	sourceBoundaries: string[];

	/** True only when the case is anchored in retrieved authority. */
	grounded: boolean;
	/** Honest notes about gaps, missing sources, or assumptions. */
	warnings: string[];
};

// ─────────────────────────────────────────────────────────
// 4. JudgeSession / JudgeTurn — the hearing
// ─────────────────────────────────────────────────────────

export type JudgeTranscriptEntry = {
	role: 'litigant' | 'judge';
	speaker: string;
	message: string;
};

export type JudgeSession = {
	dossier: CaseDossier;
	transcript: JudgeTranscriptEntry[];
	/** The litigant's current submission the Judge must respond to. */
	userTurn: string;
};

/**
 * The Judge's private reasoning — an honest, source-bound read of where the
 * bench currently stands. Surfaced in the hearing UI so the litigant can see
 * how their argument is landing. Always grounded in the dossier, its goal, and
 * the verified source passages — never invented sympathy.
 */
export type JudgeMind = {
	/** Which side the bench currently favours on the merits. */
	lean: 'plaintiff' | 'defendant' | 'undecided';
	/** 0–100: how strongly the bench leans toward `lean`. */
	leanConfidence: number;
	/** 0–100: how convinced the bench is by the litigant's case so far. */
	persuasion: number;
	/** Short private monologue about the latest submission. */
	thoughts: string;
	/** Whether the authority the litigant relied on actually supports them. */
	citationAssessment: string;
	/** What the bench still needs addressed to be moved. */
	nextChallenge: string;
};

export type JudgeTurn = {
	speaker: string;
	message: string;
	citations: string[];
	verifiedCitations: VerifiedCitation[];
	/** Set when the Judge had to refuse because support was missing from the packet. */
	refused: boolean;
	/** The bench's live, source-bound state of mind after this turn. */
	mind: JudgeMind;
};

// ─────────────────────────────────────────────────────────
// 5. Create studio chat — free conversation before the build
// ─────────────────────────────────────────────────────────

export type CreateChatMessage = {
	role: 'user' | 'assistant';
	content: string;
};

export type CreateChatResult = {
	/** The assistant's conversational reply, grounded in the user's sources. */
	reply: string;
	/** True when enough is settled to produce a dossier. */
	readyToBuild: boolean;
	/** A distilled, self-contained build request — set when readyToBuild. */
	buildRequest: string;
	/** The role the conversation points to, if any. */
	suggestedRole?: LitigantRole;
};
