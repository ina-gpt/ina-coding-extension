/**
 * CoverageAnalyzer.ts — Phase 19 Step 19.2
 * Parse test coverage and identify gaps for auto-generation
 */

import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { CoverageGap, TestFramework } from './TestGenTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export class CoverageAnalyzer {
  private workspaceRoot: string;
  private framework: TestFramework;

  constructor(workspaceRoot: string, framework: TestFramework) {
    this.workspaceRoot = workspaceRoot;
    this.framework = framework;
  }

  async runCoverageAndAnalyze(): Promise<CoverageGap[]> {
    const coverageData = await this.runCoverage();
    if (!coverageData) return [];
    return this.extractGaps(coverageData);
  }

  async getExistingCoverage(): Promise<CoverageGap[]> {
    // Try to read existing coverage report
    const candidates = [
      'coverage/coverage-summary.json',
      'coverage/coverage-final.json',
      'coverage/lcov.info',
      'htmlcov/index.html',
    ];

    for (const candidate of candidates) {
      const fullPath = path.join(this.workspaceRoot, candidate);
      if (fs.existsSync(fullPath) && candidate.endsWith('.json')) {
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          return this.extractGaps(data);
        } catch { /* */ }
      }
    }

    return [];
  }

  private async runCoverage(): Promise<any> {
    try {
      let command: string;
      switch (this.framework) {
        case TestFramework.JEST:
          command = 'npx jest --coverage --coverageReporters=json-summary --silent 2>/dev/null';
          break;
        case TestFramework.VITEST:
          command = 'npx vitest run --coverage --reporter=json 2>/dev/null';
          break;
        case TestFramework.PYTEST:
          command = 'python -m pytest --cov --cov-report=json 2>/dev/null';
          break;
        default:
          Logger.info('[CoverageAnalyzer] No coverage command for framework: ' + this.framework);
          return null;
      }

      await execAsync(command, { cwd: this.workspaceRoot, timeout: 120000 });

      // Read the generated report
      const reportPath = path.join(this.workspaceRoot, 'coverage', 'coverage-summary.json');
      if (fs.existsSync(reportPath)) {
        return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      }

      // Try coverage-final.json
      const finalPath = path.join(this.workspaceRoot, 'coverage', 'coverage-final.json');
      if (fs.existsSync(finalPath)) {
        return JSON.parse(fs.readFileSync(finalPath, 'utf-8'));
      }

      return null;
    } catch (e: any) {
      Logger.warn('[CoverageAnalyzer] Coverage run failed:', e.message);
      return null;
    }
  }

  private extractGaps(coverageData: any): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    if (!coverageData || typeof coverageData !== 'object') return gaps;

    // Istanbul/NYC format (coverage-summary.json)
    for (const [filePath, data] of Object.entries(coverageData)) {
      if (filePath === 'total') continue;
      const fileData = data as any;

      if (fileData.lines || fileData.statements) {
        const linesCov = fileData.lines?.pct ?? fileData.statements?.pct ?? 100;
        const branchesCov = fileData.branches?.pct ?? 100;
        const functionsCov = fileData.functions?.pct ?? 100;

        if (linesCov < 80 || branchesCov < 80 || functionsCov < 80) {
          const relativePath = path.relative(this.workspaceRoot, filePath);
          const complexity = Math.round((100 - linesCov) / 10) + (branchesCov < 50 ? 3 : 0);
          const priority = linesCov < 30 ? 'high' : linesCov < 60 ? 'medium' : 'low';

          gaps.push({
            file: relativePath || filePath,
            function: '*',
            uncoveredLines: [],
            branchInfo: `Lines: ${linesCov}%, Branches: ${branchesCov}%, Functions: ${functionsCov}%`,
            complexity,
            priority: priority as CoverageGap['priority'],
          });
        }
      }

      // Istanbul coverage-final.json format (per-statement)
      if (fileData.s && fileData.statementMap) {
        const uncovered: number[] = [];
        for (const [stmtId, count] of Object.entries(fileData.s)) {
          if (count === 0) {
            const stmt = fileData.statementMap[stmtId];
            if (stmt?.start?.line) uncovered.push(stmt.start.line);
          }
        }
        if (uncovered.length > 0) {
          const relativePath = path.relative(this.workspaceRoot, filePath);
          gaps.push({
            file: relativePath || filePath,
            function: '*',
            uncoveredLines: uncovered.sort((a, b) => a - b),
            complexity: uncovered.length,
            priority: uncovered.length > 20 ? 'high' : uncovered.length > 5 ? 'medium' : 'low',
          });
        }
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    gaps.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return gaps;
  }
}
