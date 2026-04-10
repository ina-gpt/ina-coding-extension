/**
 * Phase 11.1 — Theme Types
 * Comprehensive type system for theming.
 */

export enum ThemeMode {
  LIGHT = 'light', DARK = 'dark',
  HIGH_CONTRAST_DARK = 'high-contrast-dark',
  HIGH_CONTRAST_LIGHT = 'high-contrast-light',
  AUTO = 'auto',
}

export enum ThemeKind { VSCODE_SYNC = 'vscode', CUSTOM = 'custom', PRESET = 'preset' }

export interface ThemeColors {
  bgPrimary: string; bgSecondary: string; bgTertiary: string; bgElevated: string;
  bgInput: string; bgHover: string; bgActive: string; bgOverlay: string;
  borderPrimary: string; borderSecondary: string; borderFocus: string; borderError: string;
  textPrimary: string; textSecondary: string; textTertiary: string; textInverse: string;
  textLink: string; textCode: string;
  accentPrimary: string; accentPrimaryHover: string; accentPrimaryText: string;
  accentSecondary: string; accentSecondaryHover: string;
  statusSuccess: string; statusSuccessBg: string; statusWarning: string; statusWarningBg: string;
  statusError: string; statusErrorBg: string; statusInfo: string; statusInfoBg: string;
  chatUserBubble: string; chatUserText: string; chatAssistantBubble: string; chatAssistantText: string;
  chatSystemBg: string; chatInputBg: string; chatInputBorder: string; chatInputFocusBorder: string;
  codeBlockBg: string; codeBlockBorder: string; codeInlineBg: string;
  codeDiffAdded: string; codeDiffRemoved: string; codeDiffChanged: string;
  codeLineNumber: string; codeSelection: string;
  agentPlanBg: string; agentStepPending: string; agentStepActive: string;
  agentStepComplete: string; agentStepFailed: string; agentStepSkipped: string;
  badgeBg: string; badgeText: string; chipBg: string; chipText: string; chipBorder: string;
  scrollbarThumb: string; scrollbarTrack: string; scrollbarThumbHover: string;
  shadowSm: string; shadowMd: string; shadowLg: string;
}

export interface ThemeTypography {
  fontFamily: string; fontFamilyCode: string;
  fontSizeXs: string; fontSizeSm: string; fontSizeMd: string; fontSizeLg: string;
  fontSizeXl: string; fontSizeXxl: string;
  fontWeightNormal: number; fontWeightMedium: number; fontWeightSemibold: number; fontWeightBold: number;
  lineHeightTight: string; lineHeightNormal: string; lineHeightRelaxed: string;
}

export interface ThemeSpacing {
  xs: string; sm: string; md: string; lg: string; xl: string; xxl: string; xxxl: string;
}

export interface ThemeBorderRadius {
  none: string; sm: string; md: string; lg: string; xl: string; full: string;
}

export interface ThemeTransition {
  fast: string; normal: string; slow: string; theme: string;
}

export interface ThemeDefinition {
  id: string; name: string; description: string; mode: ThemeMode; kind: ThemeKind;
  colors: ThemeColors; typography: ThemeTypography; spacing: ThemeSpacing;
  borderRadius: ThemeBorderRadius; transitions: ThemeTransition;
  author: string | null; version: string;
}

export interface AccentColorPreset { name: string; color: string; hoverColor: string; textColor: string; }

export interface ThemeConfig {
  mode: ThemeMode; customAccentColor: string | null; customThemeId: string | null;
  fontSize: 'small' | 'medium' | 'large'; fontFamily: string | null; codeFontFamily: string | null;
  borderRadius: 'none' | 'small' | 'medium' | 'large'; compactMode: boolean;
  animateThemeChange: boolean; syncWithVSCode: boolean;
}

export type ThemeEvent = 'theme-changed' | 'accent-changed' | 'font-changed' | 'mode-changed' | 'custom-theme-loaded';

export const ACCENT_PRESETS: AccentColorPreset[] = [
  { name: 'Blue', color: '#2563eb', hoverColor: '#1d4ed8', textColor: '#ffffff' },
  { name: 'Purple', color: '#7c3aed', hoverColor: '#6d28d9', textColor: '#ffffff' },
  { name: 'Teal', color: '#0d9488', hoverColor: '#0f766e', textColor: '#ffffff' },
  { name: 'Green', color: '#16a34a', hoverColor: '#15803d', textColor: '#ffffff' },
  { name: 'Orange', color: '#ea580c', hoverColor: '#c2410c', textColor: '#ffffff' },
  { name: 'Pink', color: '#db2777', hoverColor: '#be185d', textColor: '#ffffff' },
  { name: 'Red', color: '#dc2626', hoverColor: '#b91c1c', textColor: '#ffffff' },
  { name: 'Cyan', color: '#0891b2', hoverColor: '#0e7490', textColor: '#ffffff' },
  { name: 'Indigo', color: '#4f46e5', hoverColor: '#4338ca', textColor: '#ffffff' },
  { name: 'INA Brand', color: '#3b82f6', hoverColor: '#2563eb', textColor: '#ffffff' },
];

export const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  fontFamily: "var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif)",
  fontFamilyCode: "var(--vscode-editor-font-family, 'Fira Code', Consolas, monospace)",
  fontSizeXs: '11px', fontSizeSm: '12px', fontSizeMd: '13px', fontSizeLg: '14px',
  fontSizeXl: '16px', fontSizeXxl: '20px',
  fontWeightNormal: 400, fontWeightMedium: 500, fontWeightSemibold: 600, fontWeightBold: 700,
  lineHeightTight: '1.25', lineHeightNormal: '1.5', lineHeightRelaxed: '1.75',
};

export const DEFAULT_SPACING: ThemeSpacing = { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px', xxl: '24px', xxxl: '32px' };
export const DEFAULT_RADIUS: ThemeBorderRadius = { none: '0', sm: '4px', md: '6px', lg: '8px', xl: '12px', full: '9999px' };
export const DEFAULT_TRANSITIONS: ThemeTransition = { fast: '100ms ease', normal: '200ms ease', slow: '300ms ease', theme: '400ms ease' };
