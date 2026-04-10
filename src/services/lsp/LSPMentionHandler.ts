import * as vscode from 'vscode';
import { LSPContextBuilder } from './LSPContextBuilder';
import { SymbolService } from './SymbolService';
import { TypeInfoService } from './TypeInfoService';
import { DefinitionService } from './DefinitionService';
import { ReferenceService } from './ReferenceService';
import { DiagnosticService } from './DiagnosticService';
import { Logger } from '../../utils/Logger';

export interface LSPMentionSuggestion {
  type: string;
  value: string;
  displayName: string;
  description?: string;
  icon: string;
  insertText: string;
  sortOrder: number;
}

export class LSPMentionHandler {
  private static instance: LSPMentionHandler;

  static getInstance(): LSPMentionHandler {
    if (!LSPMentionHandler.instance) {
      LSPMentionHandler.instance = new LSPMentionHandler();
    }
    return LSPMentionHandler.instance;
  }

  async resolveMention(mention: { type: string; value: string }): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    const value = mention.value || '';

    try {
      switch (mention.type) {
        case 'type': {
          if (value) {
            const sym = await SymbolService.getInstance().getSymbolByName(value, editor?.document);
            if (sym && editor) {
              const pos = new vscode.Position(sym.selectionRange.startLine, sym.selectionRange.startCol);
              const type = await TypeInfoService.getInstance().getTypeAtPosition(editor.document, pos);
              if (type) return TypeInfoService.getInstance().formatTypeForPrompt(type);
            }
            return `[Type not found: ${value}]`;
          }
          if (!editor) return '[No active editor]';
          const type = await TypeInfoService.getInstance().getTypeAtPosition(editor.document, editor.selection.active);
          return type ? TypeInfoService.getInstance().formatTypeForPrompt(type) : '[No type info at cursor]';
        }
        case 'def': {
          if (!editor) return '[No active editor]';
          const pos = value
            ? await this.findSymbolPosition(value, editor.document)
            : editor.selection.active;
          if (!pos) return `[Symbol not found: ${value}]`;
          const defs = await DefinitionService.getInstance().getDefinition(editor.document, pos);
          if (defs.length === 0) return '[No definition found]';
          return DefinitionService.getInstance().formatDefinitionsForPrompt(defs, 1000);
        }
        case 'refs': {
          if (!editor) return '[No active editor]';
          const pos = value
            ? await this.findSymbolPosition(value, editor.document)
            : editor.selection.active;
          if (!pos) return `[Symbol not found: ${value}]`;
          const refs = await ReferenceService.getInstance().findReferences(editor.document, pos, false);
          return ReferenceService.getInstance().formatReferencesForPrompt(refs, 1000);
        }
        case 'errors': {
          if (value) {
            const diags = DiagnosticService.getInstance().getFileDiagnostics(value);
            return DiagnosticService.getInstance().formatDiagnosticsForPrompt(diags, 1000);
          }
          if (!editor) return '[No active editor]';
          const diags = DiagnosticService.getInstance().getDiagnostics(editor.document.uri);
          return DiagnosticService.getInstance().formatDiagnosticsForPrompt(diags, 1000);
        }
        case 'signature': {
          if (!editor) return '[No active editor]';
          const pos = value
            ? await this.findSymbolPosition(value, editor.document)
            : editor.selection.active;
          if (!pos) return `[Function not found: ${value}]`;
          const sig = await TypeInfoService.getInstance().getFunctionSignature(editor.document, pos);
          return sig ? TypeInfoService.getInstance().formatSignatureForPrompt(sig) : '[No signature info]';
        }
        case 'hierarchy': {
          if (!editor) return '[No active editor]';
          const pos = value
            ? await this.findSymbolPosition(value, editor.document)
            : editor.selection.active;
          if (!pos) return `[Symbol not found: ${value}]`;
          const hierarchy = await ReferenceService.getInstance().getCallHierarchy(editor.document, pos, 'both', 2);
          if (!hierarchy) return '[No call hierarchy available]';
          return ReferenceService.getInstance().formatCallHierarchyForPrompt(hierarchy, 500);
        }
        default:
          return `[Unknown LSP mention type: ${mention.type}]`;
      }
    } catch (error) {
      Logger.error(`LSP mention resolution failed for ${mention.type}:${value}:`, error);
      return `[LSP error: ${error instanceof Error ? error.message : 'Unknown'}]`;
    }
  }

  async getSuggestions(mentionType: string, partial: string): Promise<LSPMentionSuggestion[]> {
    const suggestions: LSPMentionSuggestion[] = [];

    if (mentionType === 'type' || mentionType === 'def' || mentionType === 'refs' || mentionType === 'signature' || mentionType === 'hierarchy') {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        try {
          const symbols = await SymbolService.getInstance().getDocumentSymbols(editor.document.uri);
          const flat = this.flattenSymbols(symbols);
          const filtered = partial
            ? flat.filter(s => s.name.toLowerCase().includes(partial.toLowerCase()))
            : flat;

          for (const sym of filtered.slice(0, 15)) {
            suggestions.push({
              type: mentionType,
              value: `${mentionType}:${sym.name}`,
              displayName: sym.name,
              description: `${sym.kindLabel}${sym.detail ? ': ' + sym.detail : ''}`,
              icon: this.kindToIcon(sym.kindLabel),
              insertText: `@${mentionType}:${sym.name} `,
              sortOrder: suggestions.length,
            });
          }
        } catch { /* no symbols */ }
      }
    }

    return suggestions;
  }

  private async findSymbolPosition(name: string, document: vscode.TextDocument): Promise<vscode.Position | null> {
    const sym = await SymbolService.getInstance().getSymbolByName(name, document);
    if (!sym) return null;
    return new vscode.Position(sym.selectionRange.startLine, sym.selectionRange.startCol);
  }

  private flattenSymbols(symbols: { name: string; kindLabel: string; detail: string | null; children: any[] | null }[]): { name: string; kindLabel: string; detail: string | null }[] {
    const result: { name: string; kindLabel: string; detail: string | null }[] = [];
    for (const sym of symbols) {
      result.push({ name: sym.name, kindLabel: sym.kindLabel, detail: sym.detail });
      if (sym.children) result.push(...this.flattenSymbols(sym.children));
    }
    return result;
  }

  private kindToIcon(kind: string): string {
    const map: Record<string, string> = {
      class: '$(symbol-class)', interface: '$(symbol-interface)', function: '$(symbol-method)',
      method: '$(symbol-method)', property: '$(symbol-property)', variable: '$(symbol-variable)',
      enum: '$(symbol-enum)', const: '$(symbol-constant)', module: '$(symbol-namespace)',
    };
    return map[kind] || '$(symbol-misc)';
  }
}
