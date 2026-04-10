import * as vscode from 'vscode';

interface InlayHintInfo {
  position: { line: number; col: number };
  label: string;
  kind: 'type' | 'parameter' | 'other';
  tooltip: string | null;
}

export class InlayHintService {
  private static instance: InlayHintService;

  static getInstance(): InlayHintService {
    if (!InlayHintService.instance) {
      InlayHintService.instance = new InlayHintService();
    }
    return InlayHintService.instance;
  }

  async getInlayHints(document: vscode.TextDocument, range: vscode.Range): Promise<InlayHintInfo[]> {
    try {
      const hints = await vscode.commands.executeCommand<vscode.InlayHint[]>('vscode.executeInlayHintProvider', document.uri, range);
      if (!hints) return [];

      return hints.map(h => {
        const label = typeof h.label === 'string' ? h.label : Array.isArray(h.label) ? h.label.map(p => typeof p === 'string' ? p : p.value).join('') : '';
        const tooltip = h.tooltip ? (typeof h.tooltip === 'string' ? h.tooltip : h.tooltip.value) : null;
        let kind: 'type' | 'parameter' | 'other' = 'other';
        if (h.kind === vscode.InlayHintKind.Type) kind = 'type';
        else if (h.kind === vscode.InlayHintKind.Parameter) kind = 'parameter';

        return {
          position: { line: h.position.line, col: h.position.character },
          label: label.trim(),
          kind,
          tooltip,
        };
      });
    } catch {
      return [];
    }
  }

  async getTypeAnnotations(document: vscode.TextDocument): Promise<{ line: number; variable: string; type: string }[]> {
    const range = new vscode.Range(0, 0, document.lineCount - 1, 0);
    const hints = await this.getInlayHints(document, range);
    return hints
      .filter(h => h.kind === 'type')
      .map(h => {
        const lineText = document.lineAt(h.position.line).text;
        const before = lineText.slice(0, h.position.col).trim();
        const variable = before.split(/\s+/).pop()?.replace(/[=:;,]$/, '') || '';
        return {
          line: h.position.line,
          variable,
          type: h.label.replace(/^:\s*/, ''),
        };
      })
      .filter(h => h.variable && h.type);
  }

  formatInlayHintsForPrompt(hints: { line: number; variable: string; type: string }[]): string {
    if (hints.length === 0) return '';
    return 'Inferred types:\n' + hints.map(h => `  line ${h.line + 1}: ${h.variable} → ${h.type}`).join('\n');
  }
}
