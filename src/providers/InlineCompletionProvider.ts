import * as vscode from 'vscode';
import { CompletionDebouncer } from '../services/completion/CompletionDebouncer';
import { CompletionContextBuilder } from '../services/completion/CompletionContextBuilder';
import { CompletionTriggerManager } from '../services/completion/CompletionTriggerManager';
import { CompletionRequestManager } from '../services/completion/CompletionRequestManager';
import { CompletionCache } from '../services/completion/CompletionCache';
import { CompletionClient } from '../services/completion/CompletionClient';
import {
  CompletionConfig,
  CompletionContext,
  CompletionItem,
  CompletionMetrics,
  CompletionStatus,
  CompletionTriggerKind,
  DEFAULT_CONFIG,
} from '../services/completion/CompletionTypes';
import { FullCompletionContext } from '../services/completion/context/ContextTypes';
import { ContextAggregator } from '../services/completion/context/ContextAggregator';
import { ContextFormatter } from '../services/completion/context/ContextFormatter';
import { GhostTextController } from '../services/completion/ghosttext/GhostTextController';
import { GhostTextConfig, DEFAULT_GHOST_TEXT_CONFIG } from '../services/completion/ghosttext/GhostTextTypes';
import { QualityPipeline } from '../services/completion/quality/QualityPipeline';
import { ConfigManager } from '../utils/ConfigManager';
import { Logger } from '../utils/Logger';

export class InlineCompletionProvider
  implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
  private debouncer: CompletionDebouncer;
  private contextBuilder: CompletionContextBuilder;
  private triggerManager: CompletionTriggerManager;
  private requestManager: CompletionRequestManager;
  private cache: CompletionCache;
  private completionClient: CompletionClient;
  private config: CompletionConfig;
  private disposables: vscode.Disposable[] = [];
  private isEnabled: boolean = true;
  private lastCompletionItems: vscode.InlineCompletionItem[] = [];

  // Quality pipeline
  private qualityPipeline: QualityPipeline;
  private pendingFeedback: Map<string, { completion: CompletionItem; context: CompletionContext; shownAt: number }> = new Map();

  // Ghost text UI
  private ghostTextController: GhostTextController;

  // Advanced context
  private useFullContext: boolean = true;
  private fullContextThreshold: number = 500; // ms since last completion
  private lastCompletionTime: number = 0;
  private firstCompletionInFile: Set<string> = new Set();

  // Metrics tracking
  private totalRequests: number = 0;
  private acceptedCount: number = 0;
  private rejectedCount: number = 0;
  private cancelledCount: number = 0;
  private totalLatency: number = 0;
  private cacheHits: number = 0;

  // Context metrics
  private fastContextCount: number = 0;
  private fullContextCount: number = 0;
  private totalFastContextTime: number = 0;
  private totalFullContextTime: number = 0;

  constructor(completionClient: CompletionClient, ghostTextConfig?: Partial<GhostTextConfig>) {
    this.completionClient = completionClient;
    this.config = this.loadConfig();
    this.debouncer = new CompletionDebouncer(this.config.debounceMs);
    this.contextBuilder = CompletionContextBuilder.getInstance();
    this.triggerManager = CompletionTriggerManager.getInstance();
    this.requestManager = new CompletionRequestManager();
    this.cache = CompletionCache.getInstance();
    this.qualityPipeline = new QualityPipeline();
    this.ghostTextController = new GhostTextController(ghostTextConfig);

    this.isEnabled = this.config.enabled;

    this.triggerManager.setTriggerCharacters(this.config.triggerCharacters);
    for (const lang of this.config.disabledLanguages) {
      this.triggerManager.disableLanguage(lang);
    }
    this.cache.setTTL(this.config.cacheTTLMs);

    this.disposables.push(this.setupConfigWatcher());
    this.disposables.push(
      this.debouncer.onCancelled(() => {
        this.cancelledCount++;
      })
    );

    // Wire ghost text events
    this.disposables.push(
      this.ghostTextController.onAccept(({ item, mode, text }) => {
        this.acceptedCount++;
        Logger.debug(`Ghost text accepted (${mode}): ${text.slice(0, 50)}`);
      }),
      this.ghostTextController.onDismiss(({ reason }) => {
        this.rejectedCount++;
        Logger.debug(`Ghost text dismissed: ${reason}`);
      }),
      this.ghostTextController.onCycle((result) => {
        Logger.debug(`Ghost text cycled: ${result.previousIndex} → ${result.newIndex}/${result.totalCount}`);
      })
    );

    Logger.info('InlineCompletionProvider initialized with ghost text UI');
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | null> {
    if (!this.isEnabled) {
      return null;
    }

    // Determine trigger kind
    let triggerKind = CompletionTriggerKind.AUTOMATIC;
    let triggerCharacter: string | null = null;

    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
      triggerKind = CompletionTriggerKind.MANUAL;
    } else {
      const linePrefix = document.lineAt(position.line).text.substring(0, position.character);
      const lastChar = linePrefix.length > 0 ? linePrefix[linePrefix.length - 1] : '';
      if (this.triggerManager.isTriggerCharacter(lastChar)) {
        triggerKind = CompletionTriggerKind.TRIGGER_CHARACTER;
        triggerCharacter = lastChar;
      }
    }

    // Build basic completion context
    const completionContext = this.contextBuilder.buildContext(
      document,
      position,
      triggerKind,
      triggerCharacter
    );

    // Check trigger conditions
    const triggerResult = this.triggerManager.shouldTrigger(completionContext);
    if (!triggerResult.should && triggerKind !== CompletionTriggerKind.MANUAL) {
      Logger.debug(`Completion skipped: ${triggerResult.reason}`);
      return null;
    }

    // Check debouncer
    if (!this.debouncer.shouldTrigger(position, document) && triggerKind !== CompletionTriggerKind.MANUAL) {
      return null;
    }

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(completionContext);
      if (cached && cached.length > 0) {
        this.cacheHits++;
        Logger.debug('Completion cache hit');
        const range = new vscode.Range(position, position);
        return this.transformToVSCodeItems(cached, range);
      }
    }

    this.totalRequests++;

    // Determine context mode
    const timeSinceLastCompletion = Date.now() - this.lastCompletionTime;
    const shouldUseFull = this.shouldUseFullContext(triggerKind, timeSinceLastCompletion, document.uri.fsPath);

    // Debounce the request
    const result = await this.debouncer.debounce(async () => {
      if (token.isCancellationRequested) {
        return null;
      }

      // Gather enhanced context if applicable
      const contextStartTime = Date.now();
      if (shouldUseFull && this.useFullContext) {
        try {
          const fullContext = await this.contextBuilder.buildFullContext(document, position);
          const formatted = this.contextBuilder.formatContextForPrompt(fullContext, 'fim');
          if (typeof formatted !== 'string') {
            // Update the completion context with enhanced prefix/suffix
            completionContext.prefix = formatted.prefix;
            completionContext.suffix = formatted.suffix;
          }
          this.fullContextCount++;
          this.totalFullContextTime += Date.now() - contextStartTime;
        } catch (error) {
          Logger.debug('Full context gathering failed, using fast context:', error);
          this.fastContextCount++;
          this.totalFastContextTime += Date.now() - contextStartTime;
        }
      } else {
        this.fastContextCount++;
        this.totalFastContextTime += Date.now() - contextStartTime;
      }

      if (token.isCancellationRequested) return null;

      // Create tracked request
      const request = this.requestManager.createRequest(completionContext);

      try {
        const response = await this.completionClient.getCompletions(
          completionContext,
          request.abortController.signal
        );

        if (token.isCancellationRequested || request.abortController.signal.aborted) {
          this.requestManager.completeRequest(request.id, CompletionStatus.CANCELLED);
          return null;
        }

        if (response.items.length === 0) {
          this.requestManager.completeRequest(request.id, CompletionStatus.REJECTED);
          return null;
        }

        // Run through quality pipeline
        const qualityResult = await this.qualityPipeline.process(response.items, completionContext);
        const filteredItems = qualityResult.results;

        if (filteredItems.length === 0) {
          this.requestManager.completeRequest(request.id, CompletionStatus.REJECTED);
          return null;
        }

        // Track for feedback
        for (const item of filteredItems) {
          this.pendingFeedback.set(item.id, {
            completion: item,
            context: completionContext,
            shownAt: Date.now(),
          });
        }

        // Cache results
        if (this.config.cacheEnabled) {
          this.cache.set(completionContext, filteredItems);
        }

        this.totalLatency += response.timing.total;
        this.requestManager.completeRequest(request.id, CompletionStatus.DISPLAYING);

        return filteredItems;
      } catch (error) {
        Logger.error('Completion request failed:', error);
        this.requestManager.completeRequest(request.id, CompletionStatus.CANCELLED);
        return null;
      }
    });

    if (!result || result.length === 0) {
      return null;
    }

    const range = new vscode.Range(position, position);
    const items = this.transformToVSCodeItems(result, range);
    this.lastCompletionItems = items;
    this.lastCompletionTime = Date.now();
    this.debouncer.recordCompletion(position);

    // Mark file as having had a completion
    this.firstCompletionInFile.add(document.uri.fsPath);

    // Show via ghost text controller for enhanced UI
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document) {
      this.ghostTextController.showCompletions(editor, result, position);
    }

    vscode.commands.executeCommand('setContext', 'inaCoding.completionVisible', true);

    return new vscode.InlineCompletionList(items);
  }

  shouldUseFullContext(
    triggerKind: CompletionTriggerKind,
    timeSinceLastCompletion: number,
    filePath: string
  ): boolean {
    // Manual trigger → full context
    if (triggerKind === CompletionTriggerKind.MANUAL) return true;

    // First completion in file → full context
    if (!this.firstCompletionInFile.has(filePath)) return true;

    // Enough time since last completion → full context
    if (timeSinceLastCompletion > this.fullContextThreshold) return true;

    // Otherwise → fast context
    return false;
  }

  private transformToVSCodeItems(
    items: CompletionItem[],
    range: vscode.Range
  ): vscode.InlineCompletionItem[] {
    return items
      .slice(0, this.config.maxCompletions)
      .map((item) => {
        const inlineItem = new vscode.InlineCompletionItem(item.insertText, range);
        inlineItem.filterText = item.filterText;
        inlineItem.command = {
          command: 'inaCoding.completionAccepted',
          title: 'Completion Accepted',
          arguments: [item],
        };
        return inlineItem;
      });
  }

  handleCompletionAccepted(item: CompletionItem): void {
    this.acceptedCount++;
    Logger.debug(`Completion accepted: ${item.id} (${item.source}, ${item.latency}ms)`);

    // Record feedback for quality learning
    const pending = this.pendingFeedback.get(item.id);
    if (pending) {
      this.qualityPipeline.recordFeedback(pending.completion, pending.context, true);
      this.pendingFeedback.delete(item.id);
    }
  }

  handleCompletionRejected(requestId: string): void {
    this.rejectedCount++;

    // Record rejection feedback
    const pending = this.pendingFeedback.get(requestId);
    if (pending) {
      this.qualityPipeline.recordFeedback(pending.completion, pending.context, false);
      this.pendingFeedback.delete(requestId);
    }
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    vscode.commands.executeCommand('setContext', 'inaCoding.completionEnabled', enabled);
  }

  isProviderEnabled(): boolean {
    return this.isEnabled;
  }

  updateConfig(config: Partial<CompletionConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.debounceMs !== undefined) {
      this.debouncer.setDebounceMs(config.debounceMs);
    }
    if (config.triggerCharacters) {
      this.triggerManager.setTriggerCharacters(config.triggerCharacters);
    }
    if (config.disabledLanguages) {
      for (const lang of config.disabledLanguages) {
        this.triggerManager.disableLanguage(lang);
      }
    }
    if (config.cacheTTLMs !== undefined) {
      this.cache.setTTL(config.cacheTTLMs);
    }
  }

  getMetrics(): CompletionMetrics & {
    fastContextCount: number;
    fullContextCount: number;
    avgFastTime: number;
    avgFullTime: number;
  } {
    const total = this.totalRequests;
    return {
      totalRequests: total,
      acceptedCount: this.acceptedCount,
      rejectedCount: this.rejectedCount,
      cancelledCount: this.cancelledCount,
      averageLatency: total > 0 ? this.totalLatency / total : 0,
      cacheHitRate: total > 0 ? this.cacheHits / total : 0,
      acceptanceRate: total > 0 ? this.acceptedCount / total : 0,
      fastContextCount: this.fastContextCount,
      fullContextCount: this.fullContextCount,
      avgFastTime: this.fastContextCount > 0 ? this.totalFastContextTime / this.fastContextCount : 0,
      avgFullTime: this.fullContextCount > 0 ? this.totalFullContextTime / this.fullContextCount : 0,
    };
  }

  getContextStats(): {
    fastContextCount: number;
    fullContextCount: number;
    avgFastTime: number;
    avgFullTime: number;
  } {
    return {
      fastContextCount: this.fastContextCount,
      fullContextCount: this.fullContextCount,
      avgFastTime: this.fastContextCount > 0 ? this.totalFastContextTime / this.fastContextCount : 0,
      avgFullTime: this.fullContextCount > 0 ? this.totalFullContextTime / this.fullContextCount : 0,
    };
  }

  getGhostTextController(): GhostTextController {
    return this.ghostTextController;
  }

  clearCache(): void {
    this.cache.clear();
    this.contextBuilder.invalidateContextCache();
  }

  private loadConfig(): CompletionConfig {
    const settings = ConfigManager.getCompletion();
    return {
      enabled: settings.enabled ?? DEFAULT_CONFIG.enabled,
      debounceMs: settings.delay ?? DEFAULT_CONFIG.debounceMs,
      maxCompletions: DEFAULT_CONFIG.maxCompletions,
      minConfidence: DEFAULT_CONFIG.minConfidence,
      maxTokens: settings.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      triggerCharacters: DEFAULT_CONFIG.triggerCharacters,
      disabledLanguages: settings.disabledLanguages ?? DEFAULT_CONFIG.disabledLanguages,
      cacheEnabled: DEFAULT_CONFIG.cacheEnabled,
      cacheTTLMs: DEFAULT_CONFIG.cacheTTLMs,
    };
  }

  private setupConfigWatcher(): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('inaCoding.completion')) {
        const newConfig = this.loadConfig();
        this.updateConfig(newConfig);
        this.isEnabled = newConfig.enabled;
        Logger.info('Completion config updated');
      }
    });
  }

  dispose(): void {
    this.debouncer.dispose();
    this.requestManager.dispose();
    this.cache.dispose();
    this.completionClient.dispose();
    this.contextBuilder.dispose();
    this.qualityPipeline.dispose();
    this.ghostTextController.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
