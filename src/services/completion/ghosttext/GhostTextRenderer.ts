import * as vscode from 'vscode';
import {
  GhostTextConfig,
  GhostTextStyle,
  GhostTextItem,
  GhostTextSession,
  DEFAULT_GHOST_TEXT_STYLE,
} from './GhostTextTypes';

export class GhostTextRenderer implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType | null = null;
  private multiLineDecorationType: vscode.TextEditorDecorationType | null = null;
  private cycleIndicatorDecorationType: vscode.TextEditorDecorationType | null = null;
  private activeDecorations: Map<string, vscode.DecorationOptions[]> = new Map();
  private style: GhostTextStyle;
  private config: GhostTextConfig;
  private animationTimer: ReturnType<typeof setInterval> | null = null;
  private currentOpacity: number = 0;

  constructor(config: GhostTextConfig) {
    this.config = config;
    this.style = {
      color: config.color,
      opacity: config.opacity,
      fontStyle: config.fontStyle,
      backgroundColor: null,
      border: null,
    };
    this.decorationType = this.createDecorationType(this.style);
    this.multiLineDecorationType = this.createMultiLineDecorationType(this.style);
  }

  createDecorationType(style: GhostTextStyle): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      after: {
        color: style.color,
        fontStyle: style.fontStyle,
      },
      isWholeLine: false,
    });
  }

  createMultiLineDecorationType(style: GhostTextStyle): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      after: {
        color: style.color,
        fontStyle: style.fontStyle,
      },
      isWholeLine: true,
    });
  }

  show(editor: vscode.TextEditor, item: GhostTextItem, session: GhostTextSession): void {
    this.hide(editor, false);

    const lines = item.displayText.split('\n');

    if (lines.length === 1) {
      this.showInline(editor, item);
    } else {
      this.showMultiLine(editor, item, this.config.maxPreviewLines);
    }
  }

  private showInline(editor: vscode.TextEditor, item: GhostTextItem): void {
    if (!this.decorationType) return;

    const decoration: vscode.DecorationOptions = {
      range: new vscode.Range(item.position, item.position),
      renderOptions: {
        after: {
          contentText: item.displayText,
          color: this.style.color,
          fontStyle: this.style.fontStyle,
        },
      },
    };

    editor.setDecorations(this.decorationType, [decoration]);
    this.activeDecorations.set('inline', [decoration]);
  }

  showMultiLine(editor: vscode.TextEditor, item: GhostTextItem, maxLines: number): void {
    if (!this.decorationType) return;

    const lines = item.displayText.split('\n');
    const visibleLines = lines.slice(0, maxLines);
    const isTruncated = lines.length > maxLines;

    const decorations: vscode.DecorationOptions[] = [];

    // First line: inline after cursor
    if (visibleLines.length > 0) {
      decorations.push({
        range: new vscode.Range(item.position, item.position),
        renderOptions: {
          after: {
            contentText: visibleLines[0],
            color: this.style.color,
            fontStyle: this.style.fontStyle,
          },
        },
      });
    }

    // Subsequent lines as block decorations on following lines
    for (let i = 1; i < visibleLines.length; i++) {
      const lineNum = item.position.line + i;
      if (lineNum >= editor.document.lineCount) break;

      decorations.push({
        range: new vscode.Range(lineNum, 0, lineNum, 0),
        renderOptions: {
          after: {
            contentText: visibleLines[i],
            color: this.style.color,
            fontStyle: this.style.fontStyle,
          },
        },
      });
    }

    // Truncation indicator
    if (isTruncated) {
      const indicatorLine = Math.min(
        item.position.line + visibleLines.length,
        editor.document.lineCount - 1
      );
      decorations.push({
        range: new vscode.Range(indicatorLine, 0, indicatorLine, 0),
        renderOptions: {
          after: {
            contentText: `  ... (${lines.length - maxLines} more lines)`,
            color: this.style.color,
            fontStyle: 'italic',
          },
        },
      });
    }

    editor.setDecorations(this.decorationType, decorations);
    this.activeDecorations.set('multiline', decorations);
  }

  showWithAnimation(editor: vscode.TextEditor, item: GhostTextItem): void {
    if (this.config.fadeInDuration <= 0) {
      this.show(editor, item, null as unknown as GhostTextSession);
      return;
    }

    // For VS Code, true opacity animation is limited.
    // We simulate by showing immediately since decorations don't support animated opacity.
    this.show(editor, item, null as unknown as GhostTextSession);
  }

  hide(editor: vscode.TextEditor, animate: boolean = false): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }

    if (this.decorationType) {
      editor.setDecorations(this.decorationType, []);
    }
    if (this.multiLineDecorationType) {
      editor.setDecorations(this.multiLineDecorationType, []);
    }
    if (this.cycleIndicatorDecorationType) {
      editor.setDecorations(this.cycleIndicatorDecorationType, []);
    }

    this.activeDecorations.clear();
  }

  async hideWithAnimation(editor: vscode.TextEditor): Promise<void> {
    // VS Code decorations don't support smooth animation
    this.hide(editor, false);
  }

  updatePartialAccept(
    editor: vscode.TextEditor,
    item: GhostTextItem,
    acceptedLength: number
  ): void {
    const remaining = item.fullText.slice(acceptedLength);
    if (!remaining) {
      this.hide(editor, false);
      return;
    }

    const updatedItem: GhostTextItem = {
      ...item,
      text: remaining,
      displayText: remaining,
      lineCount: remaining.split('\n').length,
    };

    this.show(editor, updatedItem, null as unknown as GhostTextSession);
  }

  highlightAccepted(editor: vscode.TextEditor, range: vscode.Range): void {
    const highlightType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
      isWholeLine: false,
    });

    editor.setDecorations(highlightType, [{ range }]);

    // Remove highlight after 300ms
    setTimeout(() => {
      editor.setDecorations(highlightType, []);
      highlightType.dispose();
    }, 300);
  }

  showCycleIndicator(
    editor: vscode.TextEditor,
    currentIndex: number,
    totalCount: number
  ): void {
    if (!this.config.showIndicator) return;

    if (this.cycleIndicatorDecorationType) {
      this.cycleIndicatorDecorationType.dispose();
    }

    this.cycleIndicatorDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` (${currentIndex + 1}/${totalCount})`,
        color: '#6b7280',
        fontStyle: 'normal',
        margin: '0 0 0 1em',
      },
    });

    const position = editor.selection.active;
    editor.setDecorations(this.cycleIndicatorDecorationType, [
      { range: new vscode.Range(position.line, 0, position.line, 0) },
    ]);
  }

  hideCycleIndicator(editor: vscode.TextEditor): void {
    if (this.cycleIndicatorDecorationType) {
      editor.setDecorations(this.cycleIndicatorDecorationType, []);
    }
  }

  setStyle(style: Partial<GhostTextStyle>): void {
    this.style = { ...this.style, ...style };

    // Recreate decoration types
    if (this.decorationType) this.decorationType.dispose();
    if (this.multiLineDecorationType) this.multiLineDecorationType.dispose();

    this.decorationType = this.createDecorationType(this.style);
    this.multiLineDecorationType = this.createMultiLineDecorationType(this.style);
  }

  getStyle(): GhostTextStyle {
    return { ...this.style };
  }

  dispose(): void {
    if (this.animationTimer) clearInterval(this.animationTimer);
    if (this.decorationType) this.decorationType.dispose();
    if (this.multiLineDecorationType) this.multiLineDecorationType.dispose();
    if (this.cycleIndicatorDecorationType) this.cycleIndicatorDecorationType.dispose();
    this.activeDecorations.clear();
  }
}
