/**
 * Code Chunker Service
 * Chunks code into semantic units for RAG embedding.
 */

import * as crypto from 'crypto';
import {
  CodeChunk, ChunkType, ChunkingOptions, ChunkingResult, ChunkingStats, ChunkingError,
  ASTNode, SymbolReference, DEFAULT_CHUNKING_OPTIONS, LanguageDefinition,
} from './types';
import { getLanguageDefinition } from './languages';
import { astParser } from './ASTParser';
import { tokenCounter } from '../TokenCounter';
import { Logger } from '../../utils/Logger';

// ============ Code Chunker ============

export class CodeChunker {
  private chunkIdCounter = 0;

  async chunkCode(content: string, filePath: string, languageId: string, options: Partial<ChunkingOptions> = {}): Promise<ChunkingResult> {
    const opts = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
    const startTime = Date.now();
    const errors: ChunkingError[] = [];
    let chunks: CodeChunk[] = [];

    try {
      const parseResult = await astParser.parse(content, languageId);
      for (const e of parseResult.errors) {
        errors.push({ file: filePath, line: e.line, message: e.message, recoverable: true });
      }

      const langDef = getLanguageDefinition(languageId);
      if (langDef) {
        chunks = this.chunkFromAST(parseResult.tree, content, filePath, languageId, langDef, opts);
      } else {
        chunks = this.chunkSlidingWindow(content, filePath, languageId, opts);
      }

      chunks = this.postProcess(chunks, content, opts);
      chunks = this.validate(chunks, opts, errors);
    } catch (error) {
      Logger.error(`Chunking failed for ${filePath}:`, error);
      errors.push({ file: filePath, message: error instanceof Error ? error.message : 'Unknown', recoverable: false });
      chunks = this.chunkSlidingWindow(content, filePath, languageId, opts);
    }

    return { chunks, stats: this.calcStats(chunks, startTime), errors };
  }

  // ============ AST Chunking ============

  private chunkFromAST(tree: ASTNode, content: string, filePath: string, languageId: string, langDef: LanguageDefinition, opts: ChunkingOptions): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');

    // Extract imports
    if (opts.includeImports) {
      const importChunks = this.extractImports(tree, content, filePath, languageId, langDef, lines);
      chunks.push(...importChunks);
    }

    // Walk AST
    this.walkAST(tree, (node, depth, path) => {
      if (depth > opts.maxDepth) { return false; }

      const chunkType = this.getChunkType(node, langDef);
      if (!chunkType || chunkType === 'import') { return true; }

      const chunk = this.createChunk(node, content, lines, filePath, languageId, langDef, chunkType, depth, path, opts);
      if (!chunk) { return true; }

      if (opts.flattenSmallChunks && chunk.tokens < opts.minChunkTokens) { return true; }

      if (chunk.tokens > opts.maxChunkTokens) {
        chunks.push(...this.splitLargeChunk(chunk, opts));
        return false;
      }

      chunks.push(chunk);
      return chunkType !== 'class' && chunkType !== 'module';
    }, 0, []);

    return chunks;
  }

  private walkAST(node: ASTNode, cb: (n: ASTNode, d: number, p: string[]) => boolean, depth: number, path: string[]): void {
    if (!cb(node, depth, path)) { return; }
    for (const child of node.namedChildren) {
      const name = this.getNodeName(child);
      this.walkAST(child, cb, depth + 1, name ? [...path, name] : path);
    }
  }

  private getChunkType(node: ASTNode, langDef: LanguageDefinition): ChunkType | null {
    const nt = langDef.nodeTypes;
    if (nt.function.includes(node.type)) { return 'function'; }
    if (nt.method?.includes(node.type)) { return 'method'; }
    if (nt.arrow_function?.includes(node.type)) { return 'function'; }
    if (nt.class.includes(node.type)) { return 'class'; }
    if (nt.interface?.includes(node.type)) { return 'interface'; }
    if (nt.enum?.includes(node.type)) { return 'enum'; }
    if (nt.type_alias?.includes(node.type)) { return 'type'; }
    if (nt.module?.includes(node.type)) { return 'module'; }
    if (nt.namespace?.includes(node.type)) { return 'module'; }
    if (nt.import.includes(node.type)) { return 'import'; }
    if (nt.export?.includes(node.type)) { return 'export'; }
    if (nt.variable?.includes(node.type)) { return 'variable'; }
    if (nt.constant?.includes(node.type)) { return 'constant'; }
    if (nt.comment.includes(node.type)) { return 'comment'; }
    return null;
  }

  private createChunk(
    node: ASTNode, content: string, lines: string[], filePath: string, languageId: string,
    langDef: LanguageDefinition, chunkType: ChunkType, depth: number, path: string[], opts: ChunkingOptions
  ): CodeChunk | null {
    const chunkContent = this.extractContent(node, lines);
    if (!chunkContent.trim()) { return null; }

    const tokens = tokenCounter.quickEstimate(chunkContent);
    if (tokens < opts.minChunkTokens) { return null; }

    const name = this.getNodeName(node, langDef);
    const signature = langDef.patterns.functionSignature?.(node) || langDef.patterns.classSignature?.(node);
    const documentation = opts.includeDocumentation ? langDef.patterns.documentation?.(node, content) : undefined;
    const parentName = node.parent ? this.getNodeName(node.parent, langDef) : undefined;
    const parentType = node.parent ? this.getChunkType(node.parent, langDef) || undefined : undefined;
    const symbols = this.extractSymbols(node);

    const chunk: CodeChunk = {
      id: this.genId(),
      type: chunkType,
      content: chunkContent,
      language: languageId,
      file: filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column + 1,
      endColumn: node.endPosition.column + 1,
      name, signature, documentation,
      parentName, parentType,
      tokens, characters: chunkContent.length,
      symbols, depth,
      path: name ? [...path, name] : path,
      hash: this.hashContent(chunkContent),
    };

    chunk.embeddingText = this.genEmbeddingText(chunk);
    return chunk;
  }

  private extractContent(node: ASTNode, lines: string[]): string {
    const startLine = node.startPosition.row;
    const endLine = node.endPosition.row;
    if (startLine === endLine) {
      return lines[startLine]?.substring(node.startPosition.column, node.endPosition.column) || '';
    }
    const result: string[] = [];
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      let line = lines[i];
      if (i === startLine) { line = line.substring(node.startPosition.column); }
      else if (i === endLine) { line = line.substring(0, node.endPosition.column); }
      result.push(line);
    }
    return result.join('\n');
  }

  private getNodeName(node: ASTNode, langDef?: LanguageDefinition): string | undefined {
    if (langDef) {
      const name = langDef.patterns.functionName(node) || langDef.patterns.className(node);
      if (name) { return name; }
    }
    return node.namedChildren.find(c => c.type === 'identifier' || c.type === 'type_identifier' || c.fieldName === 'name')?.text;
  }

  // ============ Import Extraction ============

  private extractImports(tree: ASTNode, content: string, filePath: string, languageId: string, langDef: LanguageDefinition, lines: string[]): CodeChunk[] {
    const importNodes: ASTNode[] = [];
    this.walkAST(tree, (node) => {
      if (langDef.nodeTypes.import.includes(node.type)) { importNodes.push(node); }
      return true;
    }, 0, []);

    if (importNodes.length === 0) { return []; }

    const importContent = importNodes.map(n => this.extractContent(n, lines)).join('\n');
    const tokens = tokenCounter.quickEstimate(importContent);

    const imports: string[] = [];
    for (const node of importNodes) {
      const info = langDef.patterns.importInfo?.(node);
      if (info?.source) { imports.push(info.source); }
    }

    return [{
      id: this.genId(), type: 'import', content: importContent, language: languageId,
      file: filePath, startLine: importNodes[0].startPosition.row + 1,
      endLine: importNodes[importNodes.length - 1].endPosition.row + 1,
      startColumn: 1, endColumn: 1, name: 'imports',
      tokens, characters: importContent.length, imports,
      depth: 0, path: ['imports'], hash: this.hashContent(importContent),
    }];
  }

  // ============ Symbol Extraction ============

  private extractSymbols(node: ASTNode): SymbolReference[] {
    const symbols: SymbolReference[] = [];
    const seen = new Set<string>();

    this.walkAST(node, (child) => {
      if (child.type === 'call_expression' || child.type === 'call') {
        const func = child.namedChildren.find(c => c.type === 'identifier' || c.type === 'member_expression');
        if (func) {
          const key = `call:${func.text}`;
          if (!seen.has(key)) { seen.add(key); symbols.push({ name: func.text, type: 'call', line: func.startPosition.row + 1, column: func.startPosition.column + 1 }); }
        }
      }
      return true;
    }, 0, []);

    return symbols;
  }

  // ============ Chunk Splitting ============

  private splitLargeChunk(chunk: CodeChunk, opts: ChunkingOptions): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = chunk.content.split('\n');
    const target = opts.targetChunkTokens;
    const overlap = opts.overlapLines;
    let startLine = 0;

    while (startLine < lines.length) {
      let endLine = startLine;
      let tokens = 0;
      while (endLine < lines.length && tokens < target) {
        tokens += tokenCounter.quickEstimate(lines[endLine] + '\n');
        endLine++;
      }

      const chunkContent = lines.slice(startLine, endLine).join('\n');
      const overlapBefore = startLine > 0 ? lines.slice(Math.max(0, startLine - overlap), startLine).join('\n') : undefined;
      const overlapAfter = endLine < lines.length ? lines.slice(endLine, Math.min(lines.length, endLine + overlap)).join('\n') : undefined;

      const newChunk: CodeChunk = {
        ...chunk, id: this.genId(), content: chunkContent,
        startLine: chunk.startLine + startLine, endLine: chunk.startLine + endLine - 1,
        tokens: tokenCounter.quickEstimate(chunkContent), characters: chunkContent.length,
        overlapBefore, overlapAfter, hash: this.hashContent(chunkContent), embeddingText: undefined,
      };
      newChunk.embeddingText = this.genEmbeddingText(newChunk);
      chunks.push(newChunk);

      startLine = endLine - overlap;
      if (startLine >= endLine) { break; }
    }

    return chunks;
  }

  // ============ Sliding Window ============

  private chunkSlidingWindow(content: string, filePath: string, languageId: string, opts: ChunkingOptions): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    const target = opts.targetChunkTokens;
    const overlap = opts.overlapLines;
    let startLine = 0;

    while (startLine < lines.length) {
      let endLine = startLine;
      let tokens = 0;
      while (endLine < lines.length && tokens < target) {
        tokens += tokenCounter.quickEstimate(lines[endLine] + '\n');
        endLine++;
      }

      endLine = this.findBoundary(lines, endLine, startLine);
      const chunkContent = lines.slice(startLine, endLine).join('\n');

      const overlapBefore = startLine > 0 ? lines.slice(Math.max(0, startLine - overlap), startLine).join('\n') : undefined;
      const overlapAfter = endLine < lines.length ? lines.slice(endLine, Math.min(lines.length, endLine + overlap)).join('\n') : undefined;

      const chunk: CodeChunk = {
        id: this.genId(), type: 'block', content: chunkContent, language: languageId,
        file: filePath, startLine: startLine + 1, endLine, startColumn: 1,
        endColumn: lines[endLine - 1]?.length || 1,
        tokens: tokenCounter.quickEstimate(chunkContent), characters: chunkContent.length,
        overlapBefore, overlapAfter, depth: 0, path: [],
        hash: this.hashContent(chunkContent),
      };
      chunk.embeddingText = this.genEmbeddingText(chunk);
      chunks.push(chunk);

      startLine = endLine - overlap;
      if (startLine >= endLine) { startLine = endLine; }
    }

    return chunks;
  }

  private findBoundary(lines: string[], targetLine: number, _startLine: number): number {
    for (let i = 0; i <= 5 && targetLine + i < lines.length; i++) {
      const line = lines[targetLine + i].trim();
      if (line === '' || line === '}' || line === '};' || (line.endsWith(';') && !line.includes('{'))) {
        return targetLine + i + 1;
      }
    }
    return targetLine;
  }

  // ============ Post-processing ============

  private postProcess(chunks: CodeChunk[], content: string, opts: ChunkingOptions): CodeChunk[] {
    const lines = content.split('\n');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.startLine > 1 && !chunk.overlapBefore) {
        chunk.overlapBefore = lines.slice(Math.max(0, chunk.startLine - 1 - opts.overlapLines), chunk.startLine - 1).join('\n');
      }
      if (chunk.endLine < lines.length && !chunk.overlapAfter) {
        chunk.overlapAfter = lines.slice(chunk.endLine, Math.min(lines.length, chunk.endLine + opts.overlapLines)).join('\n');
      }
    }
    return chunks;
  }

  private validate(chunks: CodeChunk[], opts: ChunkingOptions, errors: ChunkingError[]): CodeChunk[] {
    return chunks.filter(c => {
      if (c.tokens < opts.minChunkTokens) { return false; }
      if (!c.content.trim()) { return false; }
      if (c.tokens > opts.maxChunkTokens * 1.5) {
        errors.push({ file: c.file, line: c.startLine, message: `Chunk exceeds max tokens: ${c.tokens}`, recoverable: true });
      }
      return true;
    });
  }

  // ============ Embedding Text ============

  private genEmbeddingText(chunk: CodeChunk): string {
    const parts: string[] = [`File: ${chunk.file}`];
    if (chunk.name) { parts.push(`${chunk.type}: ${chunk.name}`); }
    if (chunk.signature) { parts.push(`Signature: ${chunk.signature}`); }
    if (chunk.documentation) { parts.push(`Documentation: ${chunk.documentation}`); }
    if (chunk.path.length > 0) { parts.push(`Path: ${chunk.path.join(' > ')}`); }
    parts.push('', chunk.content);
    return parts.join('\n');
  }

  // ============ Utilities ============

  private genId(): string { return `chunk_${Date.now()}_${++this.chunkIdCounter}`; }
  private hashContent(content: string): string { return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16); }

  private calcStats(chunks: CodeChunk[], startTime: number): ChunkingStats {
    const byType: Record<string, number> = {};
    let totalTokens = 0, maxTokens = 0, minTokens = Infinity, totalLines = 0;
    for (const c of chunks) {
      byType[c.type] = (byType[c.type] || 0) + 1;
      totalTokens += c.tokens;
      maxTokens = Math.max(maxTokens, c.tokens);
      minTokens = Math.min(minTokens, c.tokens);
      totalLines += c.endLine - c.startLine + 1;
    }
    return {
      totalChunks: chunks.length, byType, totalTokens,
      avgChunkTokens: chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0,
      maxChunkTokens: maxTokens, minChunkTokens: minTokens === Infinity ? 0 : minTokens,
      totalLines, processingTime: Date.now() - startTime,
    };
  }
}

export const codeChunker = new CodeChunker();
