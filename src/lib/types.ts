export type LegalSource = {
	id: string;
	title: string;
	citation: string;
	summary: string;
};

export type CaseSummary = {
	id: string;
	title: string;
	jurisdiction: string;
	synopsis: string;
	complexity: 'Introductory' | 'Intermediate' | 'Advanced';
	sources: LegalSource[];
};

export type VerifiedCitation = {
	text: string;
	type: 'article' | 'section' | 'paragraph' | 'quote' | 'other';
	status: 'verified' | 'unverified';
	sourceId?: string;
	sourceTitle?: string;
	excerpt?: string;
};

export type DebateTurn = {
	role: 'litigant' | 'ai' | 'judge';
	speaker: string;
	message: string;
	timestamp: string;
	citations?: string[];
	verifiedCitations?: VerifiedCitation[];
};

export type CourtType = 'bench';

export type PackLanguage = 'en' | 'fr';

export type PackContext = {
	id?: string;
	name?: string;
	jurisdiction?: string;
	domain?: string;
	language?: PackLanguage;
	sourceLanguage?: PackLanguage;
	draftLanguage?: PackLanguage;
	hearingLanguage?: PackLanguage;
};

export type CaseStudioSourceUse = {
	title: string;
	citation?: string;
	reason: string;
};

export type SourceBundleExcerpt = {
	sourceId: string;
	sourceTitle: string;
	jurisdiction?: string;
	docType?: 'statute' | 'regulation' | 'case-law' | 'secondary';
	citation?: string;
	heading?: string;
	legalUnitId?: string;
	legalUnitKind?: 'article' | 'section' | 'chapter' | 'part' | 'division' | 'preamble' | 'paragraph';
	legalPath?: string[];
	legalStartOffset?: number;
	legalEndOffset?: number;
	legalStructureConfidence?: 'high' | 'medium' | 'low';
	excerpt: string;
	reason: string;
};

export type SourceBundle = {
	strategy: 'relevant-passages';
	createdAt: string;
	query: string;
	coverage: 'high' | 'medium' | 'low';
	excerptCount: number;
	sourceCount: number;
	tokenCount: number;
	excerpts: SourceBundleExcerpt[];
};

export type PackMemoryAuthority = {
	authorityId: string;
	sourceId?: string;
	sourceTitle: string;
	citation?: string;
	topic: string;
	role: 'main-rule' | 'definition' | 'exception' | 'defence' | 'procedure' | 'remedy' | 'case-law' | 'context' | 'other';
	relatedAuthorityIds: string[];
	relatedTerms: string[];
	retrievalNotes: string;
	verificationStatus: 'verified' | 'needs-review' | 'unverified';
};

export type PackMemoryTopic = {
	topic: string;
	authorityIds: string[];
	relatedTerms: string[];
	missingCoverage: string[];
	retrievalStrategy: string;
};

export type PackMemorySource = {
	sourceId: string;
	title: string;
	jurisdiction?: string;
	docType?: 'statute' | 'regulation' | 'case-law' | 'secondary';
	approxTokens: number;
	contentHash: string;
};

export type PackMemorySourceUnit = {
	unitId: string;
	kind: 'article' | 'section' | 'chapter' | 'part' | 'division' | 'preamble' | 'paragraph';
	citation?: string;
	heading: string;
	path: string[];
	preview: string;
	relatedTerms: string[];
	confidence: 'high' | 'medium' | 'low';
	tokenCount: number;
};

export type PackMemorySourceMap = {
	sourceId: string;
	title: string;
	mode: 'structured-legal' | 'paragraph-fallback';
	reliableForClassroom: boolean;
	qualityScore: number;
	coverageRatio: number;
	language: 'en' | 'fr' | 'mixed' | 'unknown';
	bilingualRisk: boolean;
	warnings: string[];
	units: PackMemorySourceUnit[];
};

export type PackMemory = {
	version: 'pack-memory-v1';
	packSignature: string;
	sourceFingerprint: string;
	generatedAt: string;
	language: PackLanguage;
	jurisdiction: string;
	sourceInventory: PackMemorySource[];
	sourceMaps?: PackMemorySourceMap[];
	summary: string;
	topics: PackMemoryTopic[];
	authorities: PackMemoryAuthority[];
	gaps: string[];
	safetyRules: string[];
};

export type GeminiSourceCache = {
	name: string;
	expiresAt?: string;
	tokenCount?: number;
};

export type EvidenceSufficiency = {
	canProceed: boolean;
	coverage: 'high' | 'medium' | 'low';
	mainRuleCovered: boolean;
	exceptionsCovered: boolean;
	counterArgumentsCovered: boolean;
	missingConcepts: string[];
	fetchMore: string[];
	reason: string;
};

export type CaseStudioGroundingStatus = 'source-grounded' | 'needs-review' | 'insufficient-sources';

export type CaseStudioGroundingMapItem = {
	area:
		| 'mainIssue'
		| 'plaintiffTheory'
		| 'defendantTheory'
		| 'judgePressurePoint'
		| 'successCriteria'
		| 'sourceBoundary'
		| 'other';
	claim: string;
	sourceTitle: string;
	citation?: string;
	excerpt?: string;
	status: 'grounded' | 'needs-review' | 'unsupported';
	note?: string;
};

export type CaseStudioGroundingAudit = {
	status: CaseStudioGroundingStatus;
	summary: string;
	warnings: string[];
	blockedReasons: string[];
	checks: {
		sourceTitlesVerified: boolean;
		citationsVerified: boolean;
		noOutsideProofRequired: boolean;
		judgeModeAligned: boolean;
		sourceBoundariesComplete: boolean;
		groundingMapComplete: boolean;
	};
	groundingMap: CaseStudioGroundingMapItem[];
};

export type JudgeModeFit = 'high' | 'medium' | 'low';

export type JudgeExerciseBrief = {
	goal: string;
	studentTask: string;
	hearingFocus: string;
	primarySkill: string;
	issuesToProbe: string[];
	pressurePoints: string[];
	sourceBoundaries: string[];
	successCriteria: string[];
};

export type ExercisePaperSnapshot = {
	title: string;
	level: 'introductory' | 'intermediate' | 'advanced';
	sourceLanguage?: PackLanguage;
	draftLanguage?: PackLanguage;
	hearingLanguage?: PackLanguage;
	objective: string;
	targetSkill: string;
	synopsis: string;
	issues: string;
	plaintiffPosition: string;
	defendantPosition: string;
	practicePoints: string[];
	recommendedRole: 'plaintiff' | 'defendant';
	selectedRole: 'plaintiff' | 'defendant';
	difficultyTrap?: string;
	sourcesUsed: CaseStudioSourceUse[];
	judgeBrief?: JudgeExerciseBrief;
	groundingAudit?: CaseStudioGroundingAudit;
	sourceBundle?: SourceBundle;
	packMemory?: PackMemory;
	evidenceSufficiency?: EvidenceSufficiency;
};

export type ExerciseDraftData = {
	title: string;
	synopsis: string;
	issues: string;
	remedy: string;
	objective: string;
	targetSkill: string;
	practicePoints: string[];
	judgeBrief: JudgeExerciseBrief | null;
	groundingAudit: CaseStudioGroundingAudit | null;
	defendantPosition: string;
	role: '' | 'plaintiff' | 'defendant';
	sources: string[];
	courtType: CourtType;
};

export type CaseStudioOption = {
	id: string;
	title: string;
	level: 'introductory' | 'intermediate' | 'advanced';
	objective: string;
	targetSkill: string;
	synopsis: string;
	issues: string;
	plaintiffPosition: string;
	defendantPosition: string;
	recommendedRole: 'plaintiff' | 'defendant';
	sourcesUsed: CaseStudioSourceUse[];
	practicePoints: string[];
	difficultyTrap: string;
	sourceWarnings: string[];
	judgeBrief: JudgeExerciseBrief;
	groundingAudit?: CaseStudioGroundingAudit;
	sourceBundle?: SourceBundle;
	packMemory?: PackMemory;
	evidenceSufficiency?: EvidenceSufficiency;
};

export type CaseStudioAnalysis = {
	understoodGoal: string;
	jurisdiction: string;
	sourceSummary: string;
	missingSources: string[];
	limits: string[];
	judgeModeFit: JudgeModeFit;
	judgeModeRationale: string;
	canGenerate: boolean;
	confidence: 'low' | 'medium' | 'high';
};

export type CaseStudioSourceDossier = {
	packSignature: string;
	generatedAt: string;
	jurisdiction: string;
	language: PackLanguage;
	sourceSummary: string;
	strengths: string[];
	limits: string[];
	missingCoverage: string[];
	supportedSkills: string[];
	exerciseDirections: string[];
	judgeModeFit: JudgeModeFit;
	judgeModeRationale: string;
	packMemory?: PackMemory;
	geminiCache?: GeminiSourceCache;
};

export type CaseStudioWorkflow = {
	stage: 'conversation' | 'source-reviewed' | 'draft-ready';
	sourceCount: number;
	nextStep: string;
};

export type CaseStudioResponse = {
	assistantMessage: string;
	analysis: CaseStudioAnalysis;
	dossier?: CaseStudioSourceDossier | null;
	draft: CaseStudioOption | null;
	alternatives: CaseStudioOption[];
	options: CaseStudioOption[];
	workflow: CaseStudioWorkflow;
};

export type SavedDraft = {
	id: string;
	title: string;
	draftData: ExerciseDraftData;
	selectedOption: CaseStudioOption;
	paperSnapshot: ExercisePaperSnapshot;
	analysis?: CaseStudioAnalysis;
	workflow?: CaseStudioWorkflow;
	packId?: string;
	packContext?: PackContext;
	createdAt: string;
	updatedAt: string;
};

export type SharedCase = {
	token: string;
	title: string;
	paperSnapshot: ExercisePaperSnapshot;
	packContext?: PackContext;
	createdAt: string;
	expiresAt?: string | null;
};

// ─────────────────────────────────────────────────────────
// Teacher assignments — frozen, source-bound dossiers handed
// to every student, with recorded hearings for review.
// ─────────────────────────────────────────────────────────

/** A frozen exercise capsule a student opens via a share link. */
export type Assignment = {
	token: string;
	title: string;
	instructions: string;
	language: 'en' | 'fr';
	/** The immutable CaseDossier every student argues — typed as unknown here to keep types.ts free of server contracts. */
	dossier: unknown;
	createdAt: string;
	expiresAt?: string | null;
};

/** Teacher-side row in the assignments roster (with submission count). */
export type AssignmentSummary = {
	token: string;
	title: string;
	instructions: string;
	language: 'en' | 'fr';
	status: string;
	submissionCount: number;
	createdAt: string;
};

/** One recorded student hearing. */
export type ExerciseSubmission = {
	id: string;
	token: string;
	studentName: string;
	studentEmail: string;
	role: 'plaintiff' | 'defendant';
	transcript: { role: 'litigant' | 'judge'; speaker: string; message: string }[];
	finalMind: unknown;
	turnCount: number;
	startedAt?: string | null;
	submittedAt: string;
};

/** Client-side context that marks the current hearing as an assigned exercise. */
export type AssignmentContext = {
	token: string;
	studentName: string;
	studentEmail: string;
	role: 'plaintiff' | 'defendant';
	instructions: string;
	startedAt: string;
};

export type JudgePacket = {
	version: 'judge-packet-v1';
	createdAt: string;
	paper: ExercisePaperSnapshot;
	sourcePacket?: SourceBundle;
	judgeBrief?: JudgeExerciseBrief;
	sourceBoundaries: string[];
	selectedRole: 'plaintiff' | 'defendant';
	language?: PackLanguage;
};

export type StagedCase = {
	id: string;
	title: string;
	synopsis: string;
	issues: string;
	remedy: string;
	objective?: string;
	targetSkill?: string;
	practicePoints?: string[];
	judgeBrief?: JudgeExerciseBrief;
	groundingAudit?: CaseStudioGroundingAudit;
	role: 'plaintiff' | 'defendant';
	sources: string[];
	packId?: string;
	packContext?: PackContext;
	paperSnapshot?: ExercisePaperSnapshot;
	judgePacket?: JudgePacket;
	courtType: CourtType;
	createdAt: string;
};
