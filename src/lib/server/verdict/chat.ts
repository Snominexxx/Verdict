/**
 * Verdict v2 — Create studio chat.
 *
 * Lets the user talk freely with the AI about the case they want to build,
 * always grounded in their uploaded sources. The assistant can ask clarifying
 * questions, tell the user honestly what the sources do and do not cover, and
 * — when enough is settled — signal that it is ready to build the dossier and
 * hand back a distilled, self-contained build request.
 *
 * Source-boundedness rule: the assistant is shown the titles of the selected
 * sources plus passages retrieved for the current turn. It must not promise or
 * describe law that is not in those sources; if something is missing it says so.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	CreateChatMessage,
	CreateChatResult,
	LitigantRole,
	SourcePacket,
	VerdictLanguage
} from '$lib/verdict/contracts';
import { callLLM } from '../providers';
import { parseIntent } from '$lib/verdict/intent';
import { assembleSourcePacket } from './retrieve';

export type CreateChatArgs = {
	supabase: SupabaseClient;
	userId: string;
	messages: CreateChatMessage[];
	sourceIds: string[];
	packId?: string;
	sourceTitles: string[];
	language: VerdictLanguage;
};

// ─────────────────────────────────────────────────────────
// Rendering helpers
// ─────────────────────────────────────────────────────────

const renderPacket = (packet: SourcePacket): string => {
	if (!packet.passages.length) {
		return '(no passages matched this turn — do not invent any; ask the user or say it is not covered)';
	}
	return packet.passages
		.map((p, i) => {
			const head = [p.sourceTitle, p.citation, p.heading].filter(Boolean).join(' — ');
			return `[S${i + 1}] ${head}\n${p.text}`;
		})
		.join('\n\n');
};

const renderConversation = (messages: CreateChatMessage[]): string =>
	messages.map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`).join('\n');

const LANGUAGE_BLOCK = (language: VerdictLanguage): string =>
	language === 'fr'
		? 'LANGUE: Réponds toujours en français.'
		: 'LANGUAGE: Always respond in English.';

// ─────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Verdict's case-building assistant. You help a law student or lawyer shape a litigation training exercise by talking with them naturally, then building it ONLY from their uploaded legal sources.

NON-NEGOTIABLE RULES (this is law — truth and authenticity matter):
1. You may only describe or rely on law that appears in the SELECTED SOURCES / RETRIEVED PASSAGES. Never invent statutes, articles, cases, or quotes.
2. If the user asks for something the sources do not cover, say so plainly and suggest what IS available. Do not pretend.
3. Be conversational and helpful: ask short clarifying questions when useful (topic, the article/section to anchor on, which side they want to argue, the skill to practise).
4. When you have enough to build a coherent case grounded in the sources, set readyToBuild=true and write a clear, self-contained "buildRequest" capturing the topic, the anchoring authority, and the role.
5. Keep replies concise and focused.

Return ONLY valid JSON:
{
  "reply": string,            // your conversational message to the user
  "readyToBuild": boolean,    // true only when a grounded case can be built now
  "buildRequest": string,     // distilled build instruction when ready, else ""
  "suggestedRole": "plaintiff" | "defendant" | null
}`;

const buildUserPrompt = (args: CreateChatArgs, packet: SourcePacket): string =>
	[
		LANGUAGE_BLOCK(args.language),
		'',
		`SELECTED SOURCES (titles the user has chosen):\n${args.sourceTitles.map((t) => `- ${t}`).join('\n') || '(none)'}`,
		'',
		'RETRIEVED PASSAGES (relevant to the latest message — the ONLY law you may rely on right now):',
		renderPacket(packet),
		'',
		'CONVERSATION SO FAR:',
		renderConversation(args.messages),
		'',
		'Respond now as the assistant with the JSON object.'
	].join('\n');

// ─────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────

const extractJson = (raw: string): Record<string, unknown> => {
	const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start === -1 || end === -1) throw new Error('Create chat returned no JSON object');
	return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
};

const asRole = (v: unknown): LitigantRole | undefined =>
	v === 'plaintiff' || v === 'defendant' ? v : undefined;

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export const runCreateChat = async (args: CreateChatArgs): Promise<CreateChatResult> => {
	const lastUser = [...args.messages].reverse().find((m) => m.role === 'user');
	const latest = lastUser?.content ?? '';

	// Ground this turn: ask the AI planner what to look for, then retrieve
	// passages (with 1-hop cross-references) from the user's sources.
	const intent = parseIntent(latest);
	const { packet } = await assembleSourcePacket({
		supabase: args.supabase,
		userId: args.userId,
		intent,
		request: latest,
		conversation: renderConversation(args.messages.slice(-6)),
		sourceIds: args.sourceIds,
		packId: args.packId,
		maxExcerpts: 6,
		language: args.language
	});

	const raw = await callLLM({
		task: 'create-chat',
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: buildUserPrompt(args, packet),
		temperature: 0.6,
		jsonMode: true,
		maxTokens: 900
	});

	const parsed = extractJson(raw);
	const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
	const readyToBuild = parsed.readyToBuild === true;
	const buildRequest = typeof parsed.buildRequest === 'string' ? parsed.buildRequest.trim() : '';

	return {
		reply: reply || (args.language === 'fr' ? 'Pouvez-vous préciser votre demande ?' : 'Could you tell me a bit more about the case you want?'),
		readyToBuild: readyToBuild && buildRequest.length > 0,
		buildRequest,
		suggestedRole: asRole(parsed.suggestedRole)
	};
};
