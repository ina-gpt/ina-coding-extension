/**
 * Phase 13.2 — Editor Compatibility Layer
 * Handles differences between VS Code, VS Codium, Theia, and other editors.
 * Provides fallbacks for APIs that may not be available in all editors.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

export type EditorType = 'vscode' | 'vscodium' | 'theia' | 'code-server' | 'gitpod' | 'unknown';

export interface EditorCapabilities {
  secretStorage: boolean;
  terminalAPI: boolean;
  authenticationAPI: boolean;
  telemetryAPI: boolean;
  walkthroughAPI: boolean;
  webviewAPI: boolean;
  treeViewAPI: boolean;
  statusBarAPI: boolean;
  fileSystemWatcher: boolean;
  taskProvider: boolean;
  debugAPI: boolean;
}

export class EditorCompat {
  private static instance: EditorCompat;
  private editorType: EditorType;
  private capabilities: EditorCapabilities;

  private constructor() {
    this.editorType = this.detectEditor();
    this.capabilities = this.detectCapabilities();
  }

  static getInstance(): EditorCompat {
    if (!EditorCompat.instance) {
      EditorCompat.instance = new EditorCompat();
    }
    return EditorCompat.instance;
  }

  getEditorType(): EditorType {
    return this.editorType;
  }

  getCapabilities(): EditorCapabilities {
    return this.capabilities;
  }

  getEditorInfo(): string {
    const caps = Object.entries(this.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    return `${this.editorType} (capabilities: ${caps})`;
  }

  /**
   * Safe wrapper for SecretStorage — falls back to globalState if unavailable
   */
  async getSecret(context: vscode.ExtensionContext, key: string): Promise<string | undefined> {
    try {
      if (context.secrets) {
        return await context.secrets.get(key);
      }
    } catch (e) {
      Logger.debug(`[EditorCompat] SecretStorage.get failed for ${key}, using fallback`);
    }
    return context.globalState.get<string>(`_secret_${key}`);
  }

  async setSecret(context: vscode.ExtensionContext, key: string, value: string): Promise<void> {
    try {
      if (context.secrets) {
        await context.secrets.store(key, value);
        return;
      }
    } catch (e) {
      Logger.debug(`[EditorCompat] SecretStorage.store failed for ${key}, using fallback`);
    }
    await context.globalState.update(`_secret_${key}`, value);
  }

  async deleteSecret(context: vscode.ExtensionContext, key: string): Promise<void> {
    try {
      if (context.secrets) {
        await context.secrets.delete(key);
      }
    } catch {
      // Ignore
    }
    await context.globalState.update(`_secret_${key}`, undefined);
  }

  /**
   * Get machine-specific identifier (for encryption key derivation)
   * Falls back to a stable alternative if machineId is not available
   */
  getMachineId(): string {
    try {
      const machineId = vscode.env.machineId;
      if (machineId && machineId !== 'someValue.machineId') {
        return machineId;
      }
    } catch {
      // machineId not available
    }
    const extPath = vscode.extensions.getExtension('inagpt.ina-coding')?.extensionPath || 'ina-fallback';
    return 'fallback-' + this.simpleHash(extPath);
  }

  /**
   * Check if running in a web/remote context
   */
  isRemote(): boolean {
    return vscode.env.remoteName !== undefined;
  }

  isWeb(): boolean {
    return vscode.env.uiKind === vscode.UIKind.Web;
  }

  /**
   * Get the URI scheme for this editor
   */
  getUriScheme(): string {
    return vscode.env.uriScheme || 'vscode';
  }

  private detectEditor(): EditorType {
    const appName = (vscode.env.appName || '').toLowerCase();
    const uriScheme = vscode.env.uriScheme || '';

    if (appName.includes('codium') || uriScheme === 'vscodium') return 'vscodium';
    if (appName.includes('theia') || uriScheme === 'theia') return 'theia';
    if (appName.includes('code-server') || (process.env.VSCODE_IPC_HOOK_CLI || '').includes('code-server')) return 'code-server';
    if (process.env.GITPOD_WORKSPACE_ID) return 'gitpod';
    if (appName.includes('visual studio code') || uriScheme === 'vscode') return 'vscode';
    return 'unknown';
  }

  private detectCapabilities(): EditorCapabilities {
    return {
      secretStorage: this.checkSecretStorage(),
      terminalAPI: true,
      authenticationAPI: typeof vscode.authentication !== 'undefined' && typeof vscode.authentication.getSession === 'function',
      telemetryAPI: typeof (vscode.env as any).createTelemetryLogger === 'function',
      walkthroughAPI: this.editorType === 'vscode' || this.editorType === 'vscodium',
      webviewAPI: true,
      treeViewAPI: true,
      statusBarAPI: true,
      fileSystemWatcher: true,
      taskProvider: true,
      debugAPI: true,
    };
  }

  private checkSecretStorage(): boolean {
    try {
      // SecretStorage is available through context.secrets, not as a standalone type
      // We check at runtime when getSecret/setSecret is called
      return true;
    } catch {
      return false;
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}
