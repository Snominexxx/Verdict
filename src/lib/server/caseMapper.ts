import type { StagedCase, CourtType } from '$lib/types';

export const mapRowToStagedCase = (row: Record<string, any>): StagedCase => {
	const rawTargetSkill = row.target_skill ?? row.targetSkill;
	const judgeBrief = row.judge_brief ?? row.judgeBrief;
	const groundingAudit = row.grounding_audit ?? row.groundingAudit;
	const judgePacket = row.judge_packet ?? row.judgePacket;
	const practicePoints = Array.isArray(row.practice_points ?? row.practicePoints)
		? (row.practice_points ?? row.practicePoints).map(String).filter(Boolean)
		: [];

	return {
		id: row.id,
		title: row.title,
		synopsis: row.synopsis,
		issues: row.issues ?? '',
		remedy: row.remedy ?? '',
		objective: typeof row.objective === 'string' && row.objective.trim() ? row.objective : undefined,
		targetSkill: typeof rawTargetSkill === 'string' && rawTargetSkill.trim() ? rawTargetSkill : undefined,
		practicePoints: practicePoints.length ? practicePoints : undefined,
		judgeBrief: judgeBrief && typeof judgeBrief === 'object' ? judgeBrief : undefined,
		groundingAudit: groundingAudit && typeof groundingAudit === 'object' ? groundingAudit : undefined,
		role: row.role,
		sources: row.sources ?? [],
		packId: row.pack_id ?? row.packId ?? undefined,
		paperSnapshot: row.paper_snapshot ?? row.paperSnapshot ?? undefined,
		judgePacket: judgePacket && typeof judgePacket === 'object' ? judgePacket : undefined,
		courtType: 'bench' as CourtType,
		createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString()
	};
};
