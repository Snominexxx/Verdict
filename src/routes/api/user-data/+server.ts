import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/server/rateLimit';

const MAX_PACKS = 50;
const MAX_SOURCES_PER_PACK = 100;
const MAX_CASES = 200;
const MAX_FIELD_LENGTH = 10_000;
const MAX_CONTENT_LENGTH = 2_000_000; // 2MB for source content

const cap = (val: unknown, max: number): string => String(val ?? '').slice(0, max);

// GET — load all user data (packs + sources + cases)
export const GET: RequestHandler = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Not authenticated');

	const userId = session.user.id;
	const supabase = locals.supabase;

	const [packsRes, sourcesRes, casesRes] = await Promise.all([
		supabase.from('legal_packs').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
		supabase.from('pack_sources').select('*').eq('user_id', userId),
		supabase.from('cases').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
	]);

	if (packsRes.error) throw error(500, packsRes.error.message);
	if (sourcesRes.error) throw error(500, sourcesRes.error.message);
	if (casesRes.error) throw error(500, casesRes.error.message);

	// Group sources into their packs
	const sourcesByPack: Record<string, typeof sourcesRes.data> = {};
	for (const src of sourcesRes.data) {
		if (!sourcesByPack[src.pack_id]) sourcesByPack[src.pack_id] = [];
		sourcesByPack[src.pack_id].push(src);
	}

	const packs = packsRes.data.map((p) => ({
		id: p.id,
		name: p.name,
		jurisdiction: p.jurisdiction,
		domain: p.domain,
		description: p.description,
		isDefault: p.is_default,
		sources: (sourcesByPack[p.id] ?? []).map((s) => ({
			id: s.id,
			title: s.title,
			jurisdiction: s.jurisdiction,
			description: s.description,
			sourceUrl: s.source_url,
			filePath: s.file_path,
			content: s.content,
			docType: s.doc_type,
			trustLevel: s.trust_level,
			isCustom: s.is_custom,
			lastUpdated: s.last_updated,
			note: s.note
		}))
	}));

	const cases = casesRes.data.map((c) => ({
		id: c.id,
		title: c.title,
		synopsis: c.synopsis,
		issues: c.issues,
		remedy: c.remedy,
		role: c.role,
		sources: c.sources,
		packId: c.pack_id,
		courtType: c.court_type,
		createdAt: c.created_at,
		status: c.status,
		startedAt: c.started_at,
		updatedAt: c.updated_at,
		performance: c.performance
	}));

	return json({ packs, cases });
};

// POST — sync user data (upsert packs, sources, cases)
export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Not authenticated');

	// Rate limit: 10 syncs per 60 seconds
	const rl = rateLimit(session.user.id, 'user_data', 10, 60_000);
	if (!rl.allowed) throw error(429, 'Too many sync requests.');

	const userId = session.user.id;
	const supabase = locals.supabase;
	const body = await request.json();

	// Sync packs
	if (body.packs && Array.isArray(body.packs)) {
		if (body.packs.length > MAX_PACKS) throw error(400, `Too many packs (max ${MAX_PACKS}).`);
		for (const pack of body.packs) {
			const { error: packErr } = await supabase.from('legal_packs').upsert({
				id: cap(pack.id, 100),
				user_id: userId,
				name: cap(pack.name, 200),
				jurisdiction: cap(pack.jurisdiction ?? 'Other', 200),
				domain: cap(pack.domain ?? 'General', 200),
				description: cap(pack.description, MAX_FIELD_LENGTH),
				is_default: pack.isDefault ?? false,
				updated_at: new Date().toISOString()
			}, { onConflict: 'id' });
			if (packErr) console.error('Pack upsert error:', packErr.message);

			// Sync sources for this pack
			if (pack.sources && Array.isArray(pack.sources)) {
				// Remove old sources then re-insert
				await supabase.from('pack_sources').delete().eq('pack_id', pack.id).eq('user_id', userId);
				const bounded = pack.sources.slice(0, MAX_SOURCES_PER_PACK);
				if (bounded.length > 0) {
					const rows = bounded.map((s: Record<string, unknown>) => ({
						id: cap(s.id, 100),
						pack_id: pack.id,
						user_id: userId,
						title: cap(s.title, 500),
						jurisdiction: cap(s.jurisdiction, 200),
						description: cap(s.description, MAX_FIELD_LENGTH),
						source_url: s.sourceUrl ? cap(s.sourceUrl, 2000) : null,
						file_path: s.filePath ? cap(s.filePath, 500) : null,
						content: s.content ? cap(s.content, MAX_CONTENT_LENGTH) : null,
						doc_type: s.docType ? cap(s.docType, 100) : null,
						trust_level: s.trustLevel ? cap(s.trustLevel, 50) : null,
						is_custom: s.isCustom ?? true,
						last_updated: s.lastUpdated ?? null,
						note: s.note ? cap(s.note, MAX_FIELD_LENGTH) : null
					}));
					const { error: srcErr } = await supabase.from('pack_sources').insert(rows);
					if (srcErr) console.error('Sources insert error:', srcErr.message);
				}
			}
		}
	}

	// Sync cases
	if (body.cases && Array.isArray(body.cases)) {
		if (body.cases.length > MAX_CASES) throw error(400, `Too many cases (max ${MAX_CASES}).`);
		for (const c of body.cases) {
			const { error: caseErr } = await supabase.from('cases').upsert({
				id: cap(c.id, 100),
				user_id: userId,
				title: cap(c.title, 500),
				synopsis: cap(c.synopsis, MAX_FIELD_LENGTH),
				issues: cap(c.issues, MAX_FIELD_LENGTH),
				remedy: cap(c.remedy, MAX_FIELD_LENGTH),
				role: c.role === 'defendant' ? 'defendant' : 'plaintiff',
				sources: Array.isArray(c.sources) ? c.sources.slice(0, MAX_SOURCES_PER_PACK) : [],
				pack_id: c.packId ? cap(c.packId, 100) : null,
				court_type: c.courtType === 'bench' ? 'bench' : 'jury',
				status: cap(c.status ?? 'ongoing', 50),
				started_at: c.startedAt ?? new Date().toISOString(),
				updated_at: c.updatedAt ?? new Date().toISOString(),
				performance: c.performance ?? null,
				created_at: c.createdAt ?? new Date().toISOString()
			}, { onConflict: 'id' });
			if (caseErr) console.error('Case upsert error:', caseErr.message);
		}
	}

	// Delete packs/cases
	if (body.deletedPackIds && Array.isArray(body.deletedPackIds)) {
		for (const id of body.deletedPackIds) {
			await supabase.from('legal_packs').delete().eq('id', id).eq('user_id', userId);
		}
	}

	if (body.deletedCaseIds && Array.isArray(body.deletedCaseIds)) {
		for (const id of body.deletedCaseIds) {
			await supabase.from('cases').delete().eq('id', id).eq('user_id', userId);
		}
	}

	return json({ ok: true });
};
