import * as vscode from 'vscode';
import { GitBlameService } from '../services/git/GitBlameService';
import { Logger } from '../utils/Logger';

export class GitDecorationProvider {
  private blameService: GitBlameService;
  private decorationType: vscode.TextEditorDecorationType;
  private enabled: boolean = false;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.blameService = GitBlameService.getInstance();
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 3em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
    });
  }

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  enable(): void {
    this.enabled = true;

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations()),
      vscode.window.onDidChangeTextEditorVisibleRanges(() => this.updateDecorations()),
    );

    this.updateDecorations();
  }

  disable(): void {
    this.enabled = false;
    const editor = vscode.window.activeTextEditor;
    if (editor) editor.setDecorations(this.decorationType, []);
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  private async updateDecorations(): Promise<void> {
    if (!this.enabled) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    try {
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const visibleRanges = editor.visibleRanges;
      if (visibleRanges.length === 0) return;

      const startLine = visibleRanges[0].start.line + 1;
      const endLine = visibleRanges[visibleRanges.length - 1].end.line + 1;

      const blameLines = await this.blameService.getRangeBlame(filePath, startLine, endLine);
      const decorations: vscode.DecorationOptions[] = [];

      for (const bl of blameLines) {
        const line = bl.lineNumber - 1;
        if (line < 0 || line >= editor.document.lineCount) continue;

        const author = bl.isUncommitted ? 'You' : bl.author.split(' ')[0];
        const date = bl.isUncommitted ? 'Not committed' : this.relativeDate(bl.date);
        const text = `  ${author} • ${date}`;

        decorations.push({
          range: new vscode.Range(line, editor.document.lineAt(line).text.length, line, editor.document.lineAt(line).text.length),
          renderOptions: {
            after: {
              contentText: text,
              color: bl.isUncommitted
                ? new vscode.ThemeColor('editorWarning.foreground')
                : new vscode.ThemeColor('editorCodeLens.foreground'),
            },
          },
        });
      }

      editor.setDecorations(this.decorationType, decorations);
    } catch {
      // Blame not available
    }
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

  dispose(): void {
    this.disable();
    this.decorationType.dispose();
  }
}
