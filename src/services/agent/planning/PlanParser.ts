import { AgentPlan, AgentStep } from '../AgentTypes';
import { PlanResponse, PlanStep } from './PlanningTypes';
import { Logger } from '../../../utils/Logger';

export class PlanParser {
  private static instance: PlanParser;

  static getInstance(): PlanParser {
    if (!PlanParser.instance) {
      PlanParser.instance = new PlanParser();
    }
    return PlanParser.instance;
  }

  parseResponse(rawResponse: string): PlanResponse {
    try {
      const json = this.extractJSON(rawResponse);
      if (!json) {
        throw new Error('No valid JSON found in response');
      }

      const validation = this.validatePlanSchema(json);
      if (!validation.valid) {
        Logger.warn('Plan schema validation warnings:', validation.errors);
      }

      const raw = json as Record<string, unknown>;
      const planData = (raw.plan || raw) as Record<string, unknown>;

      const plan = this.normalizePlan(planData);
      const reasoning = (raw.reasoning as string) || '';
      const warnings = ((planData.warnings || raw.warnings) as string[]) || [];

      return { plan, reasoning, alternatives: [], warnings };
    } catch (error) {
      return this.handleParseError(error as Error, rawResponse);
    }
  }

  private extractJSON(text: string): Record<string, unknown> | null {
    // Try 1: Direct JSON parse
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed);
      }
    } catch { /* continue */ }

    // Try 2: Extract from ```json blocks
    const jsonBlock = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlock) {
      try { return JSON.parse(jsonBlock[1].trim()); } catch { /* continue */ }
    }

    // Try 3: Extract from ``` blocks
    const codeBlock = text.match(/```\s*\n?([\s\S]*?)\n?```/);
    if (codeBlock) {
      try { return JSON.parse(codeBlock[1].trim()); } catch { /* continue */ }
    }

    // Try 4: Extract from <plan> tags
    const planTag = text.match(/<plan>\s*([\s\S]*?)\s*<\/plan>/);
    if (planTag) {
      try { return JSON.parse(planTag[1].trim()); } catch { /* continue */ }
    }

    // Try 5: Find first { and last } for partial JSON recovery
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch { /* continue */ }
    }

    return null;
  }

  private validatePlanSchema(obj: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const planData = (obj.plan || obj) as Record<string, unknown>;

    if (!planData.steps && !Array.isArray(planData.steps)) {
      // Check if steps are at top level
      if (!Array.isArray(planData.steps)) {
        errors.push('Missing or invalid "steps" array');
      }
    }

    if (Array.isArray(planData.steps)) {
      for (let i = 0; i < planData.steps.length; i++) {
        const step = planData.steps[i] as Record<string, unknown>;
        if (!step.type && !step.description) {
          errors.push(`Step ${i}: missing type or description`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private normalizePlan(raw: Record<string, unknown>): AgentPlan {
    const stepsRaw = (raw.steps as unknown[]) || [];
    const steps: AgentStep[] = stepsRaw.map((s, i) =>
      this.normalizeStep(s as Record<string, unknown>, i)
    );

    const affectedFiles = (raw.affectedFiles as string[]) ||
      steps.filter((s) => s.filePath).map((s) => s.filePath);

    return {
      steps,
      description: (raw.description as string) || 'Generated plan',
      affectedFiles: [...new Set(affectedFiles)],
      estimatedTime: steps.length * 5000,
      approved: false,
    };
  }

  private normalizeStep(raw: Record<string, unknown>, index: number): PlanStep {
    const validTypes = ['create', 'edit', 'delete', 'rename', 'move', 'terminal', 'test'];
    let type = (raw.type as string) || 'edit';
    if (!validTypes.includes(type)) {
      type = this.inferStepType(raw);
    }

    const id = (raw.id as string) || `step_${index + 1}`;

    return {
      id,
      type: type as AgentStep['type'],
      filePath: (raw.filePath as string) || (raw.file as string) || '',
      description: (raw.description as string) || `Step ${index + 1}`,
      status: 'pending',
      result: null,
      error: null,
      order: index,
      dependencies: (raw.dependencies as string[]) || [],
      estimatedDuration: 5000,
      rollbackAction: (raw.rollback as string) || null,
      validation: (raw.validation as string) || null,
      inputs: {},
      outputs: {},
      risk: (raw.risk as 'low' | 'medium' | 'high') || 'low',
      details: (raw.details as string) || '',
      targetPath: (raw.targetPath as string) || null,
    };
  }

  private inferStepType(step: Record<string, unknown>): string {
    const desc = ((step.description as string) || '').toLowerCase();
    const filePath = (step.filePath as string) || '';

    if (desc.includes('create') || desc.includes('new file')) return 'create';
    if (desc.includes('delete') || desc.includes('remove file')) return 'delete';
    if (desc.includes('rename')) return 'rename';
    if (desc.includes('move')) return 'move';
    if (desc.includes('test') || desc.includes('npm test')) return 'test';
    if (desc.includes('run') || desc.includes('execute') || desc.includes('install')) return 'terminal';
    if (!filePath) return 'terminal';
    return 'edit';
  }

  handleParseError(error: Error, rawResponse: string): PlanResponse {
    Logger.error('Plan parse error:', error, { rawLength: rawResponse.length });

    return {
      plan: {
        steps: [],
        description: 'Failed to parse plan — please try again',
        affectedFiles: [],
        estimatedTime: 0,
        approved: false,
      },
      reasoning: `Parse error: ${error.message}`,
      alternatives: [],
      warnings: [
        'Failed to parse the AI response into a valid plan.',
        'The model may have produced non-JSON output.',
        `Error: ${error.message}`,
      ],
    };
  }
}
