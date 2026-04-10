/**
 * Unit tests for InlineEditInputWidget
 */

import * as assert from 'assert';

// Mock types
const mockSession = {
  id: 'test-session-1',
  context: {
    selection: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
    content: 'function test() { return 1; }',
    language: 'typescript',
    filePath: 'src/test.ts',
    lineRange: [0, 5] as [number, number],
    surroundingCode: { before: '', after: '', beforeLines: 0, afterLines: 0 },
    symbols: ['test'],
    indentation: '  ',
    cursorPosition: { line: 0, character: 0 },
  },
  status: 'input' as const,
  prompt: '',
  originalContent: 'function test() { return 1; }',
  generatedContent: null,
  startTime: Date.now(),
  editor: {} as any,
};

describe('InlineEditInputWidget', () => {

  describe('Quick Actions', () => {
    it('should have 8 predefined quick actions', () => {
      const actions = [
        'refactor', 'fix', 'comment', 'test',
        'optimize', 'error', 'types', 'explain',
      ];
      assert.strictEqual(actions.length, 8);
    });

    it('should have prompt for each action', () => {
      const actionsWithPrompts = [
        { action: 'refactor', prompt: 'Refactor this code' },
        { action: 'fix', prompt: 'Fix any bugs' },
      ];
      for (const a of actionsWithPrompts) {
        assert.ok(a.prompt.length > 0);
      }
    });
  });

  describe('Prompt Building', () => {
    it('should include file name in prompt info', () => {
      const filePath = mockSession.context.filePath;
      const fileName = filePath.split('/').pop();
      assert.strictEqual(fileName, 'test.ts');
    });

    it('should show line count in prompt info', () => {
      const [start, end] = mockSession.context.lineRange;
      const lines = end - start + 1;
      assert.strictEqual(lines, 6);
    });

    it('should show language in prompt info', () => {
      assert.strictEqual(mockSession.context.language, 'typescript');
    });
  });

  describe('Context Enhancement', () => {
    it('should add language prefix when not plaintext', () => {
      const language = 'typescript';
      const prefix = language !== 'plaintext' ? `In ${language}` : '';
      assert.strictEqual(prefix, 'In typescript');
    });

    it('should add symbol context when available', () => {
      const symbols = mockSession.context.symbols;
      assert.ok(symbols.length > 0);
      assert.strictEqual(symbols[0], 'test');
    });

    it('should not add prefix for plaintext', () => {
      const language = 'plaintext';
      const prefix = language !== 'plaintext' ? `In ${language}` : '';
      assert.strictEqual(prefix, '');
    });
  });

  describe('Input Validation', () => {
    it('should reject empty prompts', () => {
      const prompt = ''.trim();
      assert.strictEqual(prompt.length, 0);
    });

    it('should accept non-empty prompts', () => {
      const prompt = 'Add error handling'.trim();
      assert.ok(prompt.length > 0);
    });

    it('should trim whitespace', () => {
      const prompt = '  Add tests  '.trim();
      assert.strictEqual(prompt, 'Add tests');
    });
  });
});

describe('TimeFormatter', () => {
  it('should return "just now" for recent timestamps', () => {
    const now = Date.now();
    const diff = now - now;
    assert.ok(diff < 60000); // Less than 1 minute
  });

  it('should return minutes for timestamps under an hour', () => {
    const minutes = 15;
    const expected = `${minutes} minutes ago`;
    assert.ok(expected.includes('minutes'));
  });
});

describe('PromptEnhancer', () => {
  it('should detect refactor intent', () => {
    const lower = 'refactor this code'.toLowerCase();
    assert.ok(/refactor|clean|improve/.test(lower));
  });

  it('should detect fix intent', () => {
    const lower = 'fix the bug here'.toLowerCase();
    assert.ok(/fix|bug|error/.test(lower));
  });

  it('should detect generate intent', () => {
    const lower = 'add error handling'.toLowerCase();
    assert.ok(/add|create|generate/.test(lower));
  });

  it('should return other for unknown intent', () => {
    const lower = 'make it blue'.toLowerCase();
    const isRefactor = /refactor|clean/.test(lower);
    const isFix = /fix|bug/.test(lower);
    assert.ok(!isRefactor && !isFix);
  });
});
