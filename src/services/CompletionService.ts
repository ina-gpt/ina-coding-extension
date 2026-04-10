import * as vscode from 'vscode';
import { ConfigManager } from '../utils/ConfigManager';

export class CompletionService {
  private _enabled: boolean;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(_context: vscode.ExtensionContext) {
    this._enabled = ConfigManager.getCompletion().enabled;

    ConfigManager.onChange('completion.enabled', (value) => {
      this._enabled = value as boolean;
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean) {
    this._enabled = enabled;
    ConfigManager.set('completion.enabled', enabled);
  }

  cancelPending() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  dispose() {
    this.cancelPending();
  }
}
