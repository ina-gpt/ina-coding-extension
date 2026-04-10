/**
 * Phase 11.1 — Theme Code Highlighter
 *
 * Bridges the active ThemeEngine to the chat/code-block renderer by producing
 * CSS custom-property declarations that map VS Code token colors into the
 * webview. Consumers call `getHighlightStyles()` to obtain a style-block
 * string they can inject into the document head, or `applyThemeToCodeBlock()`
 * to apply the current theme directly to a DOM element.
 *
 * The tokenization list mirrors the semantic tokens used by Shiki / the
 * built-in VS Code grammars. All outputs use INA-branded CSS custom property
 * names (prefixed with `--ina-code-`) so the rest of the webview can reference
 * them without knowing about the underlying theme engine.
 */

import { ThemeEngine } from './ThemeEngine';
import type { ThemeDefinition } from './ThemeTypes';

// ============ Token → CSS Property Mapping ============

/**
 * Maps a logical syntax token (as produced by Shiki / TextMate grammars)
 * to a CSS custom property name. The property itself is populated by
 * `getHighlightStyles()` from the active theme's `colors` object.
 */
const TOKEN_TO_CSS_VAR: Record<string, { cssVar: string; fallback: keyof ThemeDefinition['colors'] }> = {
  keyword: { cssVar: '--ina-code-keyword', fallback: 'accentPrimary' },
  storage: { cssVar: '--ina-code-storage', fallback: 'accentPrimary' },
  string: { cssVar: '--ina-code-string', fallback: 'statusSuccess' },
  number: { cssVar: '--ina-code-number', fallback: 'accentSecondary' },
  comment: { cssVar: '--ina-code-comment', fallback: 'textTertiary' },
  function: { cssVar: '--ina-code-function', fallback: 'textLink' },
  variable: { cssVar: '--ina-code-variable', fallback: 'textPrimary' },
  type: { cssVar: '--ina-code-type', fallback: 'statusWarning' },
  operator: { cssVar: '--ina-code-operator', fallback: 'textSecondary' },
  punctuation: { cssVar: '--ina-code-punctuation', fallback: 'textSecondary' },
  tag: { cssVar: '--ina-code-tag', fallback: 'statusError' },
  attribute: { cssVar: '--ina-code-attribute', fallback: 'statusWarning' },
  property: { cssVar: '--ina-code-property', fallback: 'textLink' },
  regex: { cssVar: '--ina-code-regex', fallback: 'statusError' },
  diffAdded: { cssVar: '--ina-code-diff-added', fallback: 'codeDiffAdded' },
  diffRemoved: { cssVar: '--ina-code-diff-removed', fallback: 'codeDiffRemoved' },
};

// ============ Public API ============

export class ThemeCodeHighlighter {
  private engine: ThemeEngine;

  constructor(engine?: ThemeEngine) {
    this.engine = engine ?? ThemeEngine.getInstance();
  }

  /**
   * Produces a CSS `:root { ... }` block with all `--ina-code-*` custom
   * properties set from the active theme. Call this whenever the theme
   * changes and inject it into a `<style>` tag in the webview.
   */
  getHighlightStyles(language?: string, _code?: string): string {
    const theme = this.engine.getActiveTheme();
    if (!theme) return '';
    const lines: string[] = [':root {'];
    for (const { cssVar, fallback } of Object.values(TOKEN_TO_CSS_VAR)) {
      const value = theme.colors[fallback] ?? 'inherit';
      lines.push(`  ${cssVar}: ${value};`);
    }
    lines.push(`  --ina-code-background: ${theme.colors.codeBlockBg};`);
    lines.push(`  --ina-code-border: ${theme.colors.codeBlockBorder};`);
    lines.push(`  --ina-code-line-number: ${theme.colors.codeLineNumber};`);
    lines.push(`  --ina-code-selection: ${theme.colors.codeSelection};`);
    lines.push('}');
    if (language) {
      lines.push(`/* active language: ${language} */`);
    }
    return lines.join('\n');
  }

  /**
   * Applies the current theme's syntax colors directly to a DOM element
   * (and its descendants). Expects the element to use class names of the
   * form `token-<name>` where `<name>` matches a key in `TOKEN_TO_CSS_VAR`.
   */
  applyThemeToCodeBlock(element: HTMLElement): void {
    const theme = this.engine.getActiveTheme();
    if (!theme) return;
    element.style.setProperty('background-color', theme.colors.codeBlockBg);
    element.style.setProperty('border-color', theme.colors.codeBlockBorder);
    element.style.setProperty('color', theme.colors.textPrimary);
    for (const [token, { cssVar, fallback }] of Object.entries(TOKEN_TO_CSS_VAR)) {
      const color = theme.colors[fallback] ?? 'inherit';
      element.style.setProperty(cssVar, color);
      const tokenElements = element.querySelectorAll<HTMLElement>(`.token-${token}`);
      tokenElements.forEach(el => { el.style.color = color; });
    }
  }

  /**
   * Returns the CSS class name list that should be applied to a code block
   * wrapper to opt into themed highlighting.
   */
  getWrapperClasses(): string[] {
    const theme = this.engine.getActiveTheme();
    const mode = theme?.mode ?? 'dark';
    return ['ina-code-block', `ina-theme-${mode}`];
  }
}

// Singleton accessor (mirrors the pattern used by ThemeEngine).
let _instance: ThemeCodeHighlighter | null = null;
export function getThemeCodeHighlighter(): ThemeCodeHighlighter {
  if (!_instance) _instance = new ThemeCodeHighlighter();
  return _instance;
}
