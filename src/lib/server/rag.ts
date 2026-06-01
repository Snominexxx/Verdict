/**
 * Verdict — Document text storage.
 *
 * Persists user-uploaded legal documents in Supabase. Verdict now uses a
 * full-context architecture: at query time the LLM receives the complete
 * text of every selected source (assembled by `$lib/server/sources`) and
 * reasons over it directly. No embeddings, no semantic search.
 *
 * The `document_chunks` table is reused as ordered text storage so we can
 * reconstruct the full document by concatenating rows in `chunk_index` order.
 * The `embedding` column stays nullable for backwards compatibility with
 * pre-existing rows but is never written.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	legalStructureMetadataForUnit,
	parseLegalStructure,
	type LegalStructureAudit
} from '$lib/server/legalStructure';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type DocumentChunk = {
	heading: string;
	content: string;
	chunkIndex: number;
	tokenCount: number;
	metadata?: Record<string, unknown>;
};

export type ChunkMetadata = {
	title: string;
	jurisdiction: string;
	docType?: string;
	trustLevel?: string;
	sourceUrl?: string;
	storagePath?: string;
	mimeType?: string;
	originalFileName?: string;
	fileSize?: number;
};

export type StoreChunksResult = {
	chunkCount: number;
	ingestionAudit: LegalStructureAudit;
};

// ─────────────────────────────────────────────────────────
// 1. CHUNKING — Split legal documents intelligently
// ─────────────────────────────────────────────────────────

/**
 * Patterns that mark the beginning of a new legal section.
 * Matches: "Art. 1457", "Article 12", "Section 3", "Chapter II",
 * "PART 1", "DIVISION I", "§ 42", "s. 15", numbered items like "1." etc.
 */
const SECTION_PATTERN =
	/(?:^|\n)\s*(?:Art(?:icle)?\.?\s*\d+|Section\s+\d+|CHAPTER\s+[IVXLCDM\d]+|PART\s+[IVXLCDM\d]+|DIVISION\s+[IVXLCDM\d]+|§\s*\d+|s\.\s*\d+|\d+\.\s+[A-Z])/gm;

const TARGET_CHUNK_SIZE = 800;  // ~800 tokens per chunk (sweet spot for embedding quality)
const MAX_CHUNK_SIZE = 1500;    // never exceed this
const MIN_CHUNK_SIZE = 100;     // don't create tiny orphan chunks

/** Rough token estimate: ~4 chars per token for English/French legal text */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * Split a legal document into semantically meaningful chunks.
 * Tries to split by article/section boundaries first,
 * then falls back to paragraph splitting for non-structured text.
 */
export const prepareDocumentChunks = (text: string): StoreChunksResult & { chunks: DocumentChunk[] } => {
	const cleaned = text.replace(/\r\n/g, '\n').trim();
	if (!cleaned) {
		const structure = parseLegalStructure('');
		return { chunks: [], chunkCount: 0, ingestionAudit: structure.audit };
	}

	const structure = parseLegalStructure(cleaned);
	if (structure.audit.mode === 'structured-legal' && structure.units.length) {
		const chunks = structure.units.map((unit, index) => ({
			heading: unit.heading || unit.citation || unit.label,
			content: unit.content,
			chunkIndex: index,
			tokenCount: unit.tokenCount,
			metadata: legalStructureMetadataForUnit(unit)
		}));
		return { chunks, chunkCount: chunks.length, ingestionAudit: structure.audit };
	}

	// Try structure-aware splitting first
	const sections = splitBySections(cleaned);
	if (sections.length > 1) {
		const chunks = balanceChunks(sections);
		return { chunks, chunkCount: chunks.length, ingestionAudit: structure.audit };
	}

	// Fallback: split by paragraphs / double newlines
	const chunks = splitByParagraphs(cleaned);
	return { chunks, chunkCount: chunks.length, ingestionAudit: structure.audit };
};

export const chunkDocument = (text: string): DocumentChunk[] => prepareDocumentChunks(text).chunks;

/**
 * Split by legal section markers (Art., Section, Chapter, etc.)
 */
const splitBySections = (text: string): DocumentChunk[] => {
	const matches = [...text.matchAll(SECTION_PATTERN)];
	if (matches.length < 2) return [];

	const chunks: DocumentChunk[] = [];
	for (let i = 0; i < matches.length; i++) {
		const start = matches[i].index!;
		const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
		const content = text.slice(start, end).trim();
		if (!content) continue;

		// Extract heading (first line or matched pattern)
		const firstLine = content.split('\n')[0].trim();
		const heading = firstLine.length <= 120 ? firstLine : firstLine.slice(0, 120);

		chunks.push({
			heading,
			content,
			chunkIndex: chunks.length,
			tokenCount: estimateTokens(content)
		});
	}

	// Add any preamble before the first section marker
	if (matches.length && matches[0].index! > MIN_CHUNK_SIZE) {
		const preamble = text.slice(0, matches[0].index!).trim();
		if (preamble.length >= MIN_CHUNK_SIZE) {
			chunks.unshift({
				heading: 'Preamble',
				content: preamble,
				chunkIndex: 0,
				tokenCount: estimateTokens(preamble)
			});
			// Re-index
			chunks.forEach((c, i) => (c.chunkIndex = i));
		}
	}

	return chunks;
};

/**
 * Fallback: split by paragraphs, merge small ones, split large ones.
 */
const splitByParagraphs = (text: string): DocumentChunk[] => {
	const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
	const chunks: DocumentChunk[] = [];
	let buffer = '';
	let heading = '';

	for (const para of paragraphs) {
		const combined = buffer ? `${buffer}\n\n${para}` : para;
		const tokens = estimateTokens(combined);

		if (tokens > MAX_CHUNK_SIZE && buffer) {
			// Flush buffer, start new chunk with current paragraph
			chunks.push({
				heading: heading || `Section ${chunks.length + 1}`,
				content: buffer.trim(),
				chunkIndex: chunks.length,
				tokenCount: estimateTokens(buffer)
			});
			buffer = para;
			heading = para.split('\n')[0].trim().slice(0, 120);
		} else if (tokens > MAX_CHUNK_SIZE) {
			// Single paragraph too large — force split by sentences
			const sentenceChunks = splitBySentences(para);
			for (const sc of sentenceChunks) {
				chunks.push({
					heading: `Section ${chunks.length + 1}`,
					content: sc,
					chunkIndex: chunks.length,
					tokenCount: estimateTokens(sc)
				});
			}
			buffer = '';
			heading = '';
		} else if (tokens >= TARGET_CHUNK_SIZE) {
			// Good size — flush
			chunks.push({
				heading: heading || `Section ${chunks.length + 1}`,
				content: combined.trim(),
				chunkIndex: chunks.length,
				tokenCount: estimateTokens(combined)
			});
			buffer = '';
			heading = '';
		} else {
			// Keep accumulating
			if (!heading) heading = para.split('\n')[0].trim().slice(0, 120);
			buffer = combined;
		}
	}

	// Flush remaining
	if (buffer.trim().length >= MIN_CHUNK_SIZE) {
		chunks.push({
			heading: heading || `Section ${chunks.length + 1}`,
			content: buffer.trim(),
			chunkIndex: chunks.length,
			tokenCount: estimateTokens(buffer)
		});
	} else if (buffer.trim() && chunks.length > 0) {
		// Merge tiny remainder into last chunk
		const last = chunks[chunks.length - 1];
		last.content += '\n\n' + buffer.trim();
		last.tokenCount = estimateTokens(last.content);
	}

	return chunks;
};

/**
 * Emergency split: break an oversized paragraph by sentences.
 */
const splitBySentences = (text: string): string[] => {
	const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
	const result: string[] = [];
	let buffer = '';

	for (const sentence of sentences) {
		const combined = buffer ? `${buffer} ${sentence}` : sentence;
		if (estimateTokens(combined) >= TARGET_CHUNK_SIZE && buffer) {
			result.push(buffer.trim());
			buffer = sentence;
		} else {
			buffer = combined;
		}
	}
	if (buffer.trim()) result.push(buffer.trim());
	return result;
};

/**
 * Balance section-based chunks: merge too-small ones, split too-large ones.
 */
const balanceChunks = (chunks: DocumentChunk[]): DocumentChunk[] => {
	const balanced: DocumentChunk[] = [];

	for (const chunk of chunks) {
		if (chunk.tokenCount > MAX_CHUNK_SIZE) {
			// Split oversized section
			const subChunks = splitByParagraphs(chunk.content);
			for (const sc of subChunks) {
				balanced.push({
					...sc,
					heading: sc.heading.startsWith('Section ') ? chunk.heading : sc.heading,
					chunkIndex: balanced.length
				});
			}
		} else if (chunk.tokenCount < MIN_CHUNK_SIZE && balanced.length > 0) {
			// Merge tiny chunk into previous
			const prev = balanced[balanced.length - 1];
			prev.content += '\n\n' + chunk.content;
			prev.tokenCount = estimateTokens(prev.content);
		} else {
			balanced.push({ ...chunk, chunkIndex: balanced.length });
		}
	}

	return balanced;
};

// ─────────────────────────────────────────────────────────
// 2. STORAGE — Persist text rows in document_chunks
// ─────────────────────────────────────────────────────────

/**
 * Delete all chunks for a specific source document.
 */
export const deleteDocumentChunks = async (args: {
	supabase: SupabaseClient;
	userId: string;
	sourceId: string;
}): Promise<void> => {
	const { supabase, userId, sourceId } = args;
	await supabase.from('document_chunks').delete().match({ user_id: userId, source_id: sourceId });
};

/**
 * Store chunks (text only, no embeddings) for later batch embedding.
 * Returns the number of chunks stored.
 */
export const storeChunksOnly = async (args: {
	supabase: SupabaseClient;
	userId: string;
	sourceId: string;
	packId?: string;
	content: string;
	metadata: ChunkMetadata;
	append?: boolean;
}): Promise<StoreChunksResult> => {
	const { supabase, userId, sourceId, packId, content, metadata, append = false } = args;

	let chunkIndexOffset = 0;
	if (append) {
		const { data, error } = await supabase
			.from('document_chunks')
			.select('chunk_index')
			.eq('user_id', userId)
			.eq('source_id', sourceId)
			.order('chunk_index', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (error) {
			console.warn('Failed to read existing chunk index before append:', error.message);
		}
		chunkIndexOffset = typeof data?.chunk_index === 'number' ? data.chunk_index + 1 : 0;
	} else {
		// Delete existing chunks for this source (re-index)
		await supabase.from('document_chunks').delete().match({ user_id: userId, source_id: sourceId });
	}

	// Chunk the document. Legal sources are split on article/section boundaries
	// when the structure is detectable; generic text keeps the previous fallback.
	const prepared = prepareDocumentChunks(content);
	const chunks = prepared.chunks;
	if (!chunks.length) return { chunkCount: 0, ingestionAudit: prepared.ingestionAudit };

	// Store chunks without embeddings
	const rows = chunks.map((chunk) => ({
		user_id: userId,
		source_id: sourceId,
		pack_id: packId || null,
		chunk_index: chunk.chunkIndex + chunkIndexOffset,
		heading: chunk.heading,
		content: chunk.content,
		token_count: chunk.tokenCount,
		embedding: null,
		metadata: {
			...metadata,
			ingestionAudit: prepared.ingestionAudit,
			...(chunk.metadata ?? {})
		}
	}));

	const BATCH_SIZE = 100;
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		const { error } = await supabase.from('document_chunks').insert(batch);
		if (error) {
			console.error(`Failed to insert chunk batch ${i}:`, error);
			throw new Error(`Failed to store document chunks: ${error.message}`);
		}
	}

	return { chunkCount: chunks.length, ingestionAudit: prepared.ingestionAudit };
};
