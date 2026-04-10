/**
 * Phase 11.2 — Onboarding Types
 * Complete type system for onboarding, tours, tutorials, shortcuts, and progressive hints.
 */

export const ONBOARDING_VERSION = '1.0.0';

// ============ Core Onboarding ============

export interface OnboardingState {
  isFirstRun: boolean;
  completedSteps: string[];
  currentStep: string | null;
  startedAt: number | null;
  completedAt: number | null;
  skippedAt: number | null;
  version: string;
  dismissedHints: string[];
  seenFeatures: string[];
  tutorialProgress: TutorialProgress | null;
  toursCompleted: string[];
}

export enum OnboardingStep {
  WELCOME = 'welcome',
  CONNECT = 'connect',
  THEME = 'theme',
  RULES = 'rules',
  FIRST_CHAT = 'first_chat',
  SHORTCUTS = 'shortcuts',
  FEATURES_TOUR = 'features_tour',
  TUTORIAL = 'tutorial',
  COMPLETE = 'complete',
}

export interface OnboardingStepConfig {
  id: OnboardingStep;
  title: string;
  description: string;
  icon: string;
  duration: string;
  required: boolean;
  prerequisite: OnboardingStep | null;
  action: (() => Promise<void>) | null;
}

// ============ Feature Tours ============

export interface FeatureTour {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
  category: TourCategory;
  estimatedMinutes: number;
}

export interface TourStep {
  id: string;
  target: TourTarget;
  title: string;
  description: string;
  action: string | null;
  highlight: TourHighlight | null;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  media: TourMedia | null;
  canSkip: boolean;
  autoAdvanceMs: number | null;
}

export interface TourTarget {
  type: 'element' | 'area' | 'panel' | 'command' | 'editor' | 'statusbar' | 'fullscreen';
  selector: string | null;
  panelId: string | null;
  commandId: string | null;
}

export interface TourHighlight {
  type: 'spotlight' | 'border' | 'pulse' | 'arrow' | 'glow';
  color: string | null;
  borderRadius: string | null;
}

export interface TourMedia {
  type: 'image' | 'gif' | 'svg' | 'animation';
  src: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  inlineSvg: string | null;
}

export enum TourCategory {
  ESSENTIAL = 'essential',
  CHAT = 'chat',
  COMPLETION = 'completion',
  AGENT = 'agent',
  CONTEXT = 'context',
  ADVANCED = 'advanced',
}

// ============ Tutorial ============

export interface TutorialProgress {
  currentLesson: number;
  totalLessons: number;
  completedLessons: string[];
  score: number;
  startedAt: number;
}

export interface TutorialLesson {
  id: string;
  title: string;
  description: string;
  objective: string;
  steps: TutorialStep[];
  successCriteria: string;
  reward: string | null;
}

export interface TutorialStep {
  instruction: string;
  expectedAction: string;
  hint: string | null;
  validation: ((context: any) => boolean) | null;
  autoComplete: boolean;
}

// ============ Shortcuts ============

export interface ShortcutCategory {
  name: string;
  icon: string;
  shortcuts: ShortcutEntry[];
}

export interface ShortcutEntry {
  keys: string[];
  action: string;
  description: string;
  context: string | null;
  category: string;
}

// ============ Progressive Hints ============

export interface ProgressiveHint {
  id: string;
  feature: string;
  trigger: HintTrigger;
  message: string;
  actionLabel: string | null;
  actionCommand: string | null;
  showAfterUses: number;
  maxShows: number;
  priority: number;
}

export enum HintTrigger {
  FIRST_USE = 'first_use',
  AFTER_N_USES = 'after_n',
  TIME_BASED = 'time',
  CONTEXT = 'context',
  IDLE = 'idle',
  ERROR = 'error',
}

// ============ What's New ============

export interface ChangelogEntry {
  type: 'feature' | 'fix' | 'improvement';
  title: string;
  description: string;
}

// ============ Step Configs ============

export const ONBOARDING_STEPS_CONFIG: OnboardingStepConfig[] = [
  { id: OnboardingStep.WELCOME, title: 'Welcome', description: 'Get introduced to INA Coding', icon: '$(home)', duration: '30s', required: true, prerequisite: null, action: null },
  { id: OnboardingStep.CONNECT, title: 'Connection', description: 'Verify API connection', icon: '$(plug)', duration: '15s', required: true, prerequisite: OnboardingStep.WELCOME, action: null },
  { id: OnboardingStep.THEME, title: 'Theme & Language', description: 'Pick your theme and response language', icon: '$(paintcan)', duration: '30s', required: false, prerequisite: OnboardingStep.WELCOME, action: null },
  { id: OnboardingStep.RULES, title: 'Project Rules', description: 'Set up coding preferences', icon: '$(law)', duration: '45s', required: false, prerequisite: OnboardingStep.THEME, action: null },
  { id: OnboardingStep.FIRST_CHAT, title: 'First Chat', description: 'Send your first message', icon: '$(comment-discussion)', duration: '60s', required: false, prerequisite: OnboardingStep.CONNECT, action: null },
  { id: OnboardingStep.SHORTCUTS, title: 'Shortcuts', description: 'Learn keyboard shortcuts', icon: '$(keyboard)', duration: '30s', required: false, prerequisite: null, action: null },
  { id: OnboardingStep.FEATURES_TOUR, title: 'Feature Tour', description: 'Take a guided tour of features', icon: '$(compass)', duration: '3min', required: false, prerequisite: null, action: null },
  { id: OnboardingStep.TUTORIAL, title: 'Tutorial', description: 'Interactive hands-on tutorial', icon: '$(mortar-board)', duration: '10min', required: false, prerequisite: OnboardingStep.FIRST_CHAT, action: null },
  { id: OnboardingStep.COMPLETE, title: 'Complete', description: 'Onboarding finished', icon: '$(check-all)', duration: '0s', required: false, prerequisite: null, action: null },
];

export function getDefaultOnboardingState(): OnboardingState {
  return {
    isFirstRun: true,
    completedSteps: [],
    currentStep: null,
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    version: ONBOARDING_VERSION,
    dismissedHints: [],
    seenFeatures: [],
    tutorialProgress: null,
    toursCompleted: [],
  };
}
