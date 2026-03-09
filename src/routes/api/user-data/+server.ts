import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

	const userId = session.user.id;
	const supabase = locals.supabase;
	const body = await request.json();

	// Sync packs
	if (body.packs && Array.isArray(body.packs)) {
		for (const pack of body.packs) {
			const { error: packErr } = await supabase.from('legal_packs').upsert({
				id: pack.id,
				user_id: userId,
				name: pack.name,
				jurisdiction: pack.jurisdiction ?? 'Other',
				domain: pack.domain ?? 'General',
				description: pack.description ?? '',
				is_default: pack.isDefault ?? false,
				updated_at: new Date().toISOString()
			}, { onConflict: 'id' });
			if (packErr) console.error('Pack upsert error:', packErr.message);

			// Sync sources for this pack
			if (pack.sources && Array.isArray(pack.sources)) {
				// Remove old sources then re-insert
				await supabase.from('pack_sources').delete().eq('pack_id', pack.id).eq('user_id', userId);
				if (pack.sources.length > 0) {
					const rows = pack.sources.map((s: Record<string, unknown>) => ({
						id: s.id as string,
						pack_id: pack.id,
						user_id: userId,
						title: s.title ?? '',
						jurisdiction: s.jurisdiction ?? '',
						description: s.description ?? '',
						source_url: s.sourceUrl ?? null,
						file_path: s.filePath ?? null,
						content: s.content ?? null,
						doc_type: s.docType ?? null,
						trust_level: s.trustLevel ?? null,
						is_custom: s.isCustom ?? true,
						last_updated: s.lastUpdated ?? null,
						note: s.note ?? null
					}));
					const { error: srcErr } = await supabase.from('pack_sources').insert(rows);
					if (srcErr) console.error('Sources insert error:', srcErr.message);
				}
			}
		}
	}

	// Sync cases
	if (body.cases && Array.isArray(body.cases)) {
		for (const c of body.cases) {
			const { error: caseErr } = await supabase.from('cases').upsert({
				id: c.id,
				user_id: userId,
				title: c.title,
				synopsis: c.synopsis ?? '',
				issues: c.issues ?? '',
				remedy: c.remedy ?? '',
				role: c.role ?? 'plaintiff',
				sources: c.sources ?? [],
				pack_id: c.packId ?? null,
				court_type: c.courtType ?? 'jury',
				status: c.status ?? 'ongoing',
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
