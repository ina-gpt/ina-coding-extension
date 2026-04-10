import {
  ParsedGlobalRules, UserPreferences, CodingDefaults, ResponseStyle,
  ExperienceLevel, AccessibilityPrefs,
  DEFAULT_USER_PREFERENCES, DEFAULT_CODING_DEFAULTS, DEFAULT_RESPONSE_STYLE,
  GLOBAL_RULES_CONSTANTS, GLOBAL_SECTION_KEYS,
} from './GlobalRulesTypes';
import { RulesValidation } from './RulesTypes';

export class GlobalRulesParser {
  private static instance: GlobalRulesParser;

  static getInstance(): GlobalRulesParser {
    if (!GlobalRulesParser.instance) {
      GlobalRulesParser.instance = new GlobalRulesParser();
    }
    return GlobalRulesParser.instance;
  }

  parse(content: string): ParsedGlobalRules {
    const { frontmatter, rest } = this.extractFrontmatter(content);
    const sections = this.splitSections(rest);

    let preferences = { ...DEFAULT_USER_PREFERENCES };
    let codingDefaults = { ...DEFAULT_CODING_DEFAULTS };
    let responseStyle = { ...DEFAULT_RESPONSE_STYLE };
    const customInstructions: string[] = [];

    // Apply frontmatter values to preferences
    if (frontmatter.name) preferences.displayName = frontmatter.name;
    if (frontmatter.language) preferences.preferredLanguage = frontmatter.language;
    if (frontmatter.code_language) preferences.preferredCodeLanguage = frontmatter.code_language;
    if (frontmatter.experience) preferences.experienceLevel = this.parseExperienceLevel(frontmatter.experience);
    if (frontmatter.timezone) preferences.timezone = frontmatter.timezone;
    if (frontmatter.locale) preferences.locale = frontmatter.locale;

    // Parse each section
    for (const section of sections) {
      const sectionKey = this.detectSectionType(section.header);

      if (sectionKey === 'preferences') {
        preferences = this.mergePreferences(preferences, this.parsePreferences(section.body));
      } else if (sectionKey === 'codingDefaults') {
        codingDefaults = this.mergeCodingDefaults(codingDefaults, this.parseCodingDefaults(section.body));
      } else if (sectionKey === 'responseStyle') {
        responseStyle = this.mergeResponseStyle(responseStyle, this.parseResponseStyle(section.body));
      } else if (sectionKey === 'customInstructions') {
        customInstructions.push(...this.extractListItems(section.body));
      } else {
        // Unknown section — treat items as custom instructions
        const items = this.extractListItems(section.body);
        if (items.length > 0) customInstructions.push(...items);
      }
    }

    // Sync response language from preferences if not set in response style
    if (!responseStyle.responseLanguage && preferences.preferredLanguage) {
      responseStyle.responseLanguage = preferences.preferredLanguage;
    }

    const allRules = [
      ...customInstructions,
      ...this.codingDefaultsToRules(codingDefaults),
      ...this.responseStyleToRules(responseStyle),
    ];

    return { preferences, codingDefaults, responseStyle, customInstructions, allRules };
  }

  validate(content: string): RulesValidation {
    const errors: { line: number; message: string }[] = [];
    const warnings: { line: number; message: string }[] = [];

    if (Buffer.byteLength(content, 'utf-8') > GLOBAL_RULES_CONSTANTS.MAX_FILE_SIZE) {
      errors.push({ line: 0, message: `File exceeds maximum size (${GLOBAL_RULES_CONSTANTS.MAX_FILE_SIZE / 1024}KB)` });
    }

    const parsed = this.parse(content);

    if (parsed.preferences.experienceLevel && !Object.values(ExperienceLevel).includes(parsed.preferences.experienceLevel)) {
      warnings.push({ line: 0, message: `Unknown experience level: ${parsed.preferences.experienceLevel}` });
    }

    if (parsed.allRules.length === 0 && parsed.customInstructions.length === 0) {
      warnings.push({ line: 0, message: 'No custom instructions or rules found' });
    }

    if (parsed.allRules.length > 50) {
      warnings.push({ line: 0, message: `Many global rules (${parsed.allRules.length}) — consider reducing` });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sectionCount: 0,
      ruleCount: parsed.allRules.length,
      estimatedTokens: this.estimateTokens(content),
    };
  }

  parsePreferences(text: string): Partial<UserPreferences> {
    const prefs: Partial<UserPreferences> = {};
    const lines = this.parseKeyValueLines(text);

    for (const { key, value } of lines) {
      const nk = this.normalizeKey(key);
      switch (nk) {
        case 'name': case 'displayname': prefs.displayName = value; break;
        case 'language': case 'responselanguage': case 'preferredlanguage': prefs.preferredLanguage = value.toLowerCase(); break;
        case 'codelanguage': case 'programminglanguage': case 'preferredcodelanguage': prefs.preferredCodeLanguage = value.toLowerCase(); break;
        case 'experience': case 'experiencelevel': case 'level': prefs.experienceLevel = this.parseExperienceLevel(value); break;
        case 'timezone': prefs.timezone = value; break;
        case 'locale': prefs.locale = value; break;
        case 'highcontrast': prefs.accessibility = { ...(prefs.accessibility || { highContrast: false, screenReader: false, reducedMotion: false, largeText: false }), highContrast: this.normalizeBoolean(value) }; break;
        case 'screenreader': prefs.accessibility = { ...(prefs.accessibility || { highContrast: false, screenReader: false, reducedMotion: false, largeText: false }), screenReader: this.normalizeBoolean(value) }; break;
      }
    }

    return prefs;
  }

  parseCodingDefaults(text: string): Partial<CodingDefaults> {
    const defaults: Partial<CodingDefaults> = {};
    const lines = this.parseKeyValueLines(text);

    for (const { key, value } of lines) {
      const nk = this.normalizeKey(key);
      const lv = value.toLowerCase().trim();

      switch (nk) {
        case 'indentation': case 'indent':
          if (lv.includes('tab')) { defaults.indentation = 'tabs'; }
          else if (lv.includes('space')) {
            defaults.indentation = 'spaces';
            const sizeMatch = lv.match(/(\d+)/);
            if (sizeMatch) defaults.indentSize = parseInt(sizeMatch[1], 10);
          }
          break;
        case 'indentsize': case 'tabsize': case 'tabwidth':
          defaults.indentSize = parseInt(value, 10) || 2;
          break;
        case 'quotes':
          defaults.quotes = lv.includes('double') ? 'double' : 'single';
          break;
        case 'semicolons': case 'semi':
          defaults.semicolons = this.normalizeBoolean(value);
          break;
        case 'trailingcomma': case 'trailingcommas':
          if (lv === 'none' || lv === 'no' || lv === 'false') defaults.trailingComma = 'none';
          else if (lv === 'es5') defaults.trailingComma = 'es5';
          else if (lv === 'all' || lv === 'yes' || lv === 'true') defaults.trailingComma = 'all';
          break;
        case 'linewidth': case 'maxlinewidth': case 'printwidth':
          defaults.lineWidth = parseInt(value, 10) || 100;
          break;
        case 'endofline': case 'eol':
          if (lv === 'crlf') defaults.endOfLine = 'crlf';
          else if (lv === 'auto') defaults.endOfLine = 'auto';
          else defaults.endOfLine = 'lf';
          break;
        case 'bracestyle': case 'braces':
          if (lv.includes('allman')) defaults.braceStyle = 'allman';
          else if (lv.includes('stroustrup')) defaults.braceStyle = 'stroustrup';
          else defaults.braceStyle = '1tbs';
          break;
        case 'arrowparens':
          defaults.arrowParens = lv === 'avoid' ? 'avoid' : 'always';
          break;
        case 'objectcurlyspacing': case 'curlyspacing':
          defaults.objectCurlySpacing = this.normalizeBoolean(value);
          break;
        case 'arraybracketspacing': case 'bracketspacing':
          defaults.arrayBracketSpacing = this.normalizeBoolean(value);
          break;
        case 'importorder':
          defaults.importOrder = value.split(',').map(s => s.trim()).filter(Boolean);
          break;
      }
    }

    return defaults;
  }

  parseResponseStyle(text: string): Partial<ResponseStyle> {
    const style: Partial<ResponseStyle> = {};
    const lines = this.parseKeyValueLines(text);

    for (const { key, value } of lines) {
      const nk = this.normalizeKey(key);
      const lv = value.toLowerCase().trim();

      switch (nk) {
        case 'verbosity':
          if (lv === 'concise' || lv === 'short' || lv === 'brief') style.verbosity = 'concise';
          else if (lv === 'detailed' || lv === 'verbose' || lv === 'thorough') style.verbosity = 'detailed';
          else style.verbosity = 'balanced';
          break;
        case 'tone':
          if (lv === 'casual') style.tone = 'casual';
          else if (lv === 'friendly') style.tone = 'friendly';
          else if (lv === 'technical') style.tone = 'technical';
          else style.tone = 'professional';
          break;
        case 'codecomments': case 'comments':
          if (lv === 'none' || lv === 'no') style.codeComments = 'none';
          else if (lv === 'minimal' || lv === 'few') style.codeComments = 'minimal';
          else if (lv === 'extensive' || lv === 'many' || lv === 'lots') style.codeComments = 'extensive';
          else style.codeComments = 'moderate';
          break;
        case 'includeexplanations': case 'explanations': case 'explain':
          style.includeExplanations = this.normalizeBoolean(value);
          break;
        case 'showalternatives': case 'alternatives':
          style.showAlternatives = this.normalizeBoolean(value);
          break;
        case 'preferexamples': case 'examples':
          style.preferExamples = this.normalizeBoolean(value);
          break;
        case 'responselanguage': case 'language':
          style.responseLanguage = value.toLowerCase();
          break;
        case 'markdown': case 'markdownformatting':
          style.markdownFormatting = this.normalizeBoolean(value);
          break;
        case 'maxresponselength': case 'responselength': case 'length':
          if (lv === 'short' || lv === 'brief') style.maxResponseLength = 'short';
          else if (lv === 'long' || lv === 'detailed') style.maxResponseLength = 'long';
          else if (lv === 'unlimited' || lv === 'none') style.maxResponseLength = 'unlimited';
          else style.maxResponseLength = 'medium';
          break;
        case 'includeimports': case 'imports':
          style.includeImports = this.normalizeBoolean(value);
          break;
        case 'includetypes': case 'types':
          style.includeTypes = this.normalizeBoolean(value);
          break;
        case 'errorexplanationdepth': case 'errordepth':
          if (lv === 'what') style.errorExplanationDepth = 'what';
          else if (lv === 'what-why') style.errorExplanationDepth = 'what-why';
          else style.errorExplanationDepth = 'what-why-how';
          break;
      }
    }

    return style;
  }

  // ============ Private Helpers ============

  private extractFrontmatter(content: string): { frontmatter: Record<string, string>; rest: string } {
    const fm: Record<string, string> = {};
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match) return { frontmatter: fm, rest: content };

    for (const line of match[1].split('\n')) {
      const kv = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
      if (kv) fm[kv[1].trim().toLowerCase()] = kv[2].trim();
    }

    return { frontmatter: fm, rest: content.slice(match[0].length) };
  }

  private splitSections(content: string): { header: string; body: string }[] {
    const sections: { header: string; body: string }[] = [];
    const lines = content.split('\n');
    let currentHeader = '';
    let currentBody: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (headerMatch) {
        if (currentHeader || currentBody.some(l => l.trim())) {
          sections.push({ header: currentHeader, body: currentBody.join('\n') });
        }
        currentHeader = headerMatch[1].trim();
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }

    if (currentHeader || currentBody.some(l => l.trim())) {
      sections.push({ header: currentHeader, body: currentBody.join('\n') });
    }

    return sections;
  }

  private detectSectionType(header: string): string | null {
    const lower = header.toLowerCase().trim();
    for (const [type, keys] of Object.entries(GLOBAL_SECTION_KEYS)) {
      if ((keys as readonly string[]).some(k => lower === k || lower.includes(k))) return type;
    }
    return null;
  }

  private parseKeyValueLines(text: string): { key: string; value: string }[] {
    const results: { key: string; value: string }[] = [];
    for (const line of text.split('\n')) {
      const kv = this.parseKeyValue(line);
      if (kv) results.push(kv);
    }
    return results;
  }

  private parseKeyValue(line: string): { key: string; value: string } | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // "- key: value" or "- key = value"
    const listMatch = trimmed.match(/^[-*]\s+(.+?):\s+(.+)$/);
    if (listMatch) return { key: listMatch[1].trim(), value: listMatch[2].trim() };

    // "key: value"
    const kvMatch = trimmed.match(/^(.+?):\s+(.+)$/);
    if (kvMatch && !trimmed.startsWith('#')) return { key: kvMatch[1].trim(), value: kvMatch[2].trim() };

    return null;
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[\s\-_]/g, '');
  }

  private normalizeBoolean(value: string): boolean {
    const lv = value.toLowerCase().trim();
    return ['yes', 'true', 'on', '1', 'always'].includes(lv);
  }

  private parseExperienceLevel(value: string): ExperienceLevel {
    const lv = value.toLowerCase().trim();
    if (lv === 'beginner' || lv === 'novice' || lv === 'junior') return ExperienceLevel.BEGINNER;
    if (lv === 'advanced' || lv === 'senior') return ExperienceLevel.ADVANCED;
    if (lv === 'expert' || lv === 'principal' || lv === 'staff') return ExperienceLevel.EXPERT;
    return ExperienceLevel.INTERMEDIATE;
  }

  private extractListItems(text: string): string[] {
    const items: string[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      const match = trimmed.match(/^[-*]\s+(.+)$/);
      if (match) {
        const item = match[1].replace(/\[disabled\]/g, '').trim();
        if (item) items.push(item);
      } else if (trimmed.length > 10 && !trimmed.startsWith('#')) {
        items.push(trimmed);
      }
    }
    return items;
  }

  private mergePreferences(base: UserPreferences, partial: Partial<UserPreferences>): UserPreferences {
    return { ...base, ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined && v !== null)) } as UserPreferences;
  }

  private mergeCodingDefaults(base: CodingDefaults, partial: Partial<CodingDefaults>): CodingDefaults {
    return { ...base, ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined && v !== null)) } as CodingDefaults;
  }

  private mergeResponseStyle(base: ResponseStyle, partial: Partial<ResponseStyle>): ResponseStyle {
    return { ...base, ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined && v !== null)) } as ResponseStyle;
  }

  private codingDefaultsToRules(defaults: CodingDefaults): string[] {
    return [
      `Use ${defaults.indentSize} ${defaults.indentation} for indentation`,
      `Use ${defaults.quotes} quotes`,
      defaults.semicolons ? 'Always use semicolons' : 'Never use semicolons',
      `Trailing commas: ${defaults.trailingComma}`,
      `Max line width: ${defaults.lineWidth}`,
    ];
  }

  private responseStyleToRules(style: ResponseStyle): string[] {
    const rules: string[] = [];
    if (style.verbosity !== 'balanced') rules.push(`Verbosity: ${style.verbosity}`);
    if (style.tone !== 'professional') rules.push(`Tone: ${style.tone}`);
    if (!style.includeExplanations) rules.push('Do not include explanations');
    if (style.showAlternatives) rules.push('Show alternative approaches');
    return rules;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
}
