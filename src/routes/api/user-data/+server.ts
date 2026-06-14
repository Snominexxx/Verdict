import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/server/rateLimit';

const MAX_PACKS = 50;
const MAX_SOURCES_PER_PACK = 100;
const MAX_CASES = 200;
const MAX_DRAFTS = 200;
const MAX_FIELD_LENGTH = 10_000;
const MAX_CONTENT_LENGTH = 2_000_000; // 2MB for source content

const cap = (val: unknown, max: number): string => String(val ?? '').slice(0, max);
const normalizePackLanguage = (val: unknown): 'en' | 'fr' => (val === 'fr' ? 'fr' : 'en');
const isMissingDraftTableError = (message: string) => /saved_drafts|relation|does not exist|schema cache/i.test(message);

const hasAuthoritativeEvidencePacket = (snapshot: unknown): boolean => {
	if (!snapshot || typeof snapshot !== 'object') return false;
	const paperSnapshot = snapshot as {
		sourceBundle?: { excerpts?: unknown[] };
		evidenceSufficiency?: { canProceed?: unknown };
	};
	return Boolean(
		Array.isArray(paperSnapshot.sourceBundle?.excerpts)
		&& paperSnapshot.sourceBundle.excerpts.length
		&& typeof paperSnapshot.evidenceSufficiency === 'object'
		&& paperSnapshot.evidenceSufficiency !== null
		&& typeof paperSnapshot.evidenceSufficiency.canProceed === 'boolean'
	);
};

const extractMissingColumn = (message: string): string | null => {
	const schemaCacheMatch = message.match(/Could not find the '([^']+)' column of '[^']+' in the schema cache/i);
	if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
	const relationMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of relation/i);
	if (relationMatch?.[1]) return relationMatch[1];
	return null;
};

const omitColumn = <T extends Record<string, unknown>>(row: T, column: string): T => {
	const next = { ...row };
	delete next[column as keyof T];
	return next;
};

const upsertWithLegacyColumnFallback = async <T extends Record<string, unknown>>(
	execute: (row: T) => PromiseLike<{ error: { message: string } | null }>,
	row: T
) => {
	let workingRow = { ...row };
	let result = await execute(workingRow);

	for (let attempt = 0; result.error && attempt < 12; attempt += 1) {
		const missingColumn = extractMissingColumn(result.error.message);
		if (!missingColumn || !(missingColumn in workingRow)) break;
		workingRow = omitColumn(workingRow, missingColumn);
		result = await execute(workingRow);
	}

	return result;
};

// GET — load all user data (packs + sources + cases)
export const GET: RequestHandler = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) throw error(401, 'Not authenticated');

	const rl = rateLimit(session.user.id, 'user_data_read', 20, 60_000);
	if (!rl.allowed) {
		throw error(429, 'Too many requests. Please wait a moment.');
	}

	const userId = session.user.id;
	const supabase = locals.supabase;

	const [packsRes, sourcesRes, casesRes, draftsRes] = await Promise.all([
		supabase.from('legal_packs').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
		supabase.from('pack_sources').select('*').eq('user_id', userId),
		supabase.from('cases').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
		supabase.from('saved_drafts').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
	]);

	if (packsRes.error) throw error(500, packsRes.error.message);
	if (sourcesRes.error) throw error(500, sourcesRes.error.message);
	if (casesRes.error) throw error(500, casesRes.error.message);
	if (draftsRes.error && !isMissingDraftTableError(draftsRes.error.message)) {
		throw error(500, draftsRes.error.message);
	}

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
		language: normalizePackLanguage(p.language),
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
			note: s.note,
			ingestionAudit: s.ingestion_audit ?? undefined
		}))
	}));

	const cases = casesRes.data.map((c) => ({
		id: c.id,
		title: c.title,
		synopsis: c.synopsis,
		issues: c.issues,
		remedy: c.remedy,
		objective: c.objective,
		targetSkill: c.target_skill,
		practicePoints: Array.isArray(c.practice_points) ? c.practice_points : [],
		judgeBrief: c.judge_brief ?? undefined,
		groundingAudit: c.grounding_audit ?? undefined,
		role: c.role,
		sources: c.sources,
		packId: c.pack_id,
		paperSnapshot: c.paper_snapshot ?? undefined,
		courtType: c.court_type,
		createdAt: c.created_at,
		status: c.status,
		startedAt: c.started_at,
		updatedAt: c.updated_at,
		performance: c.performance
	}));

	const drafts = (draftsRes.error ? [] : draftsRes.data).map((draft) => ({
		id: draft.id,
		title: draft.title,
		draftData: draft.draft_data,
		selectedOption: draft.selected_option,
		paperSnapshot: draft.paper_snapshot,
		analysis: draft.analysis ?? undefined,
		workflow: draft.workflow ?? undefined,
		packId: draft.pack_id ?? undefined,
		packContext: draft.pack_context ?? undefined,
		createdAt: draft.created_at,
		updatedAt: draft.updated_at
	}));

	return json({ packs, cases, drafts });
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
	const syncErrors: string[] = [];

	// Sync packs
	if (body.packs && Array.isArray(body.packs)) {
		if (body.packs.length > MAX_PACKS) throw error(400, `Too many packs (max ${MAX_PACKS}).`);
		for (const pack of body.packs) {
			const packRow = {
				id: cap(pack.id, 100),
				user_id: userId,
				name: cap(pack.name, 200),
				jurisdiction: cap(pack.jurisdiction ?? 'Other', 200),
				language: normalizePackLanguage(pack.language),
				domain: cap(pack.domain ?? 'General', 200),
				description: cap(pack.description, MAX_FIELD_LENGTH),
				is_default: pack.isDefault ?? false,
				updated_at: new Date().toISOString()
			};
			let { error: packErr } = await supabase.from('legal_packs').upsert(packRow, { onConflict: 'id' });
			if (packErr && /language|column/i.test(packErr.message)) {
				const { language: _language, ...legacyPackRow } = packRow;
				({ error: packErr } = await supabase.from('legal_packs').upsert(legacyPackRow, { onConflict: 'id' }));
			}
			if (packErr) {
				console.error('Pack upsert error:', packErr.message);
				syncErrors.push(`Pack ${packRow.id}: ${packErr.message}`);
			}

			// Sync sources for this pack
			if (pack.sources && Array.isArray(pack.sources)) {
				// Remove old sources then re-insert
				await supabase.from('pack_sources').delete().eq('pack_id', pack.id).eq('user_id', userId);
				const bounded = pack.sources.slice(0, MAX_SOURCES_PER_PACK);
				if (bounded.length > 0) {
					const rows: Record<string, unknown>[] = bounded.map((s: Record<string, unknown>) => ({
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
						note: s.note ? cap(s.note, MAX_FIELD_LENGTH) : null,
						ingestion_audit: s.ingestionAudit ?? null
					}));
					let { error: srcErr } = await supabase.from('pack_sources').insert(rows);
					if (srcErr && /ingestion_audit|column/i.test(srcErr.message)) {
						const legacyRows = rows.map((row) => {
							const legacyRow: Record<string, unknown> = { ...row };
							delete legacyRow.ingestion_audit;
							return legacyRow;
						});
						({ error: srcErr } = await supabase.from('pack_sources').insert(legacyRows));
					}
					if (srcErr) {
						console.error('Sources insert error:', srcErr.message);
						syncErrors.push(`Sources for pack ${packRow.id}: ${srcErr.message}`);
					}
				}
			}
		}
	}

	// Sync cases
	if (body.cases && Array.isArray(body.cases)) {
		if (body.cases.length > MAX_CASES) throw error(400, `Too many cases (max ${MAX_CASES}).`);
		for (const c of body.cases) {
				const caseRow = {
				id: cap(c.id, 100),
				user_id: userId,
				title: cap(c.title, 500),
				synopsis: cap(c.synopsis, MAX_FIELD_LENGTH),
				issues: cap(c.issues, MAX_FIELD_LENGTH),
				remedy: cap(c.remedy, MAX_FIELD_LENGTH),
				objective: cap(c.objective, MAX_FIELD_LENGTH),
				target_skill: cap(c.targetSkill, 160),
				practice_points: Array.isArray(c.practicePoints) ? c.practicePoints.slice(0, 8) : [],
				judge_brief: c.judgeBrief ?? null,
				grounding_audit: c.groundingAudit ?? null,
				role: c.role === 'defendant' ? 'defendant' : 'plaintiff',
				sources: Array.isArray(c.sources) ? c.sources.slice(0, MAX_SOURCES_PER_PACK) : [],
				pack_id: c.packId ? cap(c.packId, 100) : null,
				court_type: 'bench',
				status: cap(c.status ?? 'ongoing', 50),
				started_at: c.startedAt ?? new Date().toISOString(),
				updated_at: c.updatedAt ?? new Date().toISOString(),
				performance: c.performance ?? null,
				created_at: c.createdAt ?? new Date().toISOString()
				} as Record<string, unknown>;
				if (hasAuthoritativeEvidencePacket(c.paperSnapshot)) {
					caseRow.paper_snapshot = c.paperSnapshot ?? null;
				}
			const { error: caseErr } = await upsertWithLegacyColumnFallback(
				(row) => supabase.from('cases').upsert(row, { onConflict: 'id' }),
				caseRow
			);
			if (caseErr) {
				console.error('Case upsert error:', caseErr.message);
				syncErrors.push(`Case ${caseRow.id}: ${caseErr.message}`);
			}
		}
	}

	if (body.drafts && Array.isArray(body.drafts)) {
		if (body.drafts.length > MAX_DRAFTS) throw error(400, `Too many drafts (max ${MAX_DRAFTS}).`);
		for (const draft of body.drafts) {
			const draftRow = {
				id: cap(draft.id, 100),
				user_id: userId,
				title: cap(draft.title, 500),
				draft_data: draft.draftData ?? {},
				selected_option: draft.selectedOption ?? {},
				paper_snapshot: draft.paperSnapshot ?? {},
				analysis: draft.analysis ?? null,
				workflow: draft.workflow ?? null,
				pack_id: draft.packId ? cap(draft.packId, 100) : null,
				pack_context: draft.packContext ?? null,
				created_at: draft.createdAt ?? new Date().toISOString(),
				updated_at: draft.updatedAt ?? new Date().toISOString()
			};

			const { error: draftErr } = await supabase.from('saved_drafts').upsert(draftRow, { onConflict: 'id' });
			if (draftErr) {
				if (isMissingDraftTableError(draftErr.message)) {
					console.warn('Draft upsert skipped because saved_drafts is not migrated yet.');
					break;
				}
				console.error('Draft upsert error:', draftErr.message);
				syncErrors.push(`Draft ${draftRow.id}: ${draftErr.message}`);
			}
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

	if (body.deletedDraftIds && Array.isArray(body.deletedDraftIds)) {
		for (const id of body.deletedDraftIds) {
			const { error: draftDeleteErr } = await supabase.from('saved_drafts').delete().eq('id', id).eq('user_id', userId);
			if (draftDeleteErr && !isMissingDraftTableError(draftDeleteErr.message)) {
				console.error('Draft delete error:', draftDeleteErr.message);
				syncErrors.push(`Delete draft ${id}: ${draftDeleteErr.message}`);
			}
		}
	}

	if (syncErrors.length) {
		throw error(500, `User data sync failed: ${syncErrors.slice(0, 3).join(' | ')}`);
	}

	return json({ ok: true });
};
