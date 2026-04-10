import * as vscode from 'vscode';
import { ReferenceInfo, ReferenceGroup, CallHierarchyItem, TypeHierarchyItem, LSP_CONSTANTS } from './LSPTypes';

export class ReferenceService {
  private static instance: ReferenceService;

  static getInstance(): ReferenceService {
    if (!ReferenceService.instance) {
      ReferenceService.instance = new ReferenceService();
    }
    return ReferenceService.instance;
  }

  async findReferences(document: vscode.TextDocument, position: vscode.Position, includeDefinition?: boolean): Promise<ReferenceGroup[]> {
    try {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', document.uri, position);
      if (!locations || locations.length === 0) return [];

      const groups = new Map<string, ReferenceInfo[]>();
      for (const loc of locations.slice(0, LSP_CONSTANTS.MAX_REFERENCES)) {
        const filePath = vscode.workspace.asRelativePath(loc.uri);
        const preview = await this.getLinePreview(loc.uri, loc.range.start.line);
        const isWrite = await this.isWriteReference(loc);

        const ref: ReferenceInfo = {
          filePath,
          range: { startLine: loc.range.start.line, startCol: loc.range.start.character, endLine: loc.range.end.line, endCol: loc.range.end.character },
          preview,
          isWrite,
          isDefinition: loc.uri.toString() === document.uri.toString() && loc.range.start.line === position.line,
          containerName: null,
        };

        if (!includeDefinition && ref.isDefinition) continue;
        const list = groups.get(filePath) || [];
        list.push(ref);
        groups.set(filePath, list);
      }

      return [...groups.entries()].map(([filePath, references]) => ({ filePath, references, count: references.length }));
    } catch {
      return [];
    }
  }

  async findAllReferencesInFile(document: vscode.TextDocument, position: vscode.Position): Promise<ReferenceInfo[]> {
    const groups = await this.findReferences(document, position, true);
    const filePath = vscode.workspace.asRelativePath(document.uri);
    const group = groups.find(g => g.filePath === filePath);
    return group?.references || [];
  }

  async getCallHierarchy(document: vscode.TextDocument, position: vscode.Position, direction: 'incoming' | 'outgoing' | 'both', maxDepth: number = 2): Promise<CallHierarchyItem | null> {
    try {
      const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>('vscode.prepareCallHierarchy', document.uri, position);
      if (!items || items.length === 0) return null;

      const root = items[0];
      const result: CallHierarchyItem = {
        name: root.name,
        kind: vscode.SymbolKind[root.kind] || 'function',
        filePath: vscode.workspace.asRelativePath(root.uri),
        range: { startLine: root.range.start.line, startCol: root.range.start.character, endLine: root.range.end.line, endCol: root.range.end.character },
        detail: root.detail || null,
        callers: null,
        callees: null,
      };

      if ((direction === 'incoming' || direction === 'both') && maxDepth > 0) {
        result.callers = await this.getIncomingCalls(root, maxDepth - 1);
      }
      if ((direction === 'outgoing' || direction === 'both') && maxDepth > 0) {
        result.callees = await this.getOutgoingCalls(root, maxDepth - 1);
      }

      return result;
    } catch {
      return null;
    }
  }

  async getTypeHierarchy(document: vscode.TextDocument, position: vscode.Position, direction: 'supertypes' | 'subtypes' | 'both', maxDepth: number = 2): Promise<TypeHierarchyItem | null> {
    try {
      const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>('vscode.prepareTypeHierarchy', document.uri, position);
      if (!items || items.length === 0) return null;

      const root = items[0];
      const result: TypeHierarchyItem = {
        name: root.name,
        kind: vscode.SymbolKind[root.kind] || 'class',
        filePath: vscode.workspace.asRelativePath(root.uri),
        range: { startLine: root.range.start.line, startCol: root.range.start.character, endLine: root.range.end.line, endCol: root.range.end.character },
        detail: root.detail || null,
        parents: null,
        children: null,
      };

      if ((direction === 'supertypes' || direction === 'both') && maxDepth > 0) {
        try {
          const supers = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>('vscode.provideTypeHierarchySupertypes', root);
          if (supers) result.parents = supers.map(s => this.convertTypeHierarchyItem(s));
        } catch { /* not supported */ }
      }
      if ((direction === 'subtypes' || direction === 'both') && maxDepth > 0) {
        try {
          const subs = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>('vscode.provideTypeHierarchySubtypes', root);
          if (subs) result.children = subs.map(s => this.convertTypeHierarchyItem(s));
        } catch { /* not supported */ }
      }

      return result;
    } catch {
      return null;
    }
  }

  formatReferencesForPrompt(groups: ReferenceGroup[], maxTokens: number = 500): string {
    const total = groups.reduce((s, g) => s + g.count, 0);
    const lines: string[] = [`Symbol used in ${groups.length} files (${total} total references):`];
    let tokens = 15;

    for (const group of groups) {
      lines.push(`  ${group.filePath}: ${group.count} refs`);
      tokens += 8;
      for (const ref of group.references.slice(0, 3)) {
        const line = `    line ${ref.range.startLine + 1}: ${ref.preview.trim().slice(0, 80)}`;
        tokens += Math.ceil(line.split(/\s+/).length * 1.3);
        if (tokens > maxTokens) return lines.join('\n');
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  formatCallHierarchyForPrompt(item: CallHierarchyItem, maxTokens: number = 300, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    let result = `${prefix}${item.name} (${item.kind})`;
    if (item.callers) {
      for (const caller of item.callers.slice(0, 5)) {
        result += `\n${prefix}  ← ${caller.name}`;
      }
    }
    if (item.callees) {
      for (const callee of item.callees.slice(0, 5)) {
        result += `\n${prefix}  → ${callee.name}`;
      }
    }
    return result;
  }

  private async getIncomingCalls(item: vscode.CallHierarchyItem, depth: number): Promise<CallHierarchyItem[]> {
    try {
      const calls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>('vscode.provideIncomingCalls', item);
      if (!calls) return [];
      return calls.slice(0, 10).map(c => ({
        name: c.from.name,
        kind: vscode.SymbolKind[c.from.kind] || 'function',
        filePath: vscode.workspace.asRelativePath(c.from.uri),
        range: { startLine: c.from.range.start.line, startCol: c.from.range.start.character, endLine: c.from.range.end.line, endCol: c.from.range.end.character },
        detail: c.from.detail || null,
        callers: null,
        callees: null,
      }));
    } catch {
      return [];
    }
  }

  private async getOutgoingCalls(item: vscode.CallHierarchyItem, depth: number): Promise<CallHierarchyItem[]> {
    try {
      const calls = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>('vscode.provideOutgoingCalls', item);
      if (!calls) return [];
      return calls.slice(0, 10).map(c => ({
        name: c.to.name,
        kind: vscode.SymbolKind[c.to.kind] || 'function',
        filePath: vscode.workspace.asRelativePath(c.to.uri),
        range: { startLine: c.to.range.start.line, startCol: c.to.range.start.character, endLine: c.to.range.end.line, endCol: c.to.range.end.character },
        detail: c.to.detail || null,
        callers: null,
        callees: null,
      }));
    } catch {
      return [];
    }
  }

  private convertTypeHierarchyItem(item: vscode.TypeHierarchyItem): TypeHierarchyItem {
    return {
      name: item.name,
      kind: vscode.SymbolKind[item.kind] || 'class',
      filePath: vscode.workspace.asRelativePath(item.uri),
      range: { startLine: item.range.start.line, startCol: item.range.start.character, endLine: item.range.end.line, endCol: item.range.end.character },
      detail: item.detail || null,
      parents: null,
      children: null,
    };
  }

  private async getLinePreview(uri: vscode.Uri, line: number): Promise<string> {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      return doc.lineAt(line).text;
    } catch {
      return '';
    }
  }

  private async isWriteReference(loc: vscode.Location): Promise<boolean> {
    try {
      const doc = await vscode.workspace.openTextDocument(loc.uri);
      const lineText = doc.lineAt(loc.range.start.line).text;
      const afterRef = lineText.slice(loc.range.end.character).trimStart();
      return afterRef.startsWith('=') && !afterRef.startsWith('==');
    } catch {
      return false;
    }
  }
}
