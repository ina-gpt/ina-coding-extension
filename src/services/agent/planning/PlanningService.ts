import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { AgentPlan, AgentConfig, DEFAULT_AGENT_CONFIG } from '../AgentTypes';
import { PlanRequest, PlanResponse, PlanEstimate, PLANNING_CONSTANTS } from './PlanningTypes';
import { PlanningPromptBuilder } from './PlanningPromptBuilder';
import { PlanParser } from './PlanParser';
import { PlanValidator } from './PlanValidator';
import { PlanEstimator } from './PlanEstimator';
import { PlanReviser } from './PlanReviser';
import { ApiService } from '../../ApiService';
import { Logger } from '../../../utils/Logger';
import { ConfigManager } from '../../../utils/ConfigManager';

export type PlanningEvent =
  | 'planGenerated'
  | 'planApproved'
  | 'planRejected'
  | 'planRevised'
  | 'planError'
  | 'planProgress';

export class PlanningService extends EventEmitter {
  private static instance: PlanningService;
  private promptBuilder: PlanningPromptBuilder;
  private parser: PlanParser;
  private validator: PlanValidator;
  private estimator: PlanEstimator;
  private reviser: PlanReviser;
  private apiService: ApiService | null = null;
  private currentPlan: AgentPlan | null = null;
  private currentRequest: PlanRequest | null = null;
  private isGenerating = false;
  private abortController: AbortController | null = null;

  private constructor() {
    super();
    this.promptBuilder = PlanningPromptBuilder.getInstance();
    this.parser = PlanParser.getInstance();
    this.validator = PlanValidator.getInstance();
    this.estimator = PlanEstimator.getInstance();
    this.reviser = PlanReviser.getInstance();
  }

  static getInstance(): PlanningService {
    if (!PlanningService.instance) {
      PlanningService.instance = new PlanningService();
    }
    return PlanningService.instance;
  }

  setApiService(api: ApiService): void {
    this.apiService = api;
  }

  async generatePlan(request: PlanRequest): Promise<PlanResponse> {
    if (this.isGenerating) {
      throw new Error('Plan generation already in progress');
    }
    if (!this.apiService) {
      throw new Error('API service not configured');
    }

    this.isGenerating = true;
    this.currentRequest = request;
    this.abortController = new AbortController();

    try {
      this.emit('planProgress', { stage: 'building_prompt', progress: 0.1 });

      // Build prompt
      const { system, user } = this.promptBuilder.buildPlanningPrompt(request);

      this.emit('planProgress', { stage: 'calling_llm', progress: 0.3 });

      // Call LLM via streaming
      const rawResponse = await this.callLLM(system, user);

      this.emit('planProgress', { stage: 'parsing', progress: 0.7 });

      // Parse response
      const planResponse = this.parser.parseResponse(rawResponse);

      // Validate
      const workspaceRoot = request.context.workspaceRoot || '';
      const validation = this.validator.validatePlan(
        planResponse.plan,
        request.agentConfig,
        workspaceRoot
      );

      if (!validation.isValid) {
        Logger.warn('Plan validation failed, attempting retry', {
          errors: validation.errors,
        });

        // One retry with validation feedback
        const retryResponse = await this.retryWithFeedback(
          request,
          rawResponse,
          validation.errors
        );
        if (retryResponse) {
          return this.finalizePlan(retryResponse, request);
        }

        // Return with warnings if retry also failed
        planResponse.warnings.push(...validation.errors);
      }

      planResponse.warnings.push(...validation.warnings);

      this.emit('planProgress', { stage: 'estimating', progress: 0.9 });

      return this.finalizePlan(planResponse, request);
    } catch (error) {
      Logger.error('Plan generation failed:', error);
      this.emit('planError', error);
      throw error;
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }

  async revisePlan(feedback: string): Promise<PlanResponse> {
    if (!this.currentPlan || !this.currentRequest) {
      throw new Error('No current plan to revise');
    }
    if (!this.apiService) {
      throw new Error('API service not configured');
    }

    this.isGenerating = true;
    this.abortController = new AbortController();

    try {
      const { system, user } = this.reviser.buildRevisionPrompt(
        this.currentPlan,
        feedback,
        this.currentRequest
      );

      const rawResponse = await this.callLLM(system, user);
      const revision = this.reviser.parseRevision(rawResponse, this.currentPlan);
      revision.feedback = feedback;

      // Validate revised plan
      const workspaceRoot = this.currentRequest.context.workspaceRoot || '';
      const validation = this.reviser.validateRevision(
        revision,
        this.currentRequest.agentConfig,
        workspaceRoot
      );

      if (!validation.valid) {
        Logger.warn('Revision validation failed', { errors: validation.errors });
      }

      this.reviser.addToHistory(revision);

      const planResponse: PlanResponse = {
        plan: revision.revisedPlan,
        reasoning: this.reviser.getRevisionSummary(revision),
        alternatives: [],
        warnings: validation.valid ? [] : validation.errors,
      };

      return this.finalizePlan(planResponse, this.currentRequest);
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }

  approvePlan(): AgentPlan | null {
    if (!this.currentPlan) return null;
    this.currentPlan.approved = true;
    this.emit('planApproved', this.currentPlan);
    Logger.info('Plan approved', { steps: this.currentPlan.steps.length });
    return this.currentPlan;
  }

  rejectPlan(): void {
    if (!this.currentPlan) return;
    this.emit('planRejected', this.currentPlan);
    Logger.info('Plan rejected');
    this.currentPlan = null;
    this.currentRequest = null;
  }

  cancelGeneration(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isGenerating = false;
  }

  getCurrentPlan(): AgentPlan | null {
    return this.currentPlan;
  }

  getEstimate(): PlanEstimate | null {
    if (!this.currentPlan) return null;
    return this.estimator.estimate(this.currentPlan);
  }

  getRisk(): { level: 'safe' | 'moderate' | 'risky'; reasons: string[] } | null {
    if (!this.currentPlan) return null;
    return this.validator.assessRisk(this.currentPlan);
  }

  isActive(): boolean {
    return this.isGenerating;
  }

  getConfig(): AgentConfig {
    const settings = vscode.workspace.getConfiguration('inaCoding.agent');
    return {
      autoDetect: settings.get('autoDetect', DEFAULT_AGENT_CONFIG.autoDetect),
      autoDetectThreshold: settings.get('autoDetectThreshold', DEFAULT_AGENT_CONFIG.autoDetectThreshold),
      requireApproval: settings.get('requireApproval', DEFAULT_AGENT_CONFIG.requireApproval),
      maxFiles: settings.get('maxFiles', DEFAULT_AGENT_CONFIG.maxFiles),
      maxSteps: settings.get('maxSteps', DEFAULT_AGENT_CONFIG.maxSteps),
      allowTerminal: settings.get('allowTerminal', DEFAULT_AGENT_CONFIG.allowTerminal),
      allowDelete: settings.get('allowDelete', DEFAULT_AGENT_CONFIG.allowDelete),
      allowCreate: settings.get('allowCreate', DEFAULT_AGENT_CONFIG.allowCreate),
      rollbackOnError: settings.get('rollbackOnError', DEFAULT_AGENT_CONFIG.rollbackOnError),
    };
  }

  dispose(): void {
    this.cancelGeneration();
    this.currentPlan = null;
    this.currentRequest = null;
    this.removeAllListeners();
  }

  // ============ Private ============

  private async callLLM(system: string, user: string): Promise<string> {
    if (!this.apiService) throw new Error('API service not set');

    let fullContent = '';

    for await (const chunk of this.apiService.chatStream(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        options: {
          model: ConfigManager.getChatModel(),
          temperature: 0.2,
          maxTokens: 4096,
        },
      },
      this.abortController?.signal
    )) {
      if (typeof chunk === 'string') {
        fullContent += chunk;
      }
    }

    return fullContent;
  }

  private async retryWithFeedback(
    request: PlanRequest,
    previousResponse: string,
    errors: string[]
  ): Promise<PlanResponse | null> {
    try {
      const { system } = this.promptBuilder.buildPlanningPrompt(request);
      const retryUser = `Your previous plan had validation errors:
${errors.map((e) => `- ${e}`).join('\n')}

Previous response:
\`\`\`
${previousResponse.slice(0, 2000)}
\`\`\`

Please fix the issues and output a corrected plan. Remember: output ONLY valid JSON.`;

      const rawRetry = await this.callLLM(system, retryUser);
      const retryParsed = this.parser.parseResponse(rawRetry);

      const workspaceRoot = request.context.workspaceRoot || '';
      const retryValidation = this.validator.validatePlan(
        retryParsed.plan,
        request.agentConfig,
        workspaceRoot
      );

      if (retryValidation.isValid) {
        return retryParsed;
      }

      Logger.warn('Retry also failed validation', {
        errors: retryValidation.errors,
      });
      return null;
    } catch (error) {
      Logger.error('Plan retry failed:', error);
      return null;
    }
  }

  private finalizePlan(
    response: PlanResponse,
    request: PlanRequest
  ): PlanResponse {
    // Attach estimate
    const estimate = this.estimator.estimate(response.plan);
    response.plan.estimatedTime = estimate.estimatedDurationMs;

    // Store current plan
    this.currentPlan = response.plan;
    this.currentRequest = request;

    this.emit('planGenerated', {
      plan: response.plan,
      estimate,
      warnings: response.warnings,
    });

    this.emit('planProgress', { stage: 'complete', progress: 1.0 });

    // YOLO mode: auto-approve plan without waiting for user
    try {
      const yoloMode = vscode.workspace.getConfiguration('inaCoding.agent').get<boolean>('yoloMode', false);
      if (yoloMode) {
        Logger.info('YOLO mode: auto-approving plan');
        response.plan.approved = true;
        this.emit('planApproved', response.plan);
      }
    } catch { /* config read error — skip auto-approve */ }

    Logger.info('Plan generated', {
      steps: response.plan.steps.length,
      files: response.plan.affectedFiles.length,
      duration: this.estimator.formatDuration(estimate.estimatedDurationMs),
      complexity: estimate.complexity,
    });

    return response;
  }
}
