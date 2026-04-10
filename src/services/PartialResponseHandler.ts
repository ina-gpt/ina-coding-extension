/**
 * Partial Response Handler
 *
 * Handles incomplete/partial responses from the edit generation API.
 * Auto-completes brackets, provides recovery actions.
 */

import { Logger } from '../utils/Logger';

// ============ Types ============

export interface PartialRecovery {
  recoveredCode: string;
  actions: RecoveryAction[];
  isUsable: boolean;
  completeness: number; // 0-1
}

export interface RecoveryAction {
  type: 'auto_close' | 'truncate' | 'retry' | 'use_partial';
  description: string;
  applied: boolean;
}

// ============ Partial Response Handler ============

export class PartialResponseHandler {

  // ============ Handle Partial ============

  handlePartialResponse(partialCode: string, language: string): PartialRecovery {
    const actions: RecoveryAction[] = [];
    let recoveredCode = partialCode;
    let completeness = this.estimateCompleteness(partialCode, language);

    // Try auto-closing brackets
    const { code: closedCode, closedCount } = this.autoCloseBrackets(recoveredCode);
    if (closedCount > 0) {
      recoveredCode = closedCode;
      actions.push({
        type: 'auto_close',
        description: `Auto-closed ${closedCount} bracket${closedCount !== 1 ? 's' : ''}`,
        applied: true,
      });
      completeness = Math.min(completeness + 0.1, 1);
    }

    // Close unclosed strings
    const { code: stringClosed, closedStrings } = this.autoCloseStrings(recoveredCode);
    if (closedStrings > 0) {
      recoveredCode = stringClosed;
      actions.push({
        type: 'auto_close',
        description: `Auto-closed ${closedStrings} string literal${closedStrings !== 1 ? 's' : ''}`,
        applied: true,
      });
    }

    // Remove trailing incomplete lines
    const { code: truncated, removed } = this.truncateIncomplete(recoveredCode);
    if (removed) {
      recoveredCode = truncated;
      actions.push({
        type: 'truncate',
        description: 'Removed trailing incomplete line',
        applied: true,
      });
    }

    // Suggest retry if low completeness
    if (completeness < 0.5) {
      actions.push({
        type: 'retry',
        description: 'Response is less than 50% complete - retry recommended',
        applied: false,
      });
    }

    // Always offer use_partial
    if (completeness >= 0.3) {
      actions.push({
        type: 'use_partial',
        description: 'Use partial result as-is',
        applied: false,
      });
    }

    return {
      recoveredCode,
      actions,
      isUsable: completeness >= 0.5,
      completeness,
    };
  }

  // ============ Auto-Close Brackets ============

  autoCloseBrackets(code: string): { code: string; closedCount: number } {
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
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }

    if (stack.length === 0) return { code, closedCount: 0 };

    // Close in reverse order
    const closings = stack.reverse().join('');
    return {
      code: code + '\n' + closings,
      closedCount: stack.length,
    };
  }

  // ============ Auto-Close Strings ============

  autoCloseStrings(code: string): { code: string; closedStrings: number } {
    let inString = false;
    let stringChar = '';
    let escaped = false;
    let closedStrings = 0;
    let result = code;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }

      if (inString) {
        if (ch === stringChar) inString = false;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
      }
    }

    if (inString) {
      result += stringChar;
      closedStrings = 1;
    }

    return { code: result, closedStrings };
  }

  // ============ Truncate Incomplete ============

  truncateIncomplete(code: string): { code: string; removed: boolean } {
    const lines = code.split('\n');
    if (lines.length === 0) return { code, removed: false };

    const lastLine = lines[lines.length - 1].trim();

    // Incomplete patterns: ends with operator, comma, opening bracket
    const incompletePatterns = /[+\-*/=<>&|,({[\s]$/;

    if (lastLine.length > 0 && incompletePatterns.test(lastLine)) {
      lines.pop();
      return { code: lines.join('\n'), removed: true };
    }

    return { code, removed: false };
  }

  // ============ Completeness Estimation ============

  estimateCompleteness(code: string, language: string): number {
    if (!code || code.trim().length === 0) return 0;

    let score = 0.5; // Start at 50%

    // Check bracket balance
    const bracketBalance = this.getBracketBalance(code);
    if (bracketBalance === 0) score += 0.2;
    else score -= Math.min(0.3, bracketBalance * 0.1);

    // Check if last line seems complete
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.endsWith(';') || lastLine.endsWith('}') || lastLine.endsWith(')')) {
        score += 0.15;
      }
    }

    // Check for return statement or closing structure
    if (code.includes('return ') || code.trimEnd().endsWith('}')) {
      score += 0.1;
    }

    // Penalize very short responses
    if (lines.length <= 1) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private getBracketBalance(code: string): number {
    let balance = 0;
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

      if (ch === '(' || ch === '[' || ch === '{') balance++;
      else if (ch === ')' || ch === ']' || ch === '}') balance--;
    }

    return Math.abs(balance);
  }
}
