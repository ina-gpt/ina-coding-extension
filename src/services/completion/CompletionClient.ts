import * as vscode from 'vscode';
import { ApiService } from '../ApiService';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import {
  CompletionContext,
  CompletionItem,
  CompletionResponse,
} from './CompletionTypes';
import { FIMModelRouter } from './fim/FIMModelRouter';
import { FIMPostProcessor } from './fim/FIMPostProcessor';
import { RequestScheduler } from '../requestopt/RequestScheduler';
import { RequestCategory } from '../requestopt/RequestOptTypes';
import { CodeSecurityGate } from '../codesec/CodeSecurityGate';

export class CompletionClient implements vscode.Disposable {
  private apiService: ApiService;
  private timeout: number = 10000;
  private retryCount: number = 1;
  private modelRouter: FIMModelRouter;
  private postProcessor: FIMPostProcessor;

  private readonly onCompletionEmitter = new vscode.EventEmitter<CompletionResponse>();
  private readonly onErrorEmitter = new vscode.EventEmitter<Error>();
  public readonly onCompletion = this.onCompletionEmitter.event;
  public readonly onError = this.onErrorEmitter.event;

  constructor(apiService: ApiService) {
    this.apiService = apiService;
    this.modelRouter = FIMModelRouter.getInstance();
    this.postProcessor = FIMPostProcessor.getInstance();
  }

  async getCompletions(
    context: CompletionContext,
    abortSignal: AbortSignal
  ): Promise<CompletionResponse> {
    const startTime = Date.now();
    const requestId = `cr-${Date.now()}`;
    const payload = this.buildRequestPayload(context);

    // Security: scan outgoing code before sending to API
    try {
      const gate = CodeSecurityGate.getInstance();
      const prefixScan = gate.scanOutgoingCode(payload.prefix, payload.filePath || null, 'completion');
      if (prefixScan.blocked) {
        return this.emptyResponse(requestId, startTime);
      }
      payload.prefix = prefixScan.sanitizedCode;
    } catch {
      // Security gate not available, continue with original payload
    }

    try {
      // Phase 27 — Fast completion model routing
      const completionModel = this.modelRouter.getCompletionModel();

      const response = await this.apiService.complete({
        prefix: payload.prefix,
        suffix: payload.suffix,
        language: payload.language,
        filename: payload.filePath,
        options: {
          maxTokens: payload.options.maxTokens,
          model: completionModel,
        },
      });

      if (abortSignal.aborted) {
        return this.emptyResponse(requestId, startTime);
      }

      if (!response.success || !response.data?.completion) {
        return this.emptyResponse(requestId, startTime);
      }

      const modelTime = (response.data as Record<string, unknown>).duration as number || 0;
      const totalTime = Date.now() - startTime;

      const completionText = response.data.completion as string;
      if (!completionText.trim()) {
        return this.emptyResponse(requestId, startTime);
      }

      // Assess quality using FIM post-processor
      const quality = this.postProcessor.assessQuality(completionText, context.language);

      const item: CompletionItem = {
        id: `ci-${Date.now()}`,
        insertText: completionText,
        displayText: completionText,
        range: new vscode.Range(context.position, context.position),
        filterText: completionText.split('\n')[0],
        sortText: '0',
        documentation: null,
        confidence: quality.confidence,
        source: 'model',
        tokens: Math.ceil(completionText.length / 4),
        latency: totalTime,
      };

      const completionResponse: CompletionResponse = {
        requestId,
        items: [item],
        isIncomplete: false,
        timing: {
          total: totalTime,
          model: modelTime,
          processing: totalTime - modelTime,
        },
        cached: false,
        model: ConfigManager.getCompletionModel(),
      };

      this.onCompletionEmitter.fire(completionResponse);
      return completionResponse;
    } catch (error) {
      if (abortSignal.aborted) {
        return this.emptyResponse(requestId, startTime);
      }
      return this.handleApiError(error as Error, requestId, startTime);
    }
  }

  async getCompletionStream(
    context: CompletionContext,
    abortSignal: AbortSignal,
    onToken: (token: string) => void
  ): Promise<CompletionResponse> {
    // For now, delegate to non-streaming version
    // Streaming can be implemented when the backend SSE endpoint is ready
    return this.getCompletions(context, abortSignal);
  }

  private buildRequestPayload(context: CompletionContext): {
    prefix: string;
    suffix: string;
    language: string;
    filePath: string;
    position: { line: number; column: number };
    triggerKind: string;
    triggerCharacter: string | null;
    options: { maxTokens: number; temperature: number; n: number };
  } {
    const settings = ConfigManager.getCompletion();

    return {
      prefix: context.prefix,
      suffix: context.suffix,
      language: context.language,
      filePath: context.filePath,
      position: {
        line: context.lineNumber,
        column: context.columnNumber,
      },
      triggerKind: context.triggerKind,
      triggerCharacter: context.triggerCharacter,
      options: {
        maxTokens: settings.maxTokens || 128,
        temperature: settings.temperature || 0.2,
        n: 1,
      },
    };
  }

  private emptyResponse(requestId: string, startTime: number): CompletionResponse {
    return {
      requestId,
      items: [],
      isIncomplete: false,
      timing: { total: Date.now() - startTime, model: 0, processing: 0 },
      cached: false,
      model: '',
    };
  }

  private handleApiError(
    error: Error,
    requestId: string,
    startTime: number
  ): CompletionResponse {
    Logger.error('Completion API error:', error);
    this.onErrorEmitter.fire(error);
    return this.emptyResponse(requestId, startTime);
  }

  cancelAll(): void {
    // Cancel any pending completions in the scheduler
    RequestScheduler.getInstance().cancelByCategory(RequestCategory.COMPLETION);
  }

  getEndpoint(): string {
    return `${ConfigManager.getApiEndpoint()}/api/complete`;
  }

  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  setRetryCount(count: number): void {
    this.retryCount = count;
  }

  dispose(): void {
    this.onCompletionEmitter.dispose();
    this.onErrorEmitter.dispose();
  }
}
