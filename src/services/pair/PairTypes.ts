/**
 * PairTypes.ts — Phase 20 Step 20.1
 * AI Pair Programmer type definitions
 */

export type CodingPatternType = 'typing' | 'pausing' | 'deleting' | 'scrolling' | 'searching' | 'debugging' | 'refactoring' | 'reviewing' | 'pasting';

export interface CodingPattern {
  type: CodingPatternType;
  duration: number;
  intensity: number;
  file: string;
  position: { line: number; character: number };
  timestamp: number;
}

export interface DeveloperState {
  currentPattern: CodingPattern | null;
  sessionPatterns: CodingPattern[];
  frustrationScore: number;
  focusScore: number;
  currentIntent: string;
  activeFiles: string[];
  editVelocity: number;
  deletionRatio: number;
  undoCount: number;
  sessionStartTime: number;
}

export type SuggestionType = 'hint' | 'warning' | 'refactor' | 'documentation' | 'pattern' | 'learning';

export interface ProactiveSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  message: string;
  codeAction?: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dismissable: boolean;
  expiresAfterMs: number;
  file?: string;
  line?: number;
  timestamp: number;
}

export enum PairMode {
  ACTIVE = 'active',
  QUIET = 'quiet',
  OFF = 'off',
  LEARNING = 'learning',
}

export interface PairConfig {
  mode: PairMode;
  suggestionCooldownMs: number;
  minConfidence: number;
  maxSuggestionsPerHour: number;
  enableFrustrationDetection: boolean;
  enablePatternLearning: boolean;
  enableCodeSmellDetection: boolean;
  enableDocSuggestion: boolean;
  voiceFeedback: boolean;
}

export const DEFAULT_PAIR_CONFIG: PairConfig = {
  mode: PairMode.ACTIVE,
  suggestionCooldownMs: 30000,
  minConfidence: 70,
  maxSuggestionsPerHour: 20,
  enableFrustrationDetection: true,
  enablePatternLearning: true,
  enableCodeSmellDetection: true,
  enableDocSuggestion: true,
  voiceFeedback: false,
};

export interface DeveloperProfile {
  preferredPatterns: Record<string, number>;
  commonMistakes: string[];
  typingSpeed: number;
  refactoringStyle: string;
  testingHabits: string;
  learnedPreferences: Record<string, string>;
  dismissedSuggestions: Set<string>;
  totalSessionMinutes: number;
  lastUpdated: string;
}

export const EMPTY_PROFILE: DeveloperProfile = {
  preferredPatterns: {},
  commonMistakes: [],
  typingSpeed: 0,
  refactoringStyle: '',
  testingHabits: '',
  learnedPreferences: {},
  dismissedSuggestions: new Set(),
  totalSessionMinutes: 0,
  lastUpdated: new Date().toISOString(),
};

export interface ActivityEvent {
  type: 'keystroke' | 'delete' | 'paste' | 'undo' | 'redo' | 'save' | 'file_switch' | 'cursor_move' | 'scroll' | 'selection';
  timestamp: number;
  file: string;
  line: number;
  data?: any;
}
