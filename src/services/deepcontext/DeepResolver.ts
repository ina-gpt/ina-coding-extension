/**
 * Phase 17.2 — Deep Resolver
 * Transitive resolution of definitions, type hierarchies, and references.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { tokenCounter } from '../TokenCounter';
import {
  DeepContextOptions,
  DeepContextResult,
  DeepDefinition,
  DEFAULT_DEEP_OPTIONS,
  ReferenceGroup,
  ReferenceInfo,
  ReferencesResult,
  SYMBOL_KIND_MAP,
  TS_PRIMITIVES,
  UsageType,
} from './DeepContextTypes';

// ---------------------------------------------------------------------------
// DeepResolver — singleton
// ---------------------------------------------------------------------------

export class DeepResolver {
  private static instance: DeepResolver | null = null;

  private constructor() {}

  static getInstance(): DeepResolver {
    if (!DeepResolver.instance) {
      DeepResolver.instance = new DeepResolver();
    }
    return DeepResolver.instance;
  }

  // -----------------------------------------------------------------------
  // resolveDefinition
  // -----------------------------------------------------------------------

  async resolveDefinition(
    symbol: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    options: Partial<DeepContextOptions> = {},
  ): Promise<DeepContextResult> {
    const opts = { ...DEFAULT_DEEP_OPTIONS, ...options };

    try {
      // 1. Find primary via definition provider
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position,
      );

      if (!locations || locations.length === 0) {
        return this.emptyResult(symbol);
      }

      // 2. Read content from definition file
      const primary = await this.locationToDefinition(
        locations[0],
        symbol,
        0,
        null,
      );

      if (!primary) {
        return this.emptyResult(symbol);
      }

      // 3. Extract dependencies and resolve transitively
      const visited = new Set<string>();
      visited.add(this.defKey(primary));

      const transitive: DeepDefinition[] = [];
      await this.resolveTransitive(
        primary,
        opts,
        1,
        visited,
        transitive,
      );

      // 4. Deduplicate, sort, truncate
      const sorted = transitive.sort((a, b) => a.depth - b.depth);
      const { result: truncated, wasTruncated } = this.truncateToTokenBudget(
        [primary, ...sorted],
        opts.maxTokens,
      );

      const finalPrimary = truncated[0];
      const finalTransitive = truncated.slice(1);

      const maxDepthSeen = finalTransitive.reduce(
        (max, d) => Math.max(max, d.depth),
        0,
      );

      return {
        primary: finalPrimary,
        transitive: finalTransitive,
        totalTokens: this.estimateTokens(truncated),
        truncated: wasTruncated,
        resolvedDepth: maxDepthSeen,
        maxDepthReached: maxDepthSeen >= opts.maxDepth,
      };
    } catch (err) {
      Logger.warn(`[DeepResolver] resolveDefinition failed for "${symbol}": ${err}`);
      return this.emptyResult(symbol);
    }
  }

  // -----------------------------------------------------------------------
  // resolveType
  // -----------------------------------------------------------------------

  async resolveType(
    symbol: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    options: Partial<DeepContextOptions> = {},
  ): Promise<DeepContextResult> {
    const opts = { ...DEFAULT_DEEP_OPTIONS, ...options };

    try {
      // 1. Try type definition provider, fallback to definition provider
      let locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeTypeDefinitionProvider',
        document.uri,
        position,
      );

      if (!locations || locations.length === 0) {
        locations = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider',
          document.uri,
          position,
        );
      }

      if (!locations || locations.length === 0) {
        return this.emptyResult(symbol);
      }

      const primary = await this.locationToDefinition(
        locations[0],
        symbol,
        0,
        null,
      );

      if (!primary) {
        return this.emptyResult(symbol);
      }

      // 2. Resolve extends, implements, property types
      const visited = new Set<string>();
      visited.add(this.defKey(primary));

      const transitive: DeepDefinition[] = [];

      // For interfaces/classes, resolve parent types and property types
      if (
        opts.includeParentTypes &&
        (primary.kind === 'interface' || primary.kind === 'class')
      ) {
        await this.resolveTransitive(primary, opts, 1, visited, transitive);
      }

      if (opts.includeUsedTypes) {
        await this.resolveTransitive(primary, opts, 1, visited, transitive);
      }

      const sorted = transitive.sort((a, b) => a.depth - b.depth);
      const { result: truncated, wasTruncated } = this.truncateToTokenBudget(
        [primary, ...sorted],
        opts.maxTokens,
      );

      const finalPrimary = truncated[0];
      const finalTransitive = truncated.slice(1);
      const maxDepthSeen = finalTransitive.reduce(
        (max, d) => Math.max(max, d.depth),
        0,
      );

      return {
        primary: finalPrimary,
        transitive: finalTransitive,
        totalTokens: this.estimateTokens(truncated),
        truncated: wasTruncated,
        resolvedDepth: maxDepthSeen,
        maxDepthReached: maxDepthSeen >= opts.maxDepth,
      };
    } catch (err) {
      Logger.warn(`[DeepResolver] resolveType failed for "${symbol}": ${err}`);
      return this.emptyResult(symbol);
    }
  }

  // -----------------------------------------------------------------------
  // resolveReferences
  // -----------------------------------------------------------------------

  async resolveReferences(
    symbol: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    options: Partial<DeepContextOptions> = {},
  ): Promise<ReferencesResult> {
    const opts = { ...DEFAULT_DEEP_OPTIONS, ...options };

    try {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        document.uri,
        position,
      );

      if (!locations || locations.length === 0) {
        return { groups: [], totalCount: 0 };
      }

      // Filter out stdlib / node_modules if configured
      const filtered = locations.filter((loc) => {
        const fp = loc.uri.fsPath;
        if (opts.excludeStdLib && this.isStdLib(fp)) { return false; }
        if (opts.excludeNodeModules && fp.includes('node_modules')) { return false; }
        return true;
      });

      // Group by file
      const groupMap = new Map<string, ReferenceInfo[]>();

      for (const loc of filtered) {
        const fp = loc.uri.fsPath;
        const doc = await vscode.workspace.openTextDocument(loc.uri);

        // Get 3 lines of context around the reference
        const startLine = Math.max(0, loc.range.start.line - 1);
        const endLine = Math.min(doc.lineCount - 1, loc.range.start.line + 1);
        const contextLines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          contextLines.push(doc.lineAt(i).text);
        }
        const context = contextLines.join('\n');

        const refLine = doc.lineAt(loc.range.start.line).text;
        const usageType = this.classifyReference(refLine, symbol);

        const info: ReferenceInfo = {
          line: loc.range.start.line + 1,
          column: loc.range.start.character,
          context,
          usageType,
        };

        if (!groupMap.has(fp)) {
          groupMap.set(fp, []);
        }
        groupMap.get(fp)!.push(info);
      }

      let groups: ReferenceGroup[] = Array.from(groupMap.entries()).map(
        ([filePath, references]) => ({ filePath, references }),
      );

      const totalCount = filtered.length;

      // Smart sample if more than 20 references
      if (totalCount > 20) {
        groups = this.smartSampleReferences(groups, 20);
      }

      return { groups, totalCount };
    } catch (err) {
      Logger.warn(`[DeepResolver] resolveReferences failed for "${symbol}": ${err}`);
      return { groups: [], totalCount: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Private: extractDependencies
  // -----------------------------------------------------------------------

  private extractDependencies(code: string, language: string): string[] {
    const deps: Set<string> = new Set();

    if (!['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
      return [];
    }

    // Type annotations: `: SomeType` before `{`, `,`, `)`, `=`, `>`
    const typeAnnotation = /:\s*([A-Z][A-Za-z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = typeAnnotation.exec(code)) !== null) {
      deps.add(m[1]);
    }

    // Generic parameters: `<SomeType>`
    const genericParams = /<([A-Z][A-Za-z0-9_]*(?:\s*,\s*[A-Z][A-Za-z0-9_]*)*)>/g;
    while ((m = genericParams.exec(code)) !== null) {
      for (const part of m[1].split(',')) {
        const trimmed = part.trim();
        if (trimmed && /^[A-Z]/.test(trimmed)) {
          deps.add(trimmed);
        }
      }
    }

    // extends / implements clauses
    const extendsImpl =
      /(?:extends|implements)\s+([A-Z][A-Za-z0-9_]*(?:\s*,\s*[A-Z][A-Za-z0-9_]*)*)/g;
    while ((m = extendsImpl.exec(code)) !== null) {
      for (const part of m[1].split(',')) {
        const trimmed = part.trim();
        if (trimmed && /^[A-Z]/.test(trimmed)) {
          deps.add(trimmed);
        }
      }
    }

    // Import names: `import { Foo, Bar } from ...`
    const importNames =
      /import\s+\{([^}]+)\}/g;
    while ((m = importNames.exec(code)) !== null) {
      for (const part of m[1].split(',')) {
        const trimmed = part.trim().replace(/\s+as\s+\w+/, '');
        if (trimmed && /^[A-Z]/.test(trimmed)) {
          deps.add(trimmed);
        }
      }
    }

    // Remove primitives
    for (const prim of TS_PRIMITIVES) {
      deps.delete(prim);
    }
    // Remove the capitalised primitives just in case
    deps.delete('String');
    deps.delete('Number');
    deps.delete('Boolean');
    deps.delete('Object');
    deps.delete('Array');
    deps.delete('Promise');
    deps.delete('Map');
    deps.delete('Set');
    deps.delete('Record');
    deps.delete('Partial');
    deps.delete('Required');
    deps.delete('Readonly');
    deps.delete('Pick');
    deps.delete('Omit');

    return Array.from(deps);
  }

  // -----------------------------------------------------------------------
  // Private: resolveSymbolLocation
  // -----------------------------------------------------------------------

  private async resolveSymbolLocation(
    symbolName: string,
    _fromFile: string,
  ): Promise<{ uri: vscode.Uri; position: vscode.Position } | null> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        symbolName,
      );

      if (!symbols || symbols.length === 0) {
        return null;
      }

      // Find exact match
      const exact = symbols.find((s) => s.name === symbolName);
      const best = exact || symbols[0];

      return {
        uri: best.location.uri,
        position: best.location.range.start,
      };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private: isStdLib
  // -----------------------------------------------------------------------

  private isStdLib(filePath: string): boolean {
    if (filePath.includes('node_modules')) { return true; }
    if (/lib\.d\.ts$/.test(filePath)) { return true; }
    if (/lib\.es\d*\..*\.d\.ts$/.test(filePath)) { return true; }
    if (/typescript[\\/]lib[\\/]/.test(filePath)) { return true; }
    return false;
  }

  // -----------------------------------------------------------------------
  // Private: truncateToTokenBudget
  // -----------------------------------------------------------------------

  private truncateToTokenBudget(
    defs: DeepDefinition[],
    maxTokens: number,
  ): { result: DeepDefinition[]; wasTruncated: boolean } {
    const result: DeepDefinition[] = [];
    let running = 0;

    for (const def of defs) {
      const tokens = tokenCounter.quickEstimate(def.content);
      if (running + tokens > maxTokens && result.length > 0) {
        return { result, wasTruncated: true };
      }
      running += tokens;
      result.push(def);
    }

    return { result, wasTruncated: false };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async resolveTransitive(
    parent: DeepDefinition,
    opts: DeepContextOptions,
    currentDepth: number,
    visited: Set<string>,
    accumulator: DeepDefinition[],
  ): Promise<void> {
    if (currentDepth > opts.maxDepth) { return; }
    if (accumulator.length >= opts.maxTransitiveResults) { return; }

    const deps = this.extractDependencies(parent.content, parent.language);

    for (const dep of deps) {
      if (accumulator.length >= opts.maxTransitiveResults) { break; }

      const loc = await this.resolveSymbolLocation(dep, parent.filePath);
      if (!loc) { continue; }

      const fp = loc.uri.fsPath;
      if (opts.excludeStdLib && this.isStdLib(fp)) { continue; }
      if (opts.excludeNodeModules && fp.includes('node_modules')) { continue; }

      const depDef = await this.locationToDefinition(
        new vscode.Location(loc.uri, new vscode.Range(loc.position, loc.position)),
        dep,
        currentDepth,
        parent.symbol,
      );

      if (!depDef) { continue; }

      const key = this.defKey(depDef);
      if (visited.has(key)) { continue; }
      visited.add(key);

      accumulator.push(depDef);

      // Recurse deeper
      await this.resolveTransitive(depDef, opts, currentDepth + 1, visited, accumulator);
    }
  }

  private async locationToDefinition(
    location: vscode.Location,
    symbol: string,
    depth: number,
    relatedTo: string | null,
  ): Promise<DeepDefinition | null> {
    try {
      const doc = await vscode.workspace.openTextDocument(location.uri);
      const language = doc.languageId;

      // Try to expand to the full declaration
      const startLine = location.range.start.line;
      let endLine = location.range.end.line;

      // Expand to include the full block (find matching brace)
      const text = doc.getText();
      const lines = text.split('\n');

      // Simple heuristic: from start, find the block end by brace counting
      let braceCount = 0;
      let foundOpen = false;
      for (let i = startLine; i < Math.min(lines.length, startLine + 200); i++) {
        for (const ch of lines[i]) {
          if (ch === '{') { braceCount++; foundOpen = true; }
          if (ch === '}') { braceCount--; }
        }
        endLine = i;
        if (foundOpen && braceCount <= 0) { break; }
        // Also stop at next top-level declaration if no braces found
        if (i > startLine + 1 && !foundOpen && /^(export|class|interface|type|function|const|let|var|enum)\s/.test(lines[i])) {
          endLine = i - 1;
          break;
        }
      }

      const content = lines.slice(startLine, endLine + 1).join('\n');
      const kind = this.inferKind(content);

      return {
        symbol,
        kind,
        filePath: location.uri.fsPath,
        startLine: startLine + 1,
        endLine: endLine + 1,
        content,
        language,
        depth,
        relatedTo,
      };
    } catch {
      return null;
    }
  }

  private inferKind(content: string): DeepDefinition['kind'] {
    const trimmed = content.trimStart();
    if (/^(export\s+)?(default\s+)?class\s/.test(trimmed)) { return 'class'; }
    if (/^(export\s+)?interface\s/.test(trimmed)) { return 'interface'; }
    if (/^(export\s+)?type\s/.test(trimmed)) { return 'type'; }
    if (/^(export\s+)?enum\s/.test(trimmed)) { return 'enum'; }
    if (/^(export\s+)?(default\s+)?(async\s+)?function\s/.test(trimmed)) { return 'function'; }
    if (/^(export\s+)?(const|let|var)\s/.test(trimmed)) { return 'variable'; }
    if (/^(public|private|protected|static|readonly|async|get|set)\s/.test(trimmed)) { return 'method'; }
    return 'variable';
  }

  private classifyReference(line: string, symbol: string): UsageType {
    const trimmed = line.trim();
    if (/^import\s/.test(trimmed) || /from\s+['"]/.test(trimmed)) { return 'import'; }
    if (new RegExp(`(extends|implements)\\s+.*${this.escapeRegex(symbol)}`).test(trimmed)) { return 'extends'; }
    if (new RegExp(`${this.escapeRegex(symbol)}\\s*[(<]`).test(trimmed)) { return 'call'; }
    if (new RegExp(`:\\s*${this.escapeRegex(symbol)}`).test(trimmed)) { return 'type_ref'; }
    if (new RegExp(`=\\s*.*${this.escapeRegex(symbol)}`).test(trimmed)) { return 'assignment'; }
    return 'other';
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private defKey(def: DeepDefinition): string {
    return `${def.filePath}:${def.startLine}:${def.symbol}`;
  }

  private estimateTokens(defs: DeepDefinition[]): number {
    return defs.reduce(
      (sum, d) => sum + tokenCounter.quickEstimate(d.content),
      0,
    );
  }

  private smartSampleReferences(
    groups: ReferenceGroup[],
    maxRefs: number,
  ): ReferenceGroup[] {
    // Prioritise diversity across files and usage types
    const sampled: ReferenceGroup[] = [];
    let remaining = maxRefs;

    // First pass: take up to 2 from each file
    for (const group of groups) {
      if (remaining <= 0) { break; }
      const take = Math.min(2, group.references.length, remaining);
      sampled.push({
        filePath: group.filePath,
        references: group.references.slice(0, take),
      });
      remaining -= take;
    }

    // Second pass: fill remainder from largest groups
    if (remaining > 0) {
      const sorted = [...groups].sort(
        (a, b) => b.references.length - a.references.length,
      );
      for (const group of sorted) {
        if (remaining <= 0) { break; }
        const existing = sampled.find((s) => s.filePath === group.filePath);
        const alreadyTaken = existing ? existing.references.length : 0;
        const available = group.references.slice(alreadyTaken);
        const take = Math.min(available.length, remaining);
        if (take > 0 && existing) {
          existing.references.push(...available.slice(0, take));
          remaining -= take;
        }
      }
    }

    return sampled.filter((g) => g.references.length > 0);
  }

  private emptyResult(symbol: string): DeepContextResult {
    return {
      primary: {
        symbol,
        kind: 'variable',
        filePath: '',
        startLine: 0,
        endLine: 0,
        content: '',
        language: '',
        depth: 0,
        relatedTo: null,
      },
      transitive: [],
      totalTokens: 0,
      truncated: false,
      resolvedDepth: 0,
      maxDepthReached: false,
    };
  }
}
