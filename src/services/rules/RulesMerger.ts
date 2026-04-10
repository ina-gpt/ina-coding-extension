import { ParsedRules, RulesContext, RuleSectionType, RULES_CONSTANTS } from './RulesTypes';
import {
  ParsedGlobalRules, MergedRules, RuleConflict, CodingDefaults, ResponseStyle,
  UserPreferences, DEFAULT_CODING_DEFAULTS, DEFAULT_RESPONSE_STYLE,
} from './GlobalRulesTypes';
import { RulesFileManager } from './RulesFileManager';
import { GlobalRulesFileManager } from './GlobalRulesFileManager';
import { GlobalRulesFormatter } from './GlobalRulesFormatter';
import { RulesFormatter } from './RulesFormatter';

export class RulesMerger {
  private static instance: RulesMerger;
  private projectFileManager: RulesFileManager;
  private globalFileManager: GlobalRulesFileManager;
  private globalFormatter: GlobalRulesFormatter;
  private projectFormatter: RulesFormatter;

  static getInstance(): RulesMerger {
    if (!RulesMerger.instance) {
      RulesMerger.instance = new RulesMerger();
    }
    return RulesMerger.instance;
  }

  private constructor() {
    this.projectFileManager = RulesFileManager.getInstance();
    this.globalFileManager = GlobalRulesFileManager.getInstance();
    this.globalFormatter = GlobalRulesFormatter.getInstance();
    this.projectFormatter = RulesFormatter.getInstance();
  }

  getMergedRules(): MergedRules {
    const projectRulesData = this.projectFileManager.getRules();
    const globalRulesData = this.globalFileManager.getGlobalRules();

    const projectRules = projectRulesData?.isValid ? projectRulesData.parsed : null;
    const globalRules = globalRulesData?.isValid ? globalRulesData.parsed : null;

    if (!projectRules && !globalRules) {
      return {
        projectRules: null,
        globalRules: null,
        mergedContext: { forChat: '', forCompletion: '', forAgent: '', forInlineEdit: '', tokenCount: 0 },
        conflicts: [],
        source: 'project-only',
      };
    }

    if (projectRules && !globalRules) {
      return {
        projectRules,
        globalRules: null,
        mergedContext: this.projectFormatter.formatForContext(projectRules, 'chat'),
        conflicts: [],
        source: 'project-only',
      };
    }

    if (!projectRules && globalRules) {
      return {
        projectRules: null,
        globalRules,
        mergedContext: this.buildGlobalOnlyContext(globalRules),
        conflicts: [],
        source: 'global-only',
      };
    }

    return this.merge(projectRules!, globalRules!);
  }

  merge(projectRules: ParsedRules, globalRules: ParsedGlobalRules): MergedRules {
    const conflicts = this.detectConflicts(projectRules, globalRules);

    const mergedContext: RulesContext = {
      forChat: this.formatMergedForPrompt(projectRules, globalRules, 'chat', RULES_CONSTANTS.MAX_TOKEN_BUDGET_CHAT + 800),
      forCompletion: this.formatMergedForPrompt(projectRules, globalRules, 'completion', RULES_CONSTANTS.MAX_TOKEN_BUDGET_COMPLETION + 200),
      forAgent: this.formatMergedForPrompt(projectRules, globalRules, 'agent', RULES_CONSTANTS.MAX_TOKEN_BUDGET_AGENT + 800),
      forInlineEdit: this.formatMergedForPrompt(projectRules, globalRules, 'inline', RULES_CONSTANTS.MAX_TOKEN_BUDGET_INLINE + 100),
      tokenCount: 0,
    };
    mergedContext.tokenCount = this.estimateTokens(mergedContext.forChat);

    return {
      projectRules,
      globalRules,
      mergedContext,
      conflicts,
      source: 'merged',
    };
  }

  detectConflicts(projectRules: ParsedRules, globalRules: ParsedGlobalRules): RuleConflict[] {
    const conflicts: RuleConflict[] = [];

    // Check coding style conflicts between project rules and global defaults
    const projectStyleSection = projectRules.sections.find(
      s => s.type === RuleSectionType.STYLE && s.enabled
    );

    if (projectStyleSection) {
      for (const rule of projectStyleSection.rules) {
        const rl = rule.toLowerCase();

        // Indentation conflict
        if (rl.includes('tab') && globalRules.codingDefaults.indentation === 'spaces') {
          conflicts.push({ category: 'indentation', projectRule: rule, globalRule: `Use ${globalRules.codingDefaults.indentSize} spaces`, winner: 'project', reason: 'Project rules override global defaults' });
        }
        if (rl.includes('spaces') && globalRules.codingDefaults.indentation === 'tabs') {
          conflicts.push({ category: 'indentation', projectRule: rule, globalRule: 'Use tabs', winner: 'project', reason: 'Project rules override global defaults' });
        }

        // Quotes conflict
        if (rl.includes('double quote') && globalRules.codingDefaults.quotes === 'single') {
          conflicts.push({ category: 'quotes', projectRule: rule, globalRule: 'Use single quotes', winner: 'project', reason: 'Project rules override global defaults' });
        }
        if (rl.includes('single quote') && globalRules.codingDefaults.quotes === 'double') {
          conflicts.push({ category: 'quotes', projectRule: rule, globalRule: 'Use double quotes', winner: 'project', reason: 'Project rules override global defaults' });
        }

        // Semicolons conflict
        if ((rl.includes('no semicolon') || rl.includes('without semicolon')) && globalRules.codingDefaults.semicolons) {
          conflicts.push({ category: 'semicolons', projectRule: rule, globalRule: 'Always use semicolons', winner: 'project', reason: 'Project rules override global defaults' });
        }
        if ((rl.includes('always') && rl.includes('semicolon')) && !globalRules.codingDefaults.semicolons) {
          conflicts.push({ category: 'semicolons', projectRule: rule, globalRule: 'Never use semicolons', winner: 'project', reason: 'Project rules override global defaults' });
        }
      }
    }

    // Check for DO/DONT contradictions with global custom instructions
    const doSection = projectRules.sections.find(s => s.type === RuleSectionType.DO && s.enabled);
    const dontSection = projectRules.sections.find(s => s.type === RuleSectionType.DONT && s.enabled);

    for (const instruction of globalRules.customInstructions) {
      const il = instruction.toLowerCase();

      if (dontSection) {
        for (const rule of dontSection.rules) {
          if (this.detectRuleContradiction(instruction, rule)) {
            conflicts.push({ category: 'custom', projectRule: rule, globalRule: instruction, winner: 'project', reason: 'Project Do/Don\'t rules override global instructions' });
          }
        }
      }

      if (doSection) {
        for (const rule of doSection.rules) {
          if (this.detectRuleContradiction(instruction, rule)) {
            conflicts.push({ category: 'custom', projectRule: rule, globalRule: instruction, winner: 'project', reason: 'Project Do/Don\'t rules override global instructions' });
          }
        }
      }
    }

    return conflicts;
  }

  formatMergedForPrompt(
    projectRules: ParsedRules,
    globalRules: ParsedGlobalRules,
    mode: 'chat' | 'completion' | 'agent' | 'inline',
    maxTokens: number
  ): string {
    if (mode === 'completion') {
      return this.formatMergedCompletion(projectRules, globalRules, maxTokens);
    }

    if (mode === 'inline') {
      return this.formatMergedInline(projectRules, globalRules, maxTokens);
    }

    const parts: string[] = [];
    let tokens = 0;

    // 1. User preferences (personal — always include)
    const prefsText = this.globalFormatter.formatPreferencesForPrompt(globalRules.preferences);
    if (prefsText) {
      parts.push(prefsText);
      tokens += this.estimateTokens(prefsText);
    }

    // 2. Response language directive (critical)
    const langDirective = this.globalFormatter.buildResponseLanguageDirective(globalRules.preferences.preferredLanguage);
    if (langDirective) {
      parts.push(langDirective);
      tokens += this.estimateTokens(langDirective);
    }

    // 3. Response style (personal preference)
    const styleText = this.globalFormatter.formatResponseStyleForPrompt(globalRules.responseStyle);
    if (tokens + this.estimateTokens(styleText) <= maxTokens) {
      parts.push(styleText);
      tokens += this.estimateTokens(styleText);
    }

    // 4. Coding defaults (merged: project overrides)
    const codingText = this.globalFormatter.formatCodingDefaultsForPrompt(globalRules.codingDefaults);
    if (tokens + this.estimateTokens(codingText) <= maxTokens) {
      parts.push(codingText);
      tokens += this.estimateTokens(codingText);
    }

    // 5. Project rules (always highest priority)
    const projectText = mode === 'agent'
      ? this.projectFormatter.formatForAgent(projectRules, maxTokens - tokens)
      : this.projectFormatter.formatForChat(projectRules, maxTokens - tokens);
    if (projectText) {
      parts.push(projectText);
      tokens += this.estimateTokens(projectText);
    }

    // 6. Custom instructions (global, appended if budget allows)
    if (globalRules.customInstructions.length > 0 && tokens < maxTokens) {
      const instrText = '# Personal Instructions\n' + globalRules.customInstructions.map(i => `- ${i}`).join('\n');
      if (tokens + this.estimateTokens(instrText) <= maxTokens) {
        parts.push(instrText);
      }
    }

    return parts.filter(Boolean).join('\n\n');
  }

  getCodingDefaults(): CodingDefaults {
    const globalRules = this.globalFileManager.getGlobalRules();
    const projectRules = this.projectFileManager.getRules();

    const globalDefaults = globalRules?.parsed?.codingDefaults || DEFAULT_CODING_DEFAULTS;

    // Extract project coding defaults from style section
    if (projectRules?.parsed) {
      const styleSection = projectRules.parsed.sections.find(
        s => s.type === RuleSectionType.STYLE && s.enabled
      );
      if (styleSection) {
        return this.mergeProjectCodingDefaults(globalDefaults, styleSection.rules);
      }
    }

    return globalDefaults;
  }

  getResponseStyle(): ResponseStyle {
    const globalRules = this.globalFileManager.getGlobalRules();
    return globalRules?.parsed?.responseStyle || DEFAULT_RESPONSE_STYLE;
  }

  getUserPreferences(): UserPreferences | null {
    const globalRules = this.globalFileManager.getGlobalRules();
    return globalRules?.parsed?.preferences || null;
  }

  // ============ Private ============

  private buildGlobalOnlyContext(globalRules: ParsedGlobalRules): RulesContext {
    const formatter = this.globalFormatter;
    const prefsText = formatter.formatPreferencesForPrompt(globalRules.preferences);
    const langDirective = formatter.buildResponseLanguageDirective(globalRules.preferences.preferredLanguage);
    const styleText = formatter.formatResponseStyleForPrompt(globalRules.responseStyle);
    const codingText = formatter.formatCodingDefaultsForPrompt(globalRules.codingDefaults);
    const instrText = globalRules.customInstructions.length > 0
      ? '# Personal Instructions\n' + globalRules.customInstructions.map(i => `- ${i}`).join('\n')
      : '';

    const forChat = [prefsText, langDirective, styleText, codingText, instrText].filter(Boolean).join('\n\n');
    const forCompletion = formatter.formatForCompletionContext(globalRules.codingDefaults);
    const forAgent = forChat;
    const forInlineEdit = forCompletion;

    return { forChat, forCompletion, forAgent, forInlineEdit, tokenCount: this.estimateTokens(forChat) };
  }

  private formatMergedCompletion(projectRules: ParsedRules, globalRules: ParsedGlobalRules, maxTokens: number): string {
    const parts: string[] = [];

    // Compact coding defaults
    const codingCompact = this.globalFormatter.formatForCompletionContext(globalRules.codingDefaults);
    parts.push(codingCompact);

    // Compact project rules
    const projectCompact = this.projectFormatter.formatForCompletion(projectRules, maxTokens - this.estimateTokens(codingCompact));
    parts.push(projectCompact);

    return parts.join(' ');
  }

  private formatMergedInline(projectRules: ParsedRules, globalRules: ParsedGlobalRules, maxTokens: number): string {
    const defaults = globalRules.codingDefaults;
    const prefix = `Use ${defaults.indentSize} ${defaults.indentation}, ${defaults.quotes} quotes${defaults.semicolons ? ', semicolons' : ''}. `;
    const projectInline = this.projectFormatter.formatForInlineEdit(projectRules, maxTokens - this.estimateTokens(prefix));
    return prefix + projectInline;
  }

  private mergeProjectCodingDefaults(globalDefaults: CodingDefaults, projectRules: string[]): CodingDefaults {
    const merged = { ...globalDefaults };

    for (const rule of projectRules) {
      const rl = rule.toLowerCase();
      if (rl.includes('tab') && rl.includes('indent')) merged.indentation = 'tabs';
      if (rl.includes('space') && rl.includes('indent')) {
        merged.indentation = 'spaces';
        const size = rl.match(/(\d+)\s*space/);
        if (size) merged.indentSize = parseInt(size[1], 10);
      }
      if (rl.includes('double quote')) merged.quotes = 'double';
      if (rl.includes('single quote')) merged.quotes = 'single';
      if (rl.includes('no semicolon') || rl.includes('without semicolon')) merged.semicolons = false;
      if (rl.includes('always') && rl.includes('semicolon')) merged.semicolons = true;
    }

    return merged;
  }

  private detectRuleContradiction(rule1: string, rule2: string): boolean {
    const r1 = rule1.toLowerCase();
    const r2 = rule2.toLowerCase();

    // Extract key terms
    const negationPatterns = [
      { positive: /always\s+(.+)/, negative: /never\s+(.+)/ },
      { positive: /use\s+(.+)/, negative: /(?:don't|do not|avoid)\s+(?:use\s+)?(.+)/ },
      { positive: /prefer\s+(.+)/, negative: /(?:don't|do not|avoid)\s+(.+)/ },
    ];

    for (const pattern of negationPatterns) {
      const m1p = r1.match(pattern.positive);
      const m2n = r2.match(pattern.negative);
      if (m1p && m2n) {
        const term1 = m1p[1].slice(0, 20).trim();
        const term2 = m2n[1].slice(0, 20).trim();
        if (this.termsOverlap(term1, term2)) return true;
      }

      const m1n = r1.match(pattern.negative);
      const m2p = r2.match(pattern.positive);
      if (m1n && m2p) {
        const term1 = m1n[1].slice(0, 20).trim();
        const term2 = m2p[1].slice(0, 20).trim();
        if (this.termsOverlap(term1, term2)) return true;
      }
    }

    // Known alternative pairs
    const alternatives = [
      ['spaces', 'tabs'],
      ['single quotes', 'double quotes'],
      ['semicolons', 'no semicolons'],
      ['class components', 'functional components'],
      ['var', 'const'],
    ];

    for (const [a, b] of alternatives) {
      if ((r1.includes(a) && r2.includes(b)) || (r1.includes(b) && r2.includes(a))) {
        return true;
      }
    }

    return false;
  }

  private termsOverlap(term1: string, term2: string): boolean {
    const words1 = new Set(term1.split(/\s+/));
    const words2 = new Set(term2.split(/\s+/));
    let overlap = 0;
    for (const w of words1) {
      if (words2.has(w) && w.length > 2) overlap++;
    }
    return overlap >= 1;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
}
