import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { storeChunksOnly } from '$lib/server/rag';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';

const MAX_TEXT_LENGTH = 5_000_000; // ~5 MB of text

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

	const rl = rateLimit(session.user.id, 'ingest_text', 10, 60_000);
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
		throw error(400, 'Text content exceeds 5 MB limit.');
	}

	// Normalize whitespace but PRESERVE newlines (they carry legal structure for chunking)
	const text = payload.text
		.replace(/[^\S\n]+/g, ' ')      // collapse horizontal whitespace only
		.replace(/\n{3,}/g, '\n\n')     // cap consecutive newlines at 2
		.trim();
	const filename = payload.filename;
	const packId = payload.packId ?? '';

	if (!text || text.length < 20) {
		throw error(422, 'Could not extract readable text from this file. It may be scanned, image-based, or empty.');
	}

	const title = filename.replace(/\.(pdf|docx)$/i, '').replace(/[_-]+/g, ' ').trim();
	const excerpt = text.slice(0, 320);
	const jurisdiction = detectJurisdiction(filename, text);
	const docType = detectDocType(text);
	const sourceId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	let totalChunks = 0;
	try {
		const supabase = assertSupabaseAdmin();
		totalChunks = await storeChunksOnly({
			supabase,
			userId: session.user.id,
			sourceId,
			packId: packId || undefined,
			content: text,
			metadata: {
				title,
				jurisdiction,
				docType,
				trustLevel: 'unverified',
				sourceUrl: `uploaded://${filename}`
			}
		});
	} catch (storeErr) {
		console.error('Failed to store chunks:', storeErr);
	}

	return json({
		document: {
			id: sourceId,
			title,
			jurisdiction,
			description: excerpt,
			lastUpdated: new Date().toISOString().slice(0, 10),
			sourceUrl: `uploaded://${filename}`,
			content: text,
			docType,
			trustLevel: 'unverified' as const,
			isCustom: true,
			note: 'Uploaded document. Review extracted text for accuracy.'
		},
		totalChunks
	});
};
