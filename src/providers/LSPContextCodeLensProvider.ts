import * as vscode from 'vscode';
import { SymbolService } from '../services/lsp/SymbolService';
import { ReferenceService } from '../services/lsp/ReferenceService';
import { TypeInfoService } from '../services/lsp/TypeInfoService';
import { LSPCapabilityDetector } from '../services/lsp/LSPCapabilityDetector';

export class LSPContextCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    vscode.window.onDidChangeActiveTextEditor(() => this.debounceRefresh());
    vscode.workspace.onDidSaveTextDocument(() => this.debounceRefresh());
  }

  private debounceRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this._onDidChange.fire(), 1000);
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const enabled = vscode.workspace.getConfiguration('inaCoding.lsp').get<boolean>('showTypeCodeLens', true);
    if (!enabled) return [];

    const detector = LSPCapabilityDetector.getInstance();
    if (!detector.isLanguageSupported(document.languageId)) return [];

    const lenses: vscode.CodeLens[] = [];
    try {
      const symbols = await SymbolService.getInstance().getDocumentSymbols(document.uri);

      const processSymbol = async (sym: any) => {
        if ([vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Class, vscode.SymbolKind.Interface].includes(sym.kind)) {
          const range = new vscode.Range(sym.selectionRange.startLine, sym.selectionRange.startCol, sym.selectionRange.endLine, sym.selectionRange.endCol);

          if (sym.kind === vscode.SymbolKind.Function || sym.kind === vscode.SymbolKind.Method) {
            if (sym.detail) {
              lenses.push(new vscode.CodeLens(range, {
                title: `$(symbol-method) ${sym.detail}`,
                command: '',
              }));
            }
          }

          lenses.push(new vscode.CodeLens(range, {
            title: `$(references) refs`,
            command: 'inaCoding.findReferences',
            arguments: [document.uri, new vscode.Position(sym.selectionRange.startLine, sym.selectionRange.startCol)],
          }));
        }

        if (sym.children) {
          for (const child of sym.children) await processSymbol(child);
        }
      };

      for (const sym of symbols) await processSymbol(sym);
    } catch {
      // LSP not available
    }

    return lenses;
  }
}
