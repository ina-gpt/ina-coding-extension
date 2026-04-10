/**
 * TestGenerator.ts — Phase 19 Step 19.2
 * LLM-powered test generation using INA-7 Pro
 */

import * as path from 'path';
import { GeneratedTest, TestGenConfig, TestType, TestFramework, FunctionAnalysis, DEFAULT_TEST_CONFIG, TestGenEvent } from './TestGenTypes';
import { CodeAnalyzer } from './CodeAnalyzer';
import { TestFrameworkDetector } from './TestFrameworkDetector';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class TestGenerator {
  private workspaceRoot: string;
  private analyzer: CodeAnalyzer;
  private detector: TestFrameworkDetector;
  private config: TestGenConfig;
  private apiEndpoint: string;
  private onEvent?: (event: TestGenEvent) => void;

  constructor(workspaceRoot: string, config?: Partial<TestGenConfig>, onEvent?: (event: TestGenEvent) => void) {
    this.workspaceRoot = workspaceRoot;
    this.analyzer = new CodeAnalyzer(workspaceRoot);
    this.detector = new TestFrameworkDetector(workspaceRoot);
    this.onEvent = onEvent;
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');

    const detected = this.detector.detect();
    this.config = { ...DEFAULT_TEST_CONFIG, ...detected, ...config };
  }

  async generateForFile(filePath: string, authHeaders: Record<string, string>): Promise<GeneratedTest[]> {
    this.emit({ type: 'analyzing', progress: 0.1, message: `Analyzing ${path.basename(filePath)}...` });

    const functions = this.analyzer.analyzeFile(filePath);
    const exportedFunctions = functions.filter(f => f.isExported);

    if (exportedFunctions.length === 0) {
      this.emit({ type: 'complete', progress: 1, message: 'No exported functions found', tests: [] });
      return [];
    }

    const allTests: GeneratedTest[] = [];
    for (let i = 0; i < exportedFunctions.length; i++) {
      const fn = exportedFunctions[i];
      this.emit({ type: 'generating', progress: 0.2 + (0.7 * i / exportedFunctions.length), message: `Generating tests for ${fn.name}...` });

      const tests = await this.generateForFunction(fn, authHeaders);
      allTests.push(...tests);
    }

    this.emit({ type: 'complete', progress: 1, tests: allTests });
    return allTests;
  }

  async generateForFunction(fn: FunctionAnalysis, authHeaders: Record<string, string>): Promise<GeneratedTest[]> {
    const prompt = this.buildPrompt(fn);

    try {
      const resp = await fetch(`${this.apiEndpoint}/api/testing/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          prompt,
          functionName: fn.name,
          file: fn.file,
          framework: this.config.framework,
          language: this.detectLanguage(fn.file),
        }),
      });

      if (!resp.ok) throw new Error(`API error: ${resp.status}`);

      const data = await resp.json();
      return this.parseGeneratedTests(data.tests || data.testCode || data, fn);
    } catch (e: any) {
      Logger.error(`[TestGenerator] Failed to generate tests for ${fn.name}:`, e);
      return this.generateFallbackTests(fn);
    }
  }

  private buildPrompt(fn: FunctionAnalysis): string {
    const framework = this.config.framework;
    const importStyle = this.getImportStyle(framework);
    const assertStyle = this.getAssertStyle(framework);

    const sections: string[] = [];

    sections.push(`## Task\nGenerate comprehensive ${framework} tests for the function below.\n`);

    sections.push(`## Function\n\`\`\`\n${fn.code}\n\`\`\`\n`);

    sections.push(`## Function Analysis
- Name: ${fn.name}
- Parameters: ${fn.params.map(p => `${p.name}${p.type ? ': ' + p.type : ''}`).join(', ') || 'none'}
- Return type: ${fn.returnType || 'unknown'}
- Async: ${fn.isAsync}
- Side effects: ${fn.sideEffects.join(', ') || 'none'}
- Dependencies: ${fn.dependencies.join(', ') || 'none'}
- Complexity: ${fn.complexity} (${fn.branches} branches)`);

    sections.push(`## Requirements
- Use ${framework} with ${this.config.style} style
- Import style: ${importStyle}
- Assert style: ${assertStyle}
- Minimum ${this.config.minAssertions} assertions
- ${this.config.includeEdgeCases ? 'Include edge cases (null, empty, boundary values)' : ''}
- ${this.config.includeNegativeTests ? 'Include negative tests (invalid inputs, error handling)' : ''}
- ${this.config.mockStrategy !== 'none' ? `Mock external dependencies (strategy: ${this.config.mockStrategy})` : 'No mocking'}
- Output ONLY the test code, no explanation`);

    return sections.join('\n\n');
  }

  private parseGeneratedTests(data: any, fn: FunctionAnalysis): GeneratedTest[] {
    let testCode = '';
    if (typeof data === 'string') {
      testCode = data;
    } else if (data.testCode) {
      testCode = data.testCode;
    } else if (Array.isArray(data)) {
      return data.map((t: any, i: number) => this.createTestEntry(t.testCode || t.code || String(t), fn, i));
    } else {
      testCode = JSON.stringify(data);
    }

    // Extract code from markdown fences
    const codeMatch = testCode.match(/```(?:\w+)?\n([\s\S]+?)```/);
    if (codeMatch) testCode = codeMatch[1];

    return [this.createTestEntry(testCode, fn, 0)];
  }

  private createTestEntry(testCode: string, fn: FunctionAnalysis, index: number): GeneratedTest {
    const testFile = this.computeTestFilePath(fn.file);
    const assertions = (testCode.match(/expect\(|assert[\.(]|should\./g) || []).length;

    return {
      id: `test_${fn.name}_${Date.now()}_${index}`,
      type: fn.sideEffects.length > 0 ? TestType.INTEGRATION : TestType.UNIT,
      framework: this.config.framework,
      targetFile: fn.file,
      targetFunction: fn.name,
      testCode,
      testFile,
      description: `Tests for ${fn.name}`,
      assertions: [`${assertions} assertions`],
      edgeCases: this.config.includeEdgeCases ? this.inferEdgeCases(fn) : [],
    };
  }

  private generateFallbackTests(fn: FunctionAnalysis): GeneratedTest[] {
    const framework = this.config.framework;
    const importPath = this.computeImportPath(fn.file);
    let testCode: string;

    if (framework === TestFramework.PYTEST) {
      testCode = `from ${importPath} import ${fn.name}\n\ndef test_${fn.name}_basic():\n    result = ${fn.name}(${fn.params.map(() => 'None').join(', ')})\n    assert result is not None\n`;
    } else {
      const importStatement = `import { ${fn.name} } from '${importPath}';`;
      testCode = `${importStatement}\n\ndescribe('${fn.name}', () => {\n  it('should execute without errors', () => {\n    expect(() => ${fn.name}(${fn.params.map(() => 'undefined').join(', ')})).not.toThrow();\n  });\n});\n`;
    }

    return [this.createTestEntry(testCode, fn, 0)];
  }

  private computeTestFilePath(sourceFile: string): string {
    const ext = path.extname(sourceFile);
    const base = path.basename(sourceFile, ext);
    const dir = path.dirname(sourceFile);

    if (this.config.testDir === 'colocated') {
      return path.join(dir, `${base}.test${ext}`);
    }

    return path.join(this.config.testDir || '__tests__', `${base}.test${ext}`);
  }

  private computeImportPath(sourceFile: string): string {
    const ext = path.extname(sourceFile);
    return './' + sourceFile.replace(ext, '').replace(/\\/g, '/');
  }

  private getImportStyle(framework: TestFramework): string {
    if (framework === TestFramework.PYTEST) return 'Python import';
    return "import { fn } from './module'";
  }

  private getAssertStyle(framework: TestFramework): string {
    if (framework === TestFramework.JEST || framework === TestFramework.VITEST) return 'expect().toBe()';
    if (framework === TestFramework.MOCHA) return 'assert / expect (chai)';
    if (framework === TestFramework.PYTEST) return 'assert';
    return 'assert';
  }

  private detectLanguage(file: string): string {
    const ext = path.extname(file);
    const map: Record<string, string> = { '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.py': 'python', '.go': 'go', '.rs': 'rust' };
    return map[ext] || 'unknown';
  }

  private inferEdgeCases(fn: FunctionAnalysis): string[] {
    const cases: string[] = [];
    for (const p of fn.params) {
      const t = (p.type || '').toLowerCase();
      if (t.includes('string')) cases.push(`empty string for ${p.name}`, `very long string for ${p.name}`);
      else if (t.includes('number')) cases.push(`zero for ${p.name}`, `negative number for ${p.name}`, `NaN for ${p.name}`);
      else if (t.includes('array') || t.includes('[]')) cases.push(`empty array for ${p.name}`, `single-element array for ${p.name}`);
      else cases.push(`null/undefined for ${p.name}`);
    }
    return cases;
  }

  private emit(event: TestGenEvent): void {
    this.onEvent?.(event);
  }
}
