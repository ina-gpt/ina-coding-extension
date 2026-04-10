import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  StepExecutor,
  StepResult,
  RollbackData,
  ExecutionContext,
} from '../ExecutionTypes';
import { PlanStep } from '../../planning/PlanningTypes';
import { Logger } from '../../../../utils/Logger';

const execAsync = promisify(exec);

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number | null;
  runner: string;
}

/**
 * Executor for running tests.
 * Auto-detects the test runner from package.json and parses output.
 */
export class TestExecutor implements StepExecutor {
  canExecute(step: PlanStep): boolean {
    return step.type === 'test';
  }

  estimateDuration(_step: PlanStep): number {
    return 15000;
  }

  async execute(step: PlanStep, context: ExecutionContext): Promise<StepResult> {
    const warnings: string[] = [];
    const artifacts: Record<string, any> = {};

    // Determine test command
    let testCommand = this.extractTestCommand(step);

    if (!testCommand) {
      // Auto-detect from package.json
      testCommand = await this.detectTestRunner(context);
    }

    if (!testCommand) {
      return {
        success: false,
        filesChanged: [],
        output: 'Could not determine test command. No test script found in package.json and no command specified in step details.',
        warnings: [],
        artifacts: {},
      };
    }

    context.progress(`Running tests: ${testCommand}`);

    // Check abort signal
    if (context.abortSignal.aborted) {
      return {
        success: false,
        filesChanged: [],
        output: 'Aborted before test execution.',
        warnings: [],
        artifacts: {},
      };
    }

    try {
      const timeoutMs = 120000; // 120s timeout for tests
      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: context.workspaceRoot,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CI: 'true',
        },
      });

      const fullOutput = [stdout, stderr].filter(Boolean).join('\n');
      const testResults = this.parseTestOutput(fullOutput, testCommand);

      artifacts.command = testCommand;
      artifacts.stdout = stdout;
      artifacts.stderr = stderr;
      artifacts.testResults = testResults;

      if (testResults.failed > 0) {
        warnings.push(`${testResults.failed} test(s) failed.`);
      }

      Logger.info(
        `TestExecutor: Tests completed — ${testResults.passed}/${testResults.total} passed` +
        (testResults.failed > 0 ? `, ${testResults.failed} failed` : '')
      );

      return {
        success: testResults.failed === 0,
        filesChanged: [],
        output: this.formatTestSummary(testResults, fullOutput),
        warnings,
        artifacts,
      };
    } catch (error: any) {
      // Test runners often exit with non-zero on failures
      const stdout = error.stdout || '';
      const stderr = error.stderr || '';
      const fullOutput = [stdout, stderr].filter(Boolean).join('\n');
      const testResults = this.parseTestOutput(fullOutput, testCommand);

      artifacts.command = testCommand;
      artifacts.stdout = stdout;
      artifacts.stderr = stderr;
      artifacts.testResults = testResults;
      artifacts.exitCode = error.code ?? 1;

      Logger.error(`TestExecutor: Test command failed: ${error.message}`);

      // If we could parse test results, use those
      if (testResults.total > 0) {
        return {
          success: false,
          filesChanged: [],
          output: this.formatTestSummary(testResults, fullOutput),
          warnings: [`Test process exited with code ${error.code ?? 1}`],
          artifacts,
        };
      }

      return {
        success: false,
        filesChanged: [],
        output: `Test execution failed:\n${fullOutput || error.message}`,
        warnings: [],
        artifacts,
      };
    }
  }

  async rollback(_data: RollbackData): Promise<void> {
    // Tests don't modify files, nothing to roll back
    Logger.info('TestExecutor: Rollback is a no-op for test steps.');
  }

  /**
   * Extract test command from step details.
   */
  private extractTestCommand(step: PlanStep): string | null {
    const details = step.details;
    if (!details || details.trim().length === 0) {
      return null;
    }

    // Try to extract from code block
    const codeBlockRegex = /```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/;
    const match = details.match(codeBlockRegex);
    if (match && match[1]) {
      return match[1].trim();
    }

    // Check if details look like a command (starts with npm, yarn, etc.)
    const trimmed = details.trim();
    if (/^(npm|yarn|pnpm|npx|jest|vitest|mocha|node)\s/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  /**
   * Detect the test runner from package.json scripts.
   */
  private async detectTestRunner(context: ExecutionContext): Promise<string | null> {
    const packageJsonPath = path.join(context.workspaceRoot, 'package.json');

    try {
      const exists = await context.fileExists(packageJsonPath);
      if (!exists) {
        return null;
      }

      const content = await context.readFile(packageJsonPath);
      const pkg = JSON.parse(content);

      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        return 'npm test';
      }

      // Check for specific test runners in devDependencies
      const devDeps = { ...pkg.devDependencies, ...pkg.dependencies };
      if (devDeps.vitest) {
        return 'npx vitest run';
      }
      if (devDeps.jest) {
        return 'npx jest';
      }
      if (devDeps.mocha) {
        return 'npx mocha';
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse test output to extract results.
   */
  private parseTestOutput(output: string, command: string): TestResults {
    if (command.includes('jest') || command.includes('npm test')) {
      return this.parseJestOutput(output);
    }
    if (command.includes('vitest')) {
      return this.parseVitestOutput(output);
    }
    // Fallback generic parse
    return this.parseGenericOutput(output);
  }

  /**
   * Parse Jest-style test output.
   */
  private parseJestOutput(output: string): TestResults {
    const results: TestResults = { total: 0, passed: 0, failed: 0, skipped: 0, duration: null, runner: 'jest' };

    // Match "Tests: X passed, Y total" or "Tests: X failed, Y passed, Z total"
    const testsMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/);
    if (testsMatch) {
      results.failed = parseInt(testsMatch[1] || '0', 10);
      results.skipped = parseInt(testsMatch[2] || '0', 10);
      results.passed = parseInt(testsMatch[3] || '0', 10);
      results.total = parseInt(testsMatch[4], 10);
    }

    // Match "Time: X.XXs"
    const timeMatch = output.match(/Time:\s+([\d.]+)\s*s/);
    if (timeMatch) {
      results.duration = parseFloat(timeMatch[1]) * 1000;
    }

    return results;
  }

  /**
   * Parse Vitest-style test output.
   */
  private parseVitestOutput(output: string): TestResults {
    const results: TestResults = { total: 0, passed: 0, failed: 0, skipped: 0, duration: null, runner: 'vitest' };

    // Match "Tests  X passed | Y failed (Z)"
    const testsMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?\s*\((\d+)\)/);
    if (testsMatch) {
      results.passed = parseInt(testsMatch[1], 10);
      results.failed = parseInt(testsMatch[2] || '0', 10);
      results.skipped = parseInt(testsMatch[3] || '0', 10);
      results.total = parseInt(testsMatch[4], 10);
    }

    // Match "Duration  X.XXs"
    const timeMatch = output.match(/Duration\s+([\d.]+)\s*s/);
    if (timeMatch) {
      results.duration = parseFloat(timeMatch[1]) * 1000;
    }

    return results;
  }

  /**
   * Generic test output parser — counts pass/fail keywords.
   */
  private parseGenericOutput(output: string): TestResults {
    const results: TestResults = { total: 0, passed: 0, failed: 0, skipped: 0, duration: null, runner: 'unknown' };

    const passCount = (output.match(/\bpass(ed|ing)?\b/gi) || []).length;
    const failCount = (output.match(/\bfail(ed|ing|ure)?\b/gi) || []).length;

    results.passed = passCount;
    results.failed = failCount;
    results.total = passCount + failCount;

    return results;
  }

  /**
   * Format a human-readable test summary.
   */
  private formatTestSummary(results: TestResults, rawOutput: string): string {
    const lines: string[] = [];
    lines.push(`Test Results (${results.runner}):`);
    lines.push(`  Total:   ${results.total}`);
    lines.push(`  Passed:  ${results.passed}`);
    lines.push(`  Failed:  ${results.failed}`);
    if (results.skipped > 0) {
      lines.push(`  Skipped: ${results.skipped}`);
    }
    if (results.duration !== null) {
      lines.push(`  Duration: ${(results.duration / 1000).toFixed(2)}s`);
    }
    lines.push('');
    // Include truncated raw output
    const maxOutputLength = 2000;
    if (rawOutput.length > maxOutputLength) {
      lines.push(rawOutput.slice(-maxOutputLength));
      lines.push('... (output truncated)');
    } else {
      lines.push(rawOutput);
    }

    return lines.join('\n');
  }
}
