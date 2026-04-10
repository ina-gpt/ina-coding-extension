import { ParsedRules, RuleSection, RulesContext, RuleSectionType, RULES_CONSTANTS } from './RulesTypes';

export class RulesFormatter {
  private static instance: RulesFormatter;

  static getInstance(): RulesFormatter {
    if (!RulesFormatter.instance) {
      RulesFormatter.instance = new RulesFormatter();
    }
    return RulesFormatter.instance;
  }

  formatForChat(rules: ParsedRules, maxTokens: number = RULES_CONSTANTS.MAX_TOKEN_BUDGET_CHAT): string {
    const sorted = this.prioritySortSections(rules.sections.filter(s => s.enabled));
    const parts: string[] = ['# Project Rules\n'];
    let tokens = 10;

    for (const section of sorted) {
      const header = `## ${section.name}\n`;
      const rulesText = section.rules.map(r => `- ${r}`).join('\n');
      const sectionTokens = this.estimateTokens(header + rulesText);

      if (tokens + sectionTokens > maxTokens) {
        if (section.type === RuleSectionType.DO || section.type === RuleSectionType.DONT) {
          const truncated = section.rules.slice(0, 5).map(r => `- ${r}`).join('\n');
          parts.push(`${header}${truncated}\n`);
          tokens += this.estimateTokens(header + truncated);
        }
        continue;
      }

      parts.push(`${header}${rulesText}\n`);
      tokens += sectionTokens;
    }

    parts.push('\nFollow these rules in all code you generate or modify.');
    return parts.join('\n');
  }

  formatForCompletion(rules: ParsedRules, maxTokens: number = RULES_CONSTANTS.MAX_TOKEN_BUDGET_COMPLETION): string {
    const sorted = this.prioritySortSections(rules.sections.filter(s => s.enabled));
    const parts: string[] = ['Rules:'];

    const techSection = sorted.find(s => s.type === RuleSectionType.TECH_STACK);
    if (techSection) parts.push(this.compactRules(techSection.rules.slice(0, 3), ', '));

    const styleSection = sorted.find(s => s.type === RuleSectionType.STYLE);
    if (styleSection) parts.push(this.compactRules(styleSection.rules.slice(0, 3), ', '));

    const doSection = sorted.find(s => s.type === RuleSectionType.DO);
    if (doSection) parts.push(this.compactRules(doSection.rules.slice(0, 2), ', '));

    const dontSection = sorted.find(s => s.type === RuleSectionType.DONT);
    if (dontSection) parts.push('No ' + this.compactRules(dontSection.rules.slice(0, 2), ', no '));

    return this.truncateToTokenBudget(parts.join(' '), maxTokens);
  }

  formatForAgent(rules: ParsedRules, maxTokens: number = RULES_CONSTANTS.MAX_TOKEN_BUDGET_AGENT): string {
    const sorted = this.prioritySortSections(rules.sections.filter(s => s.enabled));
    const parts: string[] = ['# Project Rules (MUST follow)\n'];
    let tokens = 15;

    const tech = sorted.find(s => s.type === RuleSectionType.TECH_STACK);
    if (tech) {
      parts.push(`Tech: ${tech.rules.join(', ')}\n`);
      tokens += this.estimateTokens(tech.rules.join(', '));
    }

    const arch = sorted.find(s => s.type === RuleSectionType.ARCHITECTURE);
    if (arch) {
      parts.push(`Architecture:\n${arch.rules.map(r => `- ${r}`).join('\n')}\n`);
      tokens += this.estimateTokens(arch.rules.join('\n'));
    }

    const doRules = sorted.find(s => s.type === RuleSectionType.DO);
    const dontRules = sorted.find(s => s.type === RuleSectionType.DONT);
    if (doRules || dontRules) {
      parts.push('Critical Rules:');
      if (doRules) parts.push(`- ALWAYS: ${doRules.rules.join(', ')}`);
      if (dontRules) parts.push(`- NEVER: ${dontRules.rules.join(', ')}`);
      parts.push('');
    }

    for (const section of sorted) {
      if ([RuleSectionType.TECH_STACK, RuleSectionType.ARCHITECTURE, RuleSectionType.DO, RuleSectionType.DONT].includes(section.type)) continue;
      const sectionText = `${section.name}:\n${section.rules.map(r => `- ${r}`).join('\n')}`;
      const sectionTokens = this.estimateTokens(sectionText);
      if (tokens + sectionTokens > maxTokens) break;
      parts.push(sectionText + '\n');
      tokens += sectionTokens;
    }

    parts.push('When creating files, follow the project rules above.');
    return parts.join('\n');
  }

  formatForInlineEdit(rules: ParsedRules, maxTokens: number = RULES_CONSTANTS.MAX_TOKEN_BUDGET_INLINE): string {
    const critical: string[] = [];
    for (const s of rules.sections.filter(s => s.enabled)) {
      if (s.type === RuleSectionType.STYLE) critical.push(...s.rules.slice(0, 2));
      if (s.type === RuleSectionType.DO) critical.push(...s.rules.slice(0, 2));
      if (s.type === RuleSectionType.DONT) critical.push(...s.rules.slice(0, 2).map(r => `No: ${r}`));
    }
    const tech = rules.sections.find(s => s.type === RuleSectionType.TECH_STACK && s.enabled);
    const prefix = tech ? `Follow: ${tech.rules.slice(0, 2).join(', ')}. ` : 'Follow: ';
    return this.truncateToTokenBudget(prefix + critical.join('. ') + '.', maxTokens);
  }

  formatForContext(rules: ParsedRules, context: 'chat' | 'completion' | 'agent' | 'inline'): RulesContext {
    return {
      forChat: this.formatForChat(rules),
      forCompletion: this.formatForCompletion(rules),
      forAgent: this.formatForAgent(rules),
      forInlineEdit: this.formatForInlineEdit(rules),
      tokenCount: this.estimateTokens(this.formatForChat(rules)),
    };
  }

  private truncateToTokenBudget(formatted: string, maxTokens: number): string {
    const tokens = this.estimateTokens(formatted);
    if (tokens <= maxTokens) return formatted;
    const words = formatted.split(/\s+/);
    const targetWords = Math.floor(maxTokens / 1.3);
    return words.slice(0, targetWords).join(' ') + '...';
  }

  private prioritySortSections(sections: RuleSection[]): RuleSection[] {
    return [...sections].sort((a, b) => a.priority - b.priority);
  }

  private compactRules(rules: string[], separator: string): string {
    return rules.map(r => r.length > 80 ? r.slice(0, 77) + '...' : r).join(separator);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
}
