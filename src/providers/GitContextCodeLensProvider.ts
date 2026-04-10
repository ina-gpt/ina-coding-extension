import * as vscode from 'vscode';
import { GitBlameService } from '../services/git/GitBlameService';
import { Logger } from '../utils/Logger';

export class GitContextCodeLensProvider implements vscode.CodeLensProvider {
  private blameService: GitBlameService;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.blameService = GitBlameService.getInstance();

    vscode.window.onDidChangeActiveTextEditor(() => {
      this.debounceRefresh();
    });

    vscode.workspace.onDidSaveTextDocument(() => {
      this.debounceRefresh();
    });
  }

  private debounceRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this._onDidChange.fire(), 1000);
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const enabled = vscode.workspace.getConfiguration('inaCoding.git').get<boolean>('showBlameCodeLens', true);
    if (!enabled) return [];

    const lenses: vscode.CodeLens[] = [];

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', document.uri
      );
      if (!symbols) return [];

      const filePath = vscode.workspace.asRelativePath(document.uri);
      const blame = await this.blameService.getBlame(filePath);

      const processSymbol = (sym: vscode.DocumentSymbol) => {
        if (sym.kind === vscode.SymbolKind.Function || sym.kind === vscode.SymbolKind.Method || sym.kind === vscode.SymbolKind.Class) {
          const line = sym.range.start.line + 1;
          const blameLine = blame.lines.find(l => l.lineNumber === line);
          if (blameLine && !blameLine.isUncommitted) {
            const relDate = this.relativeDate(blameLine.date);
            const title = `Last modified by ${blameLine.author}, ${relDate} — ${blameLine.summary.slice(0, 50)}`;
            lenses.push(new vscode.CodeLens(sym.range, {
              title,
              command: 'inaCoding.showGitLog',
              arguments: [blameLine.hash],
            }));
          }
        }
        sym.children?.forEach(processSymbol);
      };

      symbols.forEach(processSymbol);
    } catch {
      // Blame not available
    }

    return lenses;
  }

  private relativeDate(date: Date): string {
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }
}
