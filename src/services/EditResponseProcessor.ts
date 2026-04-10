/**
 * Edit Response Processor
 *
 * Processes and validates edit responses from the API.
 * Handles code formatting, diff calculation, and breaking change detection.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { EditResponse } from './EditGenerationClient';
import { InlineEditSession } from './InlineEditService';

// ============ Types ============

export interface ProcessedEditResult {
  code: string;
  explanation: string | null;
  diff: DiffResult;
  isValid: boolean;
  hasBreakingChanges: boolean;
  warnings: string[];
  confidence: number;
}

export interface DiffResult {
  additions: number;
  deletions: number;
  changes: DiffChange[];
  summary: string;
}

export interface DiffChange {
  type: 'add' | 'delete' | 'modify';
  lineNumber: number;
  oldContent?: string;
  newContent?: string;
}

// ============ Edit Response Processor ============

export class EditResponseProcessor {

  // ============ Process Response ============

  processResponse(response: EditResponse, session: InlineEditSession): ProcessedEditResult {
    const warnings: string[] = [];

    // Validate response
    if (!response.generatedContent) {
      return {
        code: session.originalContent,
        explanation: null,
        diff: { additions: 0, deletions: 0, changes: [], summary: 'No changes generated' },
        isValid: false,
        hasBreakingChanges: false,
        warnings: ['Empty response from API'],
        confidence: 0,
      };
    }

    // Format code to match original indentation
    let formattedCode = this.normalizeIndentation(
      response.generatedContent,
      session.context.indentation,
      session.context.language
    );

    // Validate bracket balance
    if (!this.validateBrackets(formattedCode)) {
      warnings.push('Bracket mismatch detected in generated code');
    }

    // Validate string completeness
    if (!this.validateStrings(formattedCode)) {
      warnings.push('Unclosed string literal detected');
    }

    // Calculate diff
    const diff = this.calculateDiff(session.originalContent, formattedCode);

    // Detect breaking changes
    const hasBreakingChanges = this.detectBreakingChanges(
      session.originalContent,
      formattedCode,
      session.context.language
    );

    if (hasBreakingChanges) {
      warnings.push('Potential breaking changes detected');
    }

    // Check confidence threshold
    if (response.confidence < 0.5) {
      warnings.push(`Low confidence: ${(response.confidence * 100).toFixed(0)}%`);
    }

    return {
      code: formattedCode,
      explanation: response.explanation,
      diff,
      isValid: warnings.length === 0,
      hasBreakingChanges,
      warnings,
      confidence: response.confidence,
    };
  }

  // ============ Streaming Processing ============

  processPartialCode(partialCode: string, session: InlineEditSession): string {
    return this.normalizeIndentation(
      partialCode,
      session.context.indentation,
      session.context.language
    );
  }

  // ============ Diff Calculation ============

  calculateDiff(original: string, modified: string): DiffResult {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const changes: DiffChange[] = [];

    let additions = 0;
    let deletions = 0;

    const maxLen = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = originalLines[i];
      const newLine = modifiedLines[i];

      if (oldLine === undefined && newLine !== undefined) {
        changes.push({ type: 'add', lineNumber: i, newContent: newLine });
        additions++;
      } else if (oldLine !== undefined && newLine === undefined) {
        changes.push({ type: 'delete', lineNumber: i, oldContent: oldLine });
        deletions++;
      } else if (oldLine !== newLine) {
        changes.push({ type: 'modify', lineNumber: i, oldContent: oldLine, newContent: newLine });
        additions++;
        deletions++;
      }
    }

    const summary = changes.length === 0
      ? 'No changes'
      : `${additions} addition${additions !== 1 ? 's' : ''}, ${deletions} deletion${deletions !== 1 ? 's' : ''}`;

    return { additions, deletions, changes, summary };
  }

  // ============ Indentation ============

  normalizeIndentation(code: string, targetIndentation: string, language: string): string {
    if (!targetIndentation) return code;

    const lines = code.split('\n');
    if (lines.length === 0) return code;

    // Detect source indentation from first non-empty line
    let sourceIndent = '';
    for (const line of lines) {
      if (line.trim().length > 0) {
        const match = line.match(/^(\s*)/);
        if (match) {
          sourceIndent = match[1];
        }
        break;
      }
    }

    // If source already matches target, return as-is
    if (sourceIndent === targetIndentation) return code;

    // Re-indent all lines
    return lines.map(line => {
      if (line.trim().length === 0) return '';
      const currentIndent = line.match(/^(\s*)/)?.[1] || '';

      if (currentIndent.startsWith(sourceIndent)) {
        const relativeIndent = currentIndent.slice(sourceIndent.length);
        return targetIndentation + relativeIndent + line.trimStart();
      }

      return targetIndentation + line.trimStart();
    }).join('\n');
  }

  // ============ Validation ============

  validateBrackets(code: string): boolean {
    const stack: string[] = [];
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const closers = new Set(Object.values(pairs));
    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (const ch of code) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }

      if (inString) {
        if (ch === stringChar) inString = false;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (pairs[ch]) {
        stack.push(pairs[ch]);
      } else if (closers.has(ch)) {
        if (stack.length === 0 || stack.pop() !== ch) return false;
      }
    }

    return stack.length === 0;
  }

  validateStrings(code: string): boolean {
    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];

      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '\n' && inString && stringChar !== '`') return false;

      if (inString) {
        if (ch === stringChar) inString = false;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
      }
    }

    return !inString || stringChar === '`'; // template literals can span lines
  }

  // ============ Breaking Change Detection ============

  detectBreakingChanges(original: string, modified: string, language: string): boolean {
    // Check for removed exports
    const originalExports = this.extractExports(original, language);
    const modifiedExports = this.extractExports(modified, language);

    for (const exp of originalExports) {
      if (!modifiedExports.has(exp)) return true;
    }

    // Check for changed function signatures
    const originalSigs = this.extractSignatures(original, language);
    const modifiedSigs = this.extractSignatures(modified, language);

    for (const [name, sig] of originalSigs) {
      const newSig = modifiedSigs.get(name);
      if (newSig && newSig !== sig) return true;
    }

    return false;
  }

  private extractExports(code: string, language: string): Set<string> {
    const exports = new Set<string>();

    // TypeScript/JavaScript exports
    const tsExports = code.matchAll(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g);
    for (const m of tsExports) exports.add(m[1]);

    const defaultExport = code.match(/export\s+default\s+(?:class|function)?\s*(\w+)/);
    if (defaultExport) exports.add(defaultExport[1]);

    return exports;
  }

  private extractSignatures(code: string, language: string): Map<string, string> {
    const sigs = new Map<string, string>();

    // Function signatures
    const fnMatches = code.matchAll(/(?:function|async\s+function)\s+(\w+)\s*\(([^)]*)\)/g);
    for (const m of fnMatches) sigs.set(m[1], m[2].trim());

    // Method signatures
    const methodMatches = code.matchAll(/(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*\{/g);
    for (const m of methodMatches) sigs.set(m[1], m[2].trim());

    return sigs;
  }
}
