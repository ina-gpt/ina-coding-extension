/**
 * StackTraceParser.ts — Phase 19 Step 19.1
 * Multi-language stack trace parser
 */

import * as path from 'path';
import { ParsedError, StackFrame, ErrorType } from './DebugTypes';
import { Logger } from '../../utils/Logger';

export class StackTraceParser {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  parse(rawOutput: string, language?: string): ParsedError {
    const lang = language || this.detectLanguage(rawOutput);
    try {
      switch (lang) {
        case 'javascript':
        case 'typescript':
          return this.parseV8(rawOutput, lang);
        case 'python':
          return this.parsePython(rawOutput);
        case 'java':
        case 'kotlin':
          return this.parseJava(rawOutput, lang);
        case 'go':
          return this.parseGo(rawOutput);
        case 'rust':
          return this.parseRust(rawOutput);
        default:
          return this.parseGeneric(rawOutput, lang);
      }
    } catch (e) {
      Logger.warn('[StackTraceParser] Parse error, using generic fallback', e);
      return this.parseGeneric(rawOutput, lang);
    }
  }

  private detectLanguage(raw: string): string {
    if (/at\s+\S+\s+\(.*\.(ts|js|mjs|cjs):\d+:\d+\)/.test(raw)) return 'typescript';
    if (/Traceback \(most recent call last\)/.test(raw)) return 'python';
    if (/at\s+[\w.$]+\([\w./]+\.java:\d+\)/.test(raw)) return 'java';
    if (/goroutine\s+\d+/.test(raw) || /\.go:\d+/.test(raw)) return 'go';
    if (/thread '.*' panicked at/.test(raw) || /\.rs:\d+:\d+/.test(raw)) return 'rust';
    return 'unknown';
  }

  private parseV8(raw: string, lang: string): ParsedError {
    const lines = raw.split('\n');
    let message = '';
    let errorType: ErrorType = 'RuntimeError';
    const frames: StackFrame[] = [];

    const errorLineIdx = lines.findIndex(l => /^\w*Error:|^\w*Exception:/.test(l.trim()));
    if (errorLineIdx >= 0) {
      const errorLine = lines[errorLineIdx].trim();
      const typeMatch = errorLine.match(/^(\w+Error):\s*(.*)/);
      if (typeMatch) {
        errorType = this.mapErrorType(typeMatch[1]);
        message = typeMatch[2];
      } else {
        message = errorLine;
      }
    } else {
      message = lines[0]?.trim() || 'Unknown error';
    }

    const frameRegex = /at\s+(?:(?:new\s+)?(\S+)\s+)?\(?([^():]+):(\d+):(\d+)\)?/;
    for (const line of lines) {
      const m = line.match(frameRegex);
      if (m) {
        const filePath = this.normalizePath(m[2]);
        frames.push({
          functionName: m[1] || '<anonymous>',
          file: filePath,
          line: parseInt(m[3], 10),
          column: parseInt(m[4], 10),
          isUserCode: this.isUserCode(filePath),
        });
      }
    }

    // Detect "caused by" chain
    let causedBy: ParsedError | undefined;
    const causedIdx = raw.indexOf('Caused by:');
    if (causedIdx > 0) {
      causedBy = this.parseV8(raw.slice(causedIdx + 10), lang);
    }

    return { type: errorType, message, stackFrames: frames, rawOutput: raw, language: lang, causedBy };
  }

  private parsePython(raw: string): ParsedError {
    const lines = raw.split('\n');
    const frames: StackFrame[] = [];
    let message = '';
    let errorType: ErrorType = 'RuntimeError';

    const frameRegex = /File "([^"]+)", line (\d+), in (.+)/;
    for (const line of lines) {
      const m = line.match(frameRegex);
      if (m) {
        const filePath = this.normalizePath(m[1]);
        frames.push({ file: filePath, line: parseInt(m[2], 10), functionName: m[3], isUserCode: this.isUserCode(filePath) });
      }
    }

    // Last line is usually the error
    for (let i = lines.length - 1; i >= 0; i--) {
      const errMatch = lines[i].match(/^(\w+(?:Error|Exception)):\s*(.*)/);
      if (errMatch) {
        errorType = this.mapErrorType(errMatch[1]);
        message = errMatch[2];
        break;
      }
    }

    // Python traces are bottom-up, reverse for consistency
    frames.reverse();
    return { type: errorType, message: message || lines[lines.length - 1]?.trim() || 'Unknown error', stackFrames: frames, rawOutput: raw, language: 'python' };
  }

  private parseJava(raw: string, lang: string): ParsedError {
    const lines = raw.split('\n');
    const frames: StackFrame[] = [];
    let message = '';
    let errorType: ErrorType = 'RuntimeError';

    const firstLine = lines[0]?.trim() || '';
    const errMatch = firstLine.match(/^(?:\w+\.)*(\w+(?:Error|Exception)):\s*(.*)/);
    if (errMatch) {
      errorType = this.mapErrorType(errMatch[1]);
      message = errMatch[2];
    } else {
      message = firstLine;
    }

    const frameRegex = /at\s+([\w.$]+)\(([\w./]+):(\d+)\)/;
    for (const line of lines) {
      const m = line.match(frameRegex);
      if (m) {
        const filePath = this.normalizePath(m[2]);
        frames.push({ functionName: m[1], file: filePath, line: parseInt(m[3], 10), isUserCode: this.isUserCode(filePath) });
      }
    }

    return { type: errorType, message, stackFrames: frames, rawOutput: raw, language: lang };
  }

  private parseGo(raw: string): ParsedError {
    const lines = raw.split('\n');
    const frames: StackFrame[] = [];
    let message = '';

    const panicMatch = raw.match(/panic:\s*(.*)/);
    if (panicMatch) message = panicMatch[1];
    else message = lines[0]?.trim() || 'Unknown error';

    const frameRegex = /^\s*(\S+\.go):(\d+)\s*(?:\+0x[0-9a-f]+)?$/;
    const funcRegex = /^(\S+)\(.*\)$/;
    let lastFunc = '';
    for (const line of lines) {
      const fMatch = line.trim().match(funcRegex);
      if (fMatch) { lastFunc = fMatch[1]; continue; }
      const m = line.match(frameRegex);
      if (m) {
        const filePath = this.normalizePath(m[1]);
        frames.push({ file: filePath, line: parseInt(m[2], 10), functionName: lastFunc || '<unknown>', isUserCode: this.isUserCode(filePath) });
        lastFunc = '';
      }
    }

    return { type: 'RuntimeError', message, stackFrames: frames, rawOutput: raw, language: 'go' };
  }

  private parseRust(raw: string): ParsedError {
    const lines = raw.split('\n');
    const frames: StackFrame[] = [];
    const panicMatch = raw.match(/thread '.*' panicked at '(.*?)'.*?(\S+\.rs):(\d+):(\d+)/s);
    const message = panicMatch ? panicMatch[1] : (lines[0]?.trim() || 'Panic');

    const frameRegex = /(\S+\.rs):(\d+):(\d+)/;
    const funcRegex = /\d+:\s+(?:<)?(\S+?)(?:>)?$/;
    for (let i = 0; i < lines.length; i++) {
      const locMatch = lines[i].match(frameRegex);
      if (locMatch) {
        const funcMatch = i > 0 ? lines[i - 1].match(funcRegex) : null;
        const filePath = this.normalizePath(locMatch[1]);
        frames.push({ file: filePath, line: parseInt(locMatch[2], 10), column: parseInt(locMatch[3], 10), functionName: funcMatch?.[1] || '<unknown>', isUserCode: this.isUserCode(filePath) });
      }
    }

    return { type: 'RuntimeError', message, stackFrames: frames, rawOutput: raw, language: 'rust' };
  }

  private parseGeneric(raw: string, lang: string): ParsedError {
    const lines = raw.split('\n');
    const frames: StackFrame[] = [];
    const message = lines[0]?.trim() || 'Unknown error';

    const genericFileLineRegex = /(?:at\s+)?(\S+?\.\w+)[:\s]+(?:line\s+)?(\d+)/gi;
    let m;
    while ((m = genericFileLineRegex.exec(raw)) !== null) {
      const filePath = this.normalizePath(m[1]);
      frames.push({ file: filePath, line: parseInt(m[2], 10), functionName: '<unknown>', isUserCode: this.isUserCode(filePath) });
    }

    return { type: 'RuntimeError', message, stackFrames: frames, rawOutput: raw, language: lang };
  }

  private mapErrorType(raw: string): ErrorType {
    const lower = raw.toLowerCase();
    if (lower.includes('typeerror') || lower.includes('typeerr')) return 'TypeError';
    if (lower.includes('referenceerror') || lower.includes('nameerror')) return 'ReferenceError';
    if (lower.includes('syntaxerror') || lower.includes('parseerror')) return 'SyntaxError';
    if (lower.includes('assertionerror') || lower.includes('assert')) return 'AssertionError';
    if (lower.includes('permission') || lower.includes('access')) return 'PermissionError';
    if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('timeout')) return 'NetworkError';
    return 'RuntimeError';
  }

  private normalizePath(filePath: string): string {
    if (!filePath) return filePath;
    const cleaned = filePath.replace(/^\(|\)$/g, '').trim();
    if (path.isAbsolute(cleaned)) {
      const rel = path.relative(this.workspaceRoot, cleaned);
      if (!rel.startsWith('..')) return rel;
    }
    return cleaned;
  }

  private isUserCode(filePath: string): boolean {
    if (!filePath) return false;
    const excluded = ['node_modules', 'vendor', '.cargo', 'site-packages', 'internal/', '<'];
    return !excluded.some(e => filePath.includes(e));
  }
}
