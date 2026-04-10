/**
 * AnalyticsTypes.ts — Phase 20 Step 20.3
 * Project Analytics Dashboard type definitions
 */

export interface CodeHealthMetric {
  name: string;
  value: number;
  unit: string;
  trend: 'improving' | 'stable' | 'declining';
  thresholds: { green: number; yellow: number; red: number };
  history: number[];
}

export interface ProjectHealth {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  metrics: CodeHealthMetric[];
  lastUpdated: string;
  scanDuration: number;
}

export interface FileComplexity {
  filePath: string;
  totalComplexity: number;
  functionCount: number;
  avgComplexityPerFunction: number;
  maxComplexity: number;
  maxNesting: number;
  lineCount: number;
  hotspot: boolean;
  maintainabilityIndex: number;
}

export interface DependencyHealth {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  hasVulnerability: boolean;
  severity?: 'critical' | 'high' | 'moderate' | 'low';
  licenseType: string;
  directUsages: number;
}

export interface ChurnMetric {
  filePath: string;
  commitCount: number;
  uniqueAuthors: number;
  linesChanged: number;
  isChurning: boolean;
  correlatedBugs: number;
  churnScore: number;
}

export interface DuplicationReport {
  blockA: { file: string; startLine: number; endLine: number };
  blockB: { file: string; startLine: number; endLine: number };
  similarity: number;
  lineCount: number;
  language: string;
  suggestedExtraction?: string;
}

export interface AnalyticsConfig {
  scanOnOpen: boolean;
  scanIntervalHours: number;
  trackChurn: boolean;
  trackDependencies: boolean;
  trackDuplication: boolean;
  trackComplexity: boolean;
  complexityThreshold: number;
  duplicationMinLines: number;
  churnWindowDays: number;
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  scanOnOpen: true,
  scanIntervalHours: 24,
  trackChurn: true,
  trackDependencies: true,
  trackDuplication: true,
  trackComplexity: true,
  complexityThreshold: 15,
  duplicationMinLines: 6,
  churnWindowDays: 90,
};

export interface AnalyticsSnapshot {
  id: string;
  timestamp: string;
  projectHealth: ProjectHealth;
  fileComplexities: FileComplexity[];
  dependencyHealth: DependencyHealth[];
  churnMetrics: ChurnMetric[];
  duplicationReport: DuplicationReport[];
}

export interface TrendReport {
  period: string;
  summary: string;
  metricsChange: Record<string, { before: number; after: number; change: number; trend: string }>;
  anomalies: string[];
  recommendations: string[];
}
