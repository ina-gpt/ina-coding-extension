/**
 * Phase 30 — Context Self-Summarization
 *
 * When conversation history exceeds a token threshold, automatically
 * summarizes the middle portion to preserve key information while
 * reducing token usage. Better than truncation.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { defaultModel } from '../../config/model-registry';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ContextSummarizer {
  private get threshold(): number {
    return vscode.workspace.getConfiguration('inaCoding.context')
      .get<number>('summarizeThreshold', 4000);
  }

  private get enabled(): boolean {
    return vscode.workspace.getConfiguration('inaCoding.context')
      .get<boolean>('autoSummarize', true);
  }

  shouldSummarize(messages: ConversationMessage[]): boolean {
    if (!this.enabled) return false;
    return this.estimateTokens(messages) > this.threshold;
  }

  async summarize(
    messages: ConversationMessage[],
    apiEndpoint: string,
    headers: Record<string, string>,
  ): Promise<ConversationMessage[]> {
    const totalTokens = this.estimateTokens(messages);
    if (totalTokens <= this.threshold) return messages;

    // Keep system message and last 2 messages intact
    const systemMsg = messages.find((m) => m.role === 'system');
    const lastMessages = messages.slice(-2);
    const startIdx = systemMsg ? 1 : 0;
    const middleMessages = messages.slice(startIdx, -2);

    if (middleMessages.length <= 1) return messages;

    const historyText = middleMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'INA'}: ${m.content}`)
      .join('\n\n');

    const summarizePrompt =
      'Summarize this conversation in under 500 words. ' +
      'Keep all technical details, decisions, file names, and code changes. ' +
      'Remove only smalltalk and repetition.\n\n' +
      historyText;

    try {
      const model = vscode.workspace.getConfiguration('inaCoding.context')
        .get<string>('summarizeModel', defaultModel('general').id);

      const resp = await fetch(`${apiEndpoint}/api/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: summarizePrompt }],
          options: { model, stream: false, temperature: 0.1, maxTokens: 800 },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      const summary = data?.content || data?.message?.content || data?.data?.content || historyText.substring(0, 2000);

      const result: ConversationMessage[] = [];
      if (systemMsg) result.push(systemMsg);
      result.push({
        role: 'assistant',
        content: `[Zusammenfassung der bisherigen Konversation]\n\n${summary}`,
      });
      result.push(...lastMessages);

      const newTokens = this.estimateTokens(result);
      Logger.info(
        `[ContextSummarizer] ${totalTokens} → ${newTokens} tokens (${Math.round((1 - newTokens / totalTokens) * 100)}% reduction)`,
      );
      return result;
    } catch (err) {
      Logger.warn('[ContextSummarizer] Failed, falling back to truncation:', err);
      const fallback: ConversationMessage[] = [];
      if (systemMsg) fallback.push(systemMsg);
      fallback.push(...messages.slice(-4));
      return fallback;
    }
  }

  private estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }
}
