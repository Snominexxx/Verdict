/**
 * Verdict RAG — Chunking, Embedding & Semantic Search
 *
 * Handles:
 * 1. Intelligent chunking of legal documents (by article/section)
 * 2. Embedding via OpenAI text-embedding-3-small
 * 3. Storage in Supabase pgvector
 * 4. Semantic search for debate context
 */

import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertSupabaseAdmin } from './supabaseAdmin';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type DocumentChunk = {
	heading: string;
	content: string;
	chunkIndex: number;
	tokenCount: number;
};

export type ChunkMetadata = {
	title: string;
	jurisdiction: string;
	docType?: string;
	trustLevel?: string;
	sourceUrl?: string;
};

export type MatchedChunk = {
	id: string;
	sourceId: string;
	chunkIndex: number;
	heading: string;
	content: string;
	tokenCount: number;
	metadata: ChunkMetadata;
	similarity: number;
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
export const chunkDocument = (text: string): DocumentChunk[] => {
	const cleaned = text.replace(/\r\n/g, '\n').trim();
	if (!cleaned) return [];

	// Try structure-aware splitting first
	const sections = splitBySections(cleaned);
	if (sections.length > 1) {
		return balanceChunks(sections);
	}

	// Fallback: split by paragraphs / double newlines
	return splitByParagraphs(cleaned);
};

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
// 2. EMBEDDING — OpenAI text-embedding-3-small
// ─────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 50; // OpenAI allows up to 2048 inputs, but batch for safety

/**
 * Generate embeddings for an array of text strings.
 * Returns one 1536-dim vector per input.
 */
export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
	if (!env.LLM_API_KEY) {
		throw new Error('LLM_API_KEY is not configured.');
	}
	if (!texts.length) return [];

	const allEmbeddings: number[][] = [];

	for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
		const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
		const response = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.LLM_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: EMBEDDING_MODEL,
				input: batch
			})
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			throw new Error(`Embedding API error (${response.status}): ${errBody}`);
		}

		const data = await response.json();
		const sorted = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
		allEmbeddings.push(...sorted.map((item: { embedding: number[] }) => item.embedding));
	}

	return allEmbeddings;
};

// ─────────────────────────────────────────────────────────
// 3. STORAGE — Save chunks + embeddings to Supabase
// ─────────────────────────────────────────────────────────

/**
 * Chunk a document, embed all chunks, and store in document_chunks.
 * Returns the number of chunks created.
 */
export const indexDocument = async (args: {
	supabase: SupabaseClient;
	userId: string;
	sourceId: string;
	packId?: string;
	content: string;
	metadata: ChunkMetadata;
}): Promise<number> => {
	const { supabase, userId, sourceId, packId, content, metadata } = args;

	// 1. Delete existing chunks for this source (re-index)
	await supabase.from('document_chunks').delete().match({ user_id: userId, source_id: sourceId });

	// 2. Chunk the document
	const chunks = chunkDocument(content);
	if (!chunks.length) return 0;

	// 3. Generate embeddings for all chunks
	const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

	// 4. Insert in batches  
	const rows = chunks.map((chunk, i) => ({
		user_id: userId,
		source_id: sourceId,
		pack_id: packId || null,
		chunk_index: chunk.chunkIndex,
		heading: chunk.heading,
		content: chunk.content,
		token_count: chunk.tokenCount,
		embedding: JSON.stringify(embeddings[i]),
		metadata
	}));

	// Insert in batches of 100 to avoid payload limits
	const BATCH_SIZE = 100;
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		const { error } = await supabase.from('document_chunks').insert(batch);
		if (error) {
			console.error(`Failed to insert chunk batch ${i}:`, error);
			throw new Error(`Failed to store document chunks: ${error.message}`);
		}
	}

	return chunks.length;
};

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
}): Promise<number> => {
	const { supabase, userId, sourceId, packId, content, metadata } = args;

	// Delete existing chunks for this source (re-index)
	await supabase.from('document_chunks').delete().match({ user_id: userId, source_id: sourceId });

	// Chunk the document
	const chunks = chunkDocument(content);
	if (!chunks.length) return 0;

	// Store chunks without embeddings
	const rows = chunks.map((chunk) => ({
		user_id: userId,
		source_id: sourceId,
		pack_id: packId || null,
		chunk_index: chunk.chunkIndex,
		heading: chunk.heading,
		content: chunk.content,
		token_count: chunk.tokenCount,
		embedding: null,
		metadata
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

	return chunks.length;
};

/**
 * Embed a batch of un-embedded chunks for a given source.
 * Returns { embedded, remaining }.
 */
export const embedChunkBatch = async (args: {
	supabase: SupabaseClient;
	userId: string;
	sourceId: string;
	limit?: number;
}): Promise<{ embedded: number; remaining: number }> => {
	const { userId, sourceId, limit = 50 } = args;
	const admin = assertSupabaseAdmin();

	// Fetch un-embedded chunks (use admin to bypass RLS)
	const { data: chunks, error: fetchErr } = await admin
		.from('document_chunks')
		.select('id, content')
		.match({ user_id: userId, source_id: sourceId })
		.is('embedding', null)
		.order('chunk_index', { ascending: true })
		.limit(limit);

	if (fetchErr) throw new Error(`Failed to fetch chunks: ${fetchErr.message}`);
	if (!chunks?.length) return { embedded: 0, remaining: 0 };

	// Generate embeddings
	const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

	// Update each chunk with its embedding
	for (let i = 0; i < chunks.length; i++) {
		const { error: updateErr } = await admin
			.from('document_chunks')
			.update({ embedding: JSON.stringify(embeddings[i]) })
			.eq('id', chunks[i].id);

		if (updateErr) {
			console.error(`Failed to update chunk ${chunks[i].id}:`, updateErr);
		}
	}

	// Count remaining un-embedded
	const { count } = await admin
		.from('document_chunks')
		.select('id', { count: 'exact', head: true })
		.match({ user_id: userId, source_id: sourceId })
		.is('embedding', null);

	return { embedded: chunks.length, remaining: count ?? 0 };
};

// ─────────────────────────────────────────────────────────
// 4. SEMANTIC SEARCH — Find relevant chunks for a query
// ─────────────────────────────────────────────────────────

/**
 * Search for the most relevant document chunks given a query string.
 * Uses pgvector cosine similarity via Supabase RPC.
 */
export const searchChunks = async (args: {
	supabase: SupabaseClient;
	userId: string;
	query: string;
	packId?: string;
	maxChunks?: number;
	maxTokens?: number;
}): Promise<MatchedChunk[]> => {
	const { supabase, userId, query, packId, maxChunks = 15, maxTokens = 12000 } = args;

	// 1. Embed the query
	const [queryEmbedding] = await generateEmbeddings([query]);

	// 2. Call the match_chunks RPC function
	const { data, error } = await supabase.rpc('match_chunks', {
		query_embedding: JSON.stringify(queryEmbedding),
		match_user_id: userId,
		match_count: maxChunks,
		match_pack_id: packId || null
	});

	if (error) {
		console.error('Semantic search failed:', error);
		throw new Error(`Semantic search failed: ${error.message}`);
	}

	if (!data?.length) return [];

	// 3. Budget-constrained selection: take top chunks until token budget is exhausted
	const results: MatchedChunk[] = [];
	let totalTokens = 0;

	for (const row of data) {
		if (totalTokens + row.token_count > maxTokens) continue;
		totalTokens += row.token_count;
		results.push({
			id: row.id,
			sourceId: row.source_id,
			chunkIndex: row.chunk_index,
			heading: row.heading,
			content: row.content,
			tokenCount: row.token_count,
			metadata: row.metadata,
			similarity: row.similarity
		});
	}

	return results;
};

/**
 * Format matched chunks into a string suitable for LLM prompt injection.
 * Groups by source document for readability.
 */
export const formatChunksForPrompt = (chunks: MatchedChunk[]): string => {
	if (!chunks.length) return '- No relevant document sections found.';

	// Group by source
	const bySource = new Map<string, MatchedChunk[]>();
	for (const chunk of chunks) {
		const key = chunk.metadata.title || chunk.sourceId;
		if (!bySource.has(key)) bySource.set(key, []);
		bySource.get(key)!.push(chunk);
	}

	const lines: string[] = [];
	for (const [title, sourceChunks] of bySource) {
		// Sort chunks by their original order in the document
		sourceChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
		const jurisdiction = sourceChunks[0].metadata.jurisdiction || '';
		lines.push(`─ ${title}${jurisdiction ? ` (${jurisdiction})` : ''} ─`);
		for (const chunk of sourceChunks) {
			const label = chunk.heading && chunk.heading !== `Section ${chunk.chunkIndex + 1}` ? `[${chunk.heading}]` : '';
			lines.push(`${label}\n${chunk.content}`);
		}
		lines.push('');
	}

	return lines.join('\n');
};
