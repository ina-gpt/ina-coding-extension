import * as vscode from 'vscode';
import { FIMResponse, getFIMTokens } from './FIMTypes';
import { FIMPostProcessor } from './FIMPostProcessor';
import { Logger } from '../../../utils/Logger';

export interface StreamToken {
  content: string;
  index: number;
  timestamp: number;
}

export interface StreamState {
  requestId: string;
  model: string;
  tokens: StreamToken[];
  fullText: string;
  isComplete: boolean;
  isCancelled: boolean;
  startTime: number;
  firstTokenTime: number | null;
  lastTokenTime: number | null;
  tokenCount: number;
  stopReason: FIMResponse['stopReason'] | null;
}

export class FIMStreamHandler implements vscode.Disposable {
  private static instance: FIMStreamHandler;
  private activeStreams: Map<string, StreamState> = new Map();
  private postProcessor: FIMPostProcessor;

  private readonly onTokenEmitter = new vscode.EventEmitter<{ requestId: string; token: StreamToken }>();
  private readonly onCompleteEmitter = new vscode.EventEmitter<{ requestId: string; response: FIMResponse }>();
  private readonly onErrorEmitter = new vscode.EventEmitter<{ requestId: string; error: Error }>();

  public readonly onToken = this.onTokenEmitter.event;
  public readonly onComplete = this.onCompleteEmitter.event;
  public readonly onError = this.onErrorEmitter.event;

  constructor() {
    this.postProcessor = FIMPostProcessor.getInstance();
  }

  static getInstance(): FIMStreamHandler {
    if (!FIMStreamHandler.instance) {
      FIMStreamHandler.instance = new FIMStreamHandler();
    }
    return FIMStreamHandler.instance;
  }

  startStream(requestId: string, model: string): StreamState {
    const state: StreamState = {
      requestId,
      model,
      tokens: [],
      fullText: '',
      isComplete: false,
      isCancelled: false,
      startTime: Date.now(),
      firstTokenTime: null,
      lastTokenTime: null,
      tokenCount: 0,
      stopReason: null,
    };

    this.activeStreams.set(requestId, state);
    return state;
  }

  handleToken(requestId: string, content: string): void {
    const state = this.activeStreams.get(requestId);
    if (!state || state.isCancelled) return;

    const now = Date.now();
    if (state.firstTokenTime === null) {
      state.firstTokenTime = now;
    }
    state.lastTokenTime = now;

    const token: StreamToken = {
      content,
      index: state.tokenCount,
      timestamp: now,
    };

    state.tokens.push(token);
    state.fullText += content;
    state.tokenCount++;

    // Check for stop sequences in accumulated text
    const tokens = getFIMTokens();
    if (state.fullText.includes(tokens.endOfText)) {
      state.fullText = state.fullText.split(tokens.endOfText)[0];
      this.completeStream(requestId, 'end_of_text');
      return;
    }

    this.onTokenEmitter.fire({ requestId, token });
  }

  completeStream(requestId: string, stopReason: FIMResponse['stopReason']): void {
    const state = this.activeStreams.get(requestId);
    if (!state) return;

    state.isComplete = true;
    state.stopReason = stopReason;

    const latency = Date.now() - state.startTime;

    const response: FIMResponse = {
      requestId,
      completion: state.fullText,
      model: state.model,
      tokens: state.tokenCount,
      latency,
      stopReason,
      rawResponse: state.fullText,
    };

    this.onCompleteEmitter.fire({ requestId, response });
    this.activeStreams.delete(requestId);
  }

  cancelStream(requestId: string): void {
    const state = this.activeStreams.get(requestId);
    if (!state) return;

    state.isCancelled = true;
    this.activeStreams.delete(requestId);
  }

  getStreamState(requestId: string): StreamState | null {
    return this.activeStreams.get(requestId) || null;
  }

  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  cancelAllStreams(): void {
    for (const [id] of this.activeStreams) {
      this.cancelStream(id);
    }
  }

  getStreamMetrics(requestId: string): {
    timeToFirstToken: number | null;
    tokensPerSecond: number;
    totalLatency: number;
    tokenCount: number;
  } | null {
    const state = this.activeStreams.get(requestId);
    if (!state) return null;

    const totalLatency = (state.lastTokenTime || Date.now()) - state.startTime;
    const timeToFirstToken = state.firstTokenTime
      ? state.firstTokenTime - state.startTime
      : null;
    const tokenDuration = state.lastTokenTime && state.firstTokenTime
      ? state.lastTokenTime - state.firstTokenTime
      : 0;
    const tokensPerSecond = tokenDuration > 0
      ? (state.tokenCount / tokenDuration) * 1000
      : 0;

    return {
      timeToFirstToken,
      tokensPerSecond,
      totalLatency,
      tokenCount: state.tokenCount,
    };
  }

  processCompletedStream(
    requestId: string,
    language: string
  ): { processed: string; metrics: ReturnType<FIMPostProcessor['assessQuality']> } | null {
    // Build response from completed data
    const state = this.activeStreams.get(requestId);
    if (!state) return null;

    const response: FIMResponse = {
      requestId,
      completion: state.fullText,
      model: state.model,
      tokens: state.tokenCount,
      latency: Date.now() - state.startTime,
      stopReason: state.stopReason || 'stop',
    };

    const result = this.postProcessor.process(response, language);
    const metrics = this.postProcessor.assessQuality(result.processed, language);

    return { processed: result.processed, metrics };
  }

  dispose(): void {
    this.cancelAllStreams();
    this.onTokenEmitter.dispose();
    this.onCompleteEmitter.dispose();
    this.onErrorEmitter.dispose();
  }
}
