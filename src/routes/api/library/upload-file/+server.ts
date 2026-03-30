import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { assertSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/rateLimit';

const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB hard cap for original file storage
const STORAGE_BUCKET = env.SUPABASE_STORAGE_BUCKET ?? 'verdict-sources';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Authentication required.');

	const rl = rateLimit(session.user.id, 'upload_original_file', 20, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many uploads. Please wait a moment.');
	}

	const formData = await request.formData().catch(() => null);
	const file = formData?.get('file');
	const sourceIdRaw = formData?.get('sourceId');

	if (!(file instanceof File)) throw error(400, 'File is required.');
	const sourceId = typeof sourceIdRaw === 'string' ? sourceIdRaw.trim() : '';
	if (!sourceId) throw error(400, 'sourceId is required.');

	const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
	if (ext !== '.pdf' && ext !== '.docx') {
		throw error(400, 'Unsupported file type. Please upload PDF or DOCX.');
	}
	if (file.size <= 0) throw error(400, 'Empty file.');
	if (file.size > MAX_FILE_BYTES) {
		throw error(400, `File exceeds ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`);
	}

	const supabase = assertSupabaseAdmin();
	const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
	const path = `${session.user.id}/${sourceId}/${safeName}`;

	const body = Buffer.from(await file.arrayBuffer());
	const { error: uploadError } = await supabase.storage
		.from(STORAGE_BUCKET)
		.upload(path, body, {
			upsert: true,
			contentType: file.type || (ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
		});

	if (uploadError) {
		console.error('Original file upload failed:', uploadError);
		throw error(500, 'Failed to store original file.');
	}

	return json({
		sourceId,
		storagePath: path,
		originalFileName: file.name,
		mimeType: file.type || undefined,
		fileSize: file.size
	});
};
