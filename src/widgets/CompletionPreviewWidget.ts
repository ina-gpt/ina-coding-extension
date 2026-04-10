import * as vscode from 'vscode';
import { GhostTextItem } from '../services/completion/ghosttext/GhostTextTypes';

export class CompletionPreviewWidget implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;

  showPreview(
    item: GhostTextItem,
    position: vscode.Position,
    editor: vscode.TextEditor
  ): void {
    // Show as hover-style markdown content
    const content = this.createHoverContent(item);

    // Use a notification for quick preview (hover is not programmatically triggerable)
    vscode.window.showInformationMessage(
      `Completion: ${item.lineCount} lines, ${item.tokens} tokens`,
      'Accept',
      'Preview Full',
      'Dismiss'
    ).then((selection) => {
      if (selection === 'Accept') {
        vscode.commands.executeCommand('inaCoding.acceptCompletion');
      } else if (selection === 'Preview Full') {
        this.showFullPreviewPanel(item, editor.document.languageId);
      } else if (selection === 'Dismiss') {
        vscode.commands.executeCommand('inaCoding.dismissCompletion');
      }
    });
  }

  createHoverContent(item: GhostTextItem): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(`**Completion Preview** (${item.lineCount} lines)\n\n`);
    md.appendCodeblock(item.fullText, item.language);
    md.appendMarkdown('\n\n---\n');
    md.appendMarkdown(
      `[Accept](command:inaCoding.acceptCompletion) | [Dismiss](command:inaCoding.dismissCompletion)`
    );

    return md;
  }

  showFullPreviewPanel(item: GhostTextItem, language: string): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'completionPreview',
        'Completion Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: false,
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
      });
    }

    this.panel.webview.html = this.getPreviewPanelHtml(item, language);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'accept':
          vscode.commands.executeCommand('inaCoding.acceptCompletion');
          this.panel?.dispose();
          break;
        case 'dismiss':
          vscode.commands.executeCommand('inaCoding.dismissCompletion');
          this.panel?.dispose();
          break;
      }
    });
  }

  getPreviewPanelHtml(item: GhostTextItem, language: string): string {
    const escapedCode = item.fullText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Completion Preview</title>
  <style>
    body {
      font-family: var(--vscode-editor-font-family, 'Consolas, monospace');
      padding: 16px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .header h2 { margin: 0; font-size: 16px; }
    .meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: var(--vscode-editor-font-size, 14px);
      line-height: 1.5;
      margin: 0;
      white-space: pre;
    }
    .actions {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
    }
    button {
      padding: 6px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .accept-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .accept-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .dismiss-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .dismiss-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>Completion Preview</h2>
    <span class="meta">${item.lineCount} lines | ${item.tokens} tokens | ${language}</span>
  </div>
  <pre><code>${escapedCode}</code></pre>
  <div class="actions">
    <button class="accept-btn" onclick="accept()">Accept</button>
    <button class="dismiss-btn" onclick="dismiss()">Dismiss</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function accept() { vscode.postMessage({ command: 'accept' }); }
    function dismiss() { vscode.postMessage({ command: 'dismiss' }); }
  </script>
</body>
</html>`;
  }

  hidePreview(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }

  updatePreview(item: GhostTextItem): void {
    if (this.panel) {
      this.panel.webview.html = this.getPreviewPanelHtml(item, item.language);
    }
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }
}
