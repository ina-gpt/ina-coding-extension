/**
 * Phase 15.5 — Bug Finder Decorator
 * Provides gutter markers, inline decorations, and hover information for detected bugs.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { BugReport, BugSeverity } from './BugFinderTypes';

export class BugFinderDecorator {
  private static instance: BugFinderDecorator;

  private criticalDecoration: vscode.TextEditorDecorationType;
  private highDecoration: vscode.TextEditorDecorationType;
  private mediumDecoration: vscode.TextEditorDecorationType;
  private lowDecoration: vscode.TextEditorDecorationType;
  private infoDecoration: vscode.TextEditorDecorationType;

  /** Bugs currently displayed, keyed by file path */
  private activeBugs: Map<string, BugReport[]> = new Map();

  private constructor() {
    this.criticalDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: new vscode.ThemeIcon('error').id as unknown as vscode.Uri,
      gutterIconSize: 'contain',
      overviewRulerColor: '#ff0000',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: 'rgba(255, 0, 0, 0.08)',
      isWholeLine: true,
    });

    this.highDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: new vscode.ThemeIcon('warning').id as unknown as vscode.Uri,
      gutterIconSize: 'contain',
      overviewRulerColor: '#ff4444',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: 'rgba(255, 68, 68, 0.06)',
      isWholeLine: true,
    });

    this.mediumDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: '#ffaa00',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: 'rgba(255, 170, 0, 0.05)',
      isWholeLine: true,
      after: {
        color: '#ffaa00',
        fontStyle: 'italic',
      },
    });

    this.lowDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: '#4488ff',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: 'rgba(68, 136, 255, 0.04)',
      isWholeLine: true,
    });

    this.infoDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: '#888888',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  static getInstance(): BugFinderDecorator {
    if (!BugFinderDecorator.instance) {
      BugFinderDecorator.instance = new BugFinderDecorator();
    }
    return BugFinderDecorator.instance;
  }

  /**
   * Show gutter markers and inline decorations for the given bugs.
   */
  showBugMarkers(editor: vscode.TextEditor, bugs: BugReport[]): void {
    const filePath = editor.document.uri.fsPath;
    this.activeBugs.set(filePath, bugs);

    const critical: vscode.DecorationOptions[] = [];
    const high: vscode.DecorationOptions[] = [];
    const medium: vscode.DecorationOptions[] = [];
    const low: vscode.DecorationOptions[] = [];
    const info: vscode.DecorationOptions[] = [];

    for (const bug of bugs) {
      if (bug.status === 'dismissed' || bug.status === 'fixed') { continue; }

      const startLine = Math.max(0, bug.startLine - 1);
      const endLine = Math.max(startLine, bug.endLine - 1);
      const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, Number.MAX_SAFE_INTEGER),
      );

      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.isTrusted = true;
      hoverMessage.supportHtml = true;
      hoverMessage.appendMarkdown(this.buildHoverContent(bug));

      const decoration: vscode.DecorationOptions = { range, hoverMessage };

      switch (bug.severity) {
        case BugSeverity.CRITICAL: critical.push(decoration); break;
        case BugSeverity.HIGH: high.push(decoration); break;
        case BugSeverity.MEDIUM: medium.push(decoration); break;
        case BugSeverity.LOW: low.push(decoration); break;
        case BugSeverity.INFO: info.push(decoration); break;
      }
    }

    editor.setDecorations(this.criticalDecoration, critical);
    editor.setDecorations(this.highDecoration, high);
    editor.setDecorations(this.mediumDecoration, medium);
    editor.setDecorations(this.lowDecoration, low);
    editor.setDecorations(this.infoDecoration, info);

    Logger.info(`BugFinderDecorator: showing ${bugs.length} markers in ${filePath}`);
  }

  /**
   * Clear all bug markers from the given editor, or all editors if none specified.
   */
  clearBugMarkers(editor?: vscode.TextEditor): void {
    const editors = editor ? [editor] : vscode.window.visibleTextEditors;
    for (const ed of editors) {
      ed.setDecorations(this.criticalDecoration, []);
      ed.setDecorations(this.highDecoration, []);
      ed.setDecorations(this.mediumDecoration, []);
      ed.setDecorations(this.lowDecoration, []);
      ed.setDecorations(this.infoDecoration, []);
      this.activeBugs.delete(ed.document.uri.fsPath);
    }
  }

  /**
   * Register a hover provider that shows rich bug details when hovering over marked lines.
   * Returns a Disposable that should be added to the extension's subscriptions.
   */
  registerHoverProvider(): vscode.Disposable {
    return vscode.languages.registerHoverProvider({ scheme: 'file' }, {
      provideHover: (document, position) => {
        const filePath = document.uri.fsPath;
        const bugs = this.activeBugs.get(filePath);
        if (!bugs || bugs.length === 0) { return null; }

        const line = position.line + 1; // 1-based
        const matching = bugs.filter(
          b => b.status !== 'dismissed' && b.status !== 'fixed' && line >= b.startLine && line <= b.endLine,
        );

        if (matching.length === 0) { return null; }

        const contents = new vscode.MarkdownString();
        contents.isTrusted = true;
        contents.supportHtml = true;

        for (let i = 0; i < matching.length; i++) {
          if (i > 0) { contents.appendMarkdown('\n\n---\n\n'); }
          contents.appendMarkdown(this.buildHoverContent(matching[i]));
        }

        return new vscode.Hover(contents);
      },
    });
  }

  /**
   * Dispose all decoration types.
   */
  dispose(): void {
    this.criticalDecoration.dispose();
    this.highDecoration.dispose();
    this.mediumDecoration.dispose();
    this.lowDecoration.dispose();
    this.infoDecoration.dispose();
    this.activeBugs.clear();
  }

  // ============ Private ============

  private buildHoverContent(bug: BugReport): string {
    const severityBadge = this.getSeverityBadge(bug.severity);
    const categoryLabel = bug.category.replace(/_/g, ' ');

    let md = `${severityBadge} **${bug.title}**\n\n`;
    md += `*${categoryLabel}* | Lines ${bug.startLine}-${bug.endLine}\n\n`;
    md += `${bug.description}\n\n`;
    md += `**Suggestion:** ${bug.suggestion}\n\n`;

    // Command links for fix and dismiss
    const fixCmd = `command:ina.bugfinder.fix?${encodeURIComponent(JSON.stringify(bug.id))}`;
    const dismissCmd = `command:ina.bugfinder.dismiss?${encodeURIComponent(JSON.stringify(bug.id))}`;

    md += `[$(tools) Fix](${fixCmd} "Apply fix") | [$(close) Dismiss](${dismissCmd} "Dismiss this bug")`;

    return md;
  }

  private getSeverityBadge(severity: BugSeverity): string {
    switch (severity) {
      case BugSeverity.CRITICAL: return '$(error) **CRITICAL**';
      case BugSeverity.HIGH: return '$(warning) **HIGH**';
      case BugSeverity.MEDIUM: return '$(info) MEDIUM';
      case BugSeverity.LOW: return '$(circle-outline) LOW';
      case BugSeverity.INFO: return '$(note) INFO';
    }
  }
}
