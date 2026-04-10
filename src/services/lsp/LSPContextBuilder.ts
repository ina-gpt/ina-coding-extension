import * as vscode from 'vscode';
import { SymbolService } from './SymbolService';
import { TypeInfoService } from './TypeInfoService';
import { DefinitionService } from './DefinitionService';
import { ReferenceService } from './ReferenceService';
import { DiagnosticService } from './DiagnosticService';
import { CodeActionService } from './CodeActionService';
import { InlayHintService } from './InlayHintService';
import { LSPCapabilityDetector } from './LSPCapabilityDetector';
import { LSPContextForAI, SymbolInfo, TypeInfo, FunctionSignature, DefinitionLocation, ReferenceGroup, DiagnosticInfo, CallHierarchyItem, TypeHierarchyItem, LSP_CONSTANTS } from './LSPTypes';
import { ParallelExecutor } from '../requestopt/ParallelExecutor';
import { SensitiveFileDetector } from '../codesec/SensitiveFileDetector';

export class LSPContextBuilder {
  private static instance: LSPContextBuilder;
  private symbolService: SymbolService;
  private typeInfoService: TypeInfoService;
  private definitionService: DefinitionService;
  private referenceService: ReferenceService;
  private diagnosticService: DiagnosticService;
  private codeActionService: CodeActionService;
  private inlayHintService: InlayHintService;
  private capabilityDetector: LSPCapabilityDetector;

  static getInstance(): LSPContextBuilder {
    if (!LSPContextBuilder.instance) {
      LSPContextBuilder.instance = new LSPContextBuilder();
    }
    return LSPContextBuilder.instance;
  }

  private constructor() {
    this.symbolService = SymbolService.getInstance();
    this.typeInfoService = TypeInfoService.getInstance();
    this.definitionService = DefinitionService.getInstance();
    this.referenceService = ReferenceService.getInstance();
    this.diagnosticService = DiagnosticService.getInstance();
    this.codeActionService = CodeActionService.getInstance();
    this.inlayHintService = InlayHintService.getInstance();
    this.capabilityDetector = LSPCapabilityDetector.getInstance();
  }

  async buildFullContext(document: vscode.TextDocument, position: vscode.Position, options?: { includeReferences?: boolean; includeCallHierarchy?: boolean; includeTypeHierarchy?: boolean; maxTokens?: number }): Promise<LSPContextForAI> {
    // Check if the document is a sensitive file - return minimal context if so
    const sensitiveDetector = SensitiveFileDetector.getInstance();
    if (sensitiveDetector.isSensitiveFile(document.uri.fsPath)) {
      return {
        currentSymbol: null, currentType: null, currentSignature: null,
        diagnostics: [], relatedDefinitions: [], relatedReferences: [],
        callHierarchy: null, typeHierarchy: null,
        fileSymbols: [], importedTypes: [],
        summary: 'Sensitive file — LSP context redacted',
      };
    }

    const caps = this.capabilityDetector.detectCapabilities(document);

    const [currentSymbol, currentType, currentSignature, diagnostics, fileSymbols] = await Promise.all([
      caps.hasDocumentSymbol ? this.withTimeout(this.symbolService.getSymbolAtPosition(document, position), LSP_CONSTANTS.HOVER_TIMEOUT_MS, null) : null,
      caps.hasHover ? this.withTimeout(this.typeInfoService.getTypeAtPosition(document, position), LSP_CONSTANTS.HOVER_TIMEOUT_MS, null) : null,
      caps.hasSignatureHelp ? this.withTimeout(this.typeInfoService.getFunctionSignature(document, position), LSP_CONSTANTS.HOVER_TIMEOUT_MS, null) : null,
      this.diagnosticService.getDiagnostics(document.uri),
      caps.hasDocumentSymbol ? this.withTimeout(this.symbolService.getDocumentSymbols(document.uri), LSP_CONSTANTS.DEFINITION_TIMEOUT_MS, []) : [],
    ]);

    // Gather definitions, references, call hierarchy, and type hierarchy in parallel
    const parallelExecutor = ParallelExecutor.getInstance();
    const extended = await parallelExecutor.gatherContext([
      {
        name: 'definitions',
        fn: () => caps.hasDefinitionProvider
          ? this.withTimeout(this.definitionService.getDefinition(document, position), LSP_CONSTANTS.DEFINITION_TIMEOUT_MS, [])
          : Promise.resolve([]),
        timeoutMs: LSP_CONSTANTS.DEFINITION_TIMEOUT_MS + 500,
        optional: true,
      },
      {
        name: 'references',
        fn: () => (options?.includeReferences !== false && caps.hasReferenceProvider)
          ? this.withTimeout(this.referenceService.findReferences(document, position, false), LSP_CONSTANTS.REFERENCES_TIMEOUT_MS, [])
          : Promise.resolve([]),
        timeoutMs: LSP_CONSTANTS.REFERENCES_TIMEOUT_MS + 500,
        optional: true,
      },
      {
        name: 'callHierarchy',
        fn: () => (options?.includeCallHierarchy && caps.hasCallHierarchy)
          ? this.withTimeout(this.referenceService.getCallHierarchy(document, position, 'both', 2), LSP_CONSTANTS.REFERENCES_TIMEOUT_MS, null)
          : Promise.resolve(null),
        timeoutMs: LSP_CONSTANTS.REFERENCES_TIMEOUT_MS + 500,
        optional: true,
      },
      {
        name: 'typeHierarchy',
        fn: () => (options?.includeTypeHierarchy && caps.hasTypeHierarchy)
          ? this.withTimeout(this.referenceService.getTypeHierarchy(document, position, 'both', 2), LSP_CONSTANTS.REFERENCES_TIMEOUT_MS, null)
          : Promise.resolve(null),
        timeoutMs: LSP_CONSTANTS.REFERENCES_TIMEOUT_MS + 500,
        optional: true,
      },
    ]);

    const relatedDefinitions: DefinitionLocation[] = extended.definitions || [];
    const relatedReferences: ReferenceGroup[] = extended.references || [];
    const callHierarchy: CallHierarchyItem | null = extended.callHierarchy || null;
    const typeHierarchy: TypeHierarchyItem | null = extended.typeHierarchy || null;

    const summary = this.buildSummary(currentSymbol, currentType, diagnostics, relatedReferences);

    return {
      currentSymbol,
      currentType,
      currentSignature,
      diagnostics,
      relatedDefinitions,
      relatedReferences,
      callHierarchy,
      typeHierarchy,
      fileSymbols,
      importedTypes: [],
      summary,
    };
  }

  async buildContextForCompletion(document: vscode.TextDocument, position: vscode.Position): Promise<LSPContextForAI> {
    const caps = this.capabilityDetector.detectCapabilities(document);

    const [currentSymbol, currentType, fileSymbols] = await Promise.all([
      caps.hasDocumentSymbol ? this.withTimeout(this.symbolService.getSymbolAtPosition(document, position), 2000, null) : null,
      caps.hasHover ? this.withTimeout(this.typeInfoService.getTypeAtPosition(document, position), 2000, null) : null,
      caps.hasDocumentSymbol ? this.withTimeout(this.symbolService.getDocumentSymbols(document.uri), 2000, []) : [],
    ]);

    const lineDiags = this.diagnosticService.getDiagnostics(document.uri).filter(d => d.range.startLine === position.line);

    return {
      currentSymbol, currentType, currentSignature: null,
      diagnostics: lineDiags,
      relatedDefinitions: [], relatedReferences: [],
      callHierarchy: null, typeHierarchy: null,
      fileSymbols, importedTypes: [],
      summary: this.buildSummary(currentSymbol, currentType, lineDiags, []),
    };
  }

  async buildContextForChat(document: vscode.TextDocument, position: vscode.Position): Promise<LSPContextForAI> {
    return this.buildFullContext(document, position, { includeReferences: true, includeCallHierarchy: false });
  }

  async buildContextForInlineEdit(document: vscode.TextDocument, range: vscode.Range): Promise<LSPContextForAI> {
    const position = range.start;
    return this.buildFullContext(document, position, { includeReferences: false });
  }

  async buildContextForAgent(filePaths: string[]): Promise<Map<string, LSPContextForAI>> {
    const results = new Map<string, LSPContextForAI>();
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    for (const fp of filePaths.slice(0, 10)) {
      try {
        const fullPath = fp.startsWith('/') ? fp : `${ws}/${fp}`;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
        const symbols = await this.symbolService.getDocumentSymbols(doc.uri);
        const diagnostics = this.diagnosticService.getDiagnostics(doc.uri);

        results.set(fp, {
          currentSymbol: null, currentType: null, currentSignature: null,
          diagnostics, relatedDefinitions: [], relatedReferences: [],
          callHierarchy: null, typeHierarchy: null,
          fileSymbols: symbols, importedTypes: [],
          summary: `${fp}: ${symbols.length} symbols, ${diagnostics.length} diagnostics`,
        });
      } catch { /* skip inaccessible files */ }
    }
    return results;
  }

  formatForPrompt(context: LSPContextForAI, maxTokens: number = 500): string {
    let output = '<lsp_context>\n';
    let tokens = 5;

    if (context.currentSymbol) {
      output += `  <current_symbol name="${context.currentSymbol.name}" kind="${context.currentSymbol.kindLabel}">\n`;
      if (context.currentType) {
        output += `    <type>${context.currentType.fullName}</type>\n`;
      }
      if (context.currentSignature) {
        output += `    <signature>${this.typeInfoService.formatSignatureForPrompt(context.currentSignature)}</signature>\n`;
      }
      output += '  </current_symbol>\n';
      tokens += 30;
    }

    if (context.fileSymbols.length > 0 && tokens < maxTokens - 100) {
      output += '  <file_symbols>\n';
      const symbolStr = this.symbolService.formatSymbolsForPrompt(context.fileSymbols, Math.min(200, maxTokens - tokens));
      output += symbolStr.split('\n').map(l => `    ${l}`).join('\n') + '\n';
      output += '  </file_symbols>\n';
      tokens += Math.ceil(symbolStr.split(/\s+/).length * 1.3);
    }

    if (context.diagnostics.length > 0 && tokens < maxTokens - 50) {
      output += `  <diagnostics count="${context.diagnostics.length}">\n`;
      for (const d of context.diagnostics.slice(0, 5)) {
        output += `    <diagnostic severity="${d.severity}" line="${d.range.startLine + 1}">${d.message}</diagnostic>\n`;
        tokens += 15;
        if (tokens > maxTokens) break;
      }
      output += '  </diagnostics>\n';
    }

    if (context.relatedDefinitions.length > 0 && tokens < maxTokens - 50) {
      output += '  <definitions>\n';
      for (const def of context.relatedDefinitions.slice(0, 3)) {
        output += `    <definition symbol="${def.symbolName}" file="${def.filePath}" line="${def.range.startLine + 1}">\n`;
        output += `      ${def.preview.slice(0, 200)}\n`;
        output += '    </definition>\n';
        tokens += 30;
        if (tokens > maxTokens) break;
      }
      output += '  </definitions>\n';
    }

    if (context.relatedReferences.length > 0 && tokens < maxTokens - 30) {
      const totalRefs = context.relatedReferences.reduce((s, g) => s + g.count, 0);
      output += `  <references count="${totalRefs}" files="${context.relatedReferences.length}" />\n`;
      tokens += 10;
    }

    if (context.callHierarchy && tokens < maxTokens - 30) {
      output += `  <call_hierarchy>\n    ${this.referenceService.formatCallHierarchyForPrompt(context.callHierarchy, maxTokens - tokens)}\n  </call_hierarchy>\n`;
    }

    output += '</lsp_context>';
    return output;
  }

  formatCompactSummary(context: LSPContextForAI): string {
    return context.summary;
  }

  private buildSummary(symbol: SymbolInfo | null, type: TypeInfo | null, diagnostics: DiagnosticInfo[], references: ReferenceGroup[]): string {
    const parts: string[] = [];
    if (symbol) {
      parts.push(`In ${symbol.kindLabel} ${symbol.name}`);
      if (type?.returnType) parts[0] += `: ${type.returnType}`;
    }
    const errors = diagnostics.filter(d => d.severity === 'error').length;
    const warnings = diagnostics.filter(d => d.severity === 'warning').length;
    if (errors > 0 || warnings > 0) parts.push(`${errors} errors, ${warnings} warnings`);
    if (references.length > 0) {
      const total = references.reduce((s, g) => s + g.count, 0);
      parts.push(`${total} references across ${references.length} files`);
    }
    return parts.join(' | ') || 'No LSP context available';
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
    ]);
  }
}
