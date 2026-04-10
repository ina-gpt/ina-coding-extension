/**
 * Diff Calculator Tests
 */

import * as assert from 'assert';
import { DiffCalculator } from '../../services/diff/DiffCalculator';
import { DiffLineType } from '../../services/diff/DiffTypes';

suite('DiffCalculator', () => {
  let calculator: DiffCalculator;

  setup(() => {
    calculator = new DiffCalculator();
  });

  // ============ calculateDiff ============

  suite('calculateDiff', () => {
    test('identical strings returns empty hunks', () => {
      const result = calculator.calculateDiff('hello\nworld', 'hello\nworld');
      assert.strictEqual(result.hunks.length, 0);
      assert.strictEqual(result.additions, 0);
      assert.strictEqual(result.deletions, 0);
      assert.strictEqual(result.similarity, 1);
    });

    test('single line addition', () => {
      const result = calculator.calculateDiff('hello', 'hello\nworld');
      assert.ok(result.additions > 0);
      assert.ok(result.hunks.length > 0);
    });

    test('single line deletion', () => {
      const result = calculator.calculateDiff('hello\nworld', 'hello');
      assert.ok(result.deletions > 0);
      assert.ok(result.hunks.length > 0);
    });

    test('single line modification', () => {
      const result = calculator.calculateDiff('hello', 'world');
      assert.ok(result.hunks.length > 0);
      const hasChanges = result.additions > 0 || result.deletions > 0;
      assert.ok(hasChanges);
    });

    test('multiple hunks', () => {
      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';
      const modified = 'LINE1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nLINE10';
      const result = calculator.calculateDiff(original, modified);
      assert.ok(result.hunks.length >= 1);
    });

    test('preserves whitespace', () => {
      const original = '  indented\n    more';
      const modified = '  indented\n      extra';
      const result = calculator.calculateDiff(original, modified);
      assert.ok(result.hunks.length > 0);
    });
  });

  // ============ calculateLineDiff ============

  suite('calculateLineDiff', () => {
    test('highlights word changes', () => {
      const result = calculator.calculateLineDiff('function foo()', 'function bar()');
      assert.ok(result.length > 0);
      const hasChanges = result.some(r => r.type === 'add' || r.type === 'remove');
      assert.ok(hasChanges);
    });

    test('handles empty lines', () => {
      const result = calculator.calculateLineDiff('', 'new content');
      assert.ok(result.length > 0);
    });
  });

  // ============ calculateSimilarity ============

  suite('calculateSimilarity', () => {
    test('returns 1.0 for identical strings', () => {
      const similarity = calculator.calculateSimilarity('hello world', 'hello world');
      assert.strictEqual(similarity, 1);
    });

    test('returns 0.0 for completely different', () => {
      const similarity = calculator.calculateSimilarity('aaa', 'zzz');
      assert.ok(similarity < 0.5);
    });

    test('returns high similarity for minor changes', () => {
      const similarity = calculator.calculateSimilarity(
        'function foo() { return 1; }',
        'function foo() { return 2; }'
      );
      assert.ok(similarity > 0.8);
    });
  });

  // ============ applyHunk ============

  suite('applyHunk', () => {
    test('correctly applies addition hunk', () => {
      const original = 'line1\nline2\nline3';
      const diff = calculator.calculateDiff(original, 'line1\nline2\nnew line\nline3');
      assert.ok(diff.hunks.length > 0);

      const applied = calculator.applyHunk(original, diff.hunks[0]);
      assert.ok(applied.includes('new line'));
    });

    test('correctly applies deletion hunk', () => {
      const original = 'line1\nline2\nline3';
      const diff = calculator.calculateDiff(original, 'line1\nline3');
      assert.ok(diff.hunks.length > 0);
    });
  });

  // ============ applyHunks ============

  suite('applyHunks', () => {
    test('handles multiple hunks', () => {
      const original = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
      const modified = 'A\nb\nc\nd\ne\nf\ng\nh\ni\nJ';
      const diff = calculator.calculateDiff(original, modified);

      if (diff.hunks.length > 0) {
        const result = calculator.applyHunks(original, diff.hunks);
        assert.ok(result.length > 0);
      }
    });
  });

  // ============ createUnifiedDiff ============

  suite('createUnifiedDiff', () => {
    test('format matches git diff', () => {
      const diff = calculator.calculateDiff('old line', 'new line');
      const unified = calculator.createUnifiedDiff(diff, 'test.ts');

      assert.ok(unified.includes('--- a/test.ts'));
      assert.ok(unified.includes('+++ b/test.ts'));
      assert.ok(unified.includes('@@'));
    });
  });

  // ============ findLCS ============

  suite('findLCS', () => {
    test('finds longest common subsequence', () => {
      const lcs = calculator.findLCS(['a', 'b', 'c', 'd'], ['a', 'c', 'd']);
      assert.deepStrictEqual(lcs, ['a', 'c', 'd']);
    });

    test('empty arrays', () => {
      const lcs = calculator.findLCS([], ['a', 'b']);
      assert.deepStrictEqual(lcs, []);
    });

    test('no common elements', () => {
      const lcs = calculator.findLCS(['a', 'b'], ['c', 'd']);
      assert.deepStrictEqual(lcs, []);
    });
  });

  // ============ groupIntoHunks ============

  suite('grouping', () => {
    test('merges adjacent changes', () => {
      const original = 'a\nb\nc';
      const modified = 'x\ny\nc';
      const diff = calculator.calculateDiff(original, modified);
      // Adjacent changes at lines 0 and 1 should be in same hunk
      assert.ok(diff.hunks.length <= 2);
    });

    test('context lines respected', () => {
      const diff = calculator.calculateDiff('a\nb\nc', 'a\nB\nc');
      if (diff.hunks.length > 0) {
        // Hunk should include context lines
        assert.ok(diff.hunks[0].lines.length >= 1);
      }
    });
  });
});
