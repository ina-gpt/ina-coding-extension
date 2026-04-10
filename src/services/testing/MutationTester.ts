/**
 * MutationTester.ts — Phase 19 Step 19.2
 * Simple mutation testing engine — no external deps
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MutationResult, TestFramework } from './TestGenTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

interface Mutant {
  description: string;
  file: string;
  line: number;
  original: string;
  mutated: string;
}

const MUTATION_OPERATORS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  { name: 'negate condition', pattern: /===\s/g, replacement: '!== ' },
  { name: 'swap equality', pattern: /!==\s/g, replacement: '=== ' },
  { name: 'swap comparison', pattern: />\s(?!=)/g, replacement: '< ' },
  { name: 'swap comparison', pattern: /<\s(?!=)/g, replacement: '> ' },
  { name: 'swap logical AND/OR', pattern: /&&/g, replacement: '||' },
  { name: 'swap logical OR/AND', pattern: /\|\|/g, replacement: '&&' },
  { name: 'swap add/sub', pattern: /\+(?!=)/g, replacement: '-' },
  { name: 'remove return value', pattern: /return\s+(\S)/g, replacement: 'return undefined; //' },
  { name: 'swap true/false', pattern: /\btrue\b/g, replacement: 'false' },
  { name: 'swap false/true', pattern: /\bfalse\b/g, replacement: 'true' },
];

export class MutationTester {
  private workspaceRoot: string;
  private framework: TestFramework;

  constructor(workspaceRoot: string, framework: TestFramework) {
    this.workspaceRoot = workspaceRoot;
    this.framework = framework;
  }

  async runMutationTests(targetFile: string, testFile: string, maxMutants: number = 10): Promise<MutationResult[]> {
    const absTarget = path.isAbsolute(targetFile) ? targetFile : path.join(this.workspaceRoot, targetFile);
    const originalContent = fs.readFileSync(absTarget, 'utf-8');
    const lines = originalContent.split('\n');
    const results: MutationResult[] = [];

    // Generate mutants
    const mutants = this.generateMutants(lines, targetFile);
    const selectedMutants = mutants.slice(0, maxMutants);

    for (const mutant of selectedMutants) {
      try {
        // Apply mutation
        const mutatedLines = [...lines];
        mutatedLines[mutant.line - 1] = mutant.mutated;
        fs.writeFileSync(absTarget, mutatedLines.join('\n'), 'utf-8');

        // Run tests
        const killed = await this.runTests(testFile);

        results.push({
          mutant: mutant.description,
          location: { file: targetFile, line: mutant.line },
          killed,
        });
      } catch (e) {
        Logger.warn(`[MutationTester] Mutant execution failed:`, e);
      }
    }

    // Restore original
    fs.writeFileSync(absTarget, originalContent, 'utf-8');

    return results;
  }

  private generateMutants(lines: string[], file: string): Mutant[] {
    const mutants: Mutant[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments, imports, empty lines
      if (/^\s*\/\/|^\s*\*|^\s*import\s|^\s*$/.test(line)) continue;

      for (const op of MUTATION_OPERATORS) {
        if (op.pattern.test(line)) {
          // Reset regex lastIndex
          op.pattern.lastIndex = 0;
          const mutated = line.replace(op.pattern, op.replacement);
          if (mutated !== line) {
            mutants.push({
              description: `${op.name} at line ${i + 1}`,
              file,
              line: i + 1,
              original: line.trim(),
              mutated: mutated.trim(),
            });
          }
          op.pattern.lastIndex = 0;
        }
      }
    }

    return mutants;
  }

  private async runTests(testFile: string): Promise<boolean> {
    try {
      let command: string;
      switch (this.framework) {
        case TestFramework.JEST:
          command = `npx jest "${testFile}" --silent --no-coverage 2>&1`;
          break;
        case TestFramework.VITEST:
          command = `npx vitest run "${testFile}" --silent 2>&1`;
          break;
        case TestFramework.PYTEST:
          command = `python -m pytest "${testFile}" -q 2>&1`;
          break;
        default:
          command = `npx jest "${testFile}" --silent --no-coverage 2>&1`;
      }

      const { stdout } = await execAsync(command, { cwd: this.workspaceRoot, timeout: 30000 });
      // If tests pass with mutation, mutant survived (not killed)
      return false;
    } catch {
      // Tests failed = mutant killed (good!)
      return true;
    }
  }
}
