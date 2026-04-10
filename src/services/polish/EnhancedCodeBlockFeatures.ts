/**
 * Phase 17.7 — Enhanced Code Block Features
 *
 * Cross-cutting helpers that augment chat code blocks with extras the webview
 * can render on top of the base block:
 *   - language badge overlay
 *   - line-number toggle
 *   - collapse/expand for blocks above N lines
 *   - "Open in Editor" action that opens the snippet as a scratch document
 */
import * as vscode from 'vscode';

export interface CodeBlockFeatures {
  language: string;
  lineCount: number;
  shouldCollapse: boolean;
  badgeColor: string;
  badgeTextColor: string;
}

const LANGUAGE_COLORS: Record<string, { bg: string; fg: string }> = {
  typescript: { bg: '#3178c6', fg: '#ffffff' },
  tsx: { bg: '#3178c6', fg: '#ffffff' },
  javascript: { bg: '#f7df1e', fg: '#000000' },
  jsx: { bg: '#f7df1e', fg: '#000000' },
  python: { bg: '#3776ab', fg: '#ffffff' },
  rust: { bg: '#ce412b', fg: '#ffffff' },
  go: { bg: '#00add8', fg: '#ffffff' },
  java: { bg: '#b07219', fg: '#ffffff' },
  ruby: { bg: '#cc342d', fg: '#ffffff' },
  cpp: { bg: '#f34b7d', fg: '#ffffff' },
  c: { bg: '#555555', fg: '#ffffff' },
  csharp: { bg: '#178600', fg: '#ffffff' },
  php: { bg: '#4f5d95', fg: '#ffffff' },
  swift: { bg: '#f05138', fg: '#ffffff' },
  kotlin: { bg: '#a97bff', fg: '#ffffff' },
  scala: { bg: '#c22d40', fg: '#ffffff' },
  html: { bg: '#e34c26', fg: '#ffffff' },
  css: { bg: '#1572b6', fg: '#ffffff' },
  scss: { bg: '#c6538c', fg: '#ffffff' },
  json: { bg: '#292929', fg: '#ffffff' },
  yaml: { bg: '#cb171e', fg: '#ffffff' },
  markdown: { bg: '#083fa1', fg: '#ffffff' },
  sql: { bg: '#e38c00', fg: '#ffffff' },
  shell: { bg: '#89e051', fg: '#000000' },
  bash: { bg: '#89e051', fg: '#000000' },
  lua: { bg: '#000080', fg: '#ffffff' },
  dart: { bg: '#00b4ab', fg: '#ffffff' },
  elixir: { bg: '#6e4a7e', fg: '#ffffff' },
  haskell: { bg: '#5e5086', fg: '#ffffff' },
};

const COLLAPSE_THRESHOLD = 20;

export class EnhancedCodeBlockFeatures {
  private static instance: EnhancedCodeBlockFeatures;

  static getInstance(): EnhancedCodeBlockFeatures {
    if (!EnhancedCodeBlockFeatures.instance) EnhancedCodeBlockFeatures.instance = new EnhancedCodeBlockFeatures();
    return EnhancedCodeBlockFeatures.instance;
  }

  describe(code: string, language: string | undefined): CodeBlockFeatures {
    const lineCount = code.split('\n').length;
    const key = (language ?? '').toLowerCase();
    const colors = LANGUAGE_COLORS[key] ?? { bg: '#6b7280', fg: '#ffffff' };
    return {
      language: key || 'plaintext',
      lineCount,
      shouldCollapse: lineCount > COLLAPSE_THRESHOLD,
      badgeColor: colors.bg,
      badgeTextColor: colors.fg,
    };
  }

  /**
   * Opens the given code snippet in a new untitled editor tab, optionally
   * with the correct language mode selected, and reveals it to the user.
   */
  async openInEditor(code: string, language?: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: code,
      language: (language ?? 'plaintext').toLowerCase(),
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /**
   * Returns a CSS class list describing the feature state — used by the
   * webview to apply collapse / line-number visibility.
   */
  classesFor(features: CodeBlockFeatures, showLineNumbers: boolean, collapsed: boolean): string[] {
    const classes = ['ina-code-block', `lang-${features.language}`];
    if (features.shouldCollapse) classes.push('has-collapse');
    if (showLineNumbers) classes.push('has-line-numbers');
    if (collapsed) classes.push('is-collapsed');
    return classes;
  }
}
