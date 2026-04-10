/**
 * Phase 17.2 — Deep Context Formatter
 * Formats resolved definitions into XML structures for AI context.
 */

import { Logger } from '../../utils/Logger';
import {
  DeepContextResult,
  DeepDefinition,
  ReferenceGroup,
} from './DeepContextTypes';

// ---------------------------------------------------------------------------
// DeepContextFormatter — singleton
// ---------------------------------------------------------------------------

export class DeepContextFormatter {
  private static instance: DeepContextFormatter | null = null;

  private constructor() {}

  static getInstance(): DeepContextFormatter {
    if (!DeepContextFormatter.instance) {
      DeepContextFormatter.instance = new DeepContextFormatter();
    }
    return DeepContextFormatter.instance;
  }

  // -----------------------------------------------------------------------
  // formatForChat — full XML representation for chat context
  // -----------------------------------------------------------------------

  formatForChat(result: DeepContextResult): string {
    try {
      const lines: string[] = [];

      lines.push(
        `<deep_context symbol="${this.esc(result.primary.symbol)}" kind="${result.primary.kind}">`,
      );

      // Primary definition
      lines.push(
        `  <primary file="${this.esc(this.shortPath(result.primary.filePath))}" lines="${result.primary.startLine}-${result.primary.endLine}">`,
      );
      lines.push(result.primary.content);
      lines.push('  </primary>');

      // Transitive definitions
      if (result.transitive.length > 0) {
        lines.push('  <transitive_definitions>');

        for (const def of result.transitive) {
          lines.push(
            `    <definition symbol="${this.esc(def.symbol)}" kind="${def.kind}" file="${this.esc(this.shortPath(def.filePath))}" depth="${def.depth}" related_to="${this.esc(def.relatedTo || '')}">`,
          );
          lines.push(def.content);
          lines.push('    </definition>');
        }

        lines.push('  </transitive_definitions>');
      }

      if (result.truncated) {
        lines.push(
          `  <note>Results truncated to fit token budget. Resolved depth: ${result.resolvedDepth}.</note>`,
        );
      }

      lines.push('</deep_context>');

      return lines.join('\n');
    } catch (err) {
      Logger.warn(`[DeepContextFormatter] formatForChat failed: ${err}`);
      return `<deep_context symbol="${this.esc(result.primary.symbol)}" error="format_failed" />`;
    }
  }

  // -----------------------------------------------------------------------
  // formatForCompletion — compact representation for inline completion
  // -----------------------------------------------------------------------

  formatForCompletion(result: DeepContextResult): string {
    try {
      const lines: string[] = [];

      // Primary: full code
      lines.push(`// @definition ${result.primary.symbol} (${result.primary.kind})`);
      lines.push(`// ${this.shortPath(result.primary.filePath)}:${result.primary.startLine}`);
      lines.push(result.primary.content);

      // Transitive: type signatures only
      if (result.transitive.length > 0) {
        lines.push('');
        lines.push('// --- related types ---');

        for (const def of result.transitive) {
          const signature = this.extractSignature(def);
          lines.push(`// ${def.symbol} (${def.kind}) from ${this.shortPath(def.filePath)}`);
          lines.push(signature);
        }
      }

      return lines.join('\n');
    } catch (err) {
      Logger.warn(`[DeepContextFormatter] formatForCompletion failed: ${err}`);
      return `// @definition ${result.primary.symbol} — resolution failed`;
    }
  }

  // -----------------------------------------------------------------------
  // formatReferences — XML representation of reference groups
  // -----------------------------------------------------------------------

  formatReferences(
    groups: ReferenceGroup[],
    totalCount: number,
    symbol: string = '',
  ): string {
    try {
      const lines: string[] = [];

      lines.push(`<references symbol="${this.esc(symbol)}" total="${totalCount}">`);

      for (const group of groups) {
        lines.push(`  <file path="${this.esc(this.shortPath(group.filePath))}">`);

        for (const ref of group.references) {
          lines.push(
            `    <ref line="${ref.line}" type="${ref.usageType}">${this.esc(ref.context)}</ref>`,
          );
        }

        lines.push('  </file>');
      }

      if (totalCount > groups.reduce((s, g) => s + g.references.length, 0)) {
        const shown = groups.reduce((s, g) => s + g.references.length, 0);
        lines.push(
          `  <note>Showing ${shown} of ${totalCount} references (sampled for relevance).</note>`,
        );
      }

      lines.push('</references>');

      return lines.join('\n');
    } catch (err) {
      Logger.warn(`[DeepContextFormatter] formatReferences failed: ${err}`);
      return `<references symbol="${this.esc(symbol)}" error="format_failed" />`;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Extract just the type signature (first line, or up to the opening brace)
   * for compact representation.
   */
  private extractSignature(def: DeepDefinition): string {
    const lines = def.content.split('\n');

    // For single-line definitions, return as-is
    if (lines.length === 1) {
      return lines[0];
    }

    // For multi-line: take up to the opening brace line
    const result: string[] = [];
    for (const line of lines) {
      result.push(line);
      if (line.includes('{')) {
        // Replace the content after `{` with `... }`
        const idx = result.length - 1;
        const braceIdx = result[idx].indexOf('{');
        result[idx] = result[idx].substring(0, braceIdx + 1) + ' ... }';
        break;
      }
    }

    return result.join('\n');
  }

  /**
   * Convert absolute path to workspace-relative path for display.
   */
  private shortPath(filePath: string): string {
    if (!filePath) { return ''; }

    // Try to make it relative to any workspace folder
    try {
      const { workspace } = require('vscode') as typeof import('vscode');
      const wsFolder = workspace.workspaceFolders?.[0];
      if (wsFolder) {
        const wsRoot = wsFolder.uri.fsPath;
        if (filePath.startsWith(wsRoot)) {
          return filePath.substring(wsRoot.length + 1).replace(/\\/g, '/');
        }
      }
    } catch {
      // fallback below
    }

    // Fallback: return last 3 segments
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.slice(-3).join('/');
  }

  /**
   * Escape XML special characters.
   */
  private esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
