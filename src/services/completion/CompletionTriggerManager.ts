import * as vscode from 'vscode';
import { CompletionContext, DEFAULT_TRIGGER_CHARACTERS } from './CompletionTypes';

export class CompletionTriggerManager {
  private static instance: CompletionTriggerManager;

  private triggerCharacters: Set<string>;
  private disabledLanguages: Set<string>;
  private autoTriggerEnabled: boolean = true;
  private minLineLength: number = 1;
  private maxLineLength: number = 500;

  constructor() {
    this.triggerCharacters = new Set(DEFAULT_TRIGGER_CHARACTERS);
    this.disabledLanguages = new Set(['plaintext', 'markdown', 'json']);
  }

  static getInstance(): CompletionTriggerManager {
    if (!CompletionTriggerManager.instance) {
      CompletionTriggerManager.instance = new CompletionTriggerManager();
    }
    return CompletionTriggerManager.instance;
  }

  shouldTrigger(context: CompletionContext): { should: boolean; reason: string } {
    if (!this.autoTriggerEnabled) {
      return { should: false, reason: 'disabled' };
    }

    if (this.disabledLanguages.has(context.language)) {
      return { should: false, reason: 'language_disabled' };
    }

    const lineLength = context.cursorContext.lineContent.trim().length;

    if (lineLength < this.minLineLength) {
      return { should: false, reason: 'line_too_short' };
    }

    if (lineLength > this.maxLineLength) {
      return { should: false, reason: 'line_too_long' };
    }

    // Check if prefix has meaningful content
    const meaningfulPrefix = context.cursorContext.linePrefix.trim();
    if (!meaningfulPrefix) {
      return { should: false, reason: 'empty_context' };
    }

    // Check trigger character
    if (context.triggerCharacter && this.triggerCharacters.has(context.triggerCharacter)) {
      return { should: true, reason: 'trigger_character' };
    }

    // In comments - only trigger on explicit trigger character
    if (context.isInComment && !context.triggerCharacter) {
      return { should: false, reason: 'in_comment' };
    }

    return { should: true, reason: 'auto_trigger' };
  }

  isTriggerCharacter(char: string): boolean {
    return this.triggerCharacters.has(char);
  }

  addTriggerCharacter(char: string): void {
    this.triggerCharacters.add(char);
  }

  removeTriggerCharacter(char: string): void {
    this.triggerCharacters.delete(char);
  }

  setTriggerCharacters(chars: string[]): void {
    this.triggerCharacters = new Set(chars);
  }

  getTriggerCharacters(): string[] {
    return [...this.triggerCharacters];
  }

  disableLanguage(languageId: string): void {
    this.disabledLanguages.add(languageId);
  }

  enableLanguage(languageId: string): void {
    this.disabledLanguages.delete(languageId);
  }

  isLanguageEnabled(languageId: string): boolean {
    return !this.disabledLanguages.has(languageId);
  }

  setAutoTrigger(enabled: boolean): void {
    this.autoTriggerEnabled = enabled;
  }

  isAutoTriggerEnabled(): boolean {
    return this.autoTriggerEnabled;
  }

  getDisabledLanguages(): string[] {
    return [...this.disabledLanguages];
  }

  validateTriggerContext(document: vscode.TextDocument, position: vscode.Position): boolean {
    // Ensure cursor in valid position
    if (position.line < 0 || position.line >= document.lineCount) {
      return false;
    }

    const line = document.lineAt(position.line);
    if (position.character > line.text.length) {
      return false;
    }

    // Not in middle of word (unless after trigger char)
    if (!this.isEndOfWord(document, position) && !this.isStartOfLine(document, position)) {
      const charBefore = position.character > 0
        ? line.text[position.character - 1]
        : '';
      if (!this.triggerCharacters.has(charBefore)) {
        return false;
      }
    }

    return true;
  }

  private isEndOfWord(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    if (position.character >= line.length) return true;

    const charAfter = line[position.character];
    return /\s|[^\w]/.test(charAfter);
  }

  private isStartOfLine(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const beforeCursor = line.substring(0, position.character);
    return beforeCursor.trim().length === 0;
  }
}
