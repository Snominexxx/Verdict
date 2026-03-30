import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * GET — Reconstruct full uploaded source text from stored chunks.
 * Query: ?sourceId=xxx
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const sourceId = url.searchParams.get('sourceId')?.trim();
	if (!sourceId) throw error(400, 'sourceId is required.');

	const pageSize = 1000;
	let from = 0;
	const rows: Array<{ chunk_index: number; content: string }> = [];

	while (true) {
		const { data, error: dbError } = await locals.supabase
			.from('document_chunks')
			.select('chunk_index, content')
			.eq('user_id', session.user.id)
			.eq('source_id', sourceId)
			.order('chunk_index', { ascending: true })
			.range(from, from + pageSize - 1);

		if (dbError) {
			console.error('Failed to fetch source chunks:', dbError);
			throw error(500, 'Failed to load source text.');
		}

		const batch = (data ?? []) as Array<{ chunk_index: number; content: string }>;
		if (!batch.length) break;

		rows.push(...batch);
		if (batch.length < pageSize) break;
		from += pageSize;
	}

	if (!rows.length) {
		throw error(404, 'No stored text found for this source.');
	}

	const fullText = rows.map((r) => r.content ?? '').join('\n\n').trim();
	return json({ sourceId, text: fullText, chunks: rows.length });
};
