import { EventEmitter } from 'events';
import { RulesFileManager } from './RulesFileManager';
import { RulesFormatter } from './RulesFormatter';
import { RulesContext } from './RulesTypes';
import * as vscode from 'vscode';

export class RulesInjector extends EventEmitter {
  private static instance: RulesInjector;
  private rulesFileManager: RulesFileManager;
  private rulesFormatter: RulesFormatter;
  private cachedContexts: Map<string, { context: RulesContext; hash: string }> = new Map();
  private enabled: boolean = true;

  static getInstance(): RulesInjector {
    if (!RulesInjector.instance) {
      RulesInjector.instance = new RulesInjector();
    }
    return RulesInjector.instance;
  }

  private constructor() {
    super();
    this.rulesFileManager = RulesFileManager.getInstance();
    this.rulesFormatter = RulesFormatter.getInstance();
    this.enabled = vscode.workspace.getConfiguration('inaCoding.rules').get<boolean>('enabled', true);

    this.rulesFileManager.on('loaded', () => this.invalidateCache());
    this.rulesFileManager.on('changed', () => this.invalidateCache());
    this.rulesFileManager.on('deleted', () => this.invalidateCache());
  }

  injectIntoSystemPrompt(baseSystemPrompt: string, mode: 'chat' | 'completion' | 'agent' | 'inline'): string {
    if (!this.enabled) return baseSystemPrompt;

    const rules = this.rulesFileManager.getRules();
    if (!rules || !rules.isValid || rules.parsed.allRules.length === 0) return baseSystemPrompt;

    const cached = this.cachedContexts.get(mode);
    if (cached && cached.hash === rules.hash) {
      return this.appendRules(baseSystemPrompt, cached.context, mode);
    }

    const context = this.rulesFormatter.formatForContext(rules.parsed, mode);
    this.cachedContexts.set(mode, { context, hash: rules.hash });
    return this.appendRules(baseSystemPrompt, context, mode);
  }

  injectIntoUserPrompt(userMessage: string, mode: 'chat' | 'agent'): string {
    if (!this.enabled) return userMessage;

    const addReminder = vscode.workspace.getConfiguration('inaCoding.rules').get<boolean>('addReminderToPrompt', false);
    if (!addReminder) return userMessage;

    const rules = this.rulesFileManager.getRules();
    if (!rules || !rules.isValid) return userMessage;

    const hasCritical = rules.parsed.sections.some(s => s.type === 'do' || s.type === 'dont');
    if (!hasCritical) return userMessage;

    return `[Note: Follow the project rules defined in .ina-rules]\n\n${userMessage}`;
  }

  getActiveRulesContext(): RulesContext | null {
    const rules = this.rulesFileManager.getRules();
    if (!rules || !rules.isValid) return null;
    return this.rulesFormatter.formatForContext(rules.parsed, 'chat');
  }

  getRulesSummary(): string | null {
    const rules = this.rulesFileManager.getRules();
    if (!rules || !rules.isValid) return null;

    const parts: string[] = [];
    const meta = rules.parsed.metadata;
    if (meta.language) parts.push(meta.language);
    if (meta.framework) parts.push(meta.framework);
    parts.push(`${rules.parsed.allRules.length} rules`);
    parts.push(`${rules.parsed.sections.length} sections`);
    return `Rules: ${parts.join(', ')}`;
  }

  isRulesActive(): boolean {
    return this.enabled && this.rulesFileManager.getRules() !== null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.emit('rules-injection-changed', enabled);
  }

  private appendRules(basePrompt: string, context: RulesContext, mode: string): string {
    const rulesText = mode === 'chat' ? context.forChat : mode === 'completion' ? context.forCompletion : mode === 'agent' ? context.forAgent : context.forInlineEdit;
    if (!rulesText) return basePrompt;
    return `${basePrompt}\n\n${rulesText}`;
  }

  private invalidateCache(): void {
    this.cachedContexts.clear();
    this.emit('rules-injection-changed');
  }
}
