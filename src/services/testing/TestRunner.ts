/**
 * TestRunner.ts — Phase 19 Step 19.2
 * Run generated tests, parse output, auto-fix failures
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GeneratedTest, TestFramework } from './TestGenTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export interface TestRunResult {
  testId: string;
  passed: boolean;
  output: string;
  passCount: number;
  failCount: number;
  skipCount: number;
  duration: number;
  failureDetails?: string;
}

export class TestRunner {
  private workspaceRoot: string;
  private framework: TestFramework;

  constructor(workspaceRoot: string, framework: TestFramework) {
    this.workspaceRoot = workspaceRoot;
    this.framework = framework;
  }

  async writeAndRun(test: GeneratedTest): Promise<TestRunResult> {
    const startTime = Date.now();

    // Write test file
    const absTestPath = path.join(this.workspaceRoot, test.testFile);
    const testDir = path.dirname(absTestPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(absTestPath, test.testCode, 'utf-8');

    Logger.info(`[TestRunner] Written test to ${test.testFile}`);

    // Run
    const result = await this.runTest(test.testFile, test.id);
    result.duration = Date.now() - startTime;

    return result;
  }

  async runTest(testFile: string, testId: string): Promise<TestRunResult> {
    const result: TestRunResult = {
      testId,
      passed: false,
      output: '',
      passCount: 0,
      failCount: 0,
      skipCount: 0,
      duration: 0,
    };

    try {
      let command: string;
      switch (this.framework) {
        case TestFramework.JEST:
          command = `npx jest "${testFile}" --verbose --no-coverage 2>&1`;
          break;
        case TestFramework.VITEST:
          command = `npx vitest run "${testFile}" --reporter=verbose 2>&1`;
          break;
        case TestFramework.PYTEST:
          command = `python -m pytest "${testFile}" -v 2>&1`;
          break;
        case TestFramework.GO_TEST:
          command = `go test -v -run "${testFile}" 2>&1`;
          break;
        default:
          command = `npx jest "${testFile}" --verbose --no-coverage 2>&1`;
      }

      const { stdout } = await execAsync(command, {
        cwd: this.workspaceRoot,
        timeout: 60000,
      });

      result.output = stdout;
      result.passed = true;
      this.parseOutput(stdout, result);
    } catch (e: any) {
      result.output = e.stdout || e.stderr || e.message || String(e);
      result.passed = false;
      result.failureDetails = this.extractFailureDetails(result.output);
      this.parseOutput(result.output, result);
    }

    return result;
  }

  private parseOutput(output: string, result: TestRunResult): void {
    // Jest/Vitest format
    const jestSummary = output.match(/Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?/i);
    if (jestSummary) {
      result.passCount = parseInt(jestSummary[1], 10) || 0;
      result.failCount = parseInt(jestSummary[2], 10) || 0;
      result.skipCount = parseInt(jestSummary[3], 10) || 0;
      return;
    }

    // Pytest format
    const pytestSummary = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?/i);
    if (pytestSummary) {
      result.passCount = parseInt(pytestSummary[1], 10) || 0;
      result.failCount = parseInt(pytestSummary[2], 10) || 0;
      result.skipCount = parseInt(pytestSummary[3], 10) || 0;
      return;
    }

    // Go format
    const goPass = (output.match(/--- PASS/g) || []).length;
    const goFail = (output.match(/--- FAIL/g) || []).length;
    result.passCount = goPass;
    result.failCount = goFail;
  }

  private extractFailureDetails(output: string): string {
    // Extract the most relevant failure info
    const lines = output.split('\n');
    const failLines: string[] = [];
    let capturing = false;

    for (const line of lines) {
      if (/FAIL|Error|Expected|Received|AssertionError/.test(line)) {
        capturing = true;
      }
      if (capturing) {
        failLines.push(line);
        if (failLines.length > 20) break;
      }
    }

    return failLines.join('\n') || output.slice(-500);
  }
}
