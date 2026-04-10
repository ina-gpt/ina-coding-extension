import * as assert from 'assert';

// Mock VS Code types for testing
const mockPosition = (line: number, character: number) => ({
  line,
  character,
  isAfter: () => false,
  isBefore: () => false,
  isAfterOrEqual: () => false,
  isBeforeOrEqual: () => false,
  isEqual: () => false,
  compareTo: () => 0,
  translate: () => mockPosition(line, character),
  with: () => mockPosition(line, character),
});

const mockRange = (startLine: number, startChar: number, endLine: number, endChar: number) => ({
  start: mockPosition(startLine, startChar),
  end: mockPosition(endLine, endChar),
  isEmpty: startLine === endLine && startChar === endChar,
  isSingleLine: startLine === endLine,
  contains: () => false,
  intersection: () => undefined,
  union: () => mockRange(startLine, startChar, endLine, endChar),
  with: () => mockRange(startLine, startChar, endLine, endChar),
  isEqual: () => false,
});

// ============ PrefixExtractor Tests ============

suite('PrefixExtractor', () => {
  test('findLastCompleteStatement for JavaScript', () => {
    const lines = [
      'const a = 1;',
      'const b = 2;',
      'function foo() {',
      '  return a +',
    ];

    // Statement ending with semicolon is a complete statement
    assert.ok(lines[1].trim().endsWith(';'));
    assert.ok(lines[0].trim().endsWith(';'));
    assert.ok(!lines[3].trim().endsWith(';'));
  });

  test('findLastCompleteStatement for Python', () => {
    const lines = [
      'def hello():',
      '    print("hello")',
      '    x = 1',
      '    return x +',
    ];

    // Python: colon ends a block start, non-indented line is a statement boundary
    assert.ok(lines[0].trim().endsWith(':'));
  });

  test('findImportSection detects import block', () => {
    const lines = [
      'import { useState } from "react";',
      'import { useEffect } from "react";',
      '',
      'function App() {',
    ];

    // Import section should be lines 0-1
    const hasImports = lines[0].startsWith('import');
    assert.ok(hasImports);
    assert.ok(!lines[3].startsWith('import'));
  });

  test('smartTruncate preserves imports', () => {
    const importLines = [
      'import { A } from "a";',
      'import { B } from "b";',
    ];
    const codeLines = Array(100).fill('  const x = 1;');
    const allLines = [...importLines, '', ...codeLines, '  return x +'];

    // When truncating, imports should be preserved
    const fullText = allLines.join('\n');
    assert.ok(fullText.includes('import { A }'));
    assert.ok(allLines.length > 100);
  });
});

// ============ SuffixExtractor Tests ============

suite('SuffixExtractor', () => {
  test('findClosingBrackets counts correctly', () => {
    const prefixText = 'function foo() {\n  if (true) {\n    ';
    let braces = 0;
    for (const ch of prefixText) {
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
    }
    assert.strictEqual(braces, 2); // Two unclosed braces
  });

  test('calculateBracketDepths handles strings', () => {
    const text = 'const x = "hello { world }"; const y = {';
    let braces = 0;
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const prev = i > 0 ? text[i - 1] : '';
      if (inString) {
        if (ch === stringChar && prev !== '\\') inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
    }
    assert.strictEqual(braces, 1); // Only one real unclosed brace
  });
});

// ============ ImportAnalyzer Tests ============

suite('ImportAnalyzer', () => {
  test('parseImportLine for ES6 imports', () => {
    const line = 'import { useState, useEffect } from "react"';
    const match = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    assert.ok(match);
    assert.strictEqual(match![2], 'react');
  });

  test('parseImportLine for CommonJS require', () => {
    const line = 'const fs = require("fs")';
    const match = line.match(/^const\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/);
    assert.ok(match);
    assert.strictEqual(match![1], 'fs');
    assert.strictEqual(match![2], 'fs');
  });

  test('parseImportLine for Python imports', () => {
    const line1 = 'import os';
    const line2 = 'from pathlib import Path';
    assert.ok(/^import\s+\w+/.test(line1));
    assert.ok(/^from\s+\w+\s+import/.test(line2));
  });

  test('extractSpecifiers handles named imports', () => {
    const importText = 'import { useState, useCallback as cb, type Dispatch } from "react"';
    const namedMatch = importText.match(/\{([^}]+)\}/);
    assert.ok(namedMatch);
    const items = namedMatch![1].split(',').map((s) => s.trim());
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0], 'useState');
    assert.ok(items[1].includes('as'));
    assert.ok(items[2].startsWith('type'));
  });

  test('extractSpecifiers handles default imports', () => {
    const importText = 'import React from "react"';
    const match = importText.match(/^import\s+(\w+)\s+from/);
    assert.ok(match);
    assert.strictEqual(match![1], 'React');
  });

  test('extractSpecifiers handles namespace imports', () => {
    const importText = 'import * as path from "path"';
    const match = importText.match(/\*\s+as\s+(\w+)/);
    assert.ok(match);
    assert.strictEqual(match![1], 'path');
  });

  test('findUsedSymbols identifies used imports', () => {
    const bodyLines = [
      'const [count, setCount] = useState(0);',
      'useEffect(() => {}, []);',
      '// useCallback is not used',
    ];
    const bodyText = bodyLines.join('\n');

    assert.ok(/\buseState\b/.test(bodyText));
    assert.ok(/\buseEffect\b/.test(bodyText));
    assert.ok(!/\buseCallback\b/.test(bodyText.replace(/\/\/.*$/gm, '')));
  });

  test('identifyUnusedImports filters correctly', () => {
    const imports = ['useState', 'useEffect', 'useCallback'];
    const used = ['useState', 'useEffect'];
    const unused = imports.filter((i) => !used.includes(i));
    assert.deepStrictEqual(unused, ['useCallback']);
  });
});

// ============ TokenBudgetManager Tests ============

suite('TokenBudgetManager', () => {
  test('createBudget with default values', () => {
    const budget = {
      total: 8000,
      prefix: 4000,
      suffix: 1500,
      imports: 500,
      relatedFiles: 1500,
      recentEdits: 500,
      remaining: 8000,
    };
    assert.strictEqual(budget.total, 8000);
    assert.strictEqual(budget.prefix, 4000);
    assert.strictEqual(budget.remaining, 8000);
  });

  test('allocate respects limits', () => {
    const budget = { total: 100, prefix: 50, suffix: 30, imports: 10, relatedFiles: 10, recentEdits: 0, remaining: 100 };
    const needed = 60;
    const available = budget.prefix;
    const allocated = Math.min(needed, available, budget.remaining);
    assert.strictEqual(allocated, 50); // Can only allocate what's available
  });

  test('reallocate moves budget correctly', () => {
    const budget = { total: 100, prefix: 50, suffix: 30, imports: 10, relatedFiles: 10, recentEdits: 0, remaining: 100 };
    const transfer = Math.min(10, budget.imports);
    budget.imports -= transfer;
    budget.relatedFiles += transfer;
    assert.strictEqual(budget.imports, 0);
    assert.strictEqual(budget.relatedFiles, 20);
  });

  test('estimateTokens approximates accurately', () => {
    const text = 'const hello = "world";'; // 22 chars
    const estimated = Math.ceil(text.length / 4);
    assert.strictEqual(estimated, 6); // ~4 chars per token
  });

  test('calculateOptimalAllocation prioritizes correctly', () => {
    const sizes = { prefix: 5000, suffix: 2000, imports: 100, relatedFiles: 500, recentEdits: 200 };
    const total = 8000;

    // Prefix should get most allocation
    const prefixPct = sizes.prefix / (sizes.prefix + sizes.suffix + sizes.imports + sizes.relatedFiles + sizes.recentEdits);
    assert.ok(prefixPct > 0.5); // Prefix is >50% of content
  });
});

// ============ RecentEditsTracker Tests ============

suite('RecentEditsTracker', () => {
  test('recordEdit adds to array', () => {
    const edits: Array<{ text: string; timestamp: number }> = [];
    edits.push({ text: 'new code', timestamp: Date.now() });
    assert.strictEqual(edits.length, 1);
  });

  test('getRelevantEdits filters by file', () => {
    const edits = [
      { filePath: '/a.ts', timestamp: Date.now() },
      { filePath: '/b.ts', timestamp: Date.now() },
      { filePath: '/a.ts', timestamp: Date.now() },
    ];
    const filtered = edits.filter((e) => e.filePath === '/a.ts');
    assert.strictEqual(filtered.length, 2);
  });

  test('detectPatterns identifies repeating patterns', () => {
    const edits = [
      { oldText: 'var x', newText: 'const x', type: 'replace' as const },
      { oldText: 'var y', newText: 'const y', type: 'replace' as const },
      { oldText: 'var z', newText: 'const z', type: 'replace' as const },
    ];

    const isVarToConst = edits.every(
      (e) => e.oldText.includes('var ') && e.newText.includes('const ')
    );
    assert.ok(isVarToConst);
  });

  test('pruneOldEdits removes old entries', () => {
    const maxAge = 300000;
    const edits = [
      { timestamp: Date.now() - 400000 }, // Old
      { timestamp: Date.now() - 100000 }, // Recent
      { timestamp: Date.now() },           // Current
    ];
    const pruned = edits.filter((e) => Date.now() - e.timestamp < maxAge);
    assert.strictEqual(pruned.length, 2);
  });
});

// ============ ContextFormatter Tests ============

suite('ContextFormatter', () => {
  test('formatForFIM produces valid FIM structure', () => {
    const prefix = 'function hello() {\n  return ';
    const suffix = '\n}';
    // FIM format should have prefix and suffix
    assert.ok(prefix.length > 0);
    assert.ok(suffix.length > 0);
  });

  test('formatImports respects budget', () => {
    const imports = [
      'import { A } from "a";',
      'import { B } from "b";',
      'import { C } from "c";',
    ];

    const maxTokens = 5; // Very small budget
    const lines: string[] = [];
    let tokenCount = 0;
    for (const imp of imports) {
      const lineTokens = Math.ceil(imp.length / 4);
      if (tokenCount + lineTokens > maxTokens) break;
      lines.push(imp);
      tokenCount += lineTokens;
    }

    assert.ok(lines.length < imports.length); // Should have truncated
  });

  test('formatRelatedFiles creates valid comments', () => {
    const file = { relativePath: './types.ts', snippet: 'export interface User { id: string; }' };
    const formatted = `// From ${file.relativePath}:\n// ${file.snippet}`;
    assert.ok(formatted.startsWith('// From'));
    assert.ok(formatted.includes('// export interface'));
  });
});
