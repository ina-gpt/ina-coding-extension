import * as path from 'path';
import { AgentPlan } from '../AgentTypes';
import { PlanValidation, PlanStep } from './PlanningTypes';
import { AgentConfig } from '../AgentTypes';

const PROTECTED_PATHS = [
  '.git',
  'node_modules',
  '.env',
  '.env.local',
  '.env.production',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

const DANGEROUS_COMMANDS = [
  /\brm\s+-rf\s+[/~]/,
  /\bsudo\b/,
  /\bcurl\b.*\|\s*bash/,
  /\bwget\b.*\|\s*bash/,
  /\bchmod\s+777\b/,
  /\bdd\s+if=/,
  /\bmkfs\b/,
  /\b>\/dev\//,
  /\bkill\s+-9\s+1\b/,
  /\bshutdown\b/,
  /\breboot\b/,
];

export class PlanValidator {
  private static instance: PlanValidator;

  static getInstance(): PlanValidator {
    if (!PlanValidator.instance) {
      PlanValidator.instance = new PlanValidator();
    }
    return PlanValidator.instance;
  }

  validatePlan(
    plan: AgentPlan,
    config: AgentConfig,
    workspaceRoot: string
  ): PlanValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // At least one step
    if (!plan.steps || plan.steps.length === 0) {
      errors.push('Plan has no steps');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Step count
    if (plan.steps.length > config.maxSteps) {
      errors.push(`Plan has ${plan.steps.length} steps (max: ${config.maxSteps})`);
    }

    // File count
    if (plan.affectedFiles.length > config.maxFiles) {
      errors.push(`Plan affects ${plan.affectedFiles.length} files (max: ${config.maxFiles})`);
    }

    // Check duplicate step IDs
    const stepIds = new Set<string>();
    for (const step of plan.steps) {
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // Validate each step
    for (const step of plan.steps) {
      const extStep = step as PlanStep;

      // Path traversal prevention (CRITICAL SECURITY)
      if (step.filePath) {
        if (step.filePath.includes('\0')) {
          errors.push(`Step ${step.id}: file path contains null bytes`);
        }
        const resolved = path.resolve(workspaceRoot, step.filePath);
        if (!resolved.startsWith(workspaceRoot)) {
          errors.push(`Step ${step.id}: file path "${step.filePath}" is outside workspace (path traversal blocked)`);
        }
      }

      if (extStep.targetPath) {
        const resolvedTarget = path.resolve(workspaceRoot, extStep.targetPath);
        if (!resolvedTarget.startsWith(workspaceRoot)) {
          errors.push(`Step ${step.id}: target path "${extStep.targetPath}" is outside workspace`);
        }
      }

      // Protected files
      if (step.filePath && this.isProtectedPath(step.filePath)) {
        if (step.type === 'delete' || step.type === 'edit') {
          warnings.push(`Step ${step.id}: modifying protected path "${step.filePath}"`);
        }
      }

      // Delete permission
      if (step.type === 'delete' && !config.allowDelete) {
        errors.push(`Step ${step.id}: delete not allowed by configuration`);
      }

      // Terminal permission
      if (step.type === 'terminal' && !config.allowTerminal) {
        errors.push(`Step ${step.id}: terminal commands not allowed by configuration`);
      }

      // Dangerous commands
      if (step.type === 'terminal' && extStep.details) {
        if (this.isDangerousCommand(extStep.details)) {
          errors.push(`Step ${step.id}: contains dangerous terminal command`);
        }
      }

      // Dependency validation
      if (extStep.dependencies) {
        for (const dep of extStep.dependencies) {
          if (!stepIds.has(dep)) {
            errors.push(`Step ${step.id}: depends on non-existent step "${dep}"`);
          }
        }
      }
    }

    // Circular dependency check
    const cycle = this.detectCircularDependencies(plan.steps as PlanStep[]);
    if (cycle) {
      errors.push(`Circular dependency detected: ${cycle.join(' → ')}`);
    }

    // Suggestions
    const sugg = this.suggestImprovements(plan);
    suggestions.push(...sugg);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  validateDependencyGraph(
    steps: PlanStep[]
  ): { valid: boolean; cycle?: string[] } {
    const cycle = this.detectCircularDependencies(steps);
    return { valid: cycle === null, cycle: cycle || undefined };
  }

  assessRisk(
    plan: AgentPlan
  ): { level: 'safe' | 'moderate' | 'risky'; reasons: string[] } {
    const reasons: string[] = [];

    const hasDelete = plan.steps.some((s) => s.type === 'delete');
    const hasRename = plan.steps.some((s) => s.type === 'rename');
    const hasTerminal = plan.steps.some((s) => s.type === 'terminal');
    const manyFiles = plan.affectedFiles.length > 10;
    const hasTestFiles = plan.affectedFiles.some(
      (f) => f.includes('.test.') || f.includes('.spec.')
    );
    const hasConfigFiles = plan.affectedFiles.some((f) =>
      ['package.json', 'tsconfig.json', '.eslintrc', 'webpack.config'].some((c) =>
        f.endsWith(c)
      )
    );

    if (hasDelete) reasons.push('Includes file deletion');
    if (hasRename) reasons.push('Includes rename (may break imports)');
    if (hasTerminal) reasons.push('Includes terminal commands');
    if (manyFiles) reasons.push(`Affects ${plan.affectedFiles.length} files`);
    if (hasTestFiles) reasons.push('Modifies test files');
    if (hasConfigFiles) reasons.push('Modifies configuration files');

    let level: 'safe' | 'moderate' | 'risky' = 'safe';
    if (reasons.length >= 3 || hasDelete) level = 'risky';
    else if (reasons.length >= 1) level = 'moderate';

    return { level, reasons };
  }

  suggestImprovements(plan: AgentPlan): string[] {
    const suggestions: string[] = [];

    const hasTests = plan.steps.some((s) => s.type === 'test');
    const modifiesCode = plan.steps.some((s) =>
      s.type === 'edit' || s.type === 'create'
    );

    if (modifiesCode && !hasTests) {
      suggestions.push('Consider adding a test step to verify changes');
    }

    if (plan.steps.length > 5) {
      suggestions.push('Consider if any steps can run in parallel');
    }

    return suggestions;
  }

  private isProtectedPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return PROTECTED_PATHS.some(
      (p) => normalized === p || normalized.startsWith(p + '/')
    );
  }

  private isDangerousCommand(command: string): boolean {
    return DANGEROUS_COMMANDS.some((p) => p.test(command));
  }

  private detectCircularDependencies(steps: PlanStep[]): string[] | null {
    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, 0);
      adj.set(step.id, []);
    }

    for (const step of steps) {
      if (step.dependencies) {
        for (const dep of step.dependencies) {
          if (adj.has(dep)) {
            adj.get(dep)!.push(step.id);
            inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
          }
        }
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    let processed = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      processed++;
      for (const neighbor of adj.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (processed < steps.length) {
      // Find nodes in cycle
      return steps
        .filter((s) => (inDegree.get(s.id) || 0) > 0)
        .map((s) => s.id);
    }

    return null;
  }
}
