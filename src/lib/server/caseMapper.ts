import type { StagedCase, CourtType } from '$lib/types';

export const mapRowToStagedCase = (row: Record<string, any>): StagedCase => ({
	id: row.id,
	title: row.title,
	synopsis: row.synopsis,
	issues: row.issues ?? '',
	remedy: row.remedy ?? '',
	role: row.role,
	sources: row.sources ?? [],
	courtType: (row.court_type ?? row.courtType ?? 'jury') as CourtType,
	createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString()
});
