import {
  TerminalExecution,
  TerminalParsedResult,
  ParsedError,
  ParsedWarning,
  TerminalStats,
} from './TerminalTypes';
import { Logger } from '../../../utils/Logger';

// ============ Framework Detection Patterns ============

const FRAMEWORK_PATTERNS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: 'tsc', patterns: [/\btsc\b/, /typescript/i, /error TS\d+/] },
  { name: 'eslint', patterns: [/\beslint\b/, /eslint-plugin/] },
  { name: 'jest', patterns: [/\bjest\b/, /PASS\s|FAIL\s/, /Tests:\s+\d+\s+(passed|failed)/] },
  { name: 'vitest', patterns: [/\bvitest\b/, /Tests\s+\d+\s*\|/] },
  { name: 'mocha', patterns: [/\bmocha\b/, /\d+ passing/, /\d+ failing/] },
  { name: 'webpack', patterns: [/\bwebpack\b/, /ERROR in \.\//, /Module not found/] },
  { name: 'vite', patterns: [/\bvite\b/, /vite v\d/] },
  { name: 'nextjs', patterns: [/\bnext\b/, /next build/, /next dev/] },
  { name: 'prettier', patterns: [/\bprettier\b/, /Code style issues found/] },
  { name: 'npm', patterns: [/npm ERR!/, /npm WARN/] },
  { name: 'pytest', patterns: [/\bpytest\b/, /FAILED\s.*\.py/, /passed.*warning/] },
  { name: 'go', patterns: [/\bgo\s+(build|test|vet)\b/, /\.go:\d+:\d+:/] },
  { name: 'rust', patterns: [/\bcargo\b/, /\brustc\b/, /error\[E\d+\]/] },
];

// ============ Fixable Rules ============

const FIXABLE_TS_CODES = new Set([
  'TS2322', 'TS2339', 'TS2345', 'TS7006', 'TS2304', 'TS2307',
]);

const FIXABLE_ESLINT_RULES = new Set([
  'semi', 'quotes', 'indent', 'no-extra-semi', 'no-trailing-spaces',
  'comma-dangle', 'eol-last', 'no-multiple-empty-lines', 'space-before-function-paren',
  'object-curly-spacing', 'array-bracket-spacing', 'arrow-spacing', 'key-spacing',
  'keyword-spacing', 'no-multi-spaces', 'padded-blocks', 'space-in-parens',
  '@typescript-eslint/semi', '@typescript-eslint/quotes', '@typescript-eslint/indent',
]);

// ============ OutputParser ============

export class OutputParser {
  private static instance: OutputParser;

  private constructor() {}

  static getInstance(): OutputParser {
    if (!OutputParser.instance) {
      OutputParser.instance = new OutputParser();
    }
    return OutputParser.instance;
  }

  // ---- Main Entry Point ----

  parseOutput(execution: TerminalExecution): TerminalParsedResult {
    const output = execution.combinedOutput || execution.stdout + '\n' + execution.stderr;
    const command = execution.command.command;
    const framework = this.detectFramework(command, output);

    Logger.debug('[OutputParser] Detected framework:', framework || 'generic');

    let errors: ParsedError[] = [];
    let warnings: ParsedWarning[] = [];
    let stats: TerminalStats | null = null;

    switch (framework) {
      case 'tsc':
        errors = this.parseTypeScriptErrors(output);
        break;
      case 'eslint':
        errors = this.parseESLintErrors(output);
        break;
      case 'jest': {
        const jestResult = this.parseJestResults(output);
        errors = jestResult.errors;
        stats = jestResult.stats;
        break;
      }
      case 'vitest': {
        const vitestResult = this.parseVitestResults(output);
        errors = vitestResult.errors;
        stats = vitestResult.stats;
        break;
      }
      case 'mocha': {
        const mochaResult = this.parseMochaResults(output);
        errors = mochaResult.errors;
        stats = mochaResult.stats;
        break;
      }
      case 'webpack':
        errors = this.parseWebpackErrors(output);
        break;
      case 'nextjs':
        errors = this.parseNextJSErrors(output);
        break;
      case 'npm':
        errors = this.parseNpmErrors(output);
        break;
      case 'prettier':
        errors = this.parsePrettierOutput(output);
        break;
      default:
        errors = this.parseGenericErrors(output);
        break;
    }

    // Extract warnings from errors that have warning severity
    warnings = errors
      .filter(e => e.severity === 'warning')
      .map(e => ({
        message: e.message,
        file: e.file,
        line: e.line,
        code: e.code,
        source: e.source,
      }));

    const actualErrors = errors.filter(e => e.severity === 'error');

    const success = execution.exitCode === 0 && actualErrors.length === 0;

    return {
      success,
      summary: this.summarizeResults({
        success,
        summary: '',
        errors: actualErrors,
        warnings,
        stats,
        framework,
      }),
      errors: actualErrors,
      warnings,
      stats,
      framework,
    };
  }

  // ---- Framework Detection ----

  detectFramework(command: string, output: string): string | null {
    const combined = command + '\n' + output;
    for (const { name, patterns } of FRAMEWORK_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(combined)) {
          return name;
        }
      }
    }
    return null;
  }

  // ---- TypeScript ----

  parseTypeScriptErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split('\n');

    // Pattern 1: file.ts(line,col): error TSxxxx: msg
    const parenPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/;
    // Pattern 2: file.ts:line:col - error TSxxxx: msg
    const colonPattern = /^(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.+)$/;

    for (const line of lines) {
      let match = parenPattern.exec(line) || colonPattern.exec(line);
      if (match) {
        const [, file, lineStr, colStr, severity, code, message] = match;
        const fixable = FIXABLE_TS_CODES.has(code);
        errors.push({
          message: message.trim(),
          file: file.trim(),
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          code,
          severity: severity === 'warning' ? 'warning' : 'error',
          source: 'tsc',
          fixable,
          fixSuggestion: fixable ? this.getTSFixSuggestion(code) : null,
          rawOutput: line,
        });
      }
    }

    return errors;
  }

  private getTSFixSuggestion(code: string): string | null {
    switch (code) {
      case 'TS2322': return 'Type mismatch — check assigned value type or add a type assertion';
      case 'TS2339': return 'Property does not exist — check spelling or add to interface';
      case 'TS2345': return 'Argument type mismatch — align parameter type with expected type';
      case 'TS7006': return 'Parameter implicitly has an \'any\' type — add explicit type annotation';
      case 'TS2304': return 'Name not found — add missing import or declaration';
      case 'TS2307': return 'Module not found — install the missing package or fix the import path';
      default: return null;
    }
  }

  // ---- ESLint ----

  parseESLintErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split('\n');
    let currentFile: string | null = null;

    // ESLint output: /path/to/file.ts
    //   line:col  error  msg  rule-name
    const filePattern = /^(\/[^\s]+\.\w+)$/;
    const errorPattern = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/;

    for (const line of lines) {
      const fileMatch = filePattern.exec(line);
      if (fileMatch) {
        currentFile = fileMatch[1];
        continue;
      }

      const errorMatch = errorPattern.exec(line);
      if (errorMatch && currentFile) {
        const [, lineStr, colStr, severity, message, rule] = errorMatch;
        const fixable = FIXABLE_ESLINT_RULES.has(rule);
        errors.push({
          message: message.trim(),
          file: currentFile,
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          code: rule,
          severity: severity === 'warning' ? 'warning' : 'error',
          source: 'eslint',
          fixable,
          fixSuggestion: fixable ? `Run eslint --fix to auto-fix '${rule}'` : null,
          rawOutput: line,
        });
      }
    }

    return errors;
  }

  // ---- Jest ----

  parseJestResults(output: string): { errors: ParsedError[]; stats: TerminalStats } {
    const errors: ParsedError[] = [];
    const stats: TerminalStats = {
      total: null, passed: null, failed: null,
      skipped: null, duration: null, coverage: null,
    };

    // Parse stats line: "Tests:  X failed, Y passed, Z total"
    const statsMatch = /Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(\d+)\s+total/.exec(output);
    if (statsMatch) {
      stats.failed = statsMatch[1] ? parseInt(statsMatch[1], 10) : 0;
      stats.passed = statsMatch[2] ? parseInt(statsMatch[2], 10) : 0;
      stats.total = parseInt(statsMatch[3], 10);
      stats.skipped = stats.total - (stats.passed || 0) - (stats.failed || 0);
    }

    // Duration: "Time:  X.XXXs"
    const timeMatch = /Time:\s+([\d.]+)\s*s/.exec(output);
    if (timeMatch) {
      stats.duration = parseFloat(timeMatch[1]) * 1000;
    }

    // Parse FAIL blocks
    const failPattern = /FAIL\s+(.+)/g;
    let failMatch: RegExpExecArray | null;
    while ((failMatch = failPattern.exec(output)) !== null) {
      const failFile = failMatch[1].trim();

      // Find test names that failed after FAIL line
      const afterFail = output.slice(failMatch.index);
      const testNamePattern = /[✕×✗]\s+(.+)/g;
      let testMatch: RegExpExecArray | null;
      while ((testMatch = testNamePattern.exec(afterFail)) !== null) {
        // Stop at next FAIL or PASS block
        const nextBlock = afterFail.indexOf('\nFAIL ', testMatch.index + 1);
        if (nextBlock !== -1 && testMatch.index > nextBlock) break;

        errors.push({
          message: `Test failed: ${testMatch[1].trim()}`,
          file: failFile,
          line: null,
          column: null,
          code: null,
          severity: 'error',
          source: 'jest',
          fixable: false,
          fixSuggestion: null,
          rawOutput: testMatch[0],
        });
      }

      // If no individual test names found, add generic error for the file
      if (errors.filter(e => e.file === failFile).length === 0) {
        errors.push({
          message: `Test suite failed: ${failFile}`,
          file: failFile,
          line: null,
          column: null,
          code: null,
          severity: 'error',
          source: 'jest',
          fixable: false,
          fixSuggestion: null,
          rawOutput: failMatch[0],
        });
      }
    }

    return { errors, stats };
  }

  // ---- Vitest ----

  parseVitestResults(output: string): { errors: ParsedError[]; stats: TerminalStats } {
    const errors: ParsedError[] = [];
    const stats: TerminalStats = {
      total: null, passed: null, failed: null,
      skipped: null, duration: null, coverage: null,
    };

    // "Tests  12 | Failed 2 | Passed 10"
    const statsMatch = /Tests\s+(\d+)\s*\|\s*Failed\s+(\d+)\s*\|\s*Passed\s+(\d+)/.exec(output);
    if (statsMatch) {
      stats.total = parseInt(statsMatch[1], 10);
      stats.failed = parseInt(statsMatch[2], 10);
      stats.passed = parseInt(statsMatch[3], 10);
      stats.skipped = stats.total - stats.passed - stats.failed;
    }

    // Duration: "Duration  X.XXs"
    const timeMatch = /Duration\s+([\d.]+)\s*s/.exec(output);
    if (timeMatch) {
      stats.duration = parseFloat(timeMatch[1]) * 1000;
    }

    // FAIL lines
    const failPattern = /FAIL\s+(.+)/g;
    let failMatch: RegExpExecArray | null;
    while ((failMatch = failPattern.exec(output)) !== null) {
      errors.push({
        message: `Test failed: ${failMatch[1].trim()}`,
        file: failMatch[1].trim(),
        line: null,
        column: null,
        code: null,
        severity: 'error',
        source: 'vitest',
        fixable: false,
        fixSuggestion: null,
        rawOutput: failMatch[0],
      });
    }

    // Error messages: "AssertionError: ..." or "Error: ..."
    const errorMsgPattern = /(?:AssertionError|Error|TypeError):\s+(.+)/g;
    let errMatch: RegExpExecArray | null;
    while ((errMatch = errorMsgPattern.exec(output)) !== null) {
      // Extract file reference if present in the next lines
      const after = output.slice(errMatch.index, errMatch.index + 500);
      const fileRef = /at\s+.+?\((.+?):(\d+):(\d+)\)/.exec(after);
      errors.push({
        message: errMatch[1].trim(),
        file: fileRef ? fileRef[1] : null,
        line: fileRef ? parseInt(fileRef[2], 10) : null,
        column: fileRef ? parseInt(fileRef[3], 10) : null,
        code: null,
        severity: 'error',
        source: 'vitest',
        fixable: false,
        fixSuggestion: null,
        rawOutput: errMatch[0],
      });
    }

    return { errors, stats };
  }

  // ---- Mocha ----

  parseMochaResults(output: string): { errors: ParsedError[]; stats: TerminalStats } {
    const errors: ParsedError[] = [];
    const stats: TerminalStats = {
      total: null, passed: null, failed: null,
      skipped: null, duration: null, coverage: null,
    };

    const passingMatch = /(\d+)\s+passing\s*(?:\((.+?)\))?/.exec(output);
    if (passingMatch) {
      stats.passed = parseInt(passingMatch[1], 10);
      if (passingMatch[2]) {
        const durMatch = /([\d.]+)\s*(ms|s|m)/.exec(passingMatch[2]);
        if (durMatch) {
          let ms = parseFloat(durMatch[1]);
          if (durMatch[2] === 's') ms *= 1000;
          if (durMatch[2] === 'm') ms *= 60000;
          stats.duration = ms;
        }
      }
    }

    const failingMatch = /(\d+)\s+failing/.exec(output);
    if (failingMatch) {
      stats.failed = parseInt(failingMatch[1], 10);
    }

    const pendingMatch = /(\d+)\s+pending/.exec(output);
    if (pendingMatch) {
      stats.skipped = parseInt(pendingMatch[1], 10);
    }

    stats.total = (stats.passed || 0) + (stats.failed || 0) + (stats.skipped || 0);

    // Parse numbered failures: "  1) test suite > test name:"
    const failurePattern = /\d+\)\s+(.+?):/gm;
    let failure: RegExpExecArray | null;
    while ((failure = failurePattern.exec(output)) !== null) {
      const after = output.slice(failure.index, failure.index + 500);
      const fileRef = /at\s+.+?\((.+?):(\d+):(\d+)\)/.exec(after);
      errors.push({
        message: `Test failed: ${failure[1].trim()}`,
        file: fileRef ? fileRef[1] : null,
        line: fileRef ? parseInt(fileRef[2], 10) : null,
        column: fileRef ? parseInt(fileRef[3], 10) : null,
        code: null,
        severity: 'error',
        source: 'mocha',
        fixable: false,
        fixSuggestion: null,
        rawOutput: failure[0],
      });
    }

    return { errors, stats };
  }

  // ---- Webpack ----

  parseWebpackErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // "ERROR in ./src/file.ts"
    const errorInPattern = /ERROR in \.\/(.+)/g;
    let match: RegExpExecArray | null;
    while ((match = errorInPattern.exec(output)) !== null) {
      const after = output.slice(match.index, match.index + 500);

      // Module not found
      const moduleNotFound = /Module not found:\s*(?:Error:\s*)?(?:Can't resolve\s+)?'([^']+)'/.exec(after);
      if (moduleNotFound) {
        errors.push({
          message: `Module not found: '${moduleNotFound[1]}'`,
          file: match[1].trim(),
          line: null,
          column: null,
          code: 'MODULE_NOT_FOUND',
          severity: 'error',
          source: 'webpack',
          fixable: true,
          fixSuggestion: `Install missing module: npm install ${moduleNotFound[1]}`,
          rawOutput: match[0],
        });
        continue;
      }

      // TS errors within webpack
      const tsError = /TS(\d+):\s*(.+)/.exec(after);
      if (tsError) {
        const lineRef = /(\d+):(\d+)/.exec(after);
        errors.push({
          message: tsError[2].trim(),
          file: match[1].trim(),
          line: lineRef ? parseInt(lineRef[1], 10) : null,
          column: lineRef ? parseInt(lineRef[2], 10) : null,
          code: `TS${tsError[1]}`,
          severity: 'error',
          source: 'webpack',
          fixable: false,
          fixSuggestion: null,
          rawOutput: match[0],
        });
        continue;
      }

      // Generic webpack error
      const errorMsg = /\n\s*(.+)/.exec(after);
      errors.push({
        message: errorMsg ? errorMsg[1].trim() : `Build error in ${match[1].trim()}`,
        file: match[1].trim(),
        line: null,
        column: null,
        code: null,
        severity: 'error',
        source: 'webpack',
        fixable: false,
        fixSuggestion: null,
        rawOutput: match[0],
      });
    }

    return errors;
  }

  // ---- Next.js ----

  parseNextJSErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // Next.js combines TS errors, webpack errors, and its own patterns
    errors.push(...this.parseTypeScriptErrors(output));
    errors.push(...this.parseWebpackErrors(output));

    // Next.js specific: "Error: ..." from pages/app router
    const nextErrorPattern = /(?:Error|TypeError):\s+(.+?)(?:\n\s+at\s+(.+?):(\d+):(\d+))?/g;
    let match: RegExpExecArray | null;
    while ((match = nextErrorPattern.exec(output)) !== null) {
      // Skip if already captured by TS or webpack parsers
      const isDuplicate = errors.some(e =>
        e.message === match![1].trim() ||
        (e.file && match![2] && e.file === match![2] && e.line === parseInt(match![3], 10))
      );
      if (isDuplicate) continue;

      errors.push({
        message: match[1].trim(),
        file: match[2] || null,
        line: match[3] ? parseInt(match[3], 10) : null,
        column: match[4] ? parseInt(match[4], 10) : null,
        code: null,
        severity: 'error',
        source: 'nextjs',
        fixable: false,
        fixSuggestion: null,
        rawOutput: match[0],
      });
    }

    // Next.js page errors: "Failed to compile" context
    const compileError = /Failed to compile\s*\n([\s\S]*?)(?=\n\n|\nwarn\s)/g;
    let compileMatch: RegExpExecArray | null;
    while ((compileMatch = compileError.exec(output)) !== null) {
      const block = compileMatch[1].trim();
      if (block && !errors.some(e => e.rawOutput.includes(block.slice(0, 50)))) {
        errors.push({
          message: block.split('\n')[0],
          file: null,
          line: null,
          column: null,
          code: null,
          severity: 'error',
          source: 'nextjs',
          fixable: false,
          fixSuggestion: null,
          rawOutput: block,
        });
      }
    }

    return errors;
  }

  // ---- npm ----

  parseNpmErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line.startsWith('npm ERR!')) continue;

      const msg = line.replace('npm ERR!', '').trim();
      if (!msg) continue;

      // "npm ERR! code ERESOLVE"
      const codeMatch = /^code\s+(\S+)/.exec(msg);
      if (codeMatch) {
        const code = codeMatch[1];
        const fixable = ['ERESOLVE', 'ENOENT', 'EACCES'].includes(code);
        errors.push({
          message: `npm error: ${code}`,
          file: 'package.json',
          line: null,
          column: null,
          code,
          severity: 'error',
          source: 'npm',
          fixable,
          fixSuggestion: this.getNpmFixSuggestion(code),
          rawOutput: line,
        });
        continue;
      }

      // Skip purely informational lines
      if (msg.startsWith('A complete log') || msg.startsWith('peer dep') || !msg) continue;

      // Generic npm error lines
      if (msg.length > 5 && !errors.some(e => e.message === msg)) {
        errors.push({
          message: msg,
          file: null,
          line: null,
          column: null,
          code: null,
          severity: 'error',
          source: 'npm',
          fixable: false,
          fixSuggestion: null,
          rawOutput: line,
        });
      }
    }

    return errors;
  }

  private getNpmFixSuggestion(code: string): string | null {
    switch (code) {
      case 'ERESOLVE': return 'Run npm install --legacy-peer-deps or resolve peer dependency conflicts';
      case 'ENOENT': return 'Check that the referenced file or directory exists';
      case 'EACCES': return 'Fix file permissions or run with appropriate privileges';
      default: return null;
    }
  }

  // ---- Prettier ----

  parsePrettierOutput(output: string): ParsedError[] {
    const errors: ParsedError[] = [];

    // Prettier check output lists files that need formatting
    const filePattern = /^(?:\[warn\]\s+)?(.+\.\w+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = filePattern.exec(output)) !== null) {
      const file = match[1].trim();
      // Skip non-file lines
      if (file.startsWith('Checking') || file.startsWith('All') || file.includes(' ')) continue;
      errors.push({
        message: `File needs formatting: ${file}`,
        file,
        line: null,
        column: null,
        code: 'FORMATTING',
        severity: 'warning',
        source: 'prettier',
        fixable: true,
        fixSuggestion: `Run prettier --write "${file}"`,
        rawOutput: match[0],
      });
    }

    // "Code style issues found" summary
    if (/Code style issues found/.test(output) && errors.length === 0) {
      errors.push({
        message: 'Code style issues found in one or more files',
        file: null,
        line: null,
        column: null,
        code: 'FORMATTING',
        severity: 'warning',
        source: 'prettier',
        fixable: true,
        fixSuggestion: 'Run prettier --write to auto-format',
        rawOutput: output.split('\n').find(l => /Code style/.test(l)) || '',
      });
    }

    return errors;
  }

  // ---- Generic Fallback ----

  parseGenericErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split('\n');

    const patterns = [
      // file:line:col: error/warning: message
      /^(.+?):(\d+):(\d+):\s*(error|warning|fatal):\s*(.+)$/,
      // Error: message
      /^(?:Error|TypeError|ReferenceError|SyntaxError):\s+(.+)$/,
      // FATAL / CRITICAL
      /^(?:FATAL|CRITICAL):\s+(.+)$/,
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = pattern.exec(line);
        if (!match) continue;

        if (match.length >= 5) {
          // file:line:col pattern
          errors.push({
            message: match[5].trim(),
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            code: null,
            severity: match[4] === 'warning' ? 'warning' : 'error',
            source: 'generic',
            fixable: false,
            fixSuggestion: null,
            rawOutput: line,
          });
        } else {
          // Error: message pattern
          errors.push({
            message: match[1].trim(),
            file: null,
            line: null,
            column: null,
            code: null,
            severity: 'error',
            source: 'generic',
            fixable: false,
            fixSuggestion: null,
            rawOutput: line,
          });
        }
        break; // Only match one pattern per line
      }
    }

    return errors;
  }

  // ---- Summary ----

  summarizeResults(parsed: TerminalParsedResult): string {
    const parts: string[] = [];

    if (parsed.framework) {
      parts.push(`[${parsed.framework}]`);
    }

    if (parsed.success) {
      parts.push('Completed successfully.');
    } else {
      parts.push('Completed with errors.');
    }

    if (parsed.errors.length > 0) {
      parts.push(`${parsed.errors.length} error(s)`);
      const fixable = parsed.errors.filter(e => e.fixable).length;
      if (fixable > 0) {
        parts.push(`(${fixable} auto-fixable)`);
      }
    }

    if (parsed.warnings.length > 0) {
      parts.push(`${parsed.warnings.length} warning(s)`);
    }

    if (parsed.stats) {
      const s = parsed.stats;
      const statParts: string[] = [];
      if (s.total !== null) statParts.push(`${s.total} total`);
      if (s.passed !== null) statParts.push(`${s.passed} passed`);
      if (s.failed !== null && s.failed > 0) statParts.push(`${s.failed} failed`);
      if (s.skipped !== null && s.skipped > 0) statParts.push(`${s.skipped} skipped`);
      if (s.duration !== null) statParts.push(`${(s.duration / 1000).toFixed(1)}s`);
      if (statParts.length > 0) {
        parts.push(`Tests: ${statParts.join(', ')}`);
      }
    }

    return parts.join(' ');
  }
}
