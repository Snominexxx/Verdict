import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';

const STORAGE_BUCKET = env.SUPABASE_STORAGE_BUCKET ?? 'verdict-sources';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const sourceId = url.searchParams.get('sourceId')?.trim();
	if (!sourceId) throw error(400, 'sourceId is required.');

	const { data, error: dbError } = await locals.supabase
		.from('document_chunks')
		.select('metadata')
		.eq('user_id', session.user.id)
		.eq('source_id', sourceId)
		.limit(1)
		.maybeSingle();

	if (dbError) {
		console.error('Failed reading source metadata:', dbError);
		throw error(500, 'Could not resolve source file.');
	}

	const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
	const storagePath = typeof metadata.storagePath === 'string' ? metadata.storagePath : '';
	if (!storagePath) throw error(404, 'Original file is not available for this source.');

	const supabase = assertSupabaseAdmin();
	const { data: signed, error: signedError } = await supabase.storage
		.from(STORAGE_BUCKET)
		.createSignedUrl(storagePath, 60 * 30); // 30 minutes

	if (signedError || !signed?.signedUrl) {
		console.error('Failed generating signed URL:', signedError);
		throw error(500, 'Failed to open source file.');
	}

	return json({
		sourceId,
		url: signed.signedUrl,
		mimeType: typeof metadata.mimeType === 'string' ? metadata.mimeType : null,
		originalFileName: typeof metadata.originalFileName === 'string' ? metadata.originalFileName : null,
		fileSize: typeof metadata.fileSize === 'number' ? metadata.fileSize : null
	});
};
