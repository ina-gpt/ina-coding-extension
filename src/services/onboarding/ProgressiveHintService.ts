/**
 * Phase 11.2 — Progressive Hint Service
 * Shows contextual feature discovery hints over time based on user behavior.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ProgressiveHint, HintTrigger } from './OnboardingTypes';
import { OnboardingManager } from './OnboardingManager';

export class ProgressiveHintService extends EventEmitter {
  private static instance: ProgressiveHintService;
  private hints: ProgressiveHint[] = [];
  private showCounts = new Map<string, number>();
  private lastShowTime = new Map<string, number>();
  private cooldownMs = 300000; // 5 min between hints

  static getInstance(): ProgressiveHintService {
    if (!ProgressiveHintService.instance) {
      ProgressiveHintService.instance = new ProgressiveHintService();
    }
    return ProgressiveHintService.instance;
  }

  private constructor() {
    super();
  }

  initialize(): void {
    this.registerBuiltInHints();
    Logger.info(`[Hints] Initialized with ${this.hints.length} hints`);
  }

  setCooldown(ms: number): void {
    this.cooldownMs = ms;
  }

  private registerBuiltInHints(): void {
    this.hints = [
      {
        id: 'try-at-mentions', feature: 'mentions',
        trigger: HintTrigger.AFTER_N_USES, message: '💡 Tip: Type @ to reference files, symbols, and more in your messages',
        actionLabel: 'Learn more', actionCommand: 'inaCoding.startTour:chat-features',
        showAfterUses: 3, maxShows: 2, priority: 10,
      },
      {
        id: 'try-inline-edit', feature: 'inline-edit',
        trigger: HintTrigger.CONTEXT, message: '💡 Press Cmd+K to edit selected code with AI',
        actionLabel: 'Try it', actionCommand: 'inaCoding.inlineEdit',
        showAfterUses: 5, maxShows: 3, priority: 9,
      },
      {
        id: 'try-agent-mode', feature: 'agent',
        trigger: HintTrigger.CONTEXT, message: '💡 This sounds like a multi-file change. Try Agent mode (Cmd+Shift+K) for automated execution',
        actionLabel: 'Enable Agent', actionCommand: 'inaCoding.enableAgentMode',
        showAfterUses: 0, maxShows: 2, priority: 8,
      },
      {
        id: 'try-project-rules', feature: 'rules',
        trigger: HintTrigger.TIME_BASED, message: '💡 Set up project rules to customize AI behavior for this project → Cmd+Shift+R',
        actionLabel: 'Create rules', actionCommand: 'inaCoding.rules.create',
        showAfterUses: 0, maxShows: 1, priority: 7,
      },
      {
        id: 'try-shortcuts', feature: 'shortcuts',
        trigger: HintTrigger.IDLE, message: '💡 Press Cmd+/ to see all keyboard shortcuts',
        actionLabel: 'Show shortcuts', actionCommand: 'inaCoding.showShortcuts',
        showAfterUses: 0, maxShows: 1, priority: 5,
      },
      {
        id: 'try-image-paste', feature: 'vision',
        trigger: HintTrigger.ERROR, message: '💡 You can paste a screenshot (Cmd+V) to show the issue visually',
        actionLabel: null, actionCommand: null,
        showAfterUses: 0, maxShows: 2, priority: 6,
      },
      {
        id: 'remember-feature', feature: 'memory',
        trigger: HintTrigger.CONTEXT, message: '💡 Type "Remember that..." to save facts for future conversations',
        actionLabel: null, actionCommand: null,
        showAfterUses: 0, maxShows: 2, priority: 4,
      },
      {
        id: 'try-git-mention', feature: 'git',
        trigger: HintTrigger.CONTEXT, message: '💡 Use @git:diff or @git:log to include git context in your question',
        actionLabel: null, actionCommand: null,
        showAfterUses: 0, maxShows: 2, priority: 3,
      },
      {
        id: 'try-doc-search', feature: 'docs',
        trigger: HintTrigger.CONTEXT, message: '💡 Index documentation with the Docs panel for AI-powered doc search',
        actionLabel: 'Open Docs', actionCommand: 'inaCoding.openDocsPanel',
        showAfterUses: 0, maxShows: 1, priority: 2,
      },
      {
        id: 'completion-shortcuts', feature: 'completion',
        trigger: HintTrigger.FIRST_USE, message: '💡 Use Cmd+→ for word-by-word accept, Alt+] to cycle alternatives',
        actionLabel: null, actionCommand: null,
        showAfterUses: 0, maxShows: 1, priority: 1,
      },
    ];
  }

  checkTrigger(trigger: HintTrigger, context?: any): ProgressiveHint | null {
    const manager = OnboardingManager.getInstance();
    const candidates = this.hints
      .filter(h => h.trigger === trigger && this.shouldShowHint(h, manager))
      .sort((a, b) => b.priority - a.priority);

    for (const hint of candidates) {
      if (this.matchesTrigger(hint, trigger, context)) {
        return hint;
      }
    }
    return null;
  }

  showHint(hint: ProgressiveHint): void {
    const count = (this.showCounts.get(hint.id) || 0) + 1;
    this.showCounts.set(hint.id, count);
    this.lastShowTime.set(hint.id, Date.now());
    this.emit('hint-show', hint);
    Logger.debug(`[Hints] Showing: ${hint.id} (${count}/${hint.maxShows})`);
  }

  dismissHint(hintId: string): void {
    OnboardingManager.getInstance().dismissHint(hintId);
    this.emit('hint-dismissed', hintId);
  }

  checkContextualHint(context: { message?: string; hasSelection?: boolean; activeFile?: string; isIdle?: boolean; hasError?: boolean }): void {
    let hint: ProgressiveHint | null = null;

    if (context.hasSelection) {
      hint = this.checkTrigger(HintTrigger.CONTEXT, { feature: 'inline-edit' });
    }
    if (!hint && context.message) {
      const msg = context.message.toLowerCase();
      // Multi-file pattern detection
      if (/\b(all files|every file|multiple files|across|refactor|rename across|update all)\b/i.test(msg)) {
        hint = this.checkTrigger(HintTrigger.CONTEXT, { feature: 'agent' });
      }
      // Git-related
      if (!hint && /\b(changed|commit|diff|branch|merge|history|blame|who changed|when was)\b/i.test(msg)) {
        hint = this.checkTrigger(HintTrigger.CONTEXT, { feature: 'git' });
      }
      // Memory-related
      if (!hint && /\b(always|every time|remember|don't forget|keep in mind)\b/i.test(msg)) {
        hint = this.checkTrigger(HintTrigger.CONTEXT, { feature: 'memory' });
      }
      // Doc-related
      if (!hint && /\b(documentation|docs|api reference|how does .* work|library|framework)\b/i.test(msg)) {
        hint = this.checkTrigger(HintTrigger.CONTEXT, { feature: 'docs' });
      }
    }
    if (!hint && context.isIdle) {
      hint = this.checkTrigger(HintTrigger.IDLE);
    }
    if (!hint && context.hasError) {
      hint = this.checkTrigger(HintTrigger.ERROR);
    }

    if (hint) {
      this.showHint(hint);
    }
  }

  getActiveHints(): ProgressiveHint[] {
    const manager = OnboardingManager.getInstance();
    return this.hints.filter(h => this.shouldShowHint(h, manager));
  }

  private shouldShowHint(hint: ProgressiveHint, manager: OnboardingManager): boolean {
    if (manager.isHintDismissed(hint.id)) return false;
    if (manager.isFeatureSeen(hint.feature)) return false;
    const count = this.showCounts.get(hint.id) || 0;
    if (count >= hint.maxShows) return false;
    const lastShow = this.lastShowTime.get(hint.id) || 0;
    if (Date.now() - lastShow < this.cooldownMs) return false;
    return true;
  }

  private matchesTrigger(hint: ProgressiveHint, trigger: HintTrigger, context?: any): boolean {
    if (trigger === HintTrigger.CONTEXT && context?.feature) {
      return hint.feature === context.feature;
    }
    return true;
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
