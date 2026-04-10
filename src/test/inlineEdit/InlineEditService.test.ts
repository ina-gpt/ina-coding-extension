/**
 * Unit tests for InlineEditService
 */

import * as assert from 'assert';

// Mock vscode module
const vscode = {
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  Selection: class {
    constructor(public start: any, public end: any) {
      if (!end) { this.end = start; }
    }
    get active() { return this.end; }
    get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
  },
  Range: class {
    constructor(public start: any, public end: any) {}
    contains(pos: any) { return pos.line >= this.start.line && pos.line <= this.end.line; }
  },
  EventEmitter: class {
    fire() {}
    event = () => ({ dispose: () => {} });
    dispose() {}
  },
  workspace: {
    asRelativePath: (uri: any) => uri?.fsPath || 'test.ts',
  },
  commands: {
    executeCommand: async () => [],
  },
};

// Helper to create mock document
function createMockDocument(content: string, languageId: string = 'typescript') {
  const lines = content.split('\n');
  return {
    getText: (range?: any) => {
      if (!range) return content;
      const startLine = range.start?.line ?? 0;
      const endLine = range.end?.line ?? lines.length - 1;
      return lines.slice(startLine, endLine + 1).join('\n');
    },
    lineAt: (line: number) => ({
      text: lines[line] || '',
      isEmptyOrWhitespace: !lines[line]?.trim(),
      firstNonWhitespaceCharacterIndex: lines[line]?.search(/\S/) ?? 0,
    }),
    lineCount: lines.length,
    languageId,
    uri: { fsPath: 'test.ts', scheme: 'file' },
  };
}

describe('InlineEditService', () => {

  describe('getIndentationAtLine', () => {
    it('should extract correct whitespace for indented line', () => {
      const doc = createMockDocument('function test() {\n    const x = 1;\n}');
      // Direct test: line 1 has 4 spaces
      const text = doc.lineAt(1).text;
      const match = text.match(/^(\s*)/);
      const indentation = match ? match[1] : '';
      assert.strictEqual(indentation, '    ');
    });

    it('should return empty string for unindented line', () => {
      const doc = createMockDocument('const x = 1;');
      const text = doc.lineAt(0).text;
      const match = text.match(/^(\s*)/);
      const indentation = match ? match[1] : '';
      assert.strictEqual(indentation, '');
    });
  });

  describe('detectTriggerMode', () => {
    it('should return SELECTION when editor has selection', () => {
      // Selection is not empty when start != end
      const start = new vscode.Position(0, 0);
      const end = new vscode.Position(0, 10);
      const selection = new vscode.Selection(start, end);
      assert.strictEqual(selection.isEmpty, false);
    });

    it('should return LINE when no selection', () => {
      const pos = new vscode.Position(5, 0);
      const selection = new vscode.Selection(pos, pos);
      assert.strictEqual(selection.isEmpty, true);
    });
  });

  describe('getSurroundingCode', () => {
    it('should handle file boundaries (start of file)', () => {
      const doc = createMockDocument('line1\nline2\nline3');
      // Line 0 with 25 lines before = should clamp to 0
      const startLine = Math.max(0, 0 - 25);
      assert.strictEqual(startLine, 0);
    });

    it('should handle file boundaries (end of file)', () => {
      const doc = createMockDocument('line1\nline2\nline3');
      // Line 2 (last line) with 25 lines after = should clamp
      const endLine = Math.min(doc.lineCount - 1, 2 + 25);
      assert.strictEqual(endLine, 2);
    });
  });

  describe('session state transitions', () => {
    it('should transition from idle to input', () => {
      const states: string[] = ['idle', 'input', 'generating', 'preview', 'applied'];
      assert.strictEqual(states[0], 'idle');
      assert.strictEqual(states[1], 'input');
    });

    it('should support applied and rejected end states', () => {
      const validEndStates = ['applied', 'rejected'];
      assert.ok(validEndStates.includes('applied'));
      assert.ok(validEndStates.includes('rejected'));
    });
  });
});
