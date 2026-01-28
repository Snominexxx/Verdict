import type { StagedCase } from '$lib/types';

export const mapRowToStagedCase = (row: Record<string, any>): StagedCase => ({
	id: row.id,
	title: row.title,
	synopsis: row.synopsis,
	issues: row.issues ?? '',
	remedy: row.remedy ?? '',
	role: row.role,
	sources: row.sources ?? [],
	createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString()
});
