import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { storeChunksOnly } from '$lib/server/rag';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];

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

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		throw error(401, 'Authentication required.');
	}

	// Rate limit: 10 PDF uploads per 60 seconds
	const rl = rateLimit(session.user.id, 'ingest_pdf', 10, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many uploads. Please wait a moment.');
	}

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('multipart/form-data')) {
		throw error(400, 'Expected a file upload (multipart/form-data).');
	}

	let fileBytes: Uint8Array;
	let filename = 'document.pdf';
	let packId = '';

	const formData = await request.formData();
	const file = formData.get('file');
	if (!file || !(file instanceof File)) {
		throw error(400, 'No file provided.');
	}
	if (file.size > MAX_FILE_SIZE) {
		throw error(400, 'File exceeds 15 MB limit.');
	}
	const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
	if (!ACCEPTED_EXTENSIONS.includes(ext)) {
		throw error(400, 'Only PDF and Word (.docx) files are accepted.');
	}
	filename = file.name;
	packId = (formData.get('packId') as string) || '';
	fileBytes = new Uint8Array(await file.arrayBuffer());

	try {
		let rawText = '';

		if (ext === '.docx') {
			const result = await mammoth.extractRawText({ buffer: Buffer.from(fileBytes) });
			rawText = result.value ?? '';
		} else {
			const parser = new PDFParse({ data: fileBytes });
			const result = await parser.getText();
			parser.destroy();
			rawText = result.text ?? '';
		}

		// Normalize whitespace but PRESERVE newlines (they carry legal structure for chunking)
		const text = rawText
			.replace(/[^\S\n]+/g, ' ')      // collapse horizontal whitespace only
			.replace(/\n{3,}/g, '\n\n')     // cap consecutive newlines at 2
			.trim();

		if (!text || text.length < 20) {
			throw error(422, 'Could not extract readable text from this file. It may be scanned, image-based, or empty.');
		}

		const title = filename.replace(/\.(pdf|docx)$/i, '').replace(/[_-]+/g, ' ').trim();
		const excerpt = text.slice(0, 320);
		const jurisdiction = detectJurisdiction(filename, text);
		const docType = detectDocType(text);
		const sourceId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		// Store chunks (text only, no embeddings) in Supabase
		let totalChunks = 0;
		if (text.length >= 50) {
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
				// Non-fatal: document is still returned, user can retry embedding
			}
		}

			const fileType = ext === '.docx' ? 'Word document' : 'PDF';
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
				note: `Uploaded ${fileType}. Review extracted text for accuracy.`
			},
			totalChunks
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		const msg = err instanceof Error ? err.message : String(err);
		console.error('Document parse failed:', msg);
		throw error(500, `Failed to parse document: ${msg}`);
	}
};
