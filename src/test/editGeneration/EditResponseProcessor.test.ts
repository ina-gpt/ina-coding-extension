/**
 * Edit Response Processor Tests
 */

import * as assert from 'assert';
import { EditResponseProcessor } from '../../services/EditResponseProcessor';
import { PartialResponseHandler } from '../../services/PartialResponseHandler';

suite('EditResponseProcessor', () => {
  let processor: EditResponseProcessor;

  setup(() => {
    processor = new EditResponseProcessor();
  });

  // ============ Bracket Validation ============

  suite('validateBrackets', () => {
    test('valid balanced brackets', () => {
      assert.strictEqual(processor.validateBrackets('function foo() { return [1, 2]; }'), true);
    });

    test('unbalanced brackets', () => {
      assert.strictEqual(processor.validateBrackets('function foo() { return [1, 2]; '), false);
    });

    test('empty string', () => {
      assert.strictEqual(processor.validateBrackets(''), true);
    });

    test('brackets in strings are ignored', () => {
      assert.strictEqual(processor.validateBrackets('const s = "({[";'), true);
    });

    test('nested brackets', () => {
      assert.strictEqual(processor.validateBrackets('if (a[b(c)]) { d(); }'), true);
    });

    test('mismatched bracket types', () => {
      assert.strictEqual(processor.validateBrackets('(]'), false);
    });
  });

  // ============ String Validation ============

  suite('validateStrings', () => {
    test('valid closed strings', () => {
      assert.strictEqual(processor.validateStrings('const s = "hello";'), true);
    });

    test('unclosed double quote', () => {
      assert.strictEqual(processor.validateStrings('const s = "hello'), false);
    });

    test('unclosed single quote', () => {
      assert.strictEqual(processor.validateStrings("const s = 'hello"), false);
    });

    test('template literal spanning lines is ok', () => {
      assert.strictEqual(processor.validateStrings('const s = `hello\nworld'), true);
    });

    test('escaped quotes', () => {
      assert.strictEqual(processor.validateStrings('const s = "hello \\"world\\"";'), true);
    });
  });

  // ============ Diff Calculation ============

  suite('calculateDiff', () => {
    test('identical content', () => {
      const diff = processor.calculateDiff('hello\nworld', 'hello\nworld');
      assert.strictEqual(diff.additions, 0);
      assert.strictEqual(diff.deletions, 0);
      assert.strictEqual(diff.changes.length, 0);
    });

    test('modified line', () => {
      const diff = processor.calculateDiff('hello\nworld', 'hello\nearth');
      assert.strictEqual(diff.changes.length, 1);
      assert.strictEqual(diff.changes[0].type, 'modify');
    });

    test('added line', () => {
      const diff = processor.calculateDiff('hello', 'hello\nworld');
      assert.strictEqual(diff.additions, 1);
    });

    test('deleted line', () => {
      const diff = processor.calculateDiff('hello\nworld', 'hello');
      assert.strictEqual(diff.deletions, 1);
    });
  });

  // ============ Indentation ============

  suite('normalizeIndentation', () => {
    test('adds target indentation', () => {
      const result = processor.normalizeIndentation('const x = 1;', '    ', 'typescript');
      assert.ok(result.startsWith('    '));
    });

    test('preserves relative indentation', () => {
      const code = 'if (true) {\n  x = 1;\n}';
      const result = processor.normalizeIndentation(code, '  ', 'typescript');
      const lines = result.split('\n');
      assert.ok(lines[0].startsWith('  '));
    });

    test('empty lines remain empty', () => {
      const code = 'a\n\nb';
      const result = processor.normalizeIndentation(code, '  ', 'typescript');
      const lines = result.split('\n');
      assert.strictEqual(lines[1], '');
    });
  });

  // ============ Breaking Change Detection ============

  suite('detectBreakingChanges', () => {
    test('no breaking changes when exports preserved', () => {
      const original = 'export function foo() { return 1; }';
      const modified = 'export function foo() { return 2; }';
      assert.strictEqual(processor.detectBreakingChanges(original, modified, 'typescript'), false);
    });

    test('detects removed export', () => {
      const original = 'export function foo() { return 1; }\nexport function bar() {}';
      const modified = 'export function foo() { return 1; }';
      assert.strictEqual(processor.detectBreakingChanges(original, modified, 'typescript'), true);
    });

    test('detects changed function signature', () => {
      const original = 'function foo(a: string, b: number) { }';
      const modified = 'function foo(a: string) { }';
      assert.strictEqual(processor.detectBreakingChanges(original, modified, 'typescript'), true);
    });
  });
});

suite('PartialResponseHandler', () => {
  let handler: PartialResponseHandler;

  setup(() => {
    handler = new PartialResponseHandler();
  });

  // ============ Auto-Close Brackets ============

  suite('autoCloseBrackets', () => {
    test('closes unclosed braces', () => {
      const { code, closedCount } = handler.autoCloseBrackets('function foo() {');
      assert.ok(code.includes('}'));
      assert.strictEqual(closedCount, 1);
    });

    test('no changes for balanced code', () => {
      const { code, closedCount } = handler.autoCloseBrackets('function foo() {}');
      assert.strictEqual(closedCount, 0);
    });

    test('closes multiple brackets', () => {
      const { code, closedCount } = handler.autoCloseBrackets('if (a) { b([');
      assert.strictEqual(closedCount, 3);
    });
  });

  // ============ Auto-Close Strings ============

  suite('autoCloseStrings', () => {
    test('closes unclosed string', () => {
      const { code, closedStrings } = handler.autoCloseStrings('const s = "hello');
      assert.ok(code.endsWith('"'));
      assert.strictEqual(closedStrings, 1);
    });

    test('no changes for closed strings', () => {
      const { code, closedStrings } = handler.autoCloseStrings('const s = "hello"');
      assert.strictEqual(closedStrings, 0);
    });
  });

  // ============ Completeness Estimation ============

  suite('estimateCompleteness', () => {
    test('empty code is 0', () => {
      assert.strictEqual(handler.estimateCompleteness('', 'typescript'), 0);
    });

    test('complete function scores high', () => {
      const code = 'function foo() {\n  return 42;\n}';
      const score = handler.estimateCompleteness(code, 'typescript');
      assert.ok(score >= 0.7, `Expected >= 0.7, got ${score}`);
    });

    test('incomplete code scores lower', () => {
      const code = 'function foo() {';
      const score = handler.estimateCompleteness(code, 'typescript');
      assert.ok(score < 0.5, `Expected < 0.5, got ${score}`);
    });
  });

  // ============ Handle Partial Response ============

  suite('handlePartialResponse', () => {
    test('recovers usable partial with auto-close', () => {
      const recovery = handler.handlePartialResponse(
        'function foo() {\n  return 42;',
        'typescript'
      );
      assert.ok(recovery.recoveredCode.includes('}'));
      assert.ok(recovery.isUsable);
    });

    test('suggests retry for very incomplete response', () => {
      const recovery = handler.handlePartialResponse('func', 'typescript');
      const retryAction = recovery.actions.find(a => a.type === 'retry');
      assert.ok(retryAction, 'Should suggest retry');
    });
  });

  // ============ Truncate Incomplete ============

  suite('truncateIncomplete', () => {
    test('removes trailing incomplete line', () => {
      const { code, removed } = handler.truncateIncomplete('const x = 1;\nconst y =');
      assert.strictEqual(removed, true);
      assert.strictEqual(code, 'const x = 1;');
    });

    test('keeps complete lines', () => {
      const { code, removed } = handler.truncateIncomplete('const x = 1;\nconst y = 2;');
      assert.strictEqual(removed, false);
    });
  });
});
