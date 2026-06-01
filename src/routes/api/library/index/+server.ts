import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { storeChunksOnly, deleteDocumentChunks } from '$lib/server/rag';

/**
 * POST — Store a document's full text in `document_chunks` (no embeddings).
 * The full-context loader (`$lib/server/sources`) reconstructs the document
 * by concatenating rows in `chunk_index` order at query time.
 *
 * Body: { sourceId, packId?, content, metadata: { title, jurisdiction, docType?, trustLevel?, sourceUrl? } }
 *
 * DELETE — Remove all rows for a source
 * Query: ?sourceId=xxx
 */

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const payload = await request.json().catch(() => null);
	if (!payload?.sourceId || !payload?.content) {
		throw error(400, 'sourceId and content are required.');
	}

	const content = String(payload.content).trim();
	if (content.length < 50) {
		throw error(400, 'Document content is too short to index.');
	}

	try {
		const stored = await storeChunksOnly({
			supabase: locals.supabase,
			userId: session.user.id,
			sourceId: String(payload.sourceId),
			packId: payload.packId ? String(payload.packId) : undefined,
			content,
			metadata: {
				title: String(payload.metadata?.title ?? 'Untitled'),
				jurisdiction: String(payload.metadata?.jurisdiction ?? 'Other'),
				docType: payload.metadata?.docType,
				trustLevel: payload.metadata?.trustLevel,
				sourceUrl: payload.metadata?.sourceUrl
			}
		});

		return json({ success: true, chunkCount: stored.chunkCount, ingestionAudit: stored.ingestionAudit });
	} catch (err) {
		console.error('Document storage failed:', err);
		const msg = err instanceof Error ? err.message : 'Document storage failed';
		throw error(500, msg);
	}
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const sourceId = url.searchParams.get('sourceId');
	if (!sourceId) throw error(400, 'sourceId is required.');

	try {
		await deleteDocumentChunks({
			supabase: locals.supabase,
			userId: session.user.id,
			sourceId
		});
		return json({ success: true });
	} catch (err) {
		console.error('Delete chunks failed:', err);
		throw error(500, 'Failed to delete document chunks.');
	}
};
