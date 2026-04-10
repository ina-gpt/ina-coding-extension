export interface ProjectRules {
  raw: string;
  parsed: ParsedRules;
  filePath: string;
  lastModified: number;
  hash: string;
  isValid: boolean;
  errors: string[];
}

export interface ParsedRules {
  sections: RuleSection[];
  metadata: RulesMetadata;
  allRules: string[];
}

export interface RuleSection {
  name: string;
  type: RuleSectionType;
  content: string;
  rules: string[];
  priority: number;
  enabled: boolean;
}

export enum RuleSectionType {
  GENERAL = 'general',
  STYLE = 'style',
  TECH_STACK = 'tech_stack',
  ARCHITECTURE = 'architecture',
  DO = 'do',
  DONT = 'dont',
  NAMING = 'naming',
  TESTING = 'testing',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  DOCUMENTATION = 'documentation',
  GIT = 'git',
  IMPORTS = 'imports',
  ERROR_HANDLING = 'error_handling',
  CUSTOM = 'custom',
}

export interface RulesMetadata {
  projectName: string | null;
  language: string | null;
  framework: string | null;
  version: string | null;
  author: string | null;
  lastUpdated: string | null;
  description: string | null;
}

export interface RulesContext {
  forChat: string;
  forCompletion: string;
  forAgent: string;
  forInlineEdit: string;
  tokenCount: number;
}

export interface RulesTemplate {
  name: string;
  description: string;
  language: string | null;
  framework: string | null;
  content: string;
}

export interface RulesValidation {
  isValid: boolean;
  errors: { line: number; message: string }[];
  warnings: { line: number; message: string }[];
  sectionCount: number;
  ruleCount: number;
  estimatedTokens: number;
}

export type RulesFileEvent = 'created' | 'modified' | 'deleted' | 'loaded' | 'error';

export const RULES_CONSTANTS = {
  FILE_NAME: '.ina-rules',
  ALT_FILE_NAMES: ['.ina-rules.md', '.inarules', 'ina-rules.md'],
  MAX_FILE_SIZE_BYTES: 102400,
  MAX_TOKEN_BUDGET_CHAT: 1500,
  MAX_TOKEN_BUDGET_COMPLETION: 500,
  MAX_TOKEN_BUDGET_AGENT: 2000,
  MAX_TOKEN_BUDGET_INLINE: 300,
  DEFAULT_PRIORITY: 3,
} as const;

export const SECTION_HEADERS = new Map<string, RuleSectionType>([
  ['general', RuleSectionType.GENERAL], ['overview', RuleSectionType.GENERAL], ['about', RuleSectionType.GENERAL],
  ['style', RuleSectionType.STYLE], ['coding style', RuleSectionType.STYLE], ['code style', RuleSectionType.STYLE], ['formatting', RuleSectionType.STYLE],
  ['tech stack', RuleSectionType.TECH_STACK], ['technology', RuleSectionType.TECH_STACK], ['technologies', RuleSectionType.TECH_STACK], ['stack', RuleSectionType.TECH_STACK], ['dependencies', RuleSectionType.TECH_STACK],
  ['architecture', RuleSectionType.ARCHITECTURE], ['structure', RuleSectionType.ARCHITECTURE], ['project structure', RuleSectionType.ARCHITECTURE], ['patterns', RuleSectionType.ARCHITECTURE],
  ['do', RuleSectionType.DO], ["do's", RuleSectionType.DO], ['best practices', RuleSectionType.DO], ['guidelines', RuleSectionType.DO], ['prefer', RuleSectionType.DO], ['always', RuleSectionType.DO],
  ["don't", RuleSectionType.DONT], ["don'ts", RuleSectionType.DONT], ['avoid', RuleSectionType.DONT], ['never', RuleSectionType.DONT], ['anti-patterns', RuleSectionType.DONT],
  ['naming', RuleSectionType.NAMING], ['naming conventions', RuleSectionType.NAMING], ['names', RuleSectionType.NAMING],
  ['testing', RuleSectionType.TESTING], ['tests', RuleSectionType.TESTING], ['test', RuleSectionType.TESTING],
  ['security', RuleSectionType.SECURITY],
  ['performance', RuleSectionType.PERFORMANCE], ['optimization', RuleSectionType.PERFORMANCE],
  ['documentation', RuleSectionType.DOCUMENTATION], ['docs', RuleSectionType.DOCUMENTATION], ['comments', RuleSectionType.DOCUMENTATION],
  ['git', RuleSectionType.GIT], ['commits', RuleSectionType.GIT], ['branching', RuleSectionType.GIT],
  ['imports', RuleSectionType.IMPORTS], ['modules', RuleSectionType.IMPORTS],
  ['error handling', RuleSectionType.ERROR_HANDLING], ['errors', RuleSectionType.ERROR_HANDLING], ['exceptions', RuleSectionType.ERROR_HANDLING],
]);
