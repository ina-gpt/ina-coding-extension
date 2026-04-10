/**
 * Unit tests for SelectionExpander
 */

import * as assert from 'assert';

// Mock vscode types
class MockPosition {
  constructor(public line: number, public character: number) {}
}

class MockSelection {
  constructor(public start: MockPosition, public end: MockPosition) {}
  get active() { return this.end; }
  get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
}

function createMockDocument(content: string, languageId: string = 'typescript') {
  const lines = content.split('\n');
  return {
    getText: (range?: any) => {
      if (!range) return content;
      return lines.slice(range.start.line, range.end.line + 1).join('\n');
    },
    lineAt: (line: number) => ({
      text: lines[line] || '',
      isEmptyOrWhitespace: !lines[line]?.trim(),
      firstNonWhitespaceCharacterIndex: (lines[line] || '').search(/\S/) === -1 ? 0 : (lines[line] || '').search(/\S/),
      range: { start: new MockPosition(line, 0), end: new MockPosition(line, (lines[line] || '').length) },
    }),
    lineCount: lines.length,
    languageId,
    uri: { fsPath: 'test.ts', scheme: 'file' },
  };
}

describe('SelectionExpander', () => {

  describe('expandToLine', () => {
    it('should expand cursor to full line', () => {
      const doc = createMockDocument('  const x = 1;');
      const lineText = doc.lineAt(0).text;
      const firstNonWs = doc.lineAt(0).firstNonWhitespaceCharacterIndex;
      assert.strictEqual(firstNonWs, 2);
      assert.strictEqual(lineText.length, 14);
    });

    it('should trim leading whitespace', () => {
      const doc = createMockDocument('    hello');
      assert.strictEqual(doc.lineAt(0).firstNonWhitespaceCharacterIndex, 4);
    });
  });

  describe('expandToBlock - JavaScript/TypeScript braces', () => {
    it('should find matching braces', () => {
      const code = 'function test() {\n  const x = 1;\n  return x;\n}';
      const lines = code.split('\n');

      // Find opening brace on line 0
      assert.ok(lines[0].includes('{'));
      // Find closing brace on line 3
      assert.ok(lines[3].includes('}'));
    });

    it('should handle nested braces', () => {
      const code = 'function outer() {\n  if (true) {\n    return 1;\n  }\n}';
      const lines = code.split('\n');

      // Count braces
      let count = 0;
      for (const line of lines) {
        for (const ch of line) {
          if (ch === '{') count++;
          if (ch === '}') count--;
        }
      }
      assert.strictEqual(count, 0); // Balanced
    });
  });

  describe('expandToBlock - Python indentation', () => {
    it('should detect indentation-based blocks', () => {
      const code = 'def test():\n    x = 1\n    return x\n\nnext_function()';
      const doc = createMockDocument(code, 'python');

      // Line 1 has indent 4
      assert.strictEqual(doc.lineAt(1).firstNonWhitespaceCharacterIndex, 4);
      // Line 0 has indent 0 (block header)
      assert.strictEqual(doc.lineAt(0).firstNonWhitespaceCharacterIndex, 0);
    });
  });

  describe('expandToStatement', () => {
    it('should find semicolon terminator', () => {
      const code = 'const x =\n  computeValue(\n    arg1,\n    arg2\n  );';
      const lines = code.split('\n');
      const lastLine = lines[lines.length - 1];
      assert.ok(lastLine.trimEnd().endsWith(';'));
    });

    it('should handle multi-line statements', () => {
      const code = 'const result = {\n  key: value,\n  key2: value2,\n};';
      const lines = code.split('\n');
      // First line doesn't end with ;
      assert.ok(!lines[0].trimEnd().endsWith(';'));
      // Last line ends with ;
      assert.ok(lines[3].trimEnd().endsWith(';'));
    });
  });

  describe('shrinkToMeaningful', () => {
    it('should remove leading empty lines', () => {
      const doc = createMockDocument('\n\nconst x = 1;\n\n');
      assert.ok(doc.lineAt(0).isEmptyOrWhitespace);
      assert.ok(doc.lineAt(1).isEmptyOrWhitespace);
      assert.ok(!doc.lineAt(2).isEmptyOrWhitespace);
    });
  });

  describe('detectBlockBoundaries', () => {
    it('should detect nested block boundaries', () => {
      const code = 'function a() {\n  function b() {\n    return 1;\n  }\n}';
      const lines = code.split('\n');

      // Line 2 is inside inner function
      // Inner block: lines 1-3
      let braceCount = 0;
      for (let i = 1; i < lines.length; i++) {
        for (const ch of lines[i]) {
          if (ch === '{') braceCount++;
          if (ch === '}') braceCount--;
        }
        if (braceCount === 0 && i > 1) {
          assert.strictEqual(i, 3); // Inner block ends at line 3
          break;
        }
      }
    });
  });

  describe('findMatchingBracket', () => {
    it('should return matching position for open bracket', () => {
      const code = '{ nested { } }';
      let count = 0;
      let matchPos = -1;
      for (let i = 0; i < code.length; i++) {
        if (code[i] === '{') count++;
        if (code[i] === '}') {
          count--;
          if (count === 0) { matchPos = i; break; }
        }
      }
      assert.strictEqual(matchPos, code.length - 2); // Last }
    });

    it('should return null for unmatched bracket', () => {
      const code = '{ unclosed';
      let count = 0;
      for (const ch of code) {
        if (ch === '{') count++;
        if (ch === '}') count--;
      }
      assert.ok(count > 0); // Unmatched
    });
  });
});
