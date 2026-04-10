/**
 * Chunk Processor Service
 * Processes chunks for embedding and storage.
 */

import { CodeChunk, ProcessedChunk, ChunkBatch, ChunkType } from './types';
import { Logger } from '../../utils/Logger';

// ============ Types ============

export interface ProcessingOptions {
  maxBatchSize: number;
  maxBatchTokens: number;
  extractKeywords: boolean;
  generateSearchText: boolean;
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  maxBatchSize: 50,
  maxBatchTokens: 50000,
  extractKeywords: true,
  generateSearchText: true,
};

const STOP_WORDS = new Set([
  'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
  'import', 'export', 'from', 'as', 'default', 'return', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new',
  'this', 'super', 'extends', 'implements', 'static', 'public', 'private',
  'protected', 'async', 'await', 'try', 'catch', 'finally', 'throw',
  'true', 'false', 'null', 'undefined', 'void', 'typeof', 'instanceof',
  'def', 'pass', 'raise', 'except', 'with', 'lambda', 'yield', 'global',
  'self', 'True', 'False', 'None', 'and', 'or', 'not',
  'string', 'number', 'boolean', 'any', 'object', 'array', 'int', 'float',
]);

// ============ Chunk Processor ============

export class ChunkProcessor {

  // ============ Batching ============

  createBatches(chunks: CodeChunk[], options: Partial<ProcessingOptions> = {}): ChunkBatch[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const batches: ChunkBatch[] = [];

    const byFile = new Map<string, CodeChunk[]>();
    for (const c of chunks) {
      const arr = byFile.get(c.file) || [];
      arr.push(c);
      byFile.set(c.file, arr);
    }

    for (const [file, fileChunks] of byFile) {
      let currentBatch: CodeChunk[] = [];
      let currentTokens = 0;

      for (const chunk of fileChunks) {
        if (currentBatch.length >= opts.maxBatchSize || currentTokens + chunk.tokens > opts.maxBatchTokens) {
          if (currentBatch.length > 0) {
            batches.push({ chunks: currentBatch, file, language: currentBatch[0].language, totalTokens: currentTokens });
          }
          currentBatch = [];
          currentTokens = 0;
        }
        currentBatch.push(chunk);
        currentTokens += chunk.tokens;
      }

      if (currentBatch.length > 0) {
        batches.push({ chunks: currentBatch, file, language: currentBatch[0].language, totalTokens: currentTokens });
      }
    }

    return batches;
  }

  // ============ Processing ============

  processChunk(chunk: CodeChunk, options: Partial<ProcessingOptions> = {}): ProcessedChunk {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return {
      ...chunk,
      searchableText: opts.generateSearchText ? this.genSearchText(chunk) : '',
      keywords: opts.extractKeywords ? this.extractKeywords(chunk) : [],
    };
  }

  processChunks(chunks: CodeChunk[], options: Partial<ProcessingOptions> = {}): ProcessedChunk[] {
    return chunks.map(c => this.processChunk(c, options));
  }

  // ============ Search Text ============

  private genSearchText(chunk: CodeChunk): string {
    const parts: string[] = [];
    const fileName = chunk.file.split('/').pop() || chunk.file;
    parts.push(fileName);
    if (chunk.name) { parts.push(`${chunk.type} ${chunk.name}`); }
    if (chunk.path.length > 1) { parts.push(chunk.path.join(' ')); }
    if (chunk.documentation) { parts.push(this.cleanText(chunk.documentation)); }
    if (chunk.signature) { parts.push(this.cleanText(chunk.signature)); }
    if (chunk.symbols) { parts.push(chunk.symbols.map(s => s.name).join(' ')); }
    parts.push(this.cleanCode(chunk.content));
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  private cleanCode(code: string): string {
    let cleaned = code
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ')
      .replace(/#.*$/gm, ' ')
      .replace(/"""[\s\S]*?"""/g, ' ')
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .replace(/`[^`]*`/g, '``');

    const identifiers = cleaned.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const filtered = identifiers.filter(id => id.length > 2 && !STOP_WORDS.has(id.toLowerCase()));
    const expanded = filtered.flatMap(id => this.splitId(id));
    return [...new Set(expanded)].join(' ');
  }

  private cleanText(text: string): string {
    return text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private splitId(identifier: string): string[] {
    return identifier.split('_')
      .flatMap(part => part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' '))
      .filter(w => w.length > 1)
      .map(w => w.toLowerCase());
  }

  // ============ Keyword Extraction ============

  private extractKeywords(chunk: CodeChunk): string[] {
    const kw: string[] = [];

    if (chunk.name) { kw.push(chunk.name, ...this.splitId(chunk.name)); }
    if (chunk.parentName) { kw.push(chunk.parentName); }
    for (const p of chunk.path) { kw.push(p, ...this.splitId(p)); }
    if (chunk.imports) { for (const imp of chunk.imports) { kw.push(...imp.split(/[\/\.]/)); } }
    if (chunk.symbols) { for (const s of chunk.symbols) { if (s.type === 'call') { kw.push(s.name); } } }

    // Type annotations
    const typeMatches = chunk.content.match(/:\s*([A-Z][a-zA-Z0-9]*)/g) || [];
    kw.push(...typeMatches.map(m => m.replace(/^:\s*/, '')));

    return [...new Set(kw)].filter(k => k.length > 2 && !STOP_WORDS.has(k.toLowerCase())).slice(0, 50);
  }

  // ============ Deduplication ============

  deduplicateChunks(chunks: CodeChunk[]): CodeChunk[] {
    const seen = new Map<string, CodeChunk>();
    const result: CodeChunk[] = [];

    for (const chunk of chunks) {
      const key = chunk.hash || chunk.id;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, chunk);
        result.push(chunk);
      } else if (chunk.documentation && !existing.documentation) {
        seen.set(key, chunk);
        const idx = result.indexOf(existing);
        if (idx !== -1) { result[idx] = chunk; }
      }
    }

    return result;
  }

  // ============ Scoring ============

  scoreChunks(chunks: CodeChunk[]): Map<string, number> {
    const scores = new Map<string, number>();
    const typeScores: Record<string, number> = {
      class: 10, interface: 9, function: 8, method: 7, type: 6, enum: 5,
      module: 5, export: 4, documentation: 4, constant: 3, variable: 2,
      import: 1, block: 1, comment: 0, unknown: 0,
    };

    for (const c of chunks) {
      let score = typeScores[c.type] || 0;
      if (c.name) { score += 3; }
      if (c.documentation) { score += 5; }
      if (c.signature) { score += 2; }
      if (c.tokens >= 200 && c.tokens <= 800) { score += 3; }
      else if (c.tokens < 50) { score -= 2; }
      score -= c.depth;
      if (c.symbols && c.symbols.length > 0) { score += Math.min(c.symbols.length, 5); }
      scores.set(c.id, score);
    }

    return scores;
  }
}

export const chunkProcessor = new ChunkProcessor();
