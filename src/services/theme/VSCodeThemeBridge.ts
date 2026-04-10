/**
 * Phase 11.1 — VS Code Theme Bridge
 * Maps VS Code theme to INA theme tokens.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ThemeMode, ThemeDefinition, ThemeColors } from './ThemeTypes';
import { THEME_DARK, THEME_LIGHT, THEME_HIGH_CONTRAST_DARK } from './ThemeDefinitions';

export class VSCodeThemeBridge extends EventEmitter {
  private static instance: VSCodeThemeBridge;

  static getInstance(): VSCodeThemeBridge {
    if (!VSCodeThemeBridge.instance) { VSCodeThemeBridge.instance = new VSCodeThemeBridge(); }
    return VSCodeThemeBridge.instance;
  }

  detectVSCodeTheme(): ThemeMode {
    const kind = vscode.window.activeColorTheme?.kind;
    switch (kind) {
      case vscode.ColorThemeKind.Light: return ThemeMode.LIGHT;
      case vscode.ColorThemeKind.Dark: return ThemeMode.DARK;
      case vscode.ColorThemeKind.HighContrast: return ThemeMode.HIGH_CONTRAST_DARK;
      case vscode.ColorThemeKind.HighContrastLight: return ThemeMode.HIGH_CONTRAST_LIGHT;
      default: return ThemeMode.DARK;
    }
  }

  buildSyncedTheme(mode: ThemeMode): ThemeDefinition {
    const base = mode === ThemeMode.LIGHT ? THEME_LIGHT
      : mode === ThemeMode.HIGH_CONTRAST_DARK ? THEME_HIGH_CONTRAST_DARK
      : THEME_DARK;
    return { ...base, id: 'vscode-synced', name: `VS Code Synced (${mode})`, kind: 'vscode' as any };
  }

  getVSCodeCSSVariableOverrides(): string {
    // Map VS Code CSS variables to INA tokens for webview
    return `
      :root {
        --ina-bg-primary: var(--vscode-editor-background, var(--ina-bg-primary));
        --ina-bg-secondary: var(--vscode-sideBar-background, var(--ina-bg-secondary));
        --ina-bg-input: var(--vscode-input-background, var(--ina-bg-input));
        --ina-bg-hover: var(--vscode-list-hoverBackground, var(--ina-bg-hover));
        --ina-border-primary: var(--vscode-panel-border, var(--ina-border-primary));
        --ina-border-focus: var(--vscode-focusBorder, var(--ina-border-focus));
        --ina-text-primary: var(--vscode-foreground, var(--ina-text-primary));
        --ina-text-secondary: var(--vscode-descriptionForeground, var(--ina-text-secondary));
        --ina-text-link: var(--vscode-textLink-foreground, var(--ina-text-link));
        --ina-accent-primary: var(--vscode-button-background, var(--ina-accent-primary));
        --ina-accent-primary-text: var(--vscode-button-foreground, var(--ina-accent-primary-text));
        --ina-accent-primary-hover: var(--vscode-button-hoverBackground, var(--ina-accent-primary-hover));
        --ina-status-error: var(--vscode-errorForeground, var(--ina-status-error));
        --ina-badge-bg: var(--vscode-badge-background, var(--ina-badge-bg));
        --ina-badge-text: var(--vscode-badge-foreground, var(--ina-badge-text));
        --ina-scrollbar-thumb: var(--vscode-scrollbarSlider-background, var(--ina-scrollbar-thumb));
        --ina-scrollbar-thumb-hover: var(--vscode-scrollbarSlider-hoverBackground, var(--ina-scrollbar-thumb-hover));
        --ina-chat-input-border: var(--vscode-input-border, var(--ina-chat-input-border));
        --ina-chat-input-focus-border: var(--vscode-focusBorder, var(--ina-chat-input-focus-border));
      }
    `;
  }

  startWatching(): vscode.Disposable {
    return vscode.window.onDidChangeActiveColorTheme((theme) => {
      Logger.info(`[Theme] VS Code theme changed: ${theme.kind}`);
      this.emit('vscode-theme-changed', this.detectVSCodeTheme());
    });
  }

  dispose(): void { this.removeAllListeners(); }
}
