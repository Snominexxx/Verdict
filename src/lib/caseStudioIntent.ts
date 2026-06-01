export type CaseStudioMode = 'chat' | 'build';

export type CaseStudioIntentSignal =
	| 'explicit-build'
	| 'pack-build-request'
	| 'reset-build'
	| 'approval-build'
	| 'revision-build'
	| 'direct-source-request'
	| 'judge-exercise-question'
	| 'grounded-draft-followup'
	| 'product-meta-question';

export type CaseStudioIntent = {
	mode: CaseStudioMode;
	sourceBound: boolean;
	signals: CaseStudioIntentSignal[];
};

type CaseStudioIntentContext = {
	hasSelectedSources?: boolean;
	hasGroundedDraft?: boolean;
};

const buildIntentVerbPattern = /(?:draft|create|generate|build|write|prepare|make|turn|revise|rewrite|update|refine|adapt|rework|switch|convert|transform|add|remove|delete|keep|focus|avoid|exclude|shorten|lengthen|strengthen|weaken|harder|easier|simplify|complicate|r[ee]dige|cr[ee]e|g[ee]n[ee]re|construis|pr[ee]pare|transforme|ajoute|retire|supprime|garde|conserve|axe|evite|exclus|raccourcis|allonge|renforce|affaiblis|mets? a jour|met a jour|r[ee]vise|adapte|simplifie|complique|durcis)/i;

const buildIntentObjectPattern = /(?:case|exercise|scenario|pack|hearing|draft|paper|document|facts|issue|question|judge|source|article|position|role|difficulty|level|brief|student|practice|cas|exercice|sc[ee]nario|dossier|projet|papier|faits?|juge|source|article|position|r[oo]le|difficult[ee]|niveau|audience|memo|m[ée]moire|etudiant|eleve|pratique)/i;

const revisionIntentPattern = /(?:add|remove|delete|keep|focus|avoid|exclude|same facts|same scenario|stronger|weaker|more|less|shorter|longer|switch|rewrite|revise|update|refine|adapt|change|simplify|complicate|harder|easier|ajoute|retire|supprime|garde|conserve|m[ee]mes? faits?|m[ee]me sc[ee]nario|renforce|affaiblis|plus|moins|raccourcis|allonge|durcis|simplifie|adapte|change|mets? a jour|met a jour|r[ee]vise)/i;

const directSourceIntentPattern = /\b(read|review|verify|check|supported|analy[sz]e|summari[sz]e|extract|scan|use|using|based\s+on|from\s+(?:my|the|selected)?\s*(?:sources|documents)|lire|verifie|verifier|confirme|confirmer|soutiennent|analyse|analyser|resume|resumer|extraire|utilise|utiliser|a\s+partir\s+des?\s+(?:mes|les)?\s*(?:sources|documents))\b/i;

const buildActionPattern = /(?:create|generate|build|draft|write|prepare|make|give|show|propose|suggest|turn|revise|rewrite|update|refine|adapt|rework|switch|convert|transform|fais(?:-moi)?|donne(?:-moi)?|propose(?:-moi)?|pr[ée]pare(?:-moi)?|cr[ée]e(?:-moi)?|g[ée]n[ée]re(?:-moi)?|r[ée]dige(?:-moi)?|construis(?:-moi)?|monte(?:-moi)?|sors(?:-moi)?)/i;
const directExerciseNeedPattern = /(?:\bi\s+(?:need|want)\b[^.!?\n]{0,80}\b(?:exercise|case|scenario|pack|hearing|draft|paper|brief)\b|\bj['’]?ai\s+besoin\b[^.!?\n]{0,80}\b(?:exercice|cas|sc[ée]nario|dossier|audience|projet|papier|m[ée]moire)\b|\bje\s+veux\b[^.!?\n]{0,80}\b(?:exercice|cas|sc[ée]nario|dossier|audience|projet|papier|m[ée]moire)\b)/i;

const judgeModePattern = /(?:judge\s*mode|mode\s*juge|judge-led|bench|moot|juge|hearing|audience)/i;
const exerciseSurfacePattern = /(?:exercise|case|scenario|pack|hearing|draft|paper|brief|student|practice|argument|plaintiff|defendant|exercice|cas|sc[éee]nario|dossier|papier|etudiant|eleve|prati(?:ce|quer)|demandeur|defendeur|argumentation)/i;
const fitAssessmentPattern = /(?:fit|fits|fitting|suited|suitable|support|supports|supported|work|works|working|viable|appropriate|aligned|honest|good\s+choice|convient|adapter?|adapt[ée]e?|compatible|soutient|appuie|marche|jouable|coherent)/i;
const questionPattern = /(?:\bcan\b|\bcould\b|\bwould\b|\bshould\b|\bdoes\b|\bdo\b|\bis\b|\bwill\b|\bhow\b|\bwhat\b|\bwhich\b|\bwhy\b|\bpeut\b|\bpourrait\b|\bdoit\b|\bfaut\b|\bcomment\b|\bquoi\b|\bquel(?:le|s)?\b|\bpourquoi\b|\best-ce\b)/i;
const productMetaPattern = /(?:who\s+are\s+you|what\s+can\s+you\s+do|what\s+is\s+create|what\s+is\s+judge\s*mode|how\s+does(?:\s+create|\s+judge\s*mode|\s+this)?\s+work|help\s+me\s+understand|qui\s+es[- ]?tu|que\s+peux[- ]?tu\s+faire|qu['’ ]?est[- ]ce\s+que\s+create|qu['’ ]?est[- ]ce\s+que\s+le\s+mode\s+juge|comment\s+(?:ca|cela|create|le\s+mode\s+juge)\s+marche)/i;
const approvalBuildPattern = /^(?:yes|yeah|yep|ok(?:ay)?|sure|please\s+do|go|go\s+ahead|start|begin|continue|proceed|do\s+it|launch\s+it|let'?s\s+do\s+it|yes[,\s]+go\s+ahead|yes[,\s]+start|oui|ouais|d['’]?accord|vas[- ]?y|allez[- ]?y|on\s+y\s+va|commence|commencer|continue|lance|lance[- ]?le|fais[- ]?le|fait[- ]?le|tu\s+peux\s+y\s+aller|tu\s+peux\s+commencer|oui[,\s]+tu\s+peux\s+y\s+aller|oui[,\s]+tu\s+peux\s+commencer)\s*[.!?]*$/i;
const resetBuildPattern = /(?:\b(?:new|another|fresh)\s+(?:case|exercise|scenario|draft|paper)\b|\bnew\s+one\b|\banother\s+one\b|\bstart\s+over\b|\bbegin\s+again\b|\bfrom\s+scratch\b|\brestart\b|\bforget\b[^.!?\n]{0,60}\b(?:draft|case|exercise|scenario|paper|one|that)\b|\bsame\s+(?:code|pack|sources?)\b[^.!?\n]{0,60}\b(?:but|now)\b|\bnouveau\s+(?:cas|exercice|scenario|brouillon|papier)\b|\bun\s+autre\s+(?:cas|exercice|scenario|brouillon|papier)\b|\bon\s+repart\b|\brecommence\b|\bde\s+zero\b|\ba\s+zero\b|\boublie\b[^.!?\n]{0,60}\b(?:cas|exercice|brouillon|papier|precedent|pr[eé]c[eé]dent)\b|\bmeme\s+(?:code|pack|sources?)\b[^.!?\n]{0,60}\b(?:mais|maintenant)\b)/i;

const looksLikeExerciseBuildRequest = (input: string): boolean =>
	exerciseSurfacePattern.test(input) && (buildActionPattern.test(input) || directExerciseNeedPattern.test(input));

const looksLikeJudgeExerciseQuestion = (input: string): boolean => {
	const mentionsJudgeOrExercise = judgeModePattern.test(input) || exerciseSurfacePattern.test(input);
	if (!mentionsJudgeOrExercise) return false;
	if (looksLikeExerciseBuildRequest(input)) return false;
	return fitAssessmentPattern.test(input) || questionPattern.test(input) || directSourceIntentPattern.test(input);
};

export const classifyCaseStudioIntent = (
	input: string,
	context: CaseStudioIntentContext = {}
): CaseStudioIntent => {
	const trimmed = input.trim();
	if (!trimmed) {
		return { mode: 'chat', sourceBound: false, signals: [] };
	}

	const productMetaQuestion = productMetaPattern.test(trimmed);
	const words = trimmed.split(/\s+/).filter(Boolean);
	const approvalBuild = Boolean(context.hasSelectedSources || context.hasGroundedDraft) && approvalBuildPattern.test(trimmed);
	const resetBuild = Boolean(context.hasGroundedDraft) && resetBuildPattern.test(trimmed);
	const revisionBuild = Boolean(context.hasGroundedDraft) && !resetBuild && revisionIntentPattern.test(trimmed);
	const directSourceRequest = directSourceIntentPattern.test(trimmed);
	const judgeExerciseQuestion = looksLikeJudgeExerciseQuestion(trimmed);
	const explicitBuild = buildIntentVerbPattern.test(trimmed) && (buildIntentObjectPattern.test(trimmed) || Boolean(context.hasGroundedDraft));
	const packBuildRequest = Boolean(context.hasSelectedSources)
		&& !productMetaQuestion
		&& !directSourceRequest
		&& !judgeExerciseQuestion
		&& (
			looksLikeExerciseBuildRequest(trimmed)
			|| (exerciseSurfacePattern.test(trimmed) && words.length <= 4)
		);
	const groundedDraftFollowup = Boolean(context.hasGroundedDraft) && !productMetaQuestion;
	const mode: CaseStudioMode = explicitBuild || packBuildRequest || resetBuild || approvalBuild || revisionBuild ? 'build' : 'chat';
	const signals: CaseStudioIntentSignal[] = [];

	if (explicitBuild) signals.push('explicit-build');
	if (packBuildRequest) signals.push('pack-build-request');
	if (resetBuild) signals.push('reset-build');
	if (approvalBuild) signals.push('approval-build');
	if (revisionBuild) signals.push('revision-build');
	if (directSourceRequest) signals.push('direct-source-request');
	if (judgeExerciseQuestion) signals.push('judge-exercise-question');
	if (groundedDraftFollowup) signals.push('grounded-draft-followup');
	if (productMetaQuestion) signals.push('product-meta-question');

	const sourceBound = mode === 'build' || (
		Boolean(context.hasSelectedSources) && (
			directSourceRequest ||
			judgeExerciseQuestion ||
			groundedDraftFollowup
		)
	);

	return { mode, sourceBound, signals };
};