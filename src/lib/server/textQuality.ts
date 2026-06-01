/**
 * Text-quality validator for ingested legal documents.
 *
 * After a PDF / DOCX / TXT has been parsed, the raw text can be:
 *   - empty (corrupted file, image-only PDF with no OCR);
 *   - tiny but non-empty (a few page numbers, header garbage);
 *   - long but meaningless (whitespace, repeated form-feed characters, OCR
 *     noise, "Page 1 / Page 2 / Page 3" repeated);
 *   - genuinely useful legal text.
 *
 * Letting the last three categories through means storing garbage in
 * `document_chunks`, sending garbage to Claude, and watching Claude hallucinate
 * to compensate. We refuse them at ingest time with a precise reason so the
 * user knows exactly what to fix (re-export, run OCR, paste the text manually).
 *
 * This module is pure (no I/O) and deliberately conservative: it is better to
 * occasionally reject a valid-but-unusual document (recoverable — the user
 * pastes the text in a different way) than to accept garbage (unrecoverable
 * trust damage when the AI starts inventing citations on top of noise).
 */

export type TextQualityReason =
	| 'empty'
	| 'too-short'
	| 'no-sentence-structure'
	| 'too-few-words'
	| 'mostly-formatting'
	| 'looks-scanned';

export type TextQualityResult =
	| { valid: true }
	| { valid: false; reason: TextQualityReason; hint: string };

const MIN_LENGTH = 80; // chars after normalisation
const MIN_LONG_WORDS = 12; // words of 4+ letters
const MIN_CONTENT_RATIO = 0.45; // alphanum chars / total
const MIN_SENTENCE_PUNCT = 2; // sentence-ending punctuation marks

const HINTS: Record<TextQualityReason, string> = {
	empty:
		'No text could be extracted. The file is likely a scanned image or corrupted. Run OCR (e.g. with Adobe Acrobat, ABBYY, or `ocrmypdf`) and re-upload, or paste the text manually.',
	'too-short':
		'Only a handful of characters were extracted — usually a sign of a scanned PDF without a text layer. Run OCR and re-upload, or paste the relevant articles directly.',
	'no-sentence-structure':
		'The extracted text has no sentence punctuation. It looks like page numbers, headers, or formatting noise rather than legal prose. Re-export the document or paste the text manually.',
	'too-few-words':
		'Almost no real words were detected. The file may be image-based or formatting-only. Run OCR or paste the text manually.',
	'mostly-formatting':
		'The extracted content is overwhelmingly whitespace, punctuation, or symbols. Re-export the file (text-based PDF, not scanned) or paste the relevant excerpts manually.',
	'looks-scanned':
		'This document looks like a scanned image — the extractor returned mostly noise (single characters, isolated digits, page markers). OCR the PDF first, or paste the text manually.'
};

/**
 * Heuristic detection of "this PDF was scanned, the extractor returned junk":
 *   - very low ratio of alphabetic chars to total length;
 *   - or very few multi-letter words despite the text being long.
 */
const looksScanned = (text: string): boolean => {
	const alpha = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)?.length ?? 0;
	if (text.length >= 200 && alpha / text.length < 0.30) return true;
	const longWords = text.match(/\b[A-Za-zÀ-ÖØ-öø-ÿ]{4,}\b/g)?.length ?? 0;
	if (text.length >= 400 && longWords < 30) return true;
	return false;
};

export const validateExtractedText = (raw: string): TextQualityResult => {
	const text = (raw ?? '').trim();
	if (!text) return { valid: false, reason: 'empty', hint: HINTS.empty };
	if (text.length < MIN_LENGTH) {
		return { valid: false, reason: 'too-short', hint: HINTS['too-short'] };
	}

	if (looksScanned(text)) {
		return { valid: false, reason: 'looks-scanned', hint: HINTS['looks-scanned'] };
	}

	const sentencePunct = (text.match(/[.!?](\s|$)/g) ?? []).length;
	if (sentencePunct < MIN_SENTENCE_PUNCT) {
		return {
			valid: false,
			reason: 'no-sentence-structure',
			hint: HINTS['no-sentence-structure']
		};
	}

	const longWords = (text.match(/\b[A-Za-zÀ-ÖØ-öø-ÿ]{4,}\b/g) ?? []).length;
	if (longWords < MIN_LONG_WORDS) {
		return { valid: false, reason: 'too-few-words', hint: HINTS['too-few-words'] };
	}

	const contentChars = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g) ?? []).length;
	if (contentChars / text.length < MIN_CONTENT_RATIO) {
		return { valid: false, reason: 'mostly-formatting', hint: HINTS['mostly-formatting'] };
	}

	return { valid: true };
};

export const formatExtractionError = (result: Extract<TextQualityResult, { valid: false }>): string =>
	`Could not use this file: ${result.hint}`;
