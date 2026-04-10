import { ParsedRules, RuleSection, RuleSectionType, RulesMetadata, RulesValidation, SECTION_HEADERS, RULES_CONSTANTS } from './RulesTypes';

export class RulesParser {
  private static instance: RulesParser;

  static getInstance(): RulesParser {
    if (!RulesParser.instance) {
      RulesParser.instance = new RulesParser();
    }
    return RulesParser.instance;
  }

  parse(content: string, filePath: string): ParsedRules {
    const { metadata, rest } = this.extractFrontmatter(content);
    const sections = this.parseSections(rest);
    const allRules = sections.flatMap(s => s.enabled ? s.rules : []);
    return { sections, metadata, allRules };
  }

  validate(content: string): RulesValidation {
    const errors: { line: number; message: string }[] = [];
    const warnings: { line: number; message: string }[] = [];

    if (Buffer.byteLength(content, 'utf-8') > RULES_CONSTANTS.MAX_FILE_SIZE_BYTES) {
      errors.push({ line: 0, message: `File exceeds maximum size (${RULES_CONSTANTS.MAX_FILE_SIZE_BYTES / 1024}KB)` });
    }

    const parsed = this.parse(content, '');
    if (parsed.allRules.length === 0) {
      warnings.push({ line: 0, message: 'No rules found in file' });
    }

    const sectionNames = new Set<string>();
    for (const section of parsed.sections) {
      if (sectionNames.has(section.name.toLowerCase())) {
        warnings.push({ line: 0, message: `Duplicate section: ${section.name}` });
      }
      sectionNames.add(section.name.toLowerCase());
      if (section.rules.length === 0) {
        warnings.push({ line: 0, message: `Section "${section.name}" has no rules` });
      }
      for (const rule of section.rules) {
        if (rule.length > 500) {
          warnings.push({ line: 0, message: `Rule is very long (${rule.length} chars): "${rule.slice(0, 50)}..."` });
        }
      }
    }

    if (parsed.allRules.length > 100) {
      warnings.push({ line: 0, message: `Many rules (${parsed.allRules.length}) — consider reducing for better AI performance` });
    }

    return {
      isValid: errors.length === 0,
      errors, warnings,
      sectionCount: parsed.sections.length,
      ruleCount: parsed.allRules.length,
      estimatedTokens: this.estimateTokens(content),
    };
  }

  private parseSections(content: string): RuleSection[] {
    const lines = content.split('\n');
    const sections: RuleSection[] = [];
    let currentHeader = '';
    let currentLines: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (headerMatch) {
        if (currentHeader || currentLines.length > 0) {
          sections.push(this.parseSection(currentHeader, currentLines));
        }
        currentHeader = headerMatch[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    if (currentHeader || currentLines.some(l => l.trim())) {
      sections.push(this.parseSection(currentHeader, currentLines));
    }

    if (sections.length === 0 && content.trim()) {
      sections.push({
        name: 'General',
        type: RuleSectionType.GENERAL,
        content: content.trim(),
        rules: this.extractRules(content),
        priority: RULES_CONSTANTS.DEFAULT_PRIORITY,
        enabled: true,
      });
    }

    return sections;
  }

  private parseSection(headerLine: string, bodyLines: string[]): RuleSection {
    const { text: name, priority } = this.extractPriority(headerLine || 'General');
    const type = this.detectSectionType(name);
    const content = bodyLines.join('\n').trim();
    const rules = this.extractRules(content);
    const enabled = !headerLine.includes('[disabled]');

    return { name, type, content, rules, priority, enabled };
  }

  extractRules(text: string): string[] {
    const rules: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('<!--') || trimmed === '---') continue;

      const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (listMatch) {
        const rule = listMatch[1].replace(/\[disabled\]/g, '').replace(/\[priority:\d\]/g, '').trim();
        if (rule) rules.push(rule);
        continue;
      }

      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (numberedMatch) {
        rules.push(numberedMatch[1].trim());
        continue;
      }

      if (trimmed.length > 10 && !trimmed.startsWith('#')) {
        rules.push(trimmed);
      }
    }

    return rules;
  }

  private extractFrontmatter(content: string): { metadata: RulesMetadata; rest: string } {
    const metadata: RulesMetadata = { projectName: null, language: null, framework: null, version: null, author: null, lastUpdated: null, description: null };

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!fmMatch) return { metadata, rest: content };

    const yaml = fmMatch[1];
    for (const line of yaml.split('\n')) {
      const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (!kv) continue;
      const [, key, value] = kv;
      const v = value.trim();
      switch (key.toLowerCase()) {
        case 'project': metadata.projectName = v; break;
        case 'language': metadata.language = v; break;
        case 'framework': metadata.framework = v; break;
        case 'version': metadata.version = v; break;
        case 'author': metadata.author = v; break;
        case 'lastupdated': case 'last_updated': metadata.lastUpdated = v; break;
        case 'description': metadata.description = v; break;
      }
    }

    return { metadata, rest: content.slice(fmMatch[0].length) };
  }

  private detectSectionType(header: string): RuleSectionType {
    const lower = header.toLowerCase().replace(/[#*_]/g, '').trim();
    for (const [key, type] of SECTION_HEADERS) {
      if (lower === key || lower.includes(key)) return type;
    }
    return RuleSectionType.CUSTOM;
  }

  private extractPriority(line: string): { text: string; priority: number } {
    const priorityMatch = line.match(/\[priority:(\d)\]/);
    if (priorityMatch) {
      return { text: line.replace(priorityMatch[0], '').trim(), priority: parseInt(priorityMatch[1], 10) };
    }
    if (line.includes('[!important]')) {
      return { text: line.replace('[!important]', '').trim(), priority: 1 };
    }
    return { text: line, priority: RULES_CONSTANTS.DEFAULT_PRIORITY };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
}
