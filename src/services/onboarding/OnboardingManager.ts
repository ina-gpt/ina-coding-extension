/**
 * Phase 11.2 — Onboarding Manager
 * Manages the overall onboarding flow, state persistence, and step progression.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import {
  OnboardingState, OnboardingStep, OnboardingStepConfig,
  ONBOARDING_STEPS_CONFIG, ONBOARDING_VERSION, getDefaultOnboardingState,
} from './OnboardingTypes';

const STATE_KEY = 'inaCoding.onboardingState';

export class OnboardingManager extends EventEmitter {
  private static instance: OnboardingManager;
  private state: OnboardingState;
  private context: vscode.ExtensionContext | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): OnboardingManager {
    if (!OnboardingManager.instance) {
      OnboardingManager.instance = new OnboardingManager();
    }
    return OnboardingManager.instance;
  }

  private constructor() {
    super();
    this.state = getDefaultOnboardingState();
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.state = this.loadState();

    // Check if first run or version changed
    if (!this.state.version || this.state.version !== ONBOARDING_VERSION) {
      if (this.state.completedAt) {
        // Returning user with version change → what's new
        this.state.version = ONBOARDING_VERSION;
        this.persist();
        this.emit('show-whats-new');
        Logger.info('[Onboarding] Version changed, showing what\'s new');
      } else {
        // First run
        this.state = getDefaultOnboardingState();
        this.persist();
        Logger.info('[Onboarding] First run detected');
      }
    }

    if (this.state.isFirstRun && !this.state.completedAt && !this.state.skippedAt) {
      // Trigger welcome after short delay
      setTimeout(() => {
        this.emit('show-welcome');
      }, 2000);
    }

    Logger.info(`[Onboarding] Initialized: firstRun=${this.state.isFirstRun}, completed=${this.state.completedSteps.length}/${ONBOARDING_STEPS_CONFIG.length}`);
  }

  isFirstRun(): boolean {
    return this.state.isFirstRun;
  }

  shouldShowOnboarding(): boolean {
    return this.state.isFirstRun && !this.state.completedAt && !this.state.skippedAt;
  }

  startOnboarding(): void {
    this.state.currentStep = OnboardingStep.WELCOME;
    this.state.startedAt = Date.now();
    this.persist();
    this.emit('onboarding-started', this.state);
    this.emit('step-changed', OnboardingStep.WELCOME);
  }

  advanceToStep(step: OnboardingStep): void {
    const config = ONBOARDING_STEPS_CONFIG.find(s => s.id === step);
    if (!config) return;

    // Check prerequisite
    if (config.prerequisite && !this.state.completedSteps.includes(config.prerequisite)) {
      Logger.debug(`[Onboarding] Prerequisite not met for ${step}: needs ${config.prerequisite}`);
      return;
    }

    this.state.currentStep = step;
    this.persist();
    this.emit('step-changed', step);
  }

  completeStep(step: OnboardingStep): void {
    if (!this.state.completedSteps.includes(step)) {
      this.state.completedSteps.push(step);
    }

    // Find next step
    const nextStep = this.getNextStep();
    if (nextStep) {
      this.state.currentStep = nextStep.id;
      this.emit('step-changed', nextStep.id);
    } else {
      this.completeOnboarding();
    }
    this.persist();
    this.emit('step-completed', step);
  }

  skipOnboarding(): void {
    this.state.skippedAt = Date.now();
    this.state.currentStep = null;
    this.persist();
    this.emit('onboarding-skipped');
    Logger.info('[Onboarding] Skipped by user');
  }

  completeOnboarding(): void {
    this.state.completedAt = Date.now();
    this.state.isFirstRun = false;
    this.state.currentStep = null;
    this.persist();
    this.emit('onboarding-complete');
    Logger.info('[Onboarding] Completed');
  }

  resetOnboarding(): void {
    this.state = getDefaultOnboardingState();
    this.persist();
    this.emit('onboarding-reset');
    Logger.info('[Onboarding] Reset');
  }

  getState(): OnboardingState {
    return { ...this.state };
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    const total = ONBOARDING_STEPS_CONFIG.filter(s => s.id !== OnboardingStep.COMPLETE).length;
    const completed = this.state.completedSteps.filter(s => s !== OnboardingStep.COMPLETE).length;
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }

  getCurrentStep(): OnboardingStepConfig | null {
    if (!this.state.currentStep) return null;
    return ONBOARDING_STEPS_CONFIG.find(s => s.id === this.state.currentStep) || null;
  }

  getNextStep(): OnboardingStepConfig | null {
    const currentIdx = this.state.currentStep
      ? ONBOARDING_STEPS_CONFIG.findIndex(s => s.id === this.state.currentStep)
      : -1;

    for (let i = currentIdx + 1; i < ONBOARDING_STEPS_CONFIG.length; i++) {
      const step = ONBOARDING_STEPS_CONFIG[i];
      if (step.id === OnboardingStep.COMPLETE) continue;
      if (!this.state.completedSteps.includes(step.id)) {
        // Check prerequisite
        if (!step.prerequisite || this.state.completedSteps.includes(step.prerequisite)) {
          return step;
        }
      }
    }
    return null;
  }

  markFeatureSeen(featureId: string): void {
    if (!this.state.seenFeatures.includes(featureId)) {
      this.state.seenFeatures.push(featureId);
      this.persist();
    }
  }

  dismissHint(hintId: string): void {
    if (!this.state.dismissedHints.includes(hintId)) {
      this.state.dismissedHints.push(hintId);
      this.persist();
    }
  }

  isFeatureSeen(featureId: string): boolean {
    return this.state.seenFeatures.includes(featureId);
  }

  isHintDismissed(hintId: string): boolean {
    return this.state.dismissedHints.includes(hintId);
  }

  markTourCompleted(tourId: string): void {
    if (!this.state.toursCompleted.includes(tourId)) {
      this.state.toursCompleted.push(tourId);
      this.persist();
    }
  }

  isTourCompleted(tourId: string): boolean {
    return this.state.toursCompleted.includes(tourId);
  }

  updateTutorialProgress(progress: OnboardingState['tutorialProgress']): void {
    this.state.tutorialProgress = progress;
    this.persist();
  }

  private persist(): void {
    if (!this.context) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        this.context!.globalState.update(STATE_KEY, JSON.stringify(this.state));
      } catch (e) {
        Logger.debug('[Onboarding] Persist failed:', e);
      }
    }, 500);
  }

  private loadState(): OnboardingState {
    if (!this.context) return getDefaultOnboardingState();
    try {
      const saved = this.context.globalState.get<string>(STATE_KEY);
      if (saved) {
        return { ...getDefaultOnboardingState(), ...JSON.parse(saved) };
      }
    } catch {}
    return getDefaultOnboardingState();
  }

  dispose(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.removeAllListeners();
  }
}
