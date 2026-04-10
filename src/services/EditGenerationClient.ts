/**
 * Edit Generation Client
 *
 * Client for calling edit generation API from the extension.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

// ============ Types ============

export interface EditRequest {
  sessionId: string;
  selection: { content: string; startLine: number; endLine: number; startColumn: number; endColumn: number };
  context: { filePath: string; language: string; surroundingBefore: string; surroundingAfter: string; imports?: string[]; symbols?: string[]; indentation?: string };
  prompt: string;
  options?: Partial<{ model: string; temperature: number; maxTokens: number; streamResponse: boolean }>;
}

export interface EditResponse {
  sessionId: string;
  originalContent: string;
  generatedContent: string;
  explanation: string | null;
  confidence: number;
  tokens: { prompt: number; completion: number };
  timing: { total: number; firstToken: number; generation: number };
}

export interface StreamChunk {
  type: 'start' | 'token' | 'code_start' | 'code_content' | 'code_end' | 'explanation' | 'done' | 'error';
  content: string;
  index: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onCodeStart?: (language: string) => void;
  onCodeContent?: (content: string) => void;
  onCodeEnd?: () => void;
  onExplanation?: (text: string) => void;
  onProgress?: (progress: number) => void;
  onComplete?: (response: EditResponse) => void;
  onError?: (error: Error) => void;
}

// ============ Edit Generation Client ============

export class EditGenerationClient {
  private activeStreams: Map<string, AbortController> = new Map();
  private apiEndpoint: string;

  constructor() {
    this.apiEndpoint = ConfigManager.getApiEndpoint();
  }

  // ============ Non-Streaming ============

  async generateEdit(request: EditRequest): Promise<EditResponse> {
    const response = await fetch(`${this.apiEndpoint}/edit/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(err.error || `Generation failed: ${response.status}`);
    }

    return response.json();
  }

  // ============ Streaming ============

  async generateEditStream(request: EditRequest, callbacks: StreamCallbacks): Promise<EditResponse> {
    const controller = new AbortController();
    this.activeStreams.set(request.sessionId, controller);

    let finalResponse: EditResponse | null = null;

    try {
      const response = await fetch(`${this.apiEndpoint}/edit/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let tokenCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          const chunk = this.parseSSEEvent(eventBlock);
          if (!chunk) continue;

          tokenCount++;

          switch (chunk.type) {
            case 'start': callbacks.onStart?.(); break;
            case 'token': callbacks.onToken?.(chunk.content); break;
            case 'code_start': callbacks.onCodeStart?.(chunk.metadata?.language || ''); break;
            case 'code_content': callbacks.onCodeContent?.(chunk.content); break;
            case 'code_end': callbacks.onCodeEnd?.(); break;
            case 'explanation': callbacks.onExplanation?.(chunk.content); break;
            case 'done':
              if (chunk.metadata?.response) {
                finalResponse = chunk.metadata.response;
              }
              callbacks.onComplete?.(finalResponse!);
              break;
            case 'error':
              callbacks.onError?.(new Error(chunk.content));
              break;
          }

          callbacks.onProgress?.(tokenCount);
        }
      }

      if (!finalResponse) {
        throw new Error('No final response received');
      }

      return finalResponse;

    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        Logger.error(`Stream generation error for ${request.sessionId}:`, error);
        callbacks.onError?.(error as Error);
      }
      throw error;
    } finally {
      this.activeStreams.delete(request.sessionId);
    }
  }

  // ============ Control ============

  async cancelGeneration(sessionId: string): Promise<void> {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(sessionId);
    }

    try {
      await fetch(`${this.apiEndpoint}/edit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch { /* ignore cancel errors */ }
  }

  isGenerating(sessionId: string): boolean {
    return this.activeStreams.has(sessionId);
  }

  // ============ Helpers ============

  private parseSSEEvent(eventBlock: string): StreamChunk | null {
    const lines = eventBlock.split('\n');
    let type = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) type = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }

    if (!type || !data) return null;

    try {
      const parsed = JSON.parse(data);
      return { type: type as StreamChunk['type'], content: parsed.content || '', index: parsed.index || 0, timestamp: parsed.timestamp || Date.now(), metadata: parsed.metadata || parsed };
    } catch {
      return null;
    }
  }
}
