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

/**
 * When the URL has a #fragment, find the element with that id in the raw HTML
 * and extract text from that anchor point forward (up to ~50k chars of HTML).
 * Falls back to null if the fragment isn't found.
 */
const extractAroundAnchor = (html: string, fragment: string): string | null => {
	if (!fragment) return null;
	// Escape regex special chars in the fragment (e.g. "se:1" has a colon)
	const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Match id="fragment" or id='fragment' (case-insensitive)
	const pattern = new RegExp(`id=["']${escaped}["']`, 'i');
	const match = pattern.exec(html);
	if (!match) return null;

	// Take a generous chunk from the anchor point forward
	const chunk = html.slice(match.index, match.index + 50_000);
	const text = stripHtml(chunk);
	// Only use if we got meaningful content (at least 100 chars)
	return text.length >= 100 ? text : null;
};

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

const isPrivateIP = (hostname: string): boolean => {
	// Block SSRF: disallow private/internal IP ranges and localhost
	const blocked = [
		/^localhost$/i,
		/^127\./,
		/^10\./,
		/^172\.(1[6-9]|2\d|3[0-1])\./,
		/^192\.168\./,
		/^0\./,
		/^169\.254\./,
		/^\[::1\]$/,
		/^\[fc/i,
		/^\[fd/i,
		/^\[fe80:/i,
		/\.local$/i,
		/\.internal$/i
	];
	return blocked.some((p) => p.test(hostname));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		throw error(401, 'Authentication required.');
	}

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

	if (isPrivateIP(parsedUrl.hostname)) {
		throw error(400, 'URLs pointing to private or internal networks are not allowed.');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 25000);

	try {
		const response = await fetch(parsedUrl.toString(), {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
			},
			signal: controller.signal,
			redirect: 'follow'
		});

		if (!response.ok) {
			throw error(400, `Unable to fetch URL (HTTP ${response.status}).`);
		}

		const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
		if (contentType.includes('pdf')) {
			throw error(400, 'This is a PDF link. Use the PDF upload button instead.');
		}

		// Read response in chunks to handle very large pages (cap at 2MB)
		const maxBytes = 2 * 1024 * 1024;
		const reader = response.body?.getReader();
		if (!reader) throw error(500, 'Unable to read response body.');

		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			totalBytes += value.length;
			if (totalBytes >= maxBytes) break;
		}
		reader.cancel().catch(() => {});

		const decoder = new TextDecoder('utf-8', { fatal: false });
		const html = decoder.decode(Buffer.concat(chunks).slice(0, maxBytes));
		const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || parsedUrl.hostname;
		const fullText = stripHtml(html);

		// If URL has a #fragment, try to extract content around that anchor
		const fragment = parsedUrl.hash?.slice(1); // remove leading '#'
		const anchorText = extractAroundAnchor(html, fragment);
		const text = anchorText ?? fullText;

		const excerpt = text.slice(0, 320);
		const jurisdiction = detectJurisdiction(parsedUrl.hostname, `${title} ${excerpt}`);
		const docType = detectDocType(`${title} ${excerpt}`);
		const trustLevel = detectTrustLevel(parsedUrl.hostname);
		// Cap stored content to avoid oversized DB rows (keep first 100k chars)
		const content = text.slice(0, 100_000);

		return json({
			document: {
				id: toSourceId(parsedUrl.toString()),
				title,
				jurisdiction,
				description: excerpt || 'Imported from URL source.',
				lastUpdated: new Date().toISOString().slice(0, 10),
				sourceUrl: parsedUrl.toString(),
				content,
				docType,
				trustLevel,
				isCustom: true,
				note: trustLevel === 'unverified' ? 'Unverified source domain. Review before use.' : undefined
			}
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		if ((err as Error).name === 'AbortError') {
			throw error(408, 'The page took too long to load. Try a more specific URL (e.g. a single article instead of a full code).');
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
