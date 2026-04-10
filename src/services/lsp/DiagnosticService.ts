import * as vscode from 'vscode';
import { DiagnosticInfo, DiagnosticSeverity } from './LSPTypes';

export class DiagnosticService {
  private static instance: DiagnosticService;

  static getInstance(): DiagnosticService {
    if (!DiagnosticService.instance) {
      DiagnosticService.instance = new DiagnosticService();
    }
    return DiagnosticService.instance;
  }

  getDiagnostics(uri?: vscode.Uri): DiagnosticInfo[] {
    if (uri) {
      const diags = vscode.languages.getDiagnostics(uri);
      return diags.map(d => this.convertDiagnostic(d, vscode.workspace.asRelativePath(uri)));
    }
    const all = vscode.languages.getDiagnostics();
    const results: DiagnosticInfo[] = [];
    for (const [docUri, diags] of all) {
      const filePath = vscode.workspace.asRelativePath(docUri);
      for (const d of diags) {
        results.push(this.convertDiagnostic(d, filePath));
      }
    }
    return results;
  }

  getFileDiagnostics(filePath: string): DiagnosticInfo[] {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = filePath.startsWith('/') ? filePath : `${ws}/${filePath}`;
    const uri = vscode.Uri.file(fullPath);
    return this.getDiagnostics(uri);
  }

  getErrors(uri?: vscode.Uri): DiagnosticInfo[] {
    return this.getDiagnostics(uri).filter(d => d.severity === DiagnosticSeverity.ERROR);
  }

  getWarnings(uri?: vscode.Uri): DiagnosticInfo[] {
    return this.getDiagnostics(uri).filter(d => d.severity === DiagnosticSeverity.WARNING);
  }

  getDiagnosticsBySource(source: string): DiagnosticInfo[] {
    return this.getDiagnostics().filter(d => d.source === source);
  }

  async getDiagnosticContext(diagnostic: DiagnosticInfo, contextLines: number = 2): Promise<string> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = diagnostic.filePath.startsWith('/') ? diagnostic.filePath : `${ws}/${diagnostic.filePath}`;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      const start = Math.max(0, diagnostic.range.startLine - contextLines);
      const end = Math.min(doc.lineCount - 1, diagnostic.range.endLine + contextLines);
      const lines: string[] = [];
      for (let i = start; i <= end; i++) {
        const prefix = i === diagnostic.range.startLine ? '> ' : '  ';
        lines.push(`${prefix}${i + 1} | ${doc.lineAt(i).text}`);
      }
      lines.push(`  ${' '.repeat(String(diagnostic.range.startLine + 1).length + 3 + diagnostic.range.startCol)}^ ${diagnostic.message}`);
      return lines.join('\n');
    } catch {
      return `${diagnostic.filePath}:${diagnostic.range.startLine + 1}: ${diagnostic.message}`;
    }
  }

  watchDiagnostics(callback: (filePath: string, diagnostics: DiagnosticInfo[]) => void): vscode.Disposable {
    let timer: NodeJS.Timeout | null = null;
    return vscode.languages.onDidChangeDiagnostics(e => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const uri of e.uris) {
          const filePath = vscode.workspace.asRelativePath(uri);
          const diags = this.getDiagnostics(uri);
          callback(filePath, diags);
        }
      }, 500);
    });
  }

  formatDiagnosticsForPrompt(diagnostics: DiagnosticInfo[], maxTokens: number = 500): string {
    const grouped = new Map<string, DiagnosticInfo[]>();
    for (const d of diagnostics) {
      const list = grouped.get(d.filePath) || [];
      list.push(d);
      grouped.set(d.filePath, list);
    }

    const lines: string[] = [];
    let tokens = 0;
    for (const [filePath, diags] of grouped) {
      lines.push(`${filePath}:`);
      tokens += 5;
      for (const d of diags) {
        const line = `  line ${d.range.startLine + 1}: [${d.severity}] ${d.message}${d.code ? ` (${d.code})` : ''}`;
        tokens += Math.ceil(line.split(/\s+/).length * 1.3);
        if (tokens > maxTokens) return lines.join('\n');
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  summarizeDiagnostics(diagnostics: DiagnosticInfo[]): string {
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.ERROR).length;
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.WARNING).length;
    const files = new Set(diagnostics.map(d => d.filePath)).size;
    const topErrors = diagnostics.filter(d => d.severity === DiagnosticSeverity.ERROR).slice(0, 3).map(d => d.message.slice(0, 60));
    return `${errors} errors, ${warnings} warnings across ${files} files${topErrors.length > 0 ? '. Main: ' + topErrors.join('; ') : ''}`;
  }

  private convertDiagnostic(diag: vscode.Diagnostic, filePath: string): DiagnosticInfo {
    return {
      filePath,
      range: { startLine: diag.range.start.line, startCol: diag.range.start.character, endLine: diag.range.end.line, endCol: diag.range.end.character },
      message: diag.message,
      severity: this.convertSeverity(diag.severity),
      code: typeof diag.code === 'object' ? String(diag.code.value) : diag.code != null ? String(diag.code) : null,
      source: diag.source || null,
      relatedInformation: diag.relatedInformation?.map(r => ({
        filePath: vscode.workspace.asRelativePath(r.location.uri),
        line: r.location.range.start.line,
        message: r.message,
      })) || null,
      tags: diag.tags?.map(t => t === vscode.DiagnosticTag.Unnecessary ? 'unnecessary' : t === vscode.DiagnosticTag.Deprecated ? 'deprecated' : 'unknown') || null,
    };
  }

  private convertSeverity(severity: vscode.DiagnosticSeverity): DiagnosticSeverity {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error: return DiagnosticSeverity.ERROR;
      case vscode.DiagnosticSeverity.Warning: return DiagnosticSeverity.WARNING;
      case vscode.DiagnosticSeverity.Information: return DiagnosticSeverity.INFO;
      case vscode.DiagnosticSeverity.Hint: return DiagnosticSeverity.HINT;
      default: return DiagnosticSeverity.INFO;
    }
  }
}
