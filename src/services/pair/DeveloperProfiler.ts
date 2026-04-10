/**
 * DeveloperProfiler.ts — Phase 20 Step 20.1
 * Build and maintain developer profile for adaptive suggestions
 */

import * as vscode from 'vscode';
import { DeveloperProfile, EMPTY_PROFILE, DeveloperState, CodingPatternType } from './PairTypes';
import { Logger } from '../../utils/Logger';

const STORAGE_KEY = 'inaCoding.pair.developerProfile';

export class DeveloperProfiler {
  private profile: DeveloperProfile;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.profile = this.load();
  }

  getProfile(): DeveloperProfile { return this.profile; }

  updateFromState(state: DeveloperState): void {
    // Track patterns
    if (state.currentPattern) {
      const key = state.currentPattern.type;
      this.profile.preferredPatterns[key] = (this.profile.preferredPatterns[key] || 0) + 1;
    }

    // Track typing speed (weighted average)
    if (state.editVelocity > 0) {
      this.profile.typingSpeed = this.profile.typingSpeed === 0
        ? state.editVelocity
        : this.profile.typingSpeed * 0.95 + state.editVelocity * 0.05;
    }

    // Track common mistakes from frustration
    if (state.frustrationScore > 70 && state.currentPattern?.file) {
      const mistake = `Stuck at ${state.currentPattern.file}:${state.currentPattern.position.line}`;
      if (!this.profile.commonMistakes.includes(mistake)) {
        this.profile.commonMistakes.push(mistake);
        if (this.profile.commonMistakes.length > 50) this.profile.commonMistakes.shift();
      }
    }

    // Session time
    const elapsed = (Date.now() - state.sessionStartTime) / 60000;
    this.profile.totalSessionMinutes = Math.round(this.profile.totalSessionMinutes + (elapsed > 0 ? 0.033 : 0)); // ~2s updates
    this.profile.lastUpdated = new Date().toISOString();
  }

  recordDismissal(suggestionType: string): void {
    this.profile.dismissedSuggestions.add(suggestionType);
    this.save();
  }

  recordPreference(key: string, value: string): void {
    this.profile.learnedPreferences[key] = value;
    this.save();
  }

  isLearningPhase(): boolean {
    return this.profile.totalSessionMinutes < 120; // First 2 hours
  }

  clearProfile(): void {
    this.profile = { ...EMPTY_PROFILE, dismissedSuggestions: new Set() };
    this.save();
    Logger.info('[DeveloperProfiler] Profile cleared');
  }

  exportProfile(): string {
    const exportable = {
      ...this.profile,
      dismissedSuggestions: Array.from(this.profile.dismissedSuggestions),
    };
    return JSON.stringify(exportable, null, 2);
  }

  importProfile(json: string): void {
    try {
      const data = JSON.parse(json);
      this.profile = {
        ...data,
        dismissedSuggestions: new Set(data.dismissedSuggestions || []),
      };
      this.save();
      Logger.info('[DeveloperProfiler] Profile imported');
    } catch (e) {
      Logger.error('[DeveloperProfiler] Import failed:', e);
    }
  }

  save(): void {
    try {
      const serializable = {
        ...this.profile,
        dismissedSuggestions: Array.from(this.profile.dismissedSuggestions),
      };
      this.context.globalState.update(STORAGE_KEY, serializable);
    } catch { /* */ }
  }

  private load(): DeveloperProfile {
    try {
      const data = this.context.globalState.get<any>(STORAGE_KEY);
      if (data) {
        return {
          ...EMPTY_PROFILE,
          ...data,
          dismissedSuggestions: new Set(data.dismissedSuggestions || []),
        };
      }
    } catch { /* */ }
    return { ...EMPTY_PROFILE, dismissedSuggestions: new Set() };
  }
}
