/**
 * Diff Preview Controller Integration Tests
 *
 * Tests for the diff preview system orchestration.
 * Note: These tests mock VS Code APIs since they're not available in unit test context.
 */

import * as assert from 'assert';
import { DiffCalculator } from '../../services/diff/DiffCalculator';
import { PartialAcceptManager } from '../../services/diff/PartialAcceptManager';
import { EditBeforeAcceptManager } from '../../services/diff/EditBeforeAcceptManager';
import { DiffLineType, DiffViewMode } from '../../services/diff/DiffTypes';

suite('DiffPreviewController Integration', () => {

  // ============ DiffCalculator + PartialAcceptManager ============

  suite('Partial Accept Flow', () => {
    let calculator: DiffCalculator;
    let partialManager: PartialAcceptManager;

    setup(() => {
      calculator = new DiffCalculator();
      partialManager = new PartialAcceptManager();
    });

    test('accept all hunks produces modified content', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1\nchanged\nline3';
      const diff = calculator.calculateDiff(original, modified);

      partialManager.initializeSession('test-1', diff);

      for (const hunk of diff.hunks) {
        partialManager.acceptHunk('test-1', hunk.id);
      }

      const accepted = partialManager.getAcceptedCount('test-1');
      assert.ok(accepted.lines > 0 || accepted.hunks > 0);
    });

    test('reject all hunks keeps original', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1\nchanged\nline3';
      const diff = calculator.calculateDiff(original, modified);

      partialManager.initializeSession('test-2', diff);

      for (const hunk of diff.hunks) {
        partialManager.rejectHunk('test-2', hunk.id);
      }

      const rejected = partialManager.getRejectedCount('test-2');
      assert.ok(rejected.lines > 0 || rejected.hunks > 0);
    });

    test('mixed accept/reject produces hybrid', () => {
      const original = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
      const modified = 'A\nb\nc\nd\ne\nf\ng\nh\ni\nJ';
      const diff = calculator.calculateDiff(original, modified);

      partialManager.initializeSession('test-3', diff);

      if (diff.hunks.length >= 2) {
        partialManager.acceptHunk('test-3', diff.hunks[0].id);
        partialManager.rejectHunk('test-3', diff.hunks[1].id);

        const hunkState0 = partialManager.getHunkState('test-3', diff.hunks[0].id);
        const hunkState1 = partialManager.getHunkState('test-3', diff.hunks[1].id);

        assert.strictEqual(hunkState0, 'accepted');
        assert.strictEqual(hunkState1, 'rejected');
      }
    });

    test('toggle line cycles through states', () => {
      const diff = calculator.calculateDiff('old', 'new');
      partialManager.initializeSession('test-4', diff);

      if (diff.hunks.length > 0) {
        const firstChangeLine = diff.hunks[0].lines.find(l => l.type !== DiffLineType.UNCHANGED);
        if (firstChangeLine) {
          const state1 = partialManager.toggleLine('test-4', firstChangeLine.lineNumber);
          assert.strictEqual(state1, 'accepted');

          const state2 = partialManager.toggleLine('test-4', firstChangeLine.lineNumber);
          assert.strictEqual(state2, 'rejected');

          const state3 = partialManager.toggleLine('test-4', firstChangeLine.lineNumber);
          assert.strictEqual(state3, 'pending');
        }
      }
    });

    test('reset clears all decisions', () => {
      const diff = calculator.calculateDiff('old', 'new');
      partialManager.initializeSession('test-5', diff);

      for (const hunk of diff.hunks) {
        partialManager.acceptHunk('test-5', hunk.id);
      }

      partialManager.reset('test-5');

      const pending = partialManager.getPendingCount('test-5');
      const accepted = partialManager.getAcceptedCount('test-5');
      assert.strictEqual(accepted.lines, 0);
    });

    test('clearSession removes all state', () => {
      const diff = calculator.calculateDiff('a', 'b');
      partialManager.initializeSession('test-6', diff);
      partialManager.clearSession('test-6');

      const state = partialManager.getLineState('test-6', 0);
      assert.strictEqual(state, 'pending');
    });
  });

  // ============ EditBeforeAcceptManager Validation ============

  suite('Edit Before Accept Validation', () => {
    let editManager: EditBeforeAcceptManager;

    setup(() => {
      editManager = new EditBeforeAcceptManager();
    });

    test('validates balanced code', () => {
      const result = editManager.validateEditedContent(
        'function foo() { return 1; }',
        'typescript'
      );
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('detects unbalanced braces', () => {
      const result = editManager.validateEditedContent(
        'function foo() { return 1;',
        'typescript'
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('curly braces')));
    });

    test('detects unbalanced parentheses', () => {
      const result = editManager.validateEditedContent(
        'console.log("hello"',
        'typescript'
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('parentheses')));
    });

    test('ignores brackets in strings', () => {
      const result = editManager.validateEditedContent(
        'const s = "({[";',
        'typescript'
      );
      assert.strictEqual(result.valid, true);
    });

    test('detects unclosed string', () => {
      const result = editManager.validateEditedContent(
        'const s = "hello',
        'typescript'
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('string')));
    });

    test('isEditing returns false for unknown session', () => {
      assert.strictEqual(editManager.isEditing('unknown'), false);
    });
  });

  // ============ DiffCalculator Advanced ============

  suite('DiffCalculator Advanced', () => {
    let calculator: DiffCalculator;

    setup(() => {
      calculator = new DiffCalculator();
    });

    test('handles empty original', () => {
      const result = calculator.calculateDiff('', 'new content');
      assert.ok(result.additions > 0);
    });

    test('handles empty modified', () => {
      const result = calculator.calculateDiff('old content', '');
      assert.ok(result.deletions > 0);
    });

    test('handles both empty', () => {
      const result = calculator.calculateDiff('', '');
      assert.strictEqual(result.hunks.length, 0);
      assert.strictEqual(result.similarity, 1);
    });

    test('large file diff does not crash', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
      const modified = [...lines];
      modified[50] = 'CHANGED LINE 50';

      const result = calculator.calculateDiff(lines.join('\n'), modified.join('\n'));
      assert.ok(result.hunks.length > 0);
    });
  });
});
