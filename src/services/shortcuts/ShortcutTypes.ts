/**
 * Phase 11.3 — Shortcut Types
 * Comprehensive type system for keyboard shortcuts, profiles, conflicts, and quick actions.
 */

export interface ShortcutDefinition {
  id: string;
  command: string;
  keys: ShortcutKeys;
  whenClause: string | null;
  description: string;
  category: ShortcutCategoryType;
  isDefault: boolean;
  isCustom: boolean;
  isChord: boolean;
  chordPrefix: string | null;
  weight: number;
}

export interface ShortcutKeys {
  mac: string;
  windows: string;
  linux: string;
  display: string;
}

export enum ShortcutCategoryType {
  CHAT = 'chat',
  INLINE_EDIT = 'inline_edit',
  COMPLETION = 'completion',
  AGENT = 'agent',
  NAVIGATION = 'navigation',
  PANELS = 'panels',
  FILE_OPS = 'file_ops',
  GIT = 'git',
  SEARCH = 'search',
  RULES = 'rules',
  MEMORY = 'memory',
  DOCS = 'docs',
  GENERAL = 'general',
}

export interface ShortcutConflict {
  shortcutId: string;
  conflictsWith: { source: string; command: string; keys: string };
  severity: 'blocking' | 'override' | 'context-safe';
  suggestion: string;
}

export interface ShortcutProfile {
  id: string;
  name: string;
  description: string;
  basedOn: string | null;
  overrides: Record<string, ShortcutKeys>;
  disabled: string[];
}

export interface ShortcutAction {
  id: string;
  command: string;
  title: string;
  description: string;
  category: ShortcutCategoryType;
  defaultKeys: ShortcutKeys;
  whenClause: string | null;
  args: any | null;
  isChord?: boolean;
  chordPrefix?: string;
}

export interface QuickActionGroup {
  name: string;
  icon: string;
  actions: QuickAction[];
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  command: string;
  args: any | null;
  keys: string | null;
  icon: string | null;
}

export interface KeyChord {
  prefix: string;
  suffix: string;
  command: string;
  description: string;
}

export type ShortcutEvent = 'shortcut-triggered' | 'shortcut-customized' | 'conflict-detected' | 'profile-changed';
export type PlatformType = 'mac' | 'windows' | 'linux';

// ============ Master Shortcut Map ============

function k(mac: string, win?: string): ShortcutKeys {
  const w = win || mac.replace('Cmd', 'Ctrl');
  return { mac, windows: w, linux: w, display: '' };
}

export const MASTER_SHORTCUT_MAP: ShortcutAction[] = [
  // === CHAT ===
  { id: 'openChat', command: 'inaCoding.openChat', title: 'Open Chat', description: 'Open and focus the AI chat panel', category: ShortcutCategoryType.CHAT, defaultKeys: k('Cmd+Shift+L'), whenClause: null, args: null },
  { id: 'newChat', command: 'inaCoding.newChat', title: 'New Chat', description: 'Start a new conversation', category: ShortcutCategoryType.CHAT, defaultKeys: k('Cmd+N'), whenClause: 'inaCoding.chatFocused', args: null },
  { id: 'stopGeneration', command: 'inaCoding.stopGeneration', title: 'Stop Generation', description: 'Stop AI generation', category: ShortcutCategoryType.CHAT, defaultKeys: k('Escape'), whenClause: 'inaCoding.isGenerating', args: null },
  { id: 'quickQuestion', command: 'inaCoding.quickQuestion', title: 'Quick Question', description: 'Quick question about selected code', category: ShortcutCategoryType.CHAT, defaultKeys: k('Cmd+I'), whenClause: 'editorTextFocus', args: null },
  { id: 'sendSelectionToChat', command: 'inaCoding.sendSelectionToChat', title: 'Send to Chat', description: 'Send selected code to chat', category: ShortcutCategoryType.CHAT, defaultKeys: k('Cmd+Shift+;'), whenClause: 'editorTextFocus && editorHasSelection', args: null },
  { id: 'pasteImage', command: 'inaCoding.pasteImage', title: 'Paste Image', description: 'Paste image into chat', category: ShortcutCategoryType.CHAT, defaultKeys: k('Cmd+Shift+V'), whenClause: 'inaCoding.chatFocused', args: null },

  // === INLINE EDIT ===
  { id: 'inlineEdit', command: 'inaCoding.inlineEdit', title: 'Inline Edit', description: 'Open inline AI edit', category: ShortcutCategoryType.INLINE_EDIT, defaultKeys: k('Cmd+K'), whenClause: 'editorTextFocus && !editorReadonly', args: null },
  { id: 'acceptEdit', command: 'inaCoding.inlineEditAccept', title: 'Accept Edit', description: 'Accept inline edit changes', category: ShortcutCategoryType.INLINE_EDIT, defaultKeys: k('Cmd+Enter'), whenClause: 'inaCoding.inlineEditPreview', args: null },
  { id: 'rejectEdit', command: 'inaCoding.inlineEditReject', title: 'Reject Edit', description: 'Reject inline edit changes', category: ShortcutCategoryType.INLINE_EDIT, defaultKeys: k('Cmd+Backspace'), whenClause: 'inaCoding.inlineEditPreview', args: null },
  { id: 'cancelEdit', command: 'inaCoding.inlineEditCancel', title: 'Cancel Edit', description: 'Cancel inline edit', category: ShortcutCategoryType.INLINE_EDIT, defaultKeys: k('Escape'), whenClause: 'inaCoding.inlineEditActive', args: null },

  // === COMPLETION ===
  { id: 'acceptCompletion', command: 'inaCoding.acceptCompletion', title: 'Accept Completion', description: 'Accept AI completion', category: ShortcutCategoryType.COMPLETION, defaultKeys: k('Tab'), whenClause: 'inaCoding.ghostTextVisible && !suggestWidgetVisible && !inSnippetMode && editorTextFocus', args: null },
  { id: 'acceptWordCompletion', command: 'inaCoding.acceptCompletionWord', title: 'Accept Word', description: 'Accept completion word by word', category: ShortcutCategoryType.COMPLETION, defaultKeys: k('Cmd+Right'), whenClause: 'inaCoding.ghostTextVisible && editorTextFocus', args: null },
  { id: 'acceptLineCompletion', command: 'inaCoding.acceptCompletionLine', title: 'Accept Line', description: 'Accept completion line by line', category: ShortcutCategoryType.COMPLETION, defaultKeys: k('Cmd+Shift+Right'), whenClause: 'inaCoding.ghostTextVisible && editorTextFocus', args: null },
  { id: 'dismissCompletion', command: 'inaCoding.dismissCompletion', title: 'Dismiss Completion', description: 'Dismiss completion', category: ShortcutCategoryType.COMPLETION, defaultKeys: k('Escape'), whenClause: 'inaCoding.ghostTextVisible && editorTextFocus && !suggestWidgetVisible', args: null },
  { id: 'nextCompletion', command: 'inaCoding.cycleCompletionNext', title: 'Next Alternative', description: 'Next completion alternative', category: ShortcutCategoryType.COMPLETION, defaultKeys: k('Alt+]'), whenClause: 'inaCoding.ghostTextVisible && editorTextFocus', args: null },
  { id: 'prevCompletion', command: 'inaCoding.cycleCompletionPrevious', title: 'Previous Alternative', description: 'Previous completion alternative', category: ShortcutCategoryType.COMPLETION, defaultKeys: k('Alt+['), whenClause: 'inaCoding.ghostTextVisible && editorTextFocus', args: null },
  { id: 'triggerCompletion', command: 'inaCoding.triggerCompletion', title: 'Trigger Completion', description: 'Manually trigger AI completion', category: ShortcutCategoryType.COMPLETION, defaultKeys: k('Ctrl+Space', 'Ctrl+Space'), whenClause: 'editorTextFocus && !editorReadonly && !suggestWidgetVisible', args: null },

  // === AGENT MODE ===
  { id: 'toggleAgent', command: 'inaCoding.toggleAgentMode', title: 'Toggle Agent', description: 'Toggle Agent mode', category: ShortcutCategoryType.AGENT, defaultKeys: k('Cmd+Shift+K'), whenClause: 'editorTextFocus || inaCoding.chatFocused', args: null },
  { id: 'approvePlan', command: 'inaCoding.approvePlan', title: 'Approve Plan', description: 'Approve agent plan', category: ShortcutCategoryType.AGENT, defaultKeys: k('Cmd+Shift+Enter'), whenClause: 'inaCoding.isAgentMode && inaCoding.planPending', args: null },
  { id: 'rejectPlan', command: 'inaCoding.rejectPlan', title: 'Reject Plan', description: 'Reject agent plan', category: ShortcutCategoryType.AGENT, defaultKeys: k('Cmd+Shift+Backspace'), whenClause: 'inaCoding.isAgentMode && inaCoding.planPending', args: null },
  { id: 'pauseExecution', command: 'inaCoding.pauseExecution', title: 'Pause Execution', description: 'Pause agent execution', category: ShortcutCategoryType.AGENT, defaultKeys: k('Escape'), whenClause: 'inaCoding.executionActive && !inaCoding.executionPaused', args: null },
  { id: 'rollbackAll', command: 'inaCoding.rollbackAll', title: 'Rollback All', description: 'Rollback all agent changes', category: ShortcutCategoryType.AGENT, defaultKeys: k('Cmd+Shift+Z'), whenClause: 'inaCoding.executionActive', args: null },

  // === CONTEXT ACTIONS (Cmd+K chords) ===
  { id: 'explainCode', command: 'inaCoding.explainCode', title: 'Explain Code', description: 'Explain selected code', category: ShortcutCategoryType.NAVIGATION, defaultKeys: k('Cmd+K Cmd+E'), whenClause: 'editorTextFocus && editorHasSelection', args: null, isChord: true, chordPrefix: 'Cmd+K' },
  { id: 'refactorCode', command: 'inaCoding.refactorCode', title: 'Refactor Code', description: 'Refactor selected code', category: ShortcutCategoryType.NAVIGATION, defaultKeys: k('Cmd+K Cmd+R'), whenClause: 'editorTextFocus && editorHasSelection', args: null, isChord: true, chordPrefix: 'Cmd+K' },
  { id: 'fixCode', command: 'inaCoding.fixCode', title: 'Fix Code', description: 'Fix errors in selected code', category: ShortcutCategoryType.NAVIGATION, defaultKeys: k('Cmd+K Cmd+F'), whenClause: 'editorTextFocus && editorHasSelection', args: null, isChord: true, chordPrefix: 'Cmd+K' },
  { id: 'addTests', command: 'inaCoding.generateTests', title: 'Generate Tests', description: 'Generate tests for selected code', category: ShortcutCategoryType.NAVIGATION, defaultKeys: k('Cmd+K Cmd+T'), whenClause: 'editorTextFocus && editorHasSelection', args: null, isChord: true, chordPrefix: 'Cmd+K' },
  { id: 'addDocs', command: 'inaCoding.addDocumentation', title: 'Generate Docs', description: 'Generate documentation for selected code', category: ShortcutCategoryType.NAVIGATION, defaultKeys: k('Cmd+K Cmd+D'), whenClause: 'editorTextFocus && editorHasSelection', args: null, isChord: true, chordPrefix: 'Cmd+K' },
  { id: 'optimizeCode', command: 'inaCoding.optimizeSelection', title: 'Optimize Code', description: 'Optimize selected code', category: ShortcutCategoryType.NAVIGATION, defaultKeys: k('Cmd+K Cmd+O'), whenClause: 'editorTextFocus && editorHasSelection', args: null, isChord: true, chordPrefix: 'Cmd+K' },

  // === SEARCH & NAVIGATION ===
  { id: 'searchCodebase', command: 'inaCoding.search', title: 'Search Codebase', description: 'Search codebase semantically', category: ShortcutCategoryType.SEARCH, defaultKeys: k('Cmd+Shift+Alt+F'), whenClause: 'inaCoding.activated', args: null },
  { id: 'searchSymbols', command: 'inaCoding.searchSymbol', title: 'Search Symbols', description: 'Search symbols', category: ShortcutCategoryType.SEARCH, defaultKeys: k('Cmd+Alt+S'), whenClause: null, args: null },
  { id: 'findReferences', command: 'inaCoding.findReferences', title: 'Find References', description: 'Find AI-enhanced references', category: ShortcutCategoryType.SEARCH, defaultKeys: k('Cmd+Alt+R'), whenClause: 'editorTextFocus', args: null },
  { id: 'explainSymbol', command: 'inaCoding.explainSymbol', title: 'Explain Symbol', description: 'Explain symbol at cursor', category: ShortcutCategoryType.SEARCH, defaultKeys: k('Cmd+Alt+T'), whenClause: 'editorTextFocus', args: null },
  { id: 'explainError', command: 'inaCoding.explainError', title: 'Explain Error', description: 'Explain error at cursor', category: ShortcutCategoryType.SEARCH, defaultKeys: k('Cmd+Alt+E'), whenClause: 'editorTextFocus', args: null },

  // === PANELS ===
  { id: 'openRules', command: 'inaCoding.rules.open', title: 'Open Rules', description: 'Open project rules', category: ShortcutCategoryType.PANELS, defaultKeys: k('Cmd+Shift+R'), whenClause: 'inaCoding.chatFocused', args: null },
  { id: 'openMemory', command: 'inaCoding.openMemoryPanel', title: 'Open Memory', description: 'Open memory panel', category: ShortcutCategoryType.PANELS, defaultKeys: k('Cmd+Shift+M'), whenClause: 'inaCoding.chatFocused', args: null },
  { id: 'openDocs', command: 'inaCoding.openDocsPanel', title: 'Open Docs', description: 'Open documentation panel', category: ShortcutCategoryType.PANELS, defaultKeys: k('Cmd+Shift+D'), whenClause: 'inaCoding.chatFocused', args: null },
  { id: 'openGit', command: 'inaCoding.showGitPanel', title: 'Open Git', description: 'Open git panel', category: ShortcutCategoryType.PANELS, defaultKeys: k('Cmd+Shift+G'), whenClause: 'inaCoding.chatFocused', args: null },
  { id: 'openTheme', command: 'inaCoding.openThemeSettings', title: 'Theme Settings', description: 'Open theme settings', category: ShortcutCategoryType.PANELS, defaultKeys: k('Cmd+Shift+T'), whenClause: 'inaCoding.chatFocused', args: null },
  { id: 'openShortcuts', command: 'inaCoding.showShortcuts', title: 'Shortcuts', description: 'Show keyboard shortcuts', category: ShortcutCategoryType.PANELS, defaultKeys: k('Cmd+/'), whenClause: 'inaCoding.chatFocused', args: null },

  // === GIT ===
  { id: 'toggleGitBlame', command: 'inaCoding.showGitBlame', title: 'Toggle Blame', description: 'Toggle inline git blame', category: ShortcutCategoryType.GIT, defaultKeys: k('Cmd+Alt+B'), whenClause: 'editorTextFocus', args: null },

  // === GENERAL ===
  { id: 'commandPalette', command: 'inaCoding.showCommandPalette', title: 'Command Palette', description: 'INA Coding command palette', category: ShortcutCategoryType.GENERAL, defaultKeys: k('Cmd+Shift+P'), whenClause: 'inaCoding.chatFocused', args: null },
  { id: 'runBuild', command: 'inaCoding.runBuild', title: 'Run Build', description: 'Run build command', category: ShortcutCategoryType.FILE_OPS, defaultKeys: k('Cmd+Shift+B'), whenClause: 'inaCoding.agentMode', args: null },
  { id: 'runTests', command: 'inaCoding.runTests', title: 'Run Tests', description: 'Run tests', category: ShortcutCategoryType.FILE_OPS, defaultKeys: k('Cmd+Shift+J'), whenClause: null, args: null },
];

// ============ Built-in Profiles ============

export const BUILT_IN_PROFILES: ShortcutProfile[] = [
  { id: 'default', name: 'Default', description: 'INA Coding default shortcuts', basedOn: null, overrides: {}, disabled: [] },
  { id: 'cursor-compatible', name: 'Cursor Compatible', description: 'Remapped to match Cursor AI shortcuts', basedOn: 'default', overrides: { openChat: k('Cmd+L') }, disabled: [] },
  { id: 'copilot-compatible', name: 'Copilot Compatible', description: 'Avoids GitHub Copilot conflicts', basedOn: 'default', overrides: { quickQuestion: k('Cmd+Shift+I') }, disabled: [] },
  { id: 'minimal', name: 'Minimal', description: 'Only essential shortcuts', basedOn: 'default', overrides: {}, disabled: ['openRules', 'openMemory', 'openDocs', 'openGit', 'openTheme', 'toggleGitBlame', 'searchSymbols', 'findReferences'] },
  { id: 'vim-friendly', name: 'Vim Friendly', description: 'Avoids common Vim key conflicts', basedOn: 'default', overrides: { openChat: k('Cmd+Shift+L'), inlineEdit: k('Cmd+Shift+K') }, disabled: [] },
];
