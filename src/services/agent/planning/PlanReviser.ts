import { AgentPlan } from '../AgentTypes';
import { PlanRevision, PlanRequest } from './PlanningTypes';
import { PlanParser } from './PlanParser';
import { PlanValidator } from './PlanValidator';
import { PlanningPromptBuilder } from './PlanningPromptBuilder';
import { Logger } from '../../../utils/Logger';

export class PlanReviser {
  private static instance: PlanReviser;
  private revisionHistory: PlanRevision[] = [];

  static getInstance(): PlanReviser {
    if (!PlanReviser.instance) {
      PlanReviser.instance = new PlanReviser();
    }
    return PlanReviser.instance;
  }

  buildRevisionPrompt(
    originalPlan: AgentPlan,
    feedback: string,
    originalRequest: PlanRequest
  ): { system: string; user: string } {
    const promptBuilder = PlanningPromptBuilder.getInstance();
    const base = promptBuilder.buildPlanningPrompt(originalRequest);

    const revisionUser = `## Original Plan
\`\`\`json
${JSON.stringify(this.planToJSON(originalPlan), null, 2)}
\`\`\`

## User Feedback
${feedback}

## Instructions
Revise the plan above based on the user's feedback. Keep unchanged steps as-is. Only modify, add, or remove steps as requested. Output the complete revised plan in the same JSON format.

${base.user}`;

    return { system: base.system, user: revisionUser };
  }

  parseRevision(
    rawResponse: string,
    originalPlan: AgentPlan
  ): PlanRevision {
    const parser = PlanParser.getInstance();
    const parsed = parser.parseResponse(rawResponse);

    const revision: PlanRevision = {
      originalPlan,
      feedback: '',
      revisedPlan: parsed.plan,
    };

    return revision;
  }

  validateRevision(
    revision: PlanRevision,
    config: import('../AgentTypes').AgentConfig,
    workspaceRoot: string
  ): { valid: boolean; errors: string[] } {
    const validator = PlanValidator.getInstance();
    const validation = validator.validatePlan(
      revision.revisedPlan,
      config,
      workspaceRoot
    );

    const errors: string[] = [...validation.errors];

    // Check that revision didn't introduce empty steps
    if (revision.revisedPlan.steps.length === 0) {
      errors.push('Revised plan has no steps');
    }

    return { valid: errors.length === 0, errors };
  }

  getRevisionSummary(revision: PlanRevision): string {
    const original = revision.originalPlan;
    const revised = revision.revisedPlan;

    const addedSteps = revised.steps.filter(
      (rs) => !original.steps.some((os) => os.id === rs.id)
    );
    const removedSteps = original.steps.filter(
      (os) => !revised.steps.some((rs) => rs.id === os.id)
    );
    const modifiedSteps = revised.steps.filter((rs) => {
      const os = original.steps.find((s) => s.id === rs.id);
      return os && (os.description !== rs.description || os.type !== rs.type);
    });

    const parts: string[] = [];
    if (addedSteps.length > 0) {
      parts.push(`Added ${addedSteps.length} step(s): ${addedSteps.map((s) => s.id).join(', ')}`);
    }
    if (removedSteps.length > 0) {
      parts.push(`Removed ${removedSteps.length} step(s): ${removedSteps.map((s) => s.id).join(', ')}`);
    }
    if (modifiedSteps.length > 0) {
      parts.push(`Modified ${modifiedSteps.length} step(s): ${modifiedSteps.map((s) => s.id).join(', ')}`);
    }
    if (parts.length === 0) {
      parts.push('No changes detected');
    }

    return parts.join('\n');
  }

  addToHistory(revision: PlanRevision): void {
    this.revisionHistory.push(revision);
    if (this.revisionHistory.length > 10) {
      this.revisionHistory.shift();
    }
    Logger.debug('Plan revision recorded', {
      historySize: this.revisionHistory.length,
    });
  }

  getHistory(): PlanRevision[] {
    return [...this.revisionHistory];
  }

  clearHistory(): void {
    this.revisionHistory = [];
  }

  private planToJSON(
    plan: AgentPlan
  ): Record<string, unknown> {
    return {
      description: plan.description,
      steps: plan.steps.map((s) => ({
        id: s.id,
        type: s.type,
        filePath: s.filePath,
        description: s.description,
        status: s.status,
      })),
      affectedFiles: plan.affectedFiles,
      estimatedTime: plan.estimatedTime,
    };
  }
}
