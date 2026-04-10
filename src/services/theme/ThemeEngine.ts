/**
 * Phase 11.1 — Theme Engine
 * THE MAIN THEME ENGINE — manages themes, generates CSS, handles changes.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ThemeDefinition, ThemeConfig, ThemeMode, ThemeColors, ThemeBorderRadius, ACCENT_PRESETS, DEFAULT_TYPOGRAPHY, DEFAULT_SPACING, DEFAULT_RADIUS, DEFAULT_TRANSITIONS } from './ThemeTypes';
import { ALL_THEMES, getThemeById, THEME_DARK, THEME_LIGHT } from './ThemeDefinitions';
import { VSCodeThemeBridge } from './VSCodeThemeBridge';

export class ThemeEngine extends EventEmitter {
  private static instance: ThemeEngine;
  private activeTheme: ThemeDefinition;
  private config: ThemeConfig;
  private vscodeBridge: VSCodeThemeBridge;
  private context: vscode.ExtensionContext | null = null;
  private customThemes = new Map<string, ThemeDefinition>();

  static getInstance(): ThemeEngine {
    if (!ThemeEngine.instance) { ThemeEngine.instance = new ThemeEngine(); }
    return ThemeEngine.instance;
  }

  private constructor() {
    super();
    this.vscodeBridge = VSCodeThemeBridge.getInstance();
    this.config = { mode: ThemeMode.AUTO, customAccentColor: null, customThemeId: null, fontSize: 'medium', fontFamily: null, codeFontFamily: null, borderRadius: 'medium', compactMode: false, animateThemeChange: true, syncWithVSCode: true };
    this.activeTheme = THEME_DARK;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    // Load persisted config
    const saved = context.globalState.get<string>('inaCoding.themeConfig');
    if (saved) { try { Object.assign(this.config, JSON.parse(saved)); } catch {} }
    // Resolve active theme
    this.resolveTheme();
    // Watch VS Code theme changes
    this.vscodeBridge.on('vscode-theme-changed', (mode: ThemeMode) => {
      if (this.config.syncWithVSCode) {
        this.config.mode = ThemeMode.AUTO;
        this.resolveTheme();
        this.emit('theme-changed', this.activeTheme, this.config);
      }
    });
    Logger.info(`[Theme] Initialized: ${this.activeTheme.name} (${this.activeTheme.mode})`);
  }

  getActiveTheme(): ThemeDefinition { return this.activeTheme; }
  getConfig(): ThemeConfig { return { ...this.config }; }

  getThemeCSS(): string {
    const t = this.activeTheme;
    const lines: string[] = [':root {'];
    // Colors
    for (const [key, val] of Object.entries(t.colors)) {
      lines.push(`  --ina-${this.kebab(key)}: ${val};`);
    }
    // Typography
    for (const [key, val] of Object.entries(t.typography)) {
      lines.push(`  --ina-${this.kebab(key)}: ${val};`);
    }
    // Spacing
    for (const [key, val] of Object.entries(t.spacing)) {
      lines.push(`  --ina-spacing-${key}: ${val};`);
    }
    // Radius
    for (const [key, val] of Object.entries(t.borderRadius)) {
      lines.push(`  --ina-radius-${key}: ${val};`);
    }
    // Transitions
    for (const [key, val] of Object.entries(t.transitions)) {
      lines.push(`  --ina-transition-${key}: ${val};`);
    }
    // Shadows
    lines.push('}');
    return lines.join('\n');
  }

  setTheme(themeId: string): void {
    const theme = getThemeById(themeId) || this.customThemes.get(themeId);
    if (!theme) { Logger.warn(`[Theme] Unknown theme: ${themeId}`); return; }
    this.activeTheme = this.applyAccentOverride(theme, this.config.customAccentColor);
    this.config.customThemeId = themeId;
    this.config.syncWithVSCode = false;
    this.persist();
    this.emit('theme-changed', this.activeTheme, this.config);
  }

  setMode(mode: ThemeMode): void {
    this.config.mode = mode;
    this.config.syncWithVSCode = mode === ThemeMode.AUTO;
    this.resolveTheme();
    this.persist();
    this.emit('theme-changed', this.activeTheme, this.config);
  }

  setAccentColor(color: string): void {
    this.config.customAccentColor = color;
    this.activeTheme = this.applyAccentOverride(this.activeTheme, color);
    this.persist();
    this.emit('accent-changed', this.activeTheme, this.config);
  }

  setFontSize(size: 'small' | 'medium' | 'large'): void {
    this.config.fontSize = size;
    const offsets: Record<string, number> = { small: -1, medium: 0, large: 1 };
    const offset = offsets[size] || 0;
    this.activeTheme = { ...this.activeTheme, typography: { ...this.activeTheme.typography,
      fontSizeXs: `${11 + offset}px`, fontSizeSm: `${12 + offset}px`, fontSizeMd: `${13 + offset}px`,
      fontSizeLg: `${14 + offset}px`, fontSizeXl: `${16 + offset}px`, fontSizeXxl: `${20 + offset}px`,
    }};
    this.persist();
    this.emit('theme-changed', this.activeTheme, this.config);
  }

  setFontFamily(family: string): void { this.config.fontFamily = family || null; this.persist(); this.emit('theme-changed', this.activeTheme, this.config); }
  setCodeFontFamily(family: string): void { this.config.codeFontFamily = family || null; this.persist(); this.emit('theme-changed', this.activeTheme, this.config); }

  setBorderRadius(level: 'none' | 'small' | 'medium' | 'large'): void {
    this.config.borderRadius = level;
    const scales: Record<string, ThemeBorderRadius> = {
      none: { none: '0', sm: '0', md: '0', lg: '0', xl: '0', full: '0' },
      small: { none: '0', sm: '2px', md: '3px', lg: '4px', xl: '6px', full: '9999px' },
      medium: { none: '0', sm: '4px', md: '6px', lg: '8px', xl: '12px', full: '9999px' },
      large: { none: '0', sm: '6px', md: '10px', lg: '14px', xl: '18px', full: '9999px' },
    };
    this.activeTheme = { ...this.activeTheme, borderRadius: scales[level] || scales.medium };
    this.persist();
    this.emit('theme-changed', this.activeTheme, this.config);
  }

  setCompactMode(compact: boolean): void {
    this.config.compactMode = compact;
    if (compact) {
      this.activeTheme = { ...this.activeTheme, spacing: { xs: '1px', sm: '2px', md: '4px', lg: '8px', xl: '12px', xxl: '16px', xxxl: '24px' } };
    } else {
      this.activeTheme = { ...this.activeTheme, spacing: DEFAULT_SPACING };
    }
    this.persist();
    this.emit('theme-changed', this.activeTheme, this.config);
  }

  getAvailableThemes(): ThemeDefinition[] { return [...ALL_THEMES, ...this.customThemes.values()]; }
  addCustomTheme(theme: ThemeDefinition): void { this.customThemes.set(theme.id, theme); this.persist(); }

  getThemeForWebview(): { css: string; vscodeSyncCSS: string; themeId: string; mode: string; config: ThemeConfig } {
    return {
      css: this.getThemeCSS(),
      vscodeSyncCSS: this.config.syncWithVSCode ? this.vscodeBridge.getVSCodeCSSVariableOverrides() : '',
      themeId: this.activeTheme.id,
      mode: this.activeTheme.mode,
      config: this.getConfig(),
    };
  }

  private resolveTheme(): void {
    if (this.config.customThemeId && !this.config.syncWithVSCode) {
      const custom = getThemeById(this.config.customThemeId) || this.customThemes.get(this.config.customThemeId);
      if (custom) { this.activeTheme = this.applyAccentOverride(custom, this.config.customAccentColor); return; }
    }
    const mode = this.config.mode === ThemeMode.AUTO ? this.vscodeBridge.detectVSCodeTheme() : this.config.mode;
    const matched = ALL_THEMES.find(t => t.mode === mode) || (mode === ThemeMode.LIGHT ? THEME_LIGHT : THEME_DARK);
    this.activeTheme = this.applyAccentOverride(matched, this.config.customAccentColor);
  }

  private applyAccentOverride(theme: ThemeDefinition, accent: string | null): ThemeDefinition {
    if (!accent) return theme;
    const hoverColor = this.darken(accent, 10);
    const textColor = this.contrastingText(accent);
    return { ...theme, colors: { ...theme.colors, accentPrimary: accent, accentPrimaryHover: hoverColor, accentPrimaryText: textColor, borderFocus: accent, chatInputFocusBorder: accent, statusInfo: accent } };
  }

  private darken(hex: string, percent: number): string {
    const { r, g, b } = this.parseHex(hex);
    const factor = 1 - percent / 100;
    return `#${Math.round(r * factor).toString(16).padStart(2, '0')}${Math.round(g * factor).toString(16).padStart(2, '0')}${Math.round(b * factor).toString(16).padStart(2, '0')}`;
  }

  private contrastingText(hex: string): string {
    const { r, g, b } = this.parseHex(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  private parseHex(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  private kebab(str: string): string { return str.replace(/([A-Z])/g, '-$1').toLowerCase(); }

  private persist(): void {
    if (!this.context) return;
    try { this.context.globalState.update('inaCoding.themeConfig', JSON.stringify(this.config)); } catch {}
  }

  dispose(): void { this.vscodeBridge.dispose(); this.removeAllListeners(); }
}
