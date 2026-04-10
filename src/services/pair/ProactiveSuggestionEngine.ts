/**
 * ProactiveSuggestionEngine.ts — Phase 20 Step 20.1
 * Proactive coding suggestions based on developer behavior
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { DeveloperState, ProactiveSuggestion, SuggestionType, PairConfig, DEFAULT_PAIR_CONFIG, PairMode } from './PairTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class ProactiveSuggestionEngine {
  private static _instance: ProactiveSuggestionEngine;
  private config: PairConfig;
  private suggestions: ProactiveSuggestion[] = [];
  private lastSuggestionTime = 0;
  private suggestionCountThisHour = 0;
  private hourReset = Date.now();
  private listeners: Array<(suggestion: ProactiveSuggestion) => void> = [];
  private apiEndpoint: string;

  private constructor() {
    this.config = { ...DEFAULT_PAIR_CONFIG };
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
  }

  static getInstance(): ProactiveSuggestionEngine {
    if (!ProactiveSuggestionEngine._instance) ProactiveSuggestionEngine._instance = new ProactiveSuggestionEngine();
    return ProactiveSuggestionEngine._instance;
  }

  onSuggestion(listener: (suggestion: ProactiveSuggestion) => void): () => void {
    this.listeners.push(listener);
    return () => { const i = this.listeners.indexOf(listener); if (i >= 0) this.listeners.splice(i, 1); };
  }

  processState(state: DeveloperState): void {
    const mode = ConfigManager.get<string>('pair.mode', 'active') as PairMode;
    if (mode === PairMode.OFF) return;

    // Reset hourly counter
    if (Date.now() - this.hourReset > 3600000) {
      this.suggestionCountThisHour = 0;
      this.hourReset = Date.now();
    }

    // Rate limit
    if (this.suggestionCountThisHour >= this.config.maxSuggestionsPerHour) return;
    if (Date.now() - this.lastSuggestionTime < this.config.suggestionCooldownMs) return;

    // Don't interrupt deep focus
    if (state.focusScore > 80) return;

    // Run detectors
    if (mode === PairMode.ACTIVE || mode === PairMode.QUIET) {
      this.detectStuck(state);
      if (mode === PairMode.ACTIVE) {
        this.detectBugPrevention(state);
        this.detectRefactorOpportunity(state);
        this.detectDocumentation(state);
      }
    }
  }

  getSuggestions(): ProactiveSuggestion[] {
    // Clean expired
    const now = Date.now();
    this.suggestions = this.suggestions.filter(s => now - s.timestamp < s.expiresAfterMs);
    return this.suggestions;
  }

  dismissSuggestion(id: string): void {
    this.suggestions = this.suggestions.filter(s => s.id !== id);
  }

  private detectStuck(state: DeveloperState): void {
    if (!this.config.enableFrustrationDetection) return;
    if (state.frustrationScore < 60) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const file = vscode.workspace.asRelativePath(editor.document.uri);
    const line = editor.selection.active.line;

    this.emit({
      type: 'hint',
      title: 'Need help?',
      message: `It looks like you might be stuck on ${file}:${line + 1}. Would you like INA-7 Pro to analyze this section?`,
      confidence: Math.min(95, state.frustrationScore + 10),
      priority: state.frustrationScore > 80 ? 'high' : 'medium',
      file, line: line + 1,
      expiresAfterMs: 120000,
    });
  }

  private detectBugPrevention(state: DeveloperState): void {
    if (!this.config.enableCodeSmellDetection) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(doc.languageId)) return;

    const line = editor.selection.active.line;
    const lineText = doc.lineAt(line).text;

    // Missing await
    if (/\b(?:const|let|var)\s+\w+\s*=\s*\w+\([^)]*\)/.test(lineText) && !lineText.includes('await')) {
      const fnName = lineText.match(/=\s*(\w+)\(/)?.[1];
      if (fnName) {
        // Check if the function is async by looking at surrounding code
        const fullText = doc.getText();
        const asyncPattern = new RegExp(`async\\s+(?:function\\s+)?${fnName}\\b|${fnName}\\s*=\\s*async`);
        if (asyncPattern.test(fullText)) {
          this.emit({
            type: 'warning',
            title: 'Missing await',
            message: `\`${fnName}()\` is async but called without \`await\`. This will return a Promise instead of the resolved value.`,
            codeAction: lineText.replace(`= ${fnName}(`, `= await ${fnName}(`),
            confidence: 85,
            priority: 'high',
            file: vscode.workspace.asRelativePath(doc.uri),
            line: line + 1,
            expiresAfterMs: 60000,
          });
        }
      }
    }

    // Empty catch block
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(lineText) || (lineText.trim() === '}' && line > 0 && /catch/.test(doc.lineAt(line - 1).text) && lineText.trim() === '}')) {
      this.emit({
        type: 'warning',
        title: 'Empty catch block',
        message: 'Silently swallowing errors makes debugging difficult. Log the error or rethrow it.',
        confidence: 90,
        priority: 'medium',
        file: vscode.workspace.asRelativePath(doc.uri),
        line: line + 1,
        expiresAfterMs: 120000,
      });
    }

    // console.log detection
    if (/console\.log\(/.test(lineText) && !lineText.includes('//')) {
      this.emit({
        type: 'hint',
        title: 'Console.log detected',
        message: 'Consider using a proper logger or removing this before committing.',
        confidence: 75,
        priority: 'low',
        file: vscode.workspace.asRelativePath(doc.uri),
        line: line + 1,
        expiresAfterMs: 300000,
      });
    }
  }

  private detectRefactorOpportunity(state: DeveloperState): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;

    // Long function detection
    const line = editor.selection.active.line;
    let depth = 0, funcStart = -1;
    for (let i = line; i >= Math.max(0, line - 100); i--) {
      const text = doc.lineAt(i).text;
      for (const ch of text) {
        if (ch === '}') depth++;
        if (ch === '{') depth--;
      }
      if (depth < 0 && /function|=>|class/.test(text)) {
        funcStart = i;
        break;
      }
    }

    if (funcStart >= 0 && line - funcStart > 50) {
      this.emit({
        type: 'refactor',
        title: 'Long function detected',
        message: `This function is ${line - funcStart}+ lines long. Consider extracting some logic into smaller helper functions.`,
        confidence: 70,
        priority: 'low',
        file: vscode.workspace.asRelativePath(doc.uri),
        line: funcStart + 1,
        expiresAfterMs: 300000,
      });
    }
  }

  private detectDocumentation(state: DeveloperState): void {
    if (!this.config.enableDocSuggestion) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const line = editor.selection.active.line;
    const lineText = doc.lineAt(line).text;

    // Function without JSDoc
    if (/export\s+(?:async\s+)?function\s+\w+/.test(lineText) || /export\s+(?:const|let)\s+\w+\s*=/.test(lineText)) {
      const prevLine = line > 0 ? doc.lineAt(line - 1).text.trim() : '';
      if (!prevLine.startsWith('/**') && !prevLine.startsWith('//') && !prevLine.startsWith('*')) {
        this.emit({
          type: 'documentation',
          title: 'Missing documentation',
          message: 'This exported function has no JSDoc comment. Adding documentation helps team members understand the API.',
          confidence: 65,
          priority: 'low',
          file: vscode.workspace.asRelativePath(doc.uri),
          line: line + 1,
          expiresAfterMs: 600000,
        });
      }
    }
  }

  private emit(partial: Omit<ProactiveSuggestion, 'id' | 'dismissable' | 'timestamp'>): void {
    if (partial.confidence < this.config.minConfidence) return;

    const suggestion: ProactiveSuggestion = {
      ...partial,
      id: crypto.randomBytes(8).toString('hex'),
      dismissable: true,
      timestamp: Date.now(),
    };

    this.suggestions.push(suggestion);
    this.lastSuggestionTime = Date.now();
    this.suggestionCountThisHour++;

    for (const listener of this.listeners) {
      try { listener(suggestion); } catch { /* */ }
    }
  }
}
