import {
  FIMModel,
  FIMTokens,
  FIMRequest,
  getFIMTokensForModel,
  getStopSequences,
} from './FIMTypes';
import { FIMPromptBuilder } from './FIMPromptBuilder';
import { Logger } from '../../../utils/Logger';

export interface ModelCapabilities {
  supportsFIM: boolean;
  supportsMultiFile: boolean;
  supportsRepository: boolean;
  maxContextLength: number;
  maxCompletionTokens: number;
  optimalTemperature: number;
  latencyTier: 'fast' | 'medium' | 'slow';
}

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'qwen2.5-coder:1.5b': {
    supportsFIM: true,
    supportsMultiFile: false,
    supportsRepository: false,
    maxContextLength: 8192,
    maxCompletionTokens: 512,
    optimalTemperature: 0.05,
    latencyTier: 'fast',
  },
  'qwen2.5-coder:32b': {
    supportsFIM: true,
    supportsMultiFile: true,
    supportsRepository: true,
    maxContextLength: 32768,
    maxCompletionTokens: 2048,
    optimalTemperature: 0.2,
    latencyTier: 'slow',
  },
  'qwen2.5-coder:14b': {
    supportsFIM: true,
    supportsMultiFile: true,
    supportsRepository: true,
    maxContextLength: 32768,
    maxCompletionTokens: 2048,
    optimalTemperature: 0.2,
    latencyTier: 'medium',
  },
  'qwen2.5-coder:7b': {
    supportsFIM: true,
    supportsMultiFile: true,
    supportsRepository: false,
    maxContextLength: 32768,
    maxCompletionTokens: 1024,
    optimalTemperature: 0.2,
    latencyTier: 'fast',
  },
  'deepseek-coder:33b': {
    supportsFIM: true,
    supportsMultiFile: false,
    supportsRepository: false,
    maxContextLength: 16384,
    maxCompletionTokens: 2048,
    optimalTemperature: 0.1,
    latencyTier: 'slow',
  },
  'codellama:34b': {
    supportsFIM: true,
    supportsMultiFile: false,
    supportsRepository: false,
    maxContextLength: 16384,
    maxCompletionTokens: 1024,
    optimalTemperature: 0.2,
    latencyTier: 'slow',
  },
  'starcoder2:15b': {
    supportsFIM: true,
    supportsMultiFile: true,
    supportsRepository: true,
    maxContextLength: 16384,
    maxCompletionTokens: 1024,
    optimalTemperature: 0.2,
    latencyTier: 'medium',
  },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsFIM: true,
  supportsMultiFile: false,
  supportsRepository: false,
  maxContextLength: 8192,
  maxCompletionTokens: 512,
  optimalTemperature: 0.2,
  latencyTier: 'medium',
};

export class FIMModelRouter {
  private static instance: FIMModelRouter;
  private currentModel: string;
  private promptBuilder: FIMPromptBuilder;
  private modelHealth: Map<string, { healthy: boolean; lastCheck: number; latency: number }> = new Map();
  private fallbackModels: string[] = [];

  constructor(model?: string) {
    this.currentModel = model || process.env.COMPLETION_MODEL || FIMModel.QWEN_CODER_32B;
    this.promptBuilder = FIMPromptBuilder.getInstance();
  }

  static getInstance(): FIMModelRouter {
    if (!FIMModelRouter.instance) {
      FIMModelRouter.instance = new FIMModelRouter();
    }
    return FIMModelRouter.instance;
  }

  getCapabilities(model?: string): ModelCapabilities {
    const m = model || this.currentModel;

    // Exact match
    if (MODEL_CAPABILITIES[m]) return MODEL_CAPABILITIES[m];

    // Prefix match
    for (const [key, caps] of Object.entries(MODEL_CAPABILITIES)) {
      if (m.startsWith(key.split(':')[0])) return caps;
    }

    return DEFAULT_CAPABILITIES;
  }

  selectModel(request: {
    language: string;
    contextSize: number;
    urgency: 'low' | 'medium' | 'high';
    quality: 'low' | 'medium' | 'high';
  }): string {
    // For high urgency (fast typing), prefer faster models
    if (request.urgency === 'high') {
      const fastModel = this.findModelByTier('fast');
      if (fastModel) return fastModel;
    }

    // For high quality (manual trigger), prefer larger models
    if (request.quality === 'high') {
      const slowModel = this.findModelByTier('slow');
      if (slowModel) return slowModel;
    }

    // Check context size fits
    const caps = this.getCapabilities(this.currentModel);
    if (request.contextSize > caps.maxContextLength * 0.9) {
      // Need a model with larger context
      for (const [model, modelCaps] of Object.entries(MODEL_CAPABILITIES)) {
        if (modelCaps.maxContextLength >= request.contextSize && this.isModelHealthy(model)) {
          return model;
        }
      }
    }

    return this.currentModel;
  }

  buildRequest(params: {
    prefix: string;
    suffix: string;
    language: string;
    filePath: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): FIMRequest {
    const model = params.model || this.currentModel;
    const caps = this.getCapabilities(model);

    return {
      id: `fim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prefix: params.prefix,
      suffix: params.suffix,
      language: params.language,
      filePath: params.filePath,
      model,
      maxTokens: Math.min(params.maxTokens || 128, caps.maxCompletionTokens),
      temperature: params.temperature ?? caps.optimalTemperature,
      stopSequences: getStopSequences(params.language, model),
    };
  }

  buildPrompt(request: FIMRequest): { prompt: string; stopSequences: string[] } {
    const caps = this.getCapabilities(request.model);

    if (!caps.supportsFIM) {
      return {
        prompt: this.promptBuilder.buildAlternativePrompt(request),
        stopSequences: request.stopSequences,
      };
    }

    return this.promptBuilder.buildPrompt(request);
  }

  setCurrentModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setFallbackModels(models: string[]): void {
    this.fallbackModels = models;
  }

  getFallbackModel(): string | null {
    for (const model of this.fallbackModels) {
      if (this.isModelHealthy(model)) return model;
    }
    return null;
  }

  recordModelHealth(model: string, healthy: boolean, latency: number): void {
    this.modelHealth.set(model, { healthy, lastCheck: Date.now(), latency });
  }

  isModelHealthy(model: string): boolean {
    const health = this.modelHealth.get(model);
    if (!health) return true; // Assume healthy if unknown
    if (Date.now() - health.lastCheck > 60000) return true; // Re-check after 1 minute
    return health.healthy;
  }

  getModelLatency(model: string): number {
    return this.modelHealth.get(model)?.latency || 0;
  }

  getSupportedModels(): string[] {
    return Object.keys(MODEL_CAPABILITIES);
  }

  private findModelByTier(tier: 'fast' | 'medium' | 'slow'): string | null {
    for (const [model, caps] of Object.entries(MODEL_CAPABILITIES)) {
      if (caps.latencyTier === tier && this.isModelHealthy(model)) {
        return model;
      }
    }
    return null;
  }

  /**
   * Phase 27 — User-setting-aware completion model routing.
   *
   * Reads inaCoding.completion.model setting:
   *   'fast'     → use the low-latency INA 8 Coding tier
   *   'standard' → use the high-quality INA 8 Coding tier
   *   'auto'     → use fast if available and healthy, else standard
   */
  getCompletionModel(): string {
    try {
      const vscode = require('vscode');
      const config = vscode.workspace.getConfiguration('inaCoding.completion');
      const mode: string = config.get('model', 'auto');
      const fastModel: string = config.get('fastModelName', 'qwen2.5-coder:1.5b');
      const standardModel = 'qwen2.5-coder:32b';

      switch (mode) {
        case 'fast':
          return fastModel;
        case 'standard':
          return standardModel;
        case 'auto':
        default:
          // Use fast model if it's known to be healthy
          if (this.isModelHealthy(fastModel)) {
            const health = this.modelHealth.get(fastModel);
            if (health && health.latency > 0 && health.latency < 2000) {
              return fastModel;
            }
          }
          // Check if fast model is in capabilities (i.e. we know about it)
          if (MODEL_CAPABILITIES[fastModel]) {
            return fastModel;
          }
          return standardModel;
      }
    } catch {
      // vscode not available (test env)
      return this.currentModel;
    }
  }
}
