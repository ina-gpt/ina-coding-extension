/**
 * Phase 11.2 — What's New Service
 * Shows changelog after extension updates.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ChangelogEntry } from './OnboardingTypes';

const VERSION_KEY = 'inaCoding.lastSeenVersion';

export class WhatsNewService extends EventEmitter {
  private static instance: WhatsNewService;
  private context: vscode.ExtensionContext | null = null;
  private currentVersion = '1.0.0';

  static getInstance(): WhatsNewService {
    if (!WhatsNewService.instance) {
      WhatsNewService.instance = new WhatsNewService();
    }
    return WhatsNewService.instance;
  }

  private constructor() { super(); }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    const ext = vscode.extensions.getExtension('inagpt.ina-coding');
    if (ext) {
      this.currentVersion = ext.packageJSON?.version || '1.0.0';
    }
  }

  checkForUpdates(): boolean {
    if (!this.context) return false;
    const lastSeen = this.context.globalState.get<string>(VERSION_KEY);
    if (!lastSeen || lastSeen !== this.currentVersion) {
      if (lastSeen) {
        // Returning user with update
        Logger.info(`[WhatsNew] Version changed: ${lastSeen} → ${this.currentVersion}`);
        return true;
      }
      // First install — don't show what's new
      this.markAsSeen(this.currentVersion);
    }
    return false;
  }

  getChangelog(): ChangelogEntry[] {
    return CURRENT_CHANGELOG;
  }

  getVersion(): string {
    return this.currentVersion;
  }

  markAsSeen(version?: string): void {
    if (!this.context) return;
    this.context.globalState.update(VERSION_KEY, version || this.currentVersion);
  }

  shouldShow(): boolean {
    if (!this.context) return false;
    const lastSeen = this.context.globalState.get<string>(VERSION_KEY);
    return !!lastSeen && lastSeen !== this.currentVersion;
  }

  dispose(): void {
    this.removeAllListeners();
  }
}

const CURRENT_CHANGELOG: ChangelogEntry[] = [
  { type: 'feature', title: 'Agent Mode', description: 'Multi-file editing with plan generation, execution monitoring, and change review' },
  { type: 'feature', title: 'Image Support', description: 'Paste screenshots, design-to-code conversion, image annotation' },
  { type: 'feature', title: 'Memory System', description: 'AI remembers facts, decisions, and patterns across sessions' },
  { type: 'feature', title: 'Documentation RAG', description: 'Index and search documentation with @docs mentions' },
  { type: 'feature', title: 'Git Integration', description: '@git mentions for diff, log, blame, PR context' },
  { type: 'feature', title: 'LSP Integration', description: '@type, @refs, @errors for language server context' },
  { type: 'improvement', title: 'Offline Mode', description: 'Queue requests, local model fallback, graceful degradation' },
  { type: 'improvement', title: 'Theming', description: '10 theme presets, custom accent colors, VS Code sync' },
  { type: 'improvement', title: 'Tab Completion', description: 'AI-powered autocomplete with word-by-word accept and alternatives' },
  { type: 'improvement', title: 'Error Recovery', description: 'Circuit breakers, retry engine, self-healing, error analytics' },
];
