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

export type DebateTurn = {
	role: 'litigant' | 'ai' | 'juror' | 'judge';
	speaker: string;
	message: string;
	timestamp: string;
	citations?: string[];
};

export type CourtType = 'jury' | 'bench';

export type StagedCase = {
	id: string;
	title: string;
	synopsis: string;
	issues: string;
	remedy: string;
	role: 'plaintiff' | 'defendant';
	sources: string[];
	courtType: CourtType;
	createdAt: string;
};

export type JurorTemperament = 
	| 'Skeptical Pragmatist'
	| 'Analytical Thinker'
	| 'Empathetic Listener'
	| 'Gut-Instinct'
	| 'Fair-Minded Moderator';

export type JurorPersona = {
	id: string;
	name: string;
	temperament: JurorTemperament;
	biasVector: string;
	description: string;
	signatureMove: string;
};

export type VerdictScore = {
	jurorId: string;
	stance: 'plaintiff' | 'defense' | 'hung';
	score: number;
	rationale: string;
	metrics?: {
		logic: number;
		sources: number;
		tone: number;
	};
};
