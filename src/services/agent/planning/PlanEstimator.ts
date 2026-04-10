import { AgentPlan, AgentStep } from '../AgentTypes';
import { PlanEstimate, PlanStep } from './PlanningTypes';

const STEP_DURATION_MS: Record<string, number> = {
  create: 8000,
  edit: 5000,
  delete: 2000,
  rename: 3000,
  move: 3000,
  terminal: 10000,
  test: 15000,
};

const COMPLEXITY_WEIGHTS: Record<string, number> = {
  create: 3,
  edit: 2,
  delete: 1,
  rename: 2,
  move: 2,
  terminal: 4,
  test: 3,
};

export class PlanEstimator {
  private static instance: PlanEstimator;

  static getInstance(): PlanEstimator {
    if (!PlanEstimator.instance) {
      PlanEstimator.instance = new PlanEstimator();
    }
    return PlanEstimator.instance;
  }

  estimate(plan: AgentPlan): PlanEstimate {
    const totalSteps = plan.steps.length;
    const totalFiles = plan.affectedFiles.length;
    const estimatedDurationMs = this.estimateDuration(plan.steps);
    const complexity = this.estimateComplexity(plan);
    const riskLevel = this.estimateRisk(plan);
    const requiresTests = this.shouldIncludeTests(plan);

    return {
      totalSteps,
      totalFiles,
      estimatedDurationMs,
      complexity,
      riskLevel,
      requiresTests,
    };
  }

  estimateDuration(steps: AgentStep[]): number {
    let totalMs = 0;

    // Calculate per-step duration
    for (const step of steps) {
      const base = STEP_DURATION_MS[step.type] || 5000;
      const extStep = step as PlanStep;

      // Adjust for risk
      let multiplier = 1;
      if (extStep.risk === 'medium') multiplier = 1.5;
      if (extStep.risk === 'high') multiplier = 2;

      totalMs += base * multiplier;
    }

    // Account for sequential dependencies — steps with deps can't run in parallel
    const depSteps = (steps as PlanStep[]).filter(
      (s) => s.dependencies && s.dependencies.length > 0
    );
    if (depSteps.length > steps.length * 0.7) {
      // Mostly sequential — add 20% overhead
      totalMs *= 1.2;
    }

    return Math.round(totalMs);
  }

  estimateComplexity(
    plan: AgentPlan
  ): 'low' | 'medium' | 'high' | 'very-high' {
    let score = 0;

    // Step count contribution
    score += plan.steps.length * 2;

    // File count contribution
    score += plan.affectedFiles.length * 1.5;

    // Step type weights
    for (const step of plan.steps) {
      score += COMPLEXITY_WEIGHTS[step.type] || 2;
    }

    // Dependency chain depth
    const maxDepth = this.getMaxDependencyDepth(plan.steps as PlanStep[]);
    score += maxDepth * 3;

    // Config file changes
    const hasConfigChanges = plan.affectedFiles.some((f) =>
      ['package.json', 'tsconfig.json', '.eslintrc', 'webpack.config'].some(
        (c) => f.endsWith(c)
      )
    );
    if (hasConfigChanges) score += 10;

    if (score >= 60) return 'very-high';
    if (score >= 35) return 'high';
    if (score >= 15) return 'medium';
    return 'low';
  }

  estimateRisk(plan: AgentPlan): 'safe' | 'moderate' | 'risky' {
    let riskScore = 0;

    const hasDelete = plan.steps.some((s) => s.type === 'delete');
    const hasTerminal = plan.steps.some((s) => s.type === 'terminal');
    const hasRename = plan.steps.some((s) => s.type === 'rename');
    const manyFiles = plan.affectedFiles.length > 10;

    if (hasDelete) riskScore += 3;
    if (hasTerminal) riskScore += 2;
    if (hasRename) riskScore += 2;
    if (manyFiles) riskScore += 2;

    // High-risk steps
    const highRiskSteps = (plan.steps as PlanStep[]).filter(
      (s) => s.risk === 'high'
    );
    riskScore += highRiskSteps.length * 2;

    if (riskScore >= 5) return 'risky';
    if (riskScore >= 2) return 'moderate';
    return 'safe';
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return `~${minutes}min`;
  }

  private shouldIncludeTests(plan: AgentPlan): boolean {
    const hasTests = plan.steps.some((s) => s.type === 'test');
    const modifiesCode = plan.steps.some(
      (s) => s.type === 'edit' || s.type === 'create'
    );
    return modifiesCode && !hasTests;
  }

  private getMaxDependencyDepth(steps: PlanStep[]): number {
    const depthMap = new Map<string, number>();

    const getDepth = (stepId: string): number => {
      if (depthMap.has(stepId)) return depthMap.get(stepId)!;

      const step = steps.find((s) => s.id === stepId);
      if (!step || !step.dependencies || step.dependencies.length === 0) {
        depthMap.set(stepId, 0);
        return 0;
      }

      const maxChildDepth = Math.max(
        ...step.dependencies.map((dep) => getDepth(dep))
      );
      const depth = maxChildDepth + 1;
      depthMap.set(stepId, depth);
      return depth;
    };

    let maxDepth = 0;
    for (const step of steps) {
      maxDepth = Math.max(maxDepth, getDepth(step.id));
    }
    return maxDepth;
  }
}
