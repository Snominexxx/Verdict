import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { storeChunksOnly } from '$lib/server/rag';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';
import { validateExtractedText, formatExtractionError } from '$lib/server/textQuality';

const MAX_TEXT_LENGTH = 4_000_000; // ~4 MB per request (stays under Netlify 6 MB body limit with JSON overhead)

const detectJurisdiction = (filename: string, text: string) => {
	const haystack = `${filename} ${text.slice(0, 2000)}`.toLowerCase();
	if (haystack.includes('quebec') || haystack.includes('québec') || haystack.includes('qc')) return 'Quebec';
	if (/\bfrance\b|français|française|république française|code civil(?! du qu)/.test(haystack)) return 'France';
	if (haystack.includes('ontario')) return 'Ontario';
	if (haystack.includes('alberta')) return 'Alberta';
	if (haystack.includes('british columbia') || haystack.includes('colombie-britannique')) return 'British Columbia';
	if (haystack.includes('canada') || haystack.includes('canadian')) return 'Canada';
	if (haystack.includes('texas') || haystack.includes(' tx ')) return 'Texas';
	if (haystack.includes('california')) return 'California';
	if (haystack.includes('new york')) return 'New York';
	if (haystack.includes('kansas') || haystack.includes(' ks ')) return 'Kansas';
	if (haystack.includes('federal') || haystack.includes('fédéral')) return 'Federal';
	if (/\bunited states\b|\bu\.?s\.?\b/.test(haystack)) return 'United States';
	if (/\bunited kingdom\b|\bu\.?k\.?\b/.test(haystack)) return 'United Kingdom';
	return 'Other';
};

const detectDocType = (text: string): 'statute' | 'regulation' | 'case-law' | 'secondary' => {
	const lower = text.slice(0, 3000).toLowerCase();
	if (/\bv\.?\b|\bplaintiff\b|\bdefendant\b|\bcourt of\b/.test(lower)) return 'case-law';
	if (/\bregulation\b|\brèglement\b/.test(lower)) return 'regulation';
	if (/\bact\b|\bcode\b|\bstatute\b|\bsection\b|\bart\.?\b/.test(lower)) return 'statute';
	return 'secondary';
};

/**
 * POST — Receive pre-extracted text from client-side parsing.
 * Body: { text: string, filename: string, packId?: string }
 * This avoids serverless timeout issues with large PDFs/DOCX files
 * because the heavy parsing is done in the browser.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		throw error(401, 'Authentication required.');
	}

	const rl = rateLimit(session.user.id, 'ingest_text', 30, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many uploads. Please wait a moment.');
	}

	const payload = await request.json().catch(() => null);
	if (!payload?.text || typeof payload.text !== 'string') {
		throw error(400, 'No text content provided.');
	}
	if (!payload.filename || typeof payload.filename !== 'string') {
		throw error(400, 'Filename is required.');
	}
	if (payload.text.length > MAX_TEXT_LENGTH) {
		throw error(400, 'Text segment exceeds 4 MB limit. The client should split large documents.');
	}

	// Support continuation: append chunks to an existing sourceId
	const continueSourceId = typeof payload.sourceId === 'string' ? payload.sourceId : '';

	// Normalize whitespace but PRESERVE newlines (they carry legal structure for chunking)
	const text = payload.text
		.replace(/[^\S\n]+/g, ' ')      // collapse horizontal whitespace only
		.replace(/\n{3,}/g, '\n\n')     // cap consecutive newlines at 2
		.trim();
	const filename = payload.filename;
	const packId = payload.packId ?? '';

	// Quality gate — apply to every segment, including continuations. We do NOT
	// want a clean first segment followed by junk segments to silently corrupt
	// the document. Each chunk uploaded must be meaningful on its own.
	const quality = validateExtractedText(text);
	if (!quality.valid) {
		throw error(422, formatExtractionError(quality));
	}

	const title = filename.replace(/\.(pdf|docx)$/i, '').replace(/[_-]+/g, ' ').trim();
	const excerpt = text.slice(0, 320);
	const jurisdiction = detectJurisdiction(filename, text);
	const docType = detectDocType(text);
	const sourceId = continueSourceId || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const storagePath = typeof payload.storagePath === 'string' ? payload.storagePath : undefined;
	const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : undefined;
	const originalFileName = typeof payload.originalFileName === 'string' ? payload.originalFileName : undefined;
	const fileSize = typeof payload.fileSize === 'number' ? payload.fileSize : undefined;

	let totalChunks = 0;
	let ingestionAudit = null;
	try {
		const supabase = assertSupabaseAdmin();
		const stored = await storeChunksOnly({
			supabase,
			userId: session.user.id,
			sourceId,
			packId: packId || undefined,
			content: text,
			append: Boolean(continueSourceId),
			metadata: {
				title,
				jurisdiction,
				docType,
				trustLevel: 'unverified',
					sourceUrl: `uploaded://${filename}`,
					storagePath,
					mimeType,
					originalFileName,
					fileSize
			}
		});
		totalChunks = stored.chunkCount;
		ingestionAudit = stored.ingestionAudit;
	} catch (storeErr) {
		console.error('Failed to store chunks:', storeErr);
		throw error(500, 'Document text was extracted but chunk storage failed. Please try uploading again.');
	}

	return json({
		document: {
			id: sourceId,
			title,
			jurisdiction,
			description: excerpt,
			lastUpdated: new Date().toISOString().slice(0, 10),
			sourceUrl: `uploaded://${filename}`,
				storagePath,
				mimeType,
				originalFileName,
				fileSize,
			content: '', // Don't echo full text back — save bandwidth
			docType,
			trustLevel: 'unverified' as const,
			isCustom: true,
			note: ingestionAudit?.reliableForClassroom
				? 'Uploaded document. Legal structure detected and ready for classroom review.'
				: 'Uploaded document. Review extracted text and structure before classroom use.'
		},
		totalChunks,
		ingestionAudit
	});
};
