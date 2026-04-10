/**
 * Phase 11.1 — Built-in Theme Definitions
 */
import { ThemeDefinition, ThemeMode, ThemeKind, ThemeColors, DEFAULT_TYPOGRAPHY, DEFAULT_SPACING, DEFAULT_RADIUS, DEFAULT_TRANSITIONS } from './ThemeTypes';

function makeTheme(id: string, name: string, desc: string, mode: ThemeMode, colors: ThemeColors): ThemeDefinition {
  return { id, name, description: desc, mode, kind: ThemeKind.PRESET, colors, typography: DEFAULT_TYPOGRAPHY, spacing: DEFAULT_SPACING, borderRadius: DEFAULT_RADIUS, transitions: DEFAULT_TRANSITIONS, author: 'INA Coding', version: '1.0.0' };
}

const DARK_COLORS: ThemeColors = {
  bgPrimary: '#1e1e1e', bgSecondary: '#252526', bgTertiary: '#2d2d2d', bgElevated: '#333333',
  bgInput: '#3c3c3c', bgHover: '#2a2d2e', bgActive: '#37373d', bgOverlay: 'rgba(0,0,0,0.5)',
  borderPrimary: '#404040', borderSecondary: '#333333', borderFocus: '#3b82f6', borderError: '#ef4444',
  textPrimary: '#cccccc', textSecondary: '#9d9d9d', textTertiary: '#6b6b6b', textInverse: '#ffffff',
  textLink: '#3b82f6', textCode: '#ce9178',
  accentPrimary: '#3b82f6', accentPrimaryHover: '#2563eb', accentPrimaryText: '#ffffff',
  accentSecondary: '#22d3ee', accentSecondaryHover: '#06b6d4',
  statusSuccess: '#22c55e', statusSuccessBg: 'rgba(34,197,94,0.15)', statusWarning: '#eab308', statusWarningBg: 'rgba(234,179,8,0.15)',
  statusError: '#ef4444', statusErrorBg: 'rgba(239,68,68,0.15)', statusInfo: '#3b82f6', statusInfoBg: 'rgba(59,130,246,0.15)',
  chatUserBubble: '#264f78', chatUserText: '#ffffff', chatAssistantBubble: '#2d2d2d', chatAssistantText: '#cccccc',
  chatSystemBg: '#1a1a2e', chatInputBg: '#3c3c3c', chatInputBorder: '#404040', chatInputFocusBorder: '#3b82f6',
  codeBlockBg: '#1a1a2e', codeBlockBorder: '#333355', codeInlineBg: '#383838',
  codeDiffAdded: 'rgba(34,197,94,0.15)', codeDiffRemoved: 'rgba(239,68,68,0.15)', codeDiffChanged: 'rgba(234,179,8,0.15)',
  codeLineNumber: '#6b6b6b', codeSelection: 'rgba(59,130,246,0.3)',
  agentPlanBg: '#1a2332', agentStepPending: '#6b6b6b', agentStepActive: '#3b82f6',
  agentStepComplete: '#22c55e', agentStepFailed: '#ef4444', agentStepSkipped: '#9d9d9d',
  badgeBg: '#4b5563', badgeText: '#e5e7eb', chipBg: '#374151', chipText: '#d1d5db', chipBorder: '#4b5563',
  scrollbarThumb: 'rgba(255,255,255,0.2)', scrollbarTrack: 'transparent', scrollbarThumbHover: 'rgba(255,255,255,0.35)',
  shadowSm: '0 1px 2px rgba(0,0,0,0.3)', shadowMd: '0 4px 6px rgba(0,0,0,0.3)', shadowLg: '0 10px 15px rgba(0,0,0,0.4)',
};

const LIGHT_COLORS: ThemeColors = {
  bgPrimary: '#ffffff', bgSecondary: '#f5f5f5', bgTertiary: '#ebebeb', bgElevated: '#ffffff',
  bgInput: '#ffffff', bgHover: '#f0f0f0', bgActive: '#e8e8e8', bgOverlay: 'rgba(0,0,0,0.3)',
  borderPrimary: '#d4d4d4', borderSecondary: '#e5e5e5', borderFocus: '#2563eb', borderError: '#dc2626',
  textPrimary: '#333333', textSecondary: '#666666', textTertiary: '#999999', textInverse: '#ffffff',
  textLink: '#2563eb', textCode: '#c7254e',
  accentPrimary: '#2563eb', accentPrimaryHover: '#1d4ed8', accentPrimaryText: '#ffffff',
  accentSecondary: '#0891b2', accentSecondaryHover: '#0e7490',
  statusSuccess: '#16a34a', statusSuccessBg: 'rgba(22,163,74,0.1)', statusWarning: '#ca8a04', statusWarningBg: 'rgba(202,138,4,0.1)',
  statusError: '#dc2626', statusErrorBg: 'rgba(220,38,38,0.1)', statusInfo: '#2563eb', statusInfoBg: 'rgba(37,99,235,0.1)',
  chatUserBubble: '#e3f2fd', chatUserText: '#1a1a1a', chatAssistantBubble: '#f5f5f5', chatAssistantText: '#333333',
  chatSystemBg: '#f0f4ff', chatInputBg: '#ffffff', chatInputBorder: '#d4d4d4', chatInputFocusBorder: '#2563eb',
  codeBlockBg: '#f8f8f8', codeBlockBorder: '#e5e5e5', codeInlineBg: '#f0f0f0',
  codeDiffAdded: 'rgba(22,163,74,0.1)', codeDiffRemoved: 'rgba(220,38,38,0.1)', codeDiffChanged: 'rgba(202,138,4,0.1)',
  codeLineNumber: '#999999', codeSelection: 'rgba(37,99,235,0.2)',
  agentPlanBg: '#f0f4ff', agentStepPending: '#999999', agentStepActive: '#2563eb',
  agentStepComplete: '#16a34a', agentStepFailed: '#dc2626', agentStepSkipped: '#999999',
  badgeBg: '#e5e7eb', badgeText: '#374151', chipBg: '#f3f4f6', chipText: '#4b5563', chipBorder: '#d1d5db',
  scrollbarThumb: 'rgba(0,0,0,0.2)', scrollbarTrack: 'transparent', scrollbarThumbHover: 'rgba(0,0,0,0.35)',
  shadowSm: '0 1px 2px rgba(0,0,0,0.05)', shadowMd: '0 4px 6px rgba(0,0,0,0.07)', shadowLg: '0 10px 15px rgba(0,0,0,0.1)',
};

export const THEME_DARK = makeTheme('ina-dark', 'INA Dark', 'Default dark theme', ThemeMode.DARK, DARK_COLORS);
export const THEME_LIGHT = makeTheme('ina-light', 'INA Light', 'Default light theme', ThemeMode.LIGHT, LIGHT_COLORS);

export const THEME_MONOKAI = makeTheme('ina-monokai', 'Monokai', 'Monokai-inspired', ThemeMode.DARK, {
  ...DARK_COLORS, bgPrimary: '#272822', bgSecondary: '#2e2e28', bgTertiary: '#383830', textPrimary: '#f8f8f2', textSecondary: '#a6a68a',
  accentPrimary: '#a6e22e', accentPrimaryHover: '#8bc21b', textLink: '#66d9ef', textCode: '#e6db74',
  codeBlockBg: '#272822', chatAssistantBubble: '#2e2e28', statusError: '#f92672',
});

export const THEME_DRACULA = makeTheme('ina-dracula', 'Dracula', 'Dracula-inspired', ThemeMode.DARK, {
  ...DARK_COLORS, bgPrimary: '#282a36', bgSecondary: '#2d2f3d', bgTertiary: '#343746', textPrimary: '#f8f8f2', textSecondary: '#b0b0c0',
  accentPrimary: '#bd93f9', accentPrimaryHover: '#a370f7', textLink: '#8be9fd', textCode: '#f1fa8c',
  codeBlockBg: '#282a36', chatAssistantBubble: '#2d2f3d', statusError: '#ff5555', statusSuccess: '#50fa7b', statusWarning: '#f1fa8c',
});

export const THEME_NORD = makeTheme('ina-nord', 'Nord', 'Nord-inspired', ThemeMode.DARK, {
  ...DARK_COLORS, bgPrimary: '#2e3440', bgSecondary: '#3b4252', bgTertiary: '#434c5e', textPrimary: '#d8dee9', textSecondary: '#a0aabb',
  accentPrimary: '#88c0d0', accentPrimaryHover: '#6db3c5', accentPrimaryText: '#2e3440', textLink: '#81a1c1', textCode: '#a3be8c',
  codeBlockBg: '#2e3440', chatAssistantBubble: '#3b4252', statusError: '#bf616a', statusSuccess: '#a3be8c', statusWarning: '#ebcb8b',
});

export const THEME_GITHUB_DARK = makeTheme('ina-github-dark', 'GitHub Dark', 'GitHub-inspired dark', ThemeMode.DARK, {
  ...DARK_COLORS, bgPrimary: '#0d1117', bgSecondary: '#161b22', bgTertiary: '#21262d', textPrimary: '#c9d1d9', textSecondary: '#8b949e',
  accentPrimary: '#58a6ff', accentPrimaryHover: '#388bfd', textLink: '#58a6ff', borderPrimary: '#30363d',
  codeBlockBg: '#161b22', chatAssistantBubble: '#161b22',
});

export const THEME_GITHUB_LIGHT = makeTheme('ina-github-light', 'GitHub Light', 'GitHub-inspired light', ThemeMode.LIGHT, {
  ...LIGHT_COLORS, bgPrimary: '#ffffff', bgSecondary: '#f6f8fa', bgTertiary: '#ebeef1', textPrimary: '#1f2328', textSecondary: '#636c76',
  accentPrimary: '#0969da', accentPrimaryHover: '#0550ae', textLink: '#0969da', borderPrimary: '#d0d7de',
  codeBlockBg: '#f6f8fa', chatAssistantBubble: '#f6f8fa',
});

export const THEME_SOLARIZED_DARK = makeTheme('ina-solarized-dark', 'Solarized Dark', 'Solarized dark', ThemeMode.DARK, {
  ...DARK_COLORS, bgPrimary: '#002b36', bgSecondary: '#073642', bgTertiary: '#0a3d4a', textPrimary: '#839496', textSecondary: '#657b83',
  accentPrimary: '#268bd2', accentPrimaryHover: '#1a7ab8', textLink: '#268bd2', textCode: '#2aa198',
  codeBlockBg: '#002b36', statusError: '#dc322f', statusSuccess: '#859900', statusWarning: '#b58900',
});

export const THEME_HIGH_CONTRAST_DARK = makeTheme('ina-hc-dark', 'High Contrast Dark', 'High contrast dark', ThemeMode.HIGH_CONTRAST_DARK, {
  ...DARK_COLORS, bgPrimary: '#000000', bgSecondary: '#0a0a0a', bgTertiary: '#1a1a1a', textPrimary: '#ffffff', textSecondary: '#e0e0e0',
  borderPrimary: '#ffffff', borderSecondary: '#cccccc', accentPrimary: '#4da6ff', accentPrimaryHover: '#2d8cf0',
  chatUserBubble: '#003366', chatAssistantBubble: '#1a1a1a',
});

export const ALL_THEMES: ThemeDefinition[] = [THEME_DARK, THEME_LIGHT, THEME_MONOKAI, THEME_DRACULA, THEME_NORD, THEME_GITHUB_DARK, THEME_GITHUB_LIGHT, THEME_SOLARIZED_DARK, THEME_HIGH_CONTRAST_DARK];
export function getThemeById(id: string): ThemeDefinition | null { return ALL_THEMES.find(t => t.id === id) || null; }
export function getThemesByMode(mode: ThemeMode): ThemeDefinition[] { return ALL_THEMES.filter(t => t.mode === mode); }
