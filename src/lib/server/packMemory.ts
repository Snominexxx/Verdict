import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LibraryDocument } from '$lib/data/library';
import type {
	EvidenceSufficiency,
	GeminiSourceCache,
	PackLanguage,
	PackMemory,
	PackMemoryAuthority,
	PackMemorySource,
	PackMemorySourceMap,
	PackMemoryTopic,
	SourceBundle
} from '$lib/types';
import { estimateTokens } from '$lib/server/sources';
import { parseLegalStructure } from '$lib/server/legalStructure';

type PackMemoryCacheEntry = {
	memory: PackMemory;
	geminiCache?: GeminiSourceCache;
	expiresAt: number;
};

type PersistedPackMemoryRow = {
	user_id: string;
	pack_signature: string;
	pack_id: string | null;
	source_fingerprint: string;
	language: PackLanguage;
	jurisdiction: string;
	memory: PackMemory;
	gemini_cache: GeminiSourceCache | null;
	gemini_cache_expires_at: string | null;
	updated_at?: string;
};

type PackMemoryRecord = {
	memory: PackMemory;
	geminiCache?: GeminiSourceCache;
};

const PACK_MEMORY_CACHE_TTL_MS = 30 * 60_000;
const PACK_MEMORY_CACHE_LIMIT = 64;
const PACK_MEMORY_VERSION = 'pack-memory-v1' as const;
const GEMINI_CACHE_TTL_SECONDS = Number(env.GEMINI_SOURCE_CACHE_TTL_SECONDS ?? 3600);
const MAX_MEMORY_UNITS_PER_SOURCE = 240;
const MAX_MEMORY_UNIT_PREVIEW_CHARS = 360;
const MAX_MEMORY_FALLBACK_SOURCE_CHARS = 24_000;
const MAX_PACK_SOURCE_MAP_UNITS = 32;
const MAX_PACK_SOURCE_MAP_PREVIEW_CHARS = 220;

const packMemoryCache = new Map<string, PackMemoryCacheEntry>();

const cleanText = (value: unknown, fallback = ''): string => {
	const text = String(value ?? '').trim();
	return text || fallback;
};

const normalize = (value: string): string =>
	value
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

const hashText = (value: string): string => createHash('sha256').update(value).digest('hex');

const shortHash = (value: string): string => hashText(value).slice(0, 16);

const sourceContent = (source: LibraryDocument): string => cleanText(source.content || source.description);

const stringArray = (value: unknown, limit = 10): string[] =>
	Array.isArray(value)
		? Array.from(new Set(value.map((item) => cleanText(item)).filter(Boolean))).slice(0, limit)
		: [];

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const parseJsonObject = (raw: string): Record<string, unknown> => {
	const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start < 0 || end <= start) throw new Error('Pack memory response did not contain a JSON object.');
	return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
};

export const buildSourceFingerprint = (sources: LibraryDocument[]): string => {
	const material = sources
		.map((source) => `${source.id}\u001f${source.title}\u001f${shortHash(sourceContent(source))}`)
		.sort()
		.join('\n');
	return hashText(material);
};

export const buildPackMemoryCacheKey = (userId: string, packSignature: string, sourceFingerprint: string): string =>
	`${userId}:${packSignature}:${sourceFingerprint}`;

const pruneMemoryCache = (): void => {
	const now = Date.now();
	for (const [key, entry] of packMemoryCache) {
		if (entry.expiresAt <= now) packMemoryCache.delete(key);
	}
};

const readProcessCache = (cacheKey: string): PackMemoryRecord | null => {
	pruneMemoryCache();
	const cached = packMemoryCache.get(cacheKey);
	if (!cached) return null;
	return { memory: cached.memory, geminiCache: cached.geminiCache };
};

const writeProcessCache = (cacheKey: string, record: PackMemoryRecord): void => {
	pruneMemoryCache();
	if (packMemoryCache.size >= PACK_MEMORY_CACHE_LIMIT) {
		const oldestKey = packMemoryCache.keys().next().value;
		if (oldestKey) packMemoryCache.delete(oldestKey);
	}
	packMemoryCache.set(cacheKey, {
		memory: record.memory,
		geminiCache: record.geminiCache,
		expiresAt: Date.now() + PACK_MEMORY_CACHE_TTL_MS
	});
};

const sourceInventory = (sources: LibraryDocument[]): PackMemorySource[] =>
	sources.map((source) => {
		const content = sourceContent(source);
		return {
			sourceId: source.id,
			title: source.title,
			jurisdiction: source.jurisdiction,
			docType: source.docType,
			approxTokens: estimateTokens(content),
			contentHash: hashText(content)
		};
	});

const previewText = (value: string, maxChars: number): string => value.replace(/\s+/g, ' ').trim().slice(0, maxChars);

const extractRelatedTerms = (value: string, limit = 8): string[] => {
	const tokens = normalize(value)
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 4);
	return Array.from(new Set(tokens)).slice(0, limit);
};

const buildPackSourceMaps = (sources: LibraryDocument[]): PackMemorySourceMap[] =>
	sources.map((source) => {
		const structure = parseLegalStructure(sourceContent(source));
		return {
			sourceId: source.id,
			title: source.title,
			mode: structure.audit.mode,
			reliableForClassroom: structure.audit.reliableForClassroom,
			qualityScore: structure.audit.qualityScore,
			coverageRatio: structure.audit.coverageRatio,
			language: structure.audit.language,
			bilingualRisk: structure.audit.bilingualRisk,
			warnings: structure.audit.warnings.slice(0, 6),
			units: structure.units.slice(0, MAX_PACK_SOURCE_MAP_UNITS).map((unit) => ({
				unitId: unit.unitId,
				kind: unit.kind,
				citation: unit.citation,
				heading: unit.heading,
				path: unit.path,
				preview: previewText(unit.content, MAX_PACK_SOURCE_MAP_PREVIEW_CHARS),
				relatedTerms: extractRelatedTerms([
					source.title,
					unit.citation ?? '',
					unit.heading,
					...unit.path
				].join(' ')),
				confidence: unit.confidence,
				tokenCount: unit.tokenCount
			}))
		};
	});

const withDerivedSourceMaps = (memory: PackMemory, sources: LibraryDocument[]): PackMemory => {
	const nextSourceInventory = sourceInventory(sources);
	const nextSourceMaps = memory.sourceMaps?.length ? memory.sourceMaps : buildPackSourceMaps(sources);
	const needsUpgrade = !memory.sourceMaps?.length
		|| memory.sourceInventory.length !== nextSourceInventory.length;
	if (!needsUpgrade) return memory;
	return {
		...memory,
		sourceInventory: nextSourceInventory,
		sourceMaps: nextSourceMaps
	};
};

const citationPattern = /\b(?:article|articles|art\.?|section|sections|sec\.?|s\.|paragraph|paragraphs|para\.?|par\.?|clause|clauses|§)\s*\d+(?:[A-Za-z0-9()./-]+)*/gi;

const extractCitationLabel = (value: string): string | undefined => value.match(citationPattern)?.[0]?.trim();

const authorityIdFor = (sourceId: string, citation: string | undefined, fallback: string): string =>
	`${sourceId}:${normalize(citation || fallback).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || shortHash(fallback)}`;

const inferAuthorityRole = (text: string): PackMemoryAuthority['role'] => {
	if (/defen[cs]e|self-defen[cs]e|justification|exception|consent|exemption|moyen de defense|défense/i.test(text)) return 'defence';
	if (/definition|means|includes|interpre/i.test(text)) return 'definition';
	if (/penalty|sentence|remedy|damage|reparation|sanction|peine/i.test(text)) return 'remedy';
	if (/procedure|appeal|burden|evidence|preuve|procedure/i.test(text)) return 'procedure';
	if (/court|tribunal|decision|appel|paragraph|para\./i.test(text)) return 'case-law';
	return 'main-rule';
};

const makeFallbackMemory = (args: {
	sources: LibraryDocument[];
	packSignature: string;
	sourceFingerprint: string;
	language: PackLanguage;
	jurisdiction: string;
}): PackMemory => {
	const authorities: PackMemoryAuthority[] = [];
	const topicsByName = new Map<string, PackMemoryTopic>();

	for (const source of args.sources) {
		const content = sourceContent(source);
		const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
		const candidates = paragraphs.filter((paragraph) => extractCitationLabel(paragraph)).slice(0, 24);
		for (const paragraph of candidates) {
			const citation = extractCitationLabel(paragraph);
			const topic = cleanText(source.title, 'Selected source');
			const authorityId = authorityIdFor(source.id, citation, paragraph);
			authorities.push({
				authorityId,
				sourceId: source.id,
				sourceTitle: source.title,
				citation,
				topic,
				role: inferAuthorityRole(paragraph),
				relatedAuthorityIds: [],
				relatedTerms: [],
				retrievalNotes: paragraph.slice(0, 260),
				verificationStatus: 'verified'
			});
			const existing = topicsByName.get(topic) ?? {
				topic,
				authorityIds: [],
				relatedTerms: [],
				missingCoverage: [],
				retrievalStrategy: 'Use citation lookup first, then include adjacent provisions and source-neighbor passages before reasoning.'
			};
			existing.authorityIds.push(authorityId);
			topicsByName.set(topic, existing);
		}
	}

	return {
		version: PACK_MEMORY_VERSION,
		packSignature: args.packSignature,
		sourceFingerprint: args.sourceFingerprint,
		generatedAt: new Date().toISOString(),
		language: args.language,
		jurisdiction: args.jurisdiction,
		sourceInventory: sourceInventory(args.sources),
		sourceMaps: buildPackSourceMaps(args.sources),
		summary: args.language === 'fr'
			? 'Memoire de pack construite localement a partir des titres, citations detectees et textes sources charges. Utiliser comme carte de navigation seulement; verifier contre les extraits exacts.'
			: 'Pack memory built locally from loaded source titles, detected citations, and source text. Use as a navigation map only; verify against exact excerpts.',
		topics: Array.from(topicsByName.values()).slice(0, 20),
		authorities: authorities.slice(0, 80),
		gaps: [],
		safetyRules: [
			'Pack Memory is a navigation map, not legal authority.',
			'Every legal claim must be checked against exact source excerpts before Build or Judge output.',
			'If related exceptions, defences, or counter-rules may exist but are not retrieved, request broader evidence before answering.'
		]
	};
};

const normaliseAuthority = (value: unknown, index: number, sources: LibraryDocument[]): PackMemoryAuthority => {
	const raw = asRecord(value);
	const sourceTitle = cleanText(raw.sourceTitle, cleanText(raw.title, 'Selected source'));
	const source = sources.find((candidate) => normalize(candidate.title) === normalize(sourceTitle)) ?? sources[0];
	const citation = cleanText(raw.citation) || undefined;
	const topic = cleanText(raw.topic, cleanText(raw.legalTopic, sourceTitle));
	const fallbackId = `${source?.id ?? 'source'}:${citation ?? topic}:${index}`;
	const role = cleanText(raw.role) as PackMemoryAuthority['role'];
	const roles: PackMemoryAuthority['role'][] = ['main-rule', 'definition', 'exception', 'defence', 'procedure', 'remedy', 'case-law', 'context', 'other'];
	const verification = cleanText(raw.verificationStatus) as PackMemoryAuthority['verificationStatus'];
	return {
		authorityId: cleanText(raw.authorityId, authorityIdFor(source?.id ?? 'source', citation, fallbackId)),
		sourceId: cleanText(raw.sourceId, source?.id),
		sourceTitle: source?.title ?? sourceTitle,
		citation,
		topic,
		role: roles.includes(role) ? role : 'other',
		relatedAuthorityIds: stringArray(raw.relatedAuthorityIds, 10),
		relatedTerms: stringArray(raw.relatedTerms, 12),
		retrievalNotes: cleanText(raw.retrievalNotes, cleanText(raw.reason, 'Retrieve exact source text before relying on this authority.')).slice(0, 500),
		verificationStatus: ['verified', 'needs-review', 'unverified'].includes(verification) ? verification : 'needs-review'
	};
};

const normaliseTopic = (value: unknown, authorities: PackMemoryAuthority[]): PackMemoryTopic => {
	const raw = asRecord(value);
	const topic = cleanText(raw.topic, cleanText(raw.name, 'Source topic'));
	const authorityIds = stringArray(raw.authorityIds, 16).filter((id) => authorities.some((authority) => authority.authorityId === id));
	return {
		topic,
		authorityIds,
		relatedTerms: stringArray(raw.relatedTerms, 16),
		missingCoverage: stringArray(raw.missingCoverage, 8),
		retrievalStrategy: cleanText(raw.retrievalStrategy, 'Fetch listed authorities, neighbors, and related authority IDs before reasoning.')
	};
};

const normaliseMemory = (args: {
	raw: string;
	sources: LibraryDocument[];
	packSignature: string;
	sourceFingerprint: string;
	language: PackLanguage;
	jurisdiction: string;
}): PackMemory => {
	const parsed = parseJsonObject(args.raw);
	const authorityRows = Array.isArray(parsed.authorities) ? parsed.authorities.slice(0, 120) : [];
	const authorities = authorityRows.map((authority, index) => normaliseAuthority(authority, index, args.sources));
	const topicRows = Array.isArray(parsed.topics) ? parsed.topics.slice(0, 32) : [];
	const topics = topicRows.map((topic) => normaliseTopic(topic, authorities));
	return {
		version: PACK_MEMORY_VERSION,
		packSignature: args.packSignature,
		sourceFingerprint: args.sourceFingerprint,
		generatedAt: cleanText(parsed.generatedAt, new Date().toISOString()),
		language: args.language,
		jurisdiction: cleanText(parsed.jurisdiction, args.jurisdiction),
		sourceInventory: sourceInventory(args.sources),
		sourceMaps: buildPackSourceMaps(args.sources),
		summary: cleanText(parsed.summary, cleanText(parsed.sourceSummary, 'Sources analyzed; use exact retrieved passages as authority.')),
		topics: topics.length ? topics : makeFallbackMemory(args).topics,
		authorities: authorities.length ? authorities : makeFallbackMemory(args).authorities,
		gaps: stringArray(parsed.gaps, 12),
		safetyRules: stringArray(parsed.safetyRules, 12).length
			? stringArray(parsed.safetyRules, 12)
			: [
				'Pack Memory is a navigation map, not legal authority.',
				'Fetch exact passages and verify citations before any final legal output.',
				'If evidence is incomplete, ask for more retrieval or narrow the exercise.'
			]
	};
};

const renderSourcesForMemory = (sources: LibraryDocument[]): string =>
	sources
		.map((source, index) => {
			const content = sourceContent(source);
			const meta = [source.jurisdiction, source.docType, source.trustLevel].filter(Boolean).join(' | ');
			const structure = parseLegalStructure(content);
			if (structure.audit.mode === 'structured-legal' && structure.units.length) {
				const units = structure.units.slice(0, MAX_MEMORY_UNITS_PER_SOURCE).map((unit, unitIndex) => {
					const path = unit.path.length ? ` | path=${unit.path.join(' > ')}` : '';
					const preview = unit.content.replace(/\s+/g, ' ').slice(0, MAX_MEMORY_UNIT_PREVIEW_CHARS);
					return `${unitIndex + 1}. ${unit.citation ?? unit.label} (${unit.kind}, ${unit.confidence})${path}\nHeading: ${unit.heading}\nPreview: ${preview}`;
				});
				const truncated = structure.units.length > units.length
					? `\nNOTE: ${structure.units.length - units.length} additional legal units omitted from this compact map; ask retrieval for neighboring provisions before relying on gaps.`
					: '';
				return `SOURCE ${index + 1}: ${source.title}${meta ? ` (${meta})` : ''}
ID: ${source.id}
STRUCTURED LEGAL MAP
Audit: ${JSON.stringify(structure.audit)}
${units.join('\n\n')}${truncated}`;
			}

			const fallback = content.slice(0, MAX_MEMORY_FALLBACK_SOURCE_CHARS);
			const truncated = content.length > fallback.length
				? `\nNOTE: Source text was shortened for Pack Memory. Use exact retrieval before relying on omitted text.`
				: '';
			return `SOURCE ${index + 1}: ${source.title}${meta ? ` (${meta})` : ''}\nID: ${source.id}\nUNSTRUCTURED SOURCE PREVIEW\n${fallback || '(No source text available.)'}${truncated}`;
		})
		.join('\n\n---\n\n');

const geminiClient = (): GoogleGenAI | null => {
	if (!env.GOOGLE_API_KEY) return null;
	return new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });
};

const geminiModel = (): string => env.GEMINI_DOSSIER_MODEL ?? env.GEMINI_PRO_MODEL ?? env.GEMINI_MODEL ?? 'gemini-2.5-pro';

const createGeminiSourceCache = async (args: {
	sources: LibraryDocument[];
	packSignature: string;
	language: PackLanguage;
}): Promise<GeminiSourceCache | undefined> => {
	if ((env.GEMINI_EXPLICIT_SOURCE_CACHE ?? 'false').toLowerCase() !== 'true') return undefined;
	const client = geminiClient();
	if (!client || !client.caches?.create) return undefined;
	try {
		const cache = await client.caches.create({
			model: geminiModel(),
			config: {
				displayName: `verdict-pack-${shortHash(args.packSignature)}`,
				systemInstruction: args.language === 'fr'
					? 'Vous etes le contexte de navigation source de Verdict. Cette carte aide a recuperer les passages exacts; elle ne remplace jamais le texte source exact.'
					: 'You are Verdict cached source-navigation context. This map helps retrieve exact passages; it never replaces exact source text.',
				contents: [{ role: 'user', parts: [{ text: renderSourcesForMemory(args.sources) }] }],
				ttl: `${Math.max(300, GEMINI_CACHE_TTL_SECONDS)}s`
			}
		});
		const expiresAt = cache.expireTime ? new Date(cache.expireTime).toISOString() : undefined;
		return {
			name: cache.name ?? '',
			expiresAt,
			tokenCount: cache.usageMetadata?.totalTokenCount
		};
	} catch (err) {
		console.warn('[pack-memory] Gemini explicit source cache unavailable:', err);
		return undefined;
	}
};

const readPersistedMemory = async (args: {
	supabase: SupabaseClient;
	userId: string;
	packSignature: string;
	sourceFingerprint: string;
}): Promise<PackMemoryRecord | null> => {
	const { data, error } = await args.supabase
		.from('pack_memories')
		.select('memory, gemini_cache, gemini_cache_expires_at')
		.eq('user_id', args.userId)
		.eq('pack_signature', args.packSignature)
		.eq('source_fingerprint', args.sourceFingerprint)
		.maybeSingle();

	if (error) {
		console.warn('[pack-memory] Persistent pack memory read skipped:', error.message);
		return null;
	}
	if (!data?.memory) return null;
	const cache = data.gemini_cache as GeminiSourceCache | null;
	const aliveCache = cache?.name && (!cache.expiresAt || Date.parse(cache.expiresAt) > Date.now()) ? cache : undefined;
	return { memory: data.memory as PackMemory, geminiCache: aliveCache };
};

const writePersistedMemory = async (args: {
	supabase: SupabaseClient;
	userId: string;
	packId?: string;
	memory: PackMemory;
	geminiCache?: GeminiSourceCache;
}): Promise<void> => {
	const row: PersistedPackMemoryRow = {
		user_id: args.userId,
		pack_signature: args.memory.packSignature,
		pack_id: args.packId ?? null,
		source_fingerprint: args.memory.sourceFingerprint,
		language: args.memory.language,
		jurisdiction: args.memory.jurisdiction,
		memory: args.memory,
		gemini_cache: args.geminiCache ?? null,
		gemini_cache_expires_at: args.geminiCache?.expiresAt ?? null
	};
	const { error } = await args.supabase.from('pack_memories').upsert(row, { onConflict: 'user_id,pack_signature,source_fingerprint' });
	if (error) {
		console.warn('[pack-memory] Persistent pack memory write skipped:', error.message);
	}
};

export const ensurePackMemory = async (args: {
	supabase: SupabaseClient;
	userId: string;
	packId?: string;
	packSignature: string;
	language: PackLanguage;
	jurisdiction: string;
	sources: LibraryDocument[];
	callLLM: (request: { systemPrompt: string; userPrompt: string; schema: Record<string, unknown>; maxTokens: number }) => Promise<string>;
}): Promise<PackMemoryRecord> => {
	const sourceFingerprint = buildSourceFingerprint(args.sources);
	const cacheKey = buildPackMemoryCacheKey(args.userId, args.packSignature, sourceFingerprint);
	const cached = readProcessCache(cacheKey);
	if (cached) {
		const upgraded = { memory: withDerivedSourceMaps(cached.memory, args.sources), geminiCache: cached.geminiCache };
		if (upgraded.memory !== cached.memory) writeProcessCache(cacheKey, upgraded);
		return upgraded;
	}

	const persisted = await readPersistedMemory({
		supabase: args.supabase,
		userId: args.userId,
		packSignature: args.packSignature,
		sourceFingerprint
	});
	if (persisted) {
		const upgraded = { memory: withDerivedSourceMaps(persisted.memory, args.sources), geminiCache: persisted.geminiCache };
		writeProcessCache(cacheKey, upgraded);
		if (upgraded.memory !== persisted.memory) {
			await writePersistedMemory({
				supabase: args.supabase,
				userId: args.userId,
				packId: args.packId,
				memory: upgraded.memory,
				geminiCache: upgraded.geminiCache
			});
		}
		return upgraded;
	}

	const schema = {
		type: 'object',
		additionalProperties: false,
		required: ['summary', 'topics', 'authorities', 'gaps', 'safetyRules'],
		properties: {
			summary: { type: 'string' },
			topics: {
				type: 'array',
				maxItems: 12,
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['topic', 'authorityIds', 'relatedTerms', 'missingCoverage', 'retrievalStrategy'],
					properties: {
						topic: { type: 'string' },
						authorityIds: { type: 'array', maxItems: 8, items: { type: 'string' } },
						relatedTerms: { type: 'array', maxItems: 8, items: { type: 'string' } },
						missingCoverage: { type: 'array', maxItems: 4, items: { type: 'string' } },
						retrievalStrategy: { type: 'string' }
					}
				}
			},
			authorities: {
				type: 'array',
				maxItems: 24,
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['authorityId', 'sourceTitle', 'citation', 'topic', 'role', 'relatedAuthorityIds', 'relatedTerms', 'retrievalNotes', 'verificationStatus'],
					properties: {
						authorityId: { type: 'string' },
						sourceTitle: { type: 'string' },
						citation: { type: 'string' },
						topic: { type: 'string' },
						role: { type: 'string' },
						relatedAuthorityIds: { type: 'array', maxItems: 6, items: { type: 'string' } },
						relatedTerms: { type: 'array', maxItems: 8, items: { type: 'string' } },
						retrievalNotes: { type: 'string' },
						verificationStatus: { type: 'string' }
					}
				}
			},
			gaps: { type: 'array', maxItems: 8, items: { type: 'string' } },
			safetyRules: { type: 'array', maxItems: 8, items: { type: 'string' } }
		}
	};

	const systemPrompt = args.language === 'fr'
		? 'Vous etes le moteur de memoire juridique de Verdict. Utilisez la carte structuree des sources pour creer une carte de navigation compacte. Ne traitez jamais cette carte comme autorite finale. Repondez uniquement en JSON valide.'
		: 'You are Verdict legal pack memory engine. Use the structured source map to create a compact navigation map. Never treat this map as final authority. Respond only with valid JSON.';
	const userPrompt = `PACK CONTEXT
Jurisdiction: ${args.jurisdiction}
Language: ${args.language}

SOURCE INVENTORY
${sourceInventory(args.sources).map((source) => `- ${source.sourceId}: ${source.title} (${source.approxTokens} est. tokens)`).join('\n')}

STRUCTURED SOURCE MAPS
${renderSourcesForMemory(args.sources)}

TASK
Create a compact Pack Memory for later legal retrieval planning. This is a notebook, not authority. Do not quote or rewrite source text. For every authority you identify, provide sourceTitle, citation when present, topic, role, related authority IDs, related search terms, and retrieval notes. Include exceptions, defences, definitions, related provisions, and gaps when the structured map reveals them. If a topic may require exact text not present in the map, put that in gaps. Use stable short authorityId values that can be reused later.`;

	let memory: PackMemory;
	try {
		const content = await args.callLLM({ systemPrompt, userPrompt, schema, maxTokens: 6500 });
		memory = normaliseMemory({
			raw: content,
			sources: args.sources,
			packSignature: args.packSignature,
			sourceFingerprint,
			language: args.language,
			jurisdiction: args.jurisdiction
		});
	} catch (err) {
		console.warn('[pack-memory] Gemini pack memory unavailable; using deterministic fallback:', err);
		memory = makeFallbackMemory({
			sources: args.sources,
			packSignature: args.packSignature,
			sourceFingerprint,
			language: args.language,
			jurisdiction: args.jurisdiction
		});
	}

	const geminiCache = await createGeminiSourceCache({ sources: args.sources, packSignature: args.packSignature, language: args.language });
	const record = { memory, geminiCache };
	writeProcessCache(cacheKey, record);
	await writePersistedMemory({
		supabase: args.supabase,
		userId: args.userId,
		packId: args.packId,
		memory,
		geminiCache
	});
	return record;
};

export const renderPackMemoryBlock = (memory: PackMemory): string =>
	`PACK MEMORY (${memory.version})
Generated: ${memory.generatedAt}
Jurisdiction: ${memory.jurisdiction}
Summary: ${memory.summary}
Source maps: ${memory.sourceMaps?.length ?? 0}

Topics:
${memory.topics.map((topic) => `- ${topic.topic}: authorities=[${topic.authorityIds.join(', ')}]; related=[${topic.relatedTerms.join(', ')}]; strategy=${topic.retrievalStrategy}`).join('\n')}

Authorities:
${memory.authorities.map((authority) => `- ${authority.authorityId}: ${authority.sourceTitle}${authority.citation ? `, ${authority.citation}` : ''}; role=${authority.role}; topic=${authority.topic}; related=[${authority.relatedAuthorityIds.join(', ')}]; terms=[${authority.relatedTerms.join(', ')}]; notes=${authority.retrievalNotes}`).join('\n')}

Gaps:
${memory.gaps.map((gap) => `- ${gap}`).join('\n') || '- None recorded.'}

Safety Rules:
${memory.safetyRules.map((rule) => `- ${rule}`).join('\n')}`;

export const renderPackSourceMapBlock = (memory: PackMemory, options?: { maxSources?: number; maxUnitsPerSource?: number }): string => {
	const maxSources = Math.max(1, options?.maxSources ?? 6);
	const maxUnitsPerSource = Math.max(1, options?.maxUnitsPerSource ?? 10);
	const sourceMaps = memory.sourceMaps?.slice(0, maxSources) ?? [];
	if (!sourceMaps.length) {
		return 'PACK SOURCE MAP\nUnavailable. Use Pack Memory authorities and exact retrieved passages only.';
	}

	return `PACK SOURCE MAP
${sourceMaps.map((sourceMap, sourceIndex) => {
		const unitLines = sourceMap.units.slice(0, maxUnitsPerSource).map((unit, unitIndex) => {
			const path = unit.path.length ? ` | path=${unit.path.join(' > ')}` : '';
			const citation = unit.citation ? ` | citation=${unit.citation}` : '';
			const related = unit.relatedTerms.length ? ` | terms=${unit.relatedTerms.join(', ')}` : '';
			return `${sourceIndex + 1}.${unitIndex + 1} ${unit.kind}${citation}${path}${related}\nHeading: ${unit.heading}\nPreview: ${unit.preview}`;
		}).join('\n\n');
		const warnings = sourceMap.warnings.length ? `\nWarnings: ${sourceMap.warnings.join(' | ')}` : '';
		return `SOURCE ${sourceIndex + 1}: ${sourceMap.title}\nMode: ${sourceMap.mode} | quality=${sourceMap.qualityScore} | coverage=${sourceMap.coverageRatio} | reliable=${sourceMap.reliableForClassroom}${warnings}\n${unitLines}`;
	}).join('\n\n')}`;
};

export const renderGeminiCacheBlock = (cache?: GeminiSourceCache): string =>
	cache?.name
		? `GEMINI SOURCE-NAVIGATION CACHE
Name: ${cache.name}
Expires: ${cache.expiresAt ?? 'unknown'}
Use: If this cache is still active, the compact source map remains available for retrieval planning. Exact retrieved passages still control final citations.`
		: `GEMINI SOURCE-NAVIGATION CACHE
Unavailable for this turn. Use Pack Memory plus exact retrieved passages; broaden retrieval from the stored source library if evidence is incomplete.`;

export const buildEvidenceSufficiency = (args: {
	bundle: SourceBundle;
	memory?: PackMemory | null;
	query: string;
}): EvidenceSufficiency => {
	const normalizedQuery = normalize(args.query);
	const evidenceText = normalize(
		args.bundle.excerpts.map((excerpt) => `${excerpt.sourceTitle}\n${excerpt.citation ?? ''}\n${excerpt.heading ?? ''}\n${excerpt.excerpt}`).join('\n\n')
	);
	const queryTokens = new Set(normalizedQuery.split(/\s+/).filter((token) => token.length >= 4));
	const relevantAuthorities = args.memory?.authorities.filter((authority) => {
		const citation = normalize(authority.citation ?? '');
		if (citation && normalizedQuery.includes(citation)) return true;

		const broadTopic = normalize(authority.sourceTitle) === normalize(authority.topic);
		const terms = [
			...(broadTopic ? [] : [authority.topic]),
			...authority.relatedTerms
		]
			.map((term) => normalize(term ?? ''))
			.filter((term) => term.length >= 4);

		return terms.some((term) => {
			if (normalizedQuery.includes(term)) return true;
			return term.split(/\s+/).some((token) => token.length >= 4 && queryTokens.has(token));
		});
	}) ?? [];
	const missingAuthorities = relevantAuthorities.filter((authority) => {
		const citation = normalize(authority.citation ?? '');
		return citation && !evidenceText.includes(citation);
	});
	const hasDefenceRisk = /defen[cs]e|self-defen[cs]e|exception|consent|justification|défense|moyen de defense/i.test(args.query);
	const defenceCovered = !hasDefenceRisk || /defen[cs]e|self-defen[cs]e|exception|consent|justification|défense|moyen de defense/i.test(evidenceText);
	const mainRuleCovered = args.bundle.excerpts.length > 0 && args.bundle.coverage !== 'low';
	const canProceed = mainRuleCovered && defenceCovered && missingAuthorities.length === 0;
	return {
		canProceed,
		coverage: canProceed && args.bundle.coverage === 'high' ? 'high' : canProceed ? 'medium' : 'low',
		mainRuleCovered,
		exceptionsCovered: defenceCovered,
		counterArgumentsCovered: args.bundle.excerptCount >= 3 || !hasDefenceRisk,
		missingConcepts: [
			...missingAuthorities.map((authority) => authority.citation || authority.topic),
			...(defenceCovered ? [] : ['defence / exception boundaries'])
		],
		fetchMore: missingAuthorities.map((authority) => authority.authorityId),
		reason: canProceed
			? 'Retrieved evidence covers the apparent request, including the main authorities identified in Pack Memory.'
			: 'Retrieved evidence may be incomplete; broaden retrieval using Pack Memory, neighboring provisions, or full-pack cache before final legal reasoning.'
	};
};