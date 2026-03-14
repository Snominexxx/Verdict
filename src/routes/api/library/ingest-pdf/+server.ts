import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { PDFParse } from 'pdf-parse';
import { storeChunksOnly } from '$lib/server/rag';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB

const detectJurisdiction = (filename: string, text: string) => {
	const haystack = `${filename} ${text.slice(0, 2000)}`.toLowerCase();
	if (haystack.includes('quebec') || haystack.includes('québec') || haystack.includes('qc')) return 'Quebec';
	if (haystack.includes('canada') || haystack.includes('canadian')) return 'Canada';
	if (haystack.includes('texas') || haystack.includes(' tx ')) return 'Texas';
	if (haystack.includes('kansas') || haystack.includes(' ks ')) return 'Kansas';
	if (haystack.includes('federal')) return 'Federal';
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

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('multipart/form-data') && !contentType.includes('application/pdf')) {
		throw error(400, 'Expected a PDF file upload.');
	}

	let pdfBytes: Uint8Array;
	let filename = 'document.pdf';
	let packId = '';

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!file || !(file instanceof File)) {
			throw error(400, 'No PDF file provided.');
		}
		if (file.size > MAX_PDF_SIZE) {
			throw error(400, 'PDF file exceeds 10 MB limit.');
		}
		if (!file.name.toLowerCase().endsWith('.pdf')) {
			throw error(400, 'Only PDF files are accepted.');
		}
		filename = file.name;
		packId = (formData.get('packId') as string) || '';
		pdfBytes = new Uint8Array(await file.arrayBuffer());
	} else {
		const arrayBuffer = await request.arrayBuffer();
		if (arrayBuffer.byteLength > MAX_PDF_SIZE) {
			throw error(400, 'PDF file exceeds 10 MB limit.');
		}
		pdfBytes = new Uint8Array(arrayBuffer);
	}

	try {
		const parser = new PDFParse({ data: pdfBytes });
		const result = await parser.getText();
		parser.destroy();

		const text = (result.text ?? '').replace(/\s+/g, ' ').trim();

		if (!text || text.length < 20) {
			throw error(422, 'Could not extract readable text from this PDF. It may be scanned or image-based.');
		}

		const title = filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
		const excerpt = text.slice(0, 320);
		const jurisdiction = detectJurisdiction(filename, text);
		const docType = detectDocType(text);
		const sourceId = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
				note: 'Uploaded PDF. Review extracted text for accuracy.'
			},
			totalChunks
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		const msg = err instanceof Error ? err.message : String(err);
		console.error('PDF parse failed:', msg);
		throw error(500, `Failed to parse PDF: ${msg}`);
	}
};
