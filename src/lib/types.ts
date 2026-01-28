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
	role: 'litigant' | 'ai' | 'juror';
	speaker: string;
	message: string;
	timestamp: string;
	citations?: string[];
};

export type StagedCase = {
	id: string;
	title: string;
	synopsis: string;
	issues: string;
	remedy: string;
	role: 'plaintiff' | 'defendant';
	sources: string[];
	createdAt: string;
};

export type JurorPersona = {
	id: string;
	name: string;
	temperament: 'Textualist' | 'Pragmatist' | 'Rights-First' | 'Strict Constructionist' | 'Equity-Minded';
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
