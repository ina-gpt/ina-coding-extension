/**
 * TestGenTypes.ts — Phase 19 Step 19.2
 * Intelligent Test Generation type definitions
 */

export enum TestType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  SNAPSHOT = 'snapshot',
  PROPERTY_BASED = 'property_based',
  REGRESSION = 'regression',
}

export enum TestFramework {
  JEST = 'jest',
  VITEST = 'vitest',
  MOCHA = 'mocha',
  PYTEST = 'pytest',
  GO_TEST = 'go_test',
  CARGO_TEST = 'cargo_test',
  UNKNOWN = 'unknown',
}

export interface GeneratedTest {
  id: string;
  type: TestType;
  framework: TestFramework;
  targetFile: string;
  targetFunction: string;
  testCode: string;
  testFile: string;
  description: string;
  assertions: string[];
  edgeCases: string[];
}

export interface TestGenConfig {
  framework: TestFramework;
  testDir: string;
  style: 'describe-it' | 'test-only';
  includeEdgeCases: boolean;
  includeNegativeTests: boolean;
  mockStrategy: 'auto' | 'manual' | 'none';
  minAssertions: number;
  maxTestsPerFunction: number;
}

export const DEFAULT_TEST_CONFIG: TestGenConfig = {
  framework: TestFramework.UNKNOWN,
  testDir: '',
  style: 'describe-it',
  includeEdgeCases: true,
  includeNegativeTests: true,
  mockStrategy: 'auto',
  minAssertions: 3,
  maxTestsPerFunction: 5,
};

export interface FunctionAnalysis {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  code: string;
  params: { name: string; type?: string }[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  sideEffects: string[];
  dependencies: string[];
  branches: number;
  complexity: number;
}

export interface CoverageGap {
  file: string;
  function: string;
  uncoveredLines: number[];
  branchInfo?: string;
  complexity: number;
  priority: 'high' | 'medium' | 'low';
}

export interface MutationResult {
  mutant: string;
  location: { file: string; line: number };
  killed: boolean;
  survivingTest?: string;
}

export interface TestGenEvent {
  type: 'analyzing' | 'generating' | 'validating' | 'running' | 'complete' | 'error';
  progress: number;
  message?: string;
  tests?: GeneratedTest[];
}
