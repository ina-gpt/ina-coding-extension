import * as vscode from 'vscode';
import * as fs from 'fs';
import { DefinitionLocation, LSP_CONSTANTS } from './LSPTypes';

export class DefinitionService {
  private static instance: DefinitionService;
  private definitionCache: Map<string, { definitions: DefinitionLocation[]; timestamp: number }> = new Map();

  static getInstance(): DefinitionService {
    if (!DefinitionService.instance) {
      DefinitionService.instance = new DefinitionService();
    }
    return DefinitionService.instance;
  }

  async getDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<DefinitionLocation[]> {
    const key = `def:${document.uri}:${position.line}:${position.character}`;
    const cached = this.definitionCache.get(key);
    if (cached && Date.now() - cached.timestamp < LSP_CONSTANTS.CACHE_TTL_MS) return cached.definitions;

    try {
      const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', document.uri, position);
      if (!locations || locations.length === 0) return [];

      const wordRange = document.getWordRangeAtPosition(position);
      const symbolName = wordRange ? document.getText(wordRange) : '';

      const results: DefinitionLocation[] = [];
      for (const loc of locations.slice(0, 10)) {
        const uri = 'targetUri' in loc ? loc.targetUri : loc.uri;
        const range = 'targetRange' in loc ? loc.targetRange : loc.range;
        const filePath = vscode.workspace.asRelativePath(uri);
        const preview = await this.extractPreview(uri.fsPath, range, 3);

        results.push({
          filePath,
          range: { startLine: range.start.line, startCol: range.start.character, endLine: range.end.line, endCol: range.end.character },
          preview,
          symbolName,
          symbolKind: '',
        });
      }

      this.definitionCache.set(key, { definitions: results, timestamp: Date.now() });
      return results;
    } catch {
      return [];
    }
  }

  async getTypeDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<DefinitionLocation[]> {
    try {
      const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeTypeDefinitionProvider', document.uri, position);
      if (!locations || locations.length === 0) return [];

      const results: DefinitionLocation[] = [];
      for (const loc of locations.slice(0, 10)) {
        const uri = 'targetUri' in loc ? loc.targetUri : loc.uri;
        const range = 'targetRange' in loc ? loc.targetRange : loc.range;
        const preview = await this.extractPreview(uri.fsPath, range, 3);
        results.push({
          filePath: vscode.workspace.asRelativePath(uri),
          range: { startLine: range.start.line, startCol: range.start.character, endLine: range.end.line, endCol: range.end.character },
          preview, symbolName: '', symbolKind: 'type',
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  async getImplementation(document: vscode.TextDocument, position: vscode.Position): Promise<DefinitionLocation[]> {
    try {
      const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeImplementationProvider', document.uri, position);
      if (!locations || locations.length === 0) return [];

      const results: DefinitionLocation[] = [];
      for (const loc of locations.slice(0, 10)) {
        const uri = 'targetUri' in loc ? loc.targetUri : loc.uri;
        const range = 'targetRange' in loc ? loc.targetRange : loc.range;
        const preview = await this.extractPreview(uri.fsPath, range, 2);
        results.push({
          filePath: vscode.workspace.asRelativePath(uri),
          range: { startLine: range.start.line, startCol: range.start.character, endLine: range.end.line, endCol: range.end.character },
          preview, symbolName: '', symbolKind: 'implementation',
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  async getDefinitionContent(definition: DefinitionLocation, maxLines: number = 50): Promise<string> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = definition.filePath.startsWith('/') ? definition.filePath : `${ws}/${definition.filePath}`;
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, definition.range.startLine);
      const end = Math.min(lines.length, start + maxLines);
      return lines.slice(start, end).join('\n');
    } catch {
      return definition.preview;
    }
  }

  async resolveSymbolChain(document: vscode.TextDocument, position: vscode.Position, maxDepth: number = 3): Promise<DefinitionLocation[]> {
    const chain: DefinitionLocation[] = [];
    const visited = new Set<string>();
    let currentDoc = document;
    let currentPos = position;

    for (let i = 0; i < maxDepth; i++) {
      const defs = await this.getDefinition(currentDoc, currentPos);
      if (defs.length === 0) break;
      const def = defs[0];
      const key = `${def.filePath}:${def.range.startLine}`;
      if (visited.has(key)) break;
      visited.add(key);
      chain.push(def);

      try {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const fullPath = def.filePath.startsWith('/') ? def.filePath : `${ws}/${def.filePath}`;
        currentDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
        currentPos = new vscode.Position(def.range.startLine, def.range.startCol);
      } catch {
        break;
      }
    }

    return chain;
  }

  formatDefinitionForPrompt(def: DefinitionLocation): string {
    return `// From ${def.filePath}:${def.range.startLine + 1}\n${def.preview}`;
  }

  formatDefinitionsForPrompt(defs: DefinitionLocation[], maxTokens: number = 500): string {
    const lines: string[] = [];
    let tokens = 0;
    for (const def of defs) {
      const formatted = this.formatDefinitionForPrompt(def);
      const t = Math.ceil(formatted.split(/\s+/).length * 1.3);
      if (tokens + t > maxTokens) break;
      lines.push(formatted);
      tokens += t;
    }
    return lines.join('\n\n');
  }

  private async extractPreview(filePath: string, range: vscode.Range, contextLines: number): Promise<string> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, range.start.line - contextLines);
      const end = Math.min(lines.length, range.end.line + contextLines + 1);
      return lines.slice(start, end).join('\n');
    } catch {
      return '';
    }
  }

  invalidateCache(): void {
    this.definitionCache.clear();
  }
}
