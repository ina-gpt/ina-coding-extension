import { ParsedRules, RulesContext } from './RulesTypes';

export interface GlobalRules {
  raw: string;
  parsed: ParsedGlobalRules;
  filePath: string;
  lastModified: number;
  hash: string;
  isValid: boolean;
  errors: string[];
}

export interface ParsedGlobalRules {
  preferences: UserPreferences;
  codingDefaults: CodingDefaults;
  responseStyle: ResponseStyle;
  customInstructions: string[];
  allRules: string[];
}

export interface UserPreferences {
  displayName: string | null;
  preferredLanguage: string | null;
  preferredCodeLanguage: string | null;
  experienceLevel: ExperienceLevel;
  timezone: string | null;
  locale: string | null;
  accessibility: AccessibilityPrefs | null;
}

export enum ExperienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export interface AccessibilityPrefs {
  highContrast: boolean;
  screenReader: boolean;
  reducedMotion: boolean;
  largeText: boolean;
}

export interface CodingDefaults {
  indentation: 'spaces' | 'tabs';
  indentSize: number;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingComma: 'none' | 'es5' | 'all';
  lineWidth: number;
  endOfLine: 'lf' | 'crlf' | 'auto';
  importOrder: string[] | null;
  braceStyle: '1tbs' | 'allman' | 'stroustrup';
  arrowParens: 'always' | 'avoid';
  objectCurlySpacing: boolean;
  arrayBracketSpacing: boolean;
}

export interface ResponseStyle {
  verbosity: 'concise' | 'balanced' | 'detailed';
  tone: 'professional' | 'casual' | 'friendly' | 'technical';
  codeComments: 'none' | 'minimal' | 'moderate' | 'extensive';
  includeExplanations: boolean;
  showAlternatives: boolean;
  preferExamples: boolean;
  responseLanguage: string | null;
  markdownFormatting: boolean;
  maxResponseLength: 'short' | 'medium' | 'long' | 'unlimited';
  includeImports: boolean;
  includeTypes: boolean;
  errorExplanationDepth: 'what' | 'what-why' | 'what-why-how';
}

export interface MergedRules {
  projectRules: ParsedRules | null;
  globalRules: ParsedGlobalRules | null;
  mergedContext: RulesContext;
  conflicts: RuleConflict[];
  source: 'project-only' | 'global-only' | 'merged';
}

export interface RuleConflict {
  category: string;
  projectRule: string;
  globalRule: string;
  winner: 'project' | 'global';
  reason: string;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  displayName: null,
  preferredLanguage: null,
  preferredCodeLanguage: null,
  experienceLevel: ExperienceLevel.INTERMEDIATE,
  timezone: null,
  locale: null,
  accessibility: null,
};

export const DEFAULT_CODING_DEFAULTS: CodingDefaults = {
  indentation: 'spaces',
  indentSize: 2,
  quotes: 'single',
  semicolons: true,
  trailingComma: 'all',
  lineWidth: 100,
  endOfLine: 'lf',
  importOrder: null,
  braceStyle: '1tbs',
  arrowParens: 'always',
  objectCurlySpacing: true,
  arrayBracketSpacing: false,
};

export const DEFAULT_RESPONSE_STYLE: ResponseStyle = {
  verbosity: 'balanced',
  tone: 'professional',
  codeComments: 'moderate',
  includeExplanations: true,
  showAlternatives: false,
  preferExamples: true,
  responseLanguage: null,
  markdownFormatting: true,
  maxResponseLength: 'medium',
  includeImports: true,
  includeTypes: true,
  errorExplanationDepth: 'what-why-how',
};

export const GLOBAL_RULES_CONSTANTS = {
  FILE_NAME: '.ina-global-rules',
  STORAGE_DIR: '.ina-coding',
  MAX_FILE_SIZE: 51200,
  MAX_TOKEN_BUDGET: 800,
} as const;

export const EXPERIENCE_DESCRIPTIONS: Record<ExperienceLevel, string> = {
  [ExperienceLevel.BEGINNER]: 'Explain concepts in detail with examples, avoid jargon',
  [ExperienceLevel.INTERMEDIATE]: 'Moderate explanations with some examples',
  [ExperienceLevel.ADVANCED]: 'Brief explanations, focus on code',
  [ExperienceLevel.EXPERT]: 'Minimal explanations, advanced patterns, discuss trade-offs',
};

export const LANGUAGE_NAMES: Record<string, string> = {
  english: 'English',
  persian: 'Persian (فارسی)',
  german: 'German (Deutsch)',
  arabic: 'Arabic (العربية)',
  turkish: 'Turkish (Türkçe)',
  french: 'French (Français)',
  spanish: 'Spanish (Español)',
  chinese: 'Chinese (中文)',
  japanese: 'Japanese (日本語)',
  korean: 'Korean (한국어)',
  portuguese: 'Portuguese (Português)',
  russian: 'Russian (Русский)',
  italian: 'Italian (Italiano)',
  dutch: 'Dutch (Nederlands)',
  hindi: 'Hindi (हिन्दी)',
};

export const GLOBAL_SECTION_KEYS = {
  preferences: ['preferences', 'user preferences', 'user', 'about me'],
  codingDefaults: ['coding defaults', 'formatting', 'code style', 'code formatting', 'formatting defaults'],
  responseStyle: ['response style', 'how to respond', 'response', 'ai response', 'communication'],
  customInstructions: ['custom instructions', 'always', 'instructions', 'personal rules', 'my rules'],
} as const;
