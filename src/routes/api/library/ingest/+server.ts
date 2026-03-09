import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

const officialHostPatterns = [/\.gov$/i, /\.gc\.ca$/i, /legisquebec\.gouv\.qc\.ca$/i, /justice\.gc\.ca$/i, /canlii\.org$/i];
const recognizedHostPatterns = [/court/i, /legis/i, /law/i, /bar/i, /canlii\.org$/i];

const stripHtml = (html: string) =>
	html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const detectJurisdiction = (host: string, text: string) => {
	const haystack = `${host} ${text}`.toLowerCase();
	if (haystack.includes('quebec') || haystack.includes('qc.ca') || haystack.includes('legisquebec')) return 'Quebec';
	if (haystack.includes('canada') || haystack.includes('gc.ca')) return 'Canada';
	if (haystack.includes('texas') || haystack.includes('tx')) return 'Texas';
	if (haystack.includes('kansas') || haystack.includes('ks')) return 'Kansas';
	if (haystack.includes('federal')) return 'Federal';
	return 'Other';
};

const detectDocType = (text: string): 'statute' | 'regulation' | 'case-law' | 'secondary' => {
	const lower = text.toLowerCase();
	if (/\bv\.?\b|\bplaintiff\b|\bdefendant\b|\bcourt of\b/.test(lower)) return 'case-law';
	if (/\bregulation\b|\brèglement\b/.test(lower)) return 'regulation';
	if (/\bact\b|\bcode\b|\bstatute\b|\bsection\b|\bart\.?\b/.test(lower)) return 'statute';
	return 'secondary';
};

const detectTrustLevel = (host: string): 'official' | 'recognized' | 'unverified' => {
	if (officialHostPatterns.some((p) => p.test(host))) return 'official';
	if (recognizedHostPatterns.some((p) => p.test(host))) return 'recognized';
	return 'unverified';
};

const toSourceId = (url: string) => {
	const safe = url.toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	return `url-${safe.slice(0, 48)}-${Date.now().toString().slice(-6)}`;
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.json().catch(() => null);
	const rawUrl = String(payload?.url ?? '').trim();

	if (!rawUrl) throw error(400, 'URL is required.');

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(rawUrl);
	} catch {
		throw error(400, 'Invalid URL.');
	}

	if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
		throw error(400, 'Only http/https URLs are supported.');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 12000);

	try {
		const response = await fetch(parsedUrl.toString(), {
			headers: {
				'User-Agent': 'Verdict-Library-Ingest/1.0',
				Accept: 'text/html,application/xhtml+xml,text/plain,application/pdf;q=0.8,*/*;q=0.5'
			},
			signal: controller.signal,
			redirect: 'follow'
		});

		if (!response.ok) {
			throw error(400, `Unable to fetch URL (HTTP ${response.status}).`);
		}

		const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
		if (contentType.includes('pdf')) {
			throw error(400, 'PDF URL detected. Please upload PDF directly or use a text-based law page URL.');
		}

		const html = await response.text();
		const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || parsedUrl.hostname;
		const text = stripHtml(html);
		const excerpt = text.slice(0, 320);
		const jurisdiction = detectJurisdiction(parsedUrl.hostname, `${title} ${excerpt}`);
		const docType = detectDocType(`${title} ${excerpt}`);
		const trustLevel = detectTrustLevel(parsedUrl.hostname);

		return json({
			document: {
				id: toSourceId(parsedUrl.toString()),
				title,
				jurisdiction,
				description: excerpt || 'Imported from URL source.',
				lastUpdated: new Date().toISOString().slice(0, 10),
				sourceUrl: parsedUrl.toString(),
				content: text,
				docType,
				trustLevel,
				isCustom: true,
				note: trustLevel === 'unverified' ? 'Unverified source domain. Review before use.' : undefined
			}
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		if ((err as Error).name === 'AbortError') {
			throw error(408, 'URL fetch timed out.');
		}
		if ((err as Error).message?.startsWith('Unable to fetch URL')) {
			throw err;
		}
		console.error('Library ingest failed', err);
		throw error(500, 'Failed to ingest source URL.');
	} finally {
		clearTimeout(timeout);
	}
};
