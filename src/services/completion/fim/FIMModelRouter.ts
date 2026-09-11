import { FIMRequest, getStopSequences } from './FIMTypes';
import {
  InaModel,
  ModelTier,
  defaultModel,
  getModel,
  modelsByCapability,
} from '../../../config/model-registry';
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

/**
 * Per-tier completion behaviour, keyed by TIER rather than by model.
 *
 * This replaces a table keyed by seven upstream model ids — four of which named
 * families this product has never served. Tier is the property the routing
 * decision actually turns on: "prefer something fast" and "prefer something
 * strong" are the only two questions `selectModel` ever asks, and neither of
 * them needs a model name to answer.
 *
 * Context length comes from the registry per model, not from here, so there is
 * exactly one place a context window is stated.
 */
const TIER_BEHAVIOUR: { readonly [K in ModelTier]: Omit<ModelCapabilities, 'supportsFIM' | 'maxContextLength'> } = {
  fast: {
    supportsMultiFile: false,
    supportsRepository: false,
    maxCompletionTokens: 512,
    optimalTemperature: 0.05,
    latencyTier: 'fast',
  },
  standard: {
    supportsMultiFile: true,
    supportsRepository: false,
    maxCompletionTokens: 1024,
    optimalTemperature: 0.2,
    latencyTier: 'medium',
  },
  pro: {
    supportsMultiFile: true,
    supportsRepository: true,
    maxCompletionTokens: 2048,
    optimalTemperature: 0.2,
    latencyTier: 'slow',
  },
};

function capabilitiesOf(m: InaModel): ModelCapabilities {
  return {
    supportsFIM: m.supportsFim,
    maxContextLength: m.contextWindow,
    ...TIER_BEHAVIOUR[m.tier],
  };
}

/** The coding models, in registry order — the routable set for completion. */
const ROUTABLE: readonly InaModel[] = modelsByCapability('coding');

/**
 * Capabilities assumed for an id the registry does not know.
 *
 * supportsFIM is FALSE, and that is the fail-closed direction. Assuming FIM and
 * being wrong does not produce an error: a model without fill-in-the-middle
 * ignores the sentinel markers and answers in prose, which then gets inserted
 * into the user's buffer as if it were code. Assuming no FIM and being wrong
 * only costs a slightly less efficient prompt.
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsFIM: false,
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
    this.currentModel = model || defaultModel('coding').id;
    this.promptBuilder = FIMPromptBuilder.getInstance();
  }

  static getInstance(): FIMModelRouter {
    if (!FIMModelRouter.instance) {
      FIMModelRouter.instance = new FIMModelRouter();
    }
    return FIMModelRouter.instance;
  }

  getCapabilities(model?: string): ModelCapabilities {
    // No prefix matching. The old version fell back to `m.startsWith(family)`,
    // which quietly gave one model another model's limits whenever a new size
    // of the same family appeared. An id is either in the registry or it is not.
    const m = getModel(model || this.currentModel);
    return m ? capabilitiesOf(m) : DEFAULT_CAPABILITIES;
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
      for (const m of ROUTABLE) {
        if (m.contextWindow >= request.contextSize && this.isModelHealthy(m.id)) {
          return m.id;
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
      stopSequences: getStopSequences(params.language),
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
    return ROUTABLE.map((m) => m.id);
  }

  private findModelByTier(tier: 'fast' | 'medium' | 'slow'): string | null {
    for (const m of ROUTABLE) {
      if (TIER_BEHAVIOUR[m.tier].latencyTier === tier && this.isModelHealthy(m.id)) {
        return m.id;
      }
    }
    return null;
  }

  /**
   * Phase 27 — User-setting-aware completion model routing.
   *
   * Reads `inaCoding.completion.model`:
   *   'fast'     → the fast coding tier
   *   'standard' → the pro coding tier
   *   'auto'     → fast when it is healthy and responding quickly, else pro
   *
   * `inaCoding.completion.fastModelName` is still honoured, but its value is
   * now resolved through the registry: the setting used to default to a raw
   * upstream id, which the packaged manifest published and which was sent to
   * the server verbatim.
   */
  getCompletionModel(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const vscode = require('vscode');
      const config = vscode.workspace.getConfiguration('inaCoding.completion');
      const mode: string = config.get('model', 'auto');

      const fastDefault = ROUTABLE.find((m) => m.tier === 'fast') ?? defaultModel('coding');
      const configured: string = config.get('fastModelName', fastDefault.id);
      const fastModel = getModel(configured) ? configured : fastDefault.id;
      const standardModel = defaultModel('coding').id;

      switch (mode) {
        case 'fast':
          return fastModel;
        case 'standard':
          return standardModel;
        case 'auto':
        default:
          if (this.isModelHealthy(fastModel)) {
            const health = this.modelHealth.get(fastModel);
            if (health && health.latency > 0 && health.latency < 2000) {
              return fastModel;
            }
          }
          // Only route to the fast model if the registry actually knows it.
          return getModel(fastModel) ? fastModel : standardModel;
      }
    } catch {
      // vscode not available (test env)
      return this.currentModel;
    }
  }
}
