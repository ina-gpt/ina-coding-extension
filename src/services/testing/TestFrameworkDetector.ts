/**
 * TestFrameworkDetector.ts — Phase 19 Step 19.2
 * Auto-detects test framework, test directory, assertion and mock libraries
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestFramework, TestGenConfig, DEFAULT_TEST_CONFIG } from './TestGenTypes';
import { Logger } from '../../utils/Logger';

export class TestFrameworkDetector {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  detect(): Partial<TestGenConfig> {
    const result: Partial<TestGenConfig> = {};

    result.framework = this.detectFramework();
    result.testDir = this.detectTestDir();
    result.style = this.detectStyle(result.framework);
    result.mockStrategy = this.detectMockStrategy(result.framework);

    Logger.info(`[TestFrameworkDetector] Detected: ${result.framework}, dir: ${result.testDir}, style: ${result.style}`);
    return result;
  }

  private detectFramework(): TestFramework {
    const pkg = this.readPackageJson();

    // Check devDependencies and dependencies
    const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };

    if (allDeps?.vitest) return TestFramework.VITEST;
    if (allDeps?.jest || allDeps?.['@jest/core'] || allDeps?.['ts-jest']) return TestFramework.JEST;
    if (allDeps?.mocha) return TestFramework.MOCHA;

    // Check config files
    const configFiles: Record<string, TestFramework> = {
      'vitest.config.ts': TestFramework.VITEST,
      'vitest.config.js': TestFramework.VITEST,
      'jest.config.ts': TestFramework.JEST,
      'jest.config.js': TestFramework.JEST,
      'jest.config.json': TestFramework.JEST,
      '.mocharc.yml': TestFramework.MOCHA,
      '.mocharc.json': TestFramework.MOCHA,
      'pytest.ini': TestFramework.PYTEST,
      'setup.cfg': TestFramework.PYTEST,
      'pyproject.toml': TestFramework.PYTEST,
    };

    for (const [file, framework] of Object.entries(configFiles)) {
      if (fs.existsSync(path.join(this.workspaceRoot, file))) return framework;
    }

    // Check for Go
    if (fs.existsSync(path.join(this.workspaceRoot, 'go.mod'))) return TestFramework.GO_TEST;

    // Check for Rust
    if (fs.existsSync(path.join(this.workspaceRoot, 'Cargo.toml'))) return TestFramework.CARGO_TEST;

    // Check for Python
    const pyFiles = ['*.py', 'requirements.txt', 'Pipfile'];
    for (const p of pyFiles) {
      try {
        const found = fs.readdirSync(this.workspaceRoot).some(f => f.endsWith('.py') || f === p);
        if (found) return TestFramework.PYTEST;
      } catch { /* */ }
    }

    return TestFramework.UNKNOWN;
  }

  private detectTestDir(): string {
    const candidates = [
      '__tests__', 'test', 'tests', 'spec', 'specs',
      'src/__tests__', 'src/test', 'src/tests',
    ];

    for (const dir of candidates) {
      const fullPath = path.join(this.workspaceRoot, dir);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        return dir;
      }
    }

    // Check if tests are colocated (*.test.ts next to source)
    try {
      const srcDir = path.join(this.workspaceRoot, 'src');
      if (fs.existsSync(srcDir)) {
        const hasColocated = this.findFilesRecursive(srcDir, /\.(test|spec)\.(ts|js|tsx|jsx)$/, 3);
        if (hasColocated) return 'colocated';
      }
    } catch { /* */ }

    return '__tests__';
  }

  private detectStyle(framework: TestFramework): 'describe-it' | 'test-only' {
    if (framework === TestFramework.VITEST || framework === TestFramework.JEST) return 'describe-it';
    if (framework === TestFramework.MOCHA) return 'describe-it';
    return 'test-only';
  }

  private detectMockStrategy(framework: TestFramework): 'auto' | 'manual' | 'none' {
    const pkg = this.readPackageJson();
    const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };

    if (framework === TestFramework.JEST || framework === TestFramework.VITEST) return 'auto';
    if (allDeps?.sinon) return 'manual';
    return 'none';
  }

  private readPackageJson(): any {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.workspaceRoot, 'package.json'), 'utf-8'));
    } catch {
      return null;
    }
  }

  private findFilesRecursive(dir: string, pattern: RegExp, maxDepth: number): boolean {
    if (maxDepth <= 0) return false;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && pattern.test(entry.name)) return true;
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          if (this.findFilesRecursive(path.join(dir, entry.name), pattern, maxDepth - 1)) return true;
        }
      }
    } catch { /* */ }
    return false;
  }
}
