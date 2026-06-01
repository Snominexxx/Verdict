/**
 * Validator for manually-entered case input.
 *
 * The case form is the single biggest free-text surface the user controls
 * before it lands in an LLM prompt. Two failure modes matter:
 *
 *   1. Garbage in, garbage out. A 4-character "test" synopsis cannot produce
 *      a meaningful debate; the AI will hallucinate facts to fill the void.
 *      We refuse anything below a minimum length per field, and cap the
 *      maximum to keep prompt budgets stable.
 *
 *   2. Prompt-injection breakout. A user (or someone pasting hostile text)
 *      could try to inject `\`\`\`` fences, role markers, or
 *      "ignore previous instructions". We do not whitelist content — we
 *      neutralise the few characters that can actually break out of a
 *      JSON-encoded string passed to the model. Triple-backticks are the
 *      main breakout vector for fenced code; we replace them with a
 *      visually-similar but inert sequence.
 *
 * Rules are deliberately conservative. Better to bounce a borderline-empty
 * case (recoverable: user adds detail) than to ship an empty case to the AI.
 */

export type CaseFieldName = 'title' | 'synopsis' | 'issues' | 'remedy' | 'defendantPosition';

type LengthRule = { min: number; max: number };

const RULES: Record<CaseFieldName, LengthRule> = {
	title: { min: 5, max: 150 },
	synopsis: { min: 50, max: 5_000 },
	issues: { min: 10, max: 3_000 },
	remedy: { min: 5, max: 1_500 },
	defendantPosition: { min: 5, max: 1_500 }
};

const FIELD_LABEL: Record<CaseFieldName, string> = {
	title: 'Case title',
	synopsis: 'Synopsis',
	issues: 'Legal issues',
	remedy: 'Requested remedy',
	defendantPosition: 'Defendant position'
};

export class CaseValidationError extends Error {
	readonly field: CaseFieldName;
	constructor(field: CaseFieldName, message: string) {
		super(message);
		this.field = field;
		this.name = 'CaseValidationError';
	}
}

/**
 * Length-check + trim a single field. Throws `CaseValidationError` with a
 * clear, user-facing message; the caller maps it to HTTP 400.
 */
export const validateField = (field: CaseFieldName, raw: unknown): string => {
	const value = String(raw ?? '').trim();
	const rule = RULES[field];
	const label = FIELD_LABEL[field];

	if (value.length === 0) {
		throw new CaseValidationError(field, `${label} is required.`);
	}
	if (value.length < rule.min) {
		throw new CaseValidationError(
			field,
			`${label} is too short (${value.length} chars). Provide at least ${rule.min} characters so the AI has enough context to reason without inventing facts.`
		);
	}
	if (value.length > rule.max) {
		throw new CaseValidationError(
			field,
			`${label} is too long (${value.length} chars). Keep it under ${rule.max.toLocaleString()} characters.`
		);
	}

	return value;
};

/**
 * Neutralise prompt-injection vectors without altering the meaning of the
 * text. We do NOT remove or rewrite content — we only defang sequences that
 * could break out of the prompt envelope:
 *   - triple-backticks (`\`\`\``) → replaced with three FULLWIDTH GRAVE marks,
 *     visually identical to humans, inert to markdown-fence parsers;
 *   - leading "system:" / "assistant:" role markers on their own line are
 *     left intact (the model is instructed to treat the case block as data),
 *     but we DO collapse runs of more than 6 consecutive newlines, which are
 *     sometimes used to hide trailing instructions in pastes.
 */
export const sanitiseUserText = (value: string): string =>
	value
		.replace(/```/g, '\uFF40\uFF40\uFF40') // FULLWIDTH GRAVE ACCENT × 3
		.replace(/\n{7,}/g, '\n\n\n\n\n\n');

export type ValidatedCasePayload = {
	title: string;
	synopsis: string;
	issues: string;
	remedy: string;
	defendantPosition?: string;
};

/**
 * Validate + sanitise every required text field in a single pass. Throws on
 * the first failing field so the user gets one clear error at a time.
 */
export const validateCasePayload = (input: {
	title: unknown;
	synopsis: unknown;
	issues: unknown;
	remedy: unknown;
	defendantPosition?: unknown;
}): ValidatedCasePayload => {
	const out: ValidatedCasePayload = {
		title: sanitiseUserText(validateField('title', input.title)),
		synopsis: sanitiseUserText(validateField('synopsis', input.synopsis)),
		issues: sanitiseUserText(validateField('issues', input.issues)),
		remedy: sanitiseUserText(validateField('remedy', input.remedy))
	};
	if (input.defendantPosition !== undefined && input.defendantPosition !== '') {
		out.defendantPosition = sanitiseUserText(
			validateField('defendantPosition', input.defendantPosition)
		);
	}
	return out;
};
