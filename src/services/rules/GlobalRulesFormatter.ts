import {
  UserPreferences, CodingDefaults, ResponseStyle,
  ExperienceLevel, EXPERIENCE_DESCRIPTIONS,
} from './GlobalRulesTypes';

export class GlobalRulesFormatter {
  private static instance: GlobalRulesFormatter;

  static getInstance(): GlobalRulesFormatter {
    if (!GlobalRulesFormatter.instance) {
      GlobalRulesFormatter.instance = new GlobalRulesFormatter();
    }
    return GlobalRulesFormatter.instance;
  }

  formatPreferencesForPrompt(prefs: UserPreferences): string {
    const parts: string[] = ['# User Preferences'];

    if (prefs.displayName) parts.push(`- Name: ${prefs.displayName}`);
    if (prefs.preferredLanguage) parts.push(`- Preferred language for responses: ${prefs.preferredLanguage}`);
    if (prefs.preferredCodeLanguage) parts.push(`- Programming language preference: ${prefs.preferredCodeLanguage}`);
    parts.push(`- Experience level: ${prefs.experienceLevel}`);

    // Add experience-level guidance
    const guidance = EXPERIENCE_DESCRIPTIONS[prefs.experienceLevel];
    if (guidance) {
      parts.push('');
      parts.push(`Adjust your responses accordingly: ${guidance}`);
    }

    return parts.length > 1 ? parts.join('\n') : '';
  }

  formatCodingDefaultsForPrompt(defaults: CodingDefaults): string {
    const parts: string[] = ['# Code Formatting Defaults'];

    parts.push(`- Indentation: ${defaults.indentSize} ${defaults.indentation}`);
    parts.push(`- Quotes: ${defaults.quotes}`);
    parts.push(`- Semicolons: ${defaults.semicolons ? 'always' : 'never'}`);
    parts.push(`- Trailing commas: ${defaults.trailingComma}`);
    parts.push(`- Max line width: ${defaults.lineWidth}`);
    parts.push(`- Brace style: ${defaults.braceStyle}`);
    if (defaults.arrowParens !== 'always') parts.push(`- Arrow parens: ${defaults.arrowParens}`);
    if (defaults.endOfLine !== 'lf') parts.push(`- End of line: ${defaults.endOfLine}`);

    parts.push('');
    parts.push('Always follow these formatting rules in generated code.');

    return parts.join('\n');
  }

  formatResponseStyleForPrompt(style: ResponseStyle): string {
    const parts: string[] = ['# Response Style'];

    parts.push(`- Be ${style.verbosity} in explanations`);
    parts.push(`- Use a ${style.tone} tone`);

    if (style.codeComments === 'none') {
      parts.push('- Do not add code comments');
    } else {
      parts.push(`- Add ${style.codeComments} code comments`);
    }

    if (style.includeExplanations) {
      parts.push('- Include explanations with code');
    } else {
      parts.push('- Output code only, no explanations');
    }

    if (style.showAlternatives) {
      parts.push('- Show alternative approaches when relevant');
    }

    if (style.preferExamples) {
      parts.push('- Prefer examples over abstract explanations');
    }

    if (style.maxResponseLength === 'short') {
      parts.push('- Keep responses brief and to the point');
    } else if (style.maxResponseLength === 'long') {
      parts.push('- Provide thorough, comprehensive responses');
    }

    if (!style.includeImports) {
      parts.push('- Do not include import statements unless asked');
    }

    if (!style.includeTypes) {
      parts.push('- Do not include type definitions unless asked');
    }

    if (style.errorExplanationDepth === 'what') {
      parts.push('- For errors: explain what went wrong');
    } else if (style.errorExplanationDepth === 'what-why') {
      parts.push('- For errors: explain what went wrong and why');
    } else {
      parts.push('- For errors: explain what went wrong, why, and how to fix');
    }

    return parts.join('\n');
  }

  formatForCompletionContext(defaults: CodingDefaults): string {
    const parts: string[] = [];
    parts.push(`Format: ${defaults.indentSize}${defaults.indentation === 'tabs' ? 'tab' : 'sp'}`);
    parts.push(`${defaults.quotes}q`);
    parts.push(defaults.semicolons ? ';' : 'no;');
    return parts.join(', ');
  }

  buildResponseLanguageDirective(language: string | null): string {
    if (!language || language === 'english') return '';

    const directives: Record<string, string> = {
      persian: 'IMPORTANT: Respond in Persian (فارسی). All explanations, comments, and text should be in Persian. Code identifiers and keywords remain in English.',
      german: 'IMPORTANT: Respond in German (Deutsch). All explanations, comments, and text should be in German. Code identifiers and keywords remain in English.',
      arabic: 'IMPORTANT: Respond in Arabic (العربية). All explanations, comments, and text should be in Arabic. Code identifiers and keywords remain in English.',
      turkish: 'IMPORTANT: Respond in Turkish (Türkçe). All explanations, comments, and text should be in Turkish. Code identifiers and keywords remain in English.',
      french: 'IMPORTANT: Respond in French (Français). All explanations, comments, and text should be in French. Code identifiers and keywords remain in English.',
      spanish: 'IMPORTANT: Respond in Spanish (Español). All explanations, comments, and text should be in Spanish. Code identifiers and keywords remain in English.',
      chinese: 'IMPORTANT: Respond in Chinese (中文). All explanations, comments, and text should be in Chinese. Code identifiers and keywords remain in English.',
      japanese: 'IMPORTANT: Respond in Japanese (日本語). All explanations, comments, and text should be in Japanese. Code identifiers and keywords remain in English.',
      korean: 'IMPORTANT: Respond in Korean (한국어). All explanations, comments, and text should be in Korean. Code identifiers and keywords remain in English.',
      portuguese: 'IMPORTANT: Respond in Portuguese (Português). All explanations, comments, and text should be in Portuguese. Code identifiers and keywords remain in English.',
      russian: 'IMPORTANT: Respond in Russian (Русский). All explanations, comments, and text should be in Russian. Code identifiers and keywords remain in English.',
      italian: 'IMPORTANT: Respond in Italian (Italiano). All explanations, comments, and text should be in Italian. Code identifiers and keywords remain in English.',
      dutch: 'IMPORTANT: Respond in Dutch (Nederlands). All explanations, comments, and text should be in Dutch. Code identifiers and keywords remain in English.',
      hindi: 'IMPORTANT: Respond in Hindi (हिन्दी). All explanations, comments, and text should be in Hindi. Code identifiers and keywords remain in English.',
    };

    return directives[language] || `IMPORTANT: Respond in ${language}. All explanations, comments, and text should be in ${language}. Code identifiers and keywords remain in English.`;
  }
}
