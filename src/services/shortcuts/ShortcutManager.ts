/**
 * Phase 11.3 — Shortcut Manager
 * Central manager for all keyboard shortcuts, profiles, customization, and conflict detection.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import {
  ShortcutDefinition, ShortcutKeys, ShortcutCategoryType, ShortcutConflict,
  ShortcutProfile, ShortcutAction, PlatformType,
  MASTER_SHORTCUT_MAP, BUILT_IN_PROFILES,
} from './ShortcutTypes';

const STATE_KEY_OVERRIDES = 'inaCoding.shortcutOverrides';
const STATE_KEY_DISABLED = 'inaCoding.shortcutDisabled';
const STATE_KEY_PROFILE = 'inaCoding.shortcutProfile';

export class ShortcutManager extends EventEmitter {
  private static instance: ShortcutManager;
  private shortcuts = new Map<string, ShortcutDefinition>();
  private customOverrides = new Map<string, ShortcutKeys>();
  private disabledShortcuts = new Set<string>();
  private activeProfile: ShortcutProfile | null = null;
  private platform: PlatformType;
  private context: vscode.ExtensionContext | null = null;

  static getInstance(): ShortcutManager {
    if (!ShortcutManager.instance) {
      ShortcutManager.instance = new ShortcutManager();
    }
    return ShortcutManager.instance;
  }

  private constructor() {
    super();
    this.platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadFromGlobalState();
    this.registerAllShortcuts();

    const profileId = vscode.workspace.getConfiguration('inaCoding.shortcuts').get<string>('profile', 'default');
    const profile = BUILT_IN_PROFILES.find(p => p.id === profileId);
    if (profile) this.applyProfile(profile);

    Logger.info(`[Shortcuts] Initialized: ${this.shortcuts.size} shortcuts, platform=${this.platform}, profile=${profileId}`);
  }

  private registerAllShortcuts(): void {
    for (const action of MASTER_SHORTCUT_MAP) {
      const customKeys = this.customOverrides.get(action.id);
      const keys = customKeys || action.defaultKeys;
      const def: ShortcutDefinition = {
        id: action.id,
        command: action.command,
        keys: { ...keys, display: this.getDisplayString(keys) },
        whenClause: action.whenClause,
        description: action.description,
        category: action.category,
        isDefault: !customKeys,
        isCustom: !!customKeys,
        isChord: action.isChord || false,
        chordPrefix: action.chordPrefix || null,
        weight: this.getCategoryWeight(action.category),
      };
      this.shortcuts.set(action.id, def);
    }
  }

  getShortcut(id: string): ShortcutDefinition | null {
    return this.shortcuts.get(id) || null;
  }

  getAllShortcuts(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values()).filter(s => !this.disabledShortcuts.has(s.id));
  }

  getAllShortcutsIncludingDisabled(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values());
  }

  getByCategory(category: ShortcutCategoryType): ShortcutDefinition[] {
    return this.getAllShortcuts().filter(s => s.category === category);
  }

  getByCommand(command: string): ShortcutDefinition | null {
    return Array.from(this.shortcuts.values()).find(s => s.command === command) || null;
  }

  isDisabled(id: string): boolean {
    return this.disabledShortcuts.has(id);
  }

  customizeShortcut(id: string, newKeys: ShortcutKeys): { success: boolean; conflicts: ShortcutConflict[] } {
    const existing = this.shortcuts.get(id);
    if (!existing) return { success: false, conflicts: [] };

    const platformKey = this.getPlatformKey(newKeys);
    const conflicts = this.detectConflicts(platformKey, existing.whenClause);

    const blockingConflicts = conflicts.filter(c => c.severity === 'blocking');
    if (blockingConflicts.length > 0) {
      return { success: false, conflicts: blockingConflicts };
    }

    this.customOverrides.set(id, newKeys);
    const updatedDef: ShortcutDefinition = {
      ...existing,
      keys: { ...newKeys, display: this.getDisplayString(newKeys) },
      isDefault: false,
      isCustom: true,
    };
    this.shortcuts.set(id, updatedDef);
    this.persist();
    this.emit('shortcut-customized', id, newKeys);

    if (conflicts.length > 0) {
      this.emit('conflict-detected', conflicts);
    }

    return { success: true, conflicts };
  }

  resetShortcut(id: string): void {
    this.customOverrides.delete(id);
    const action = MASTER_SHORTCUT_MAP.find(a => a.id === id);
    if (action) {
      const def: ShortcutDefinition = {
        ...this.shortcuts.get(id)!,
        keys: { ...action.defaultKeys, display: this.getDisplayString(action.defaultKeys) },
        isDefault: true,
        isCustom: false,
      };
      this.shortcuts.set(id, def);
    }
    this.persist();
    this.emit('shortcut-customized', id, null);
  }

  resetAllShortcuts(): void {
    this.customOverrides.clear();
    this.disabledShortcuts.clear();
    this.registerAllShortcuts();
    this.persist();
    this.emit('profile-changed', null);
  }

  disableShortcut(id: string): void {
    this.disabledShortcuts.add(id);
    this.persist();
  }

  enableShortcut(id: string): void {
    this.disabledShortcuts.delete(id);
    this.persist();
  }

  searchShortcuts(query: string): ShortcutDefinition[] {
    const q = query.toLowerCase();
    return this.getAllShortcutsIncludingDisabled().filter(s =>
      s.description.toLowerCase().includes(q) ||
      s.command.toLowerCase().includes(q) ||
      s.keys.display.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }

  getDisplayKeys(id: string): string {
    const s = this.shortcuts.get(id);
    return s ? this.getDisplayString(s.keys) : '';
  }

  getPlatform(): PlatformType {
    return this.platform;
  }

  detectConflicts(keys: string, whenClause: string | null): ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = [];
    const normalizedKeys = keys.toLowerCase().replace(/\s+/g, '');

    // Check against INA shortcuts
    for (const [id, def] of this.shortcuts) {
      const defKey = this.getPlatformKey(def.keys).toLowerCase().replace(/\s+/g, '');
      if (defKey === normalizedKeys) {
        // Same keys — check if when clauses make them context-safe
        if (def.whenClause && whenClause && def.whenClause !== whenClause && !this.whenClausesOverlap(def.whenClause, whenClause)) {
          conflicts.push({ shortcutId: id, conflictsWith: { source: 'INA Coding', command: def.command, keys: defKey }, severity: 'context-safe', suggestion: 'Different contexts — no real conflict' });
        } else {
          conflicts.push({ shortcutId: id, conflictsWith: { source: 'INA Coding', command: def.command, keys: defKey }, severity: 'blocking', suggestion: `Change one of the shortcuts` });
        }
      }
    }

    // Check against known VS Code defaults
    const vsCodeCmd = KNOWN_VSCODE_SHORTCUTS[normalizedKeys];
    if (vsCodeCmd) {
      const severity = whenClause ? 'context-safe' : 'override';
      conflicts.push({ shortcutId: '', conflictsWith: { source: 'VS Code', command: vsCodeCmd, keys: normalizedKeys }, severity, suggestion: severity === 'context-safe' ? 'Context-specific — should work' : `Overrides VS Code's "${vsCodeCmd}"` });
    }

    return conflicts;
  }

  // Profiles
  getProfiles(): ShortcutProfile[] {
    return [...BUILT_IN_PROFILES];
  }

  getActiveProfile(): ShortcutProfile | null {
    return this.activeProfile;
  }

  setProfile(profileId: string): void {
    const profile = BUILT_IN_PROFILES.find(p => p.id === profileId);
    if (!profile) return;
    this.applyProfile(profile);
    this.persist();
    this.emit('profile-changed', profile);
  }

  private applyProfile(profile: ShortcutProfile): void {
    this.activeProfile = profile;
    // Apply profile overrides on top of custom overrides
    for (const [id, keys] of Object.entries(profile.overrides)) {
      if (!this.customOverrides.has(id)) {
        const def = this.shortcuts.get(id);
        if (def) {
          this.shortcuts.set(id, { ...def, keys: { ...keys, display: this.getDisplayString(keys) } });
        }
      }
    }
    // Apply profile disabled
    for (const id of profile.disabled) {
      this.disabledShortcuts.add(id);
    }
  }

  exportConfiguration(): string {
    return JSON.stringify({
      overrides: Object.fromEntries(this.customOverrides),
      disabled: Array.from(this.disabledShortcuts),
      profile: this.activeProfile?.id || 'default',
    }, null, 2);
  }

  importConfiguration(json: string): void {
    try {
      const data = JSON.parse(json);
      if (data.overrides) {
        this.customOverrides = new Map(Object.entries(data.overrides));
      }
      if (data.disabled) {
        this.disabledShortcuts = new Set(data.disabled);
      }
      this.registerAllShortcuts();
      if (data.profile) {
        const profile = BUILT_IN_PROFILES.find(p => p.id === data.profile);
        if (profile) this.applyProfile(profile);
      }
      this.persist();
    } catch (e) {
      Logger.warn('[Shortcuts] Import failed:', e);
    }
  }

  // For webview
  getShortcutsForWebview(): { shortcuts: ShortcutDefinition[]; profiles: ShortcutProfile[]; activeProfileId: string; disabledIds: string[] } {
    return {
      shortcuts: this.getAllShortcutsIncludingDisabled().map(s => ({ ...s, keys: { ...s.keys, display: this.getDisplayString(s.keys) } })),
      profiles: this.getProfiles(),
      activeProfileId: this.activeProfile?.id || 'default',
      disabledIds: Array.from(this.disabledShortcuts),
    };
  }

  private getDisplayString(keys: ShortcutKeys): string {
    const raw = this.getPlatformKey(keys);
    if (this.platform === 'mac') {
      return raw.replace(/Cmd/g, '⌘').replace(/Shift/g, '⇧').replace(/Alt/g, '⌥').replace(/Ctrl/g, '⌃').replace(/\+/g, '');
    }
    return raw;
  }

  private getPlatformKey(keys: ShortcutKeys): string {
    return keys[this.platform] || keys.mac.replace('Cmd', 'Ctrl');
  }

  private getCategoryWeight(category: ShortcutCategoryType): number {
    const weights: Record<string, number> = { chat: 100, inline_edit: 90, completion: 80, agent: 70, navigation: 60, search: 50, panels: 40, git: 30, file_ops: 20, general: 10 };
    return weights[category] || 10;
  }

  private whenClausesOverlap(a: string, b: string): boolean {
    // Simple heuristic: if both contain the same context key, they might overlap
    const keysA = a.split(/\s*&&\s*/).map(k => k.trim().replace('!', ''));
    const keysB = b.split(/\s*&&\s*/).map(k => k.trim().replace('!', ''));
    return keysA.some(k => keysB.includes(k));
  }

  private persist(): void {
    if (!this.context) return;
    try {
      this.context.globalState.update(STATE_KEY_OVERRIDES, JSON.stringify(Object.fromEntries(this.customOverrides)));
      this.context.globalState.update(STATE_KEY_DISABLED, JSON.stringify(Array.from(this.disabledShortcuts)));
      this.context.globalState.update(STATE_KEY_PROFILE, this.activeProfile?.id || 'default');
    } catch {}
  }

  private loadFromGlobalState(): void {
    if (!this.context) return;
    try {
      const ov = this.context.globalState.get<string>(STATE_KEY_OVERRIDES);
      if (ov) this.customOverrides = new Map(Object.entries(JSON.parse(ov)));
      const dis = this.context.globalState.get<string>(STATE_KEY_DISABLED);
      if (dis) this.disabledShortcuts = new Set(JSON.parse(dis));
    } catch {}
  }

  dispose(): void {
    this.removeAllListeners();
  }
}

const KNOWN_VSCODE_SHORTCUTS: Record<string, string> = {
  'cmd+k': 'VS Code chord prefix',
  'ctrl+k': 'VS Code chord prefix',
  'cmd+l': 'editor.action.selectLine',
  'ctrl+l': 'editor.action.selectLine',
  'cmd+n': 'workbench.action.files.newUntitledFile',
  'ctrl+n': 'workbench.action.files.newUntitledFile',
  'cmd+shift+k': 'editor.action.deleteLines',
  'ctrl+shift+k': 'editor.action.deleteLines',
  'cmd+shift+p': 'workbench.action.showCommands',
  'ctrl+shift+p': 'workbench.action.showCommands',
  'cmd+shift+m': 'workbench.actions.view.problems',
  'ctrl+shift+m': 'workbench.actions.view.problems',
  'cmd+shift+d': 'workbench.view.debug',
  'ctrl+shift+d': 'workbench.view.debug',
  'cmd+shift+g': 'workbench.view.scm',
  'ctrl+shift+g': 'workbench.view.scm',
  'cmd+shift+b': 'workbench.action.tasks.build',
  'ctrl+shift+b': 'workbench.action.tasks.build',
  'cmd+shift+t': 'workbench.action.reopenClosedEditor',
  'ctrl+shift+t': 'workbench.action.reopenClosedEditor',
  'ctrl+space': 'editor.action.triggerSuggest',
  'cmd+i': 'editor.action.triggerSuggest',
};
