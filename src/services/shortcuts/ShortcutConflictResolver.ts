/**
 * Phase 11.3 — Shortcut Conflict Resolver
 * Detects and helps resolve keyboard shortcut conflicts.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ShortcutConflict } from './ShortcutTypes';
import { ShortcutManager } from './ShortcutManager';

export class ShortcutConflictResolver {
  private static instance: ShortcutConflictResolver;

  static getInstance(): ShortcutConflictResolver {
    if (!ShortcutConflictResolver.instance) {
      ShortcutConflictResolver.instance = new ShortcutConflictResolver();
    }
    return ShortcutConflictResolver.instance;
  }

  private constructor() {}

  runFullAudit(): ShortcutConflict[] {
    const sm = ShortcutManager.getInstance();
    const allConflicts: ShortcutConflict[] = [];
    const shortcuts = sm.getAllShortcuts();

    // Check each shortcut against all others
    const seen = new Map<string, string>();
    for (const s of shortcuts) {
      const key = this.normalizeKey(s.keys[sm.getPlatform()]);

      if (seen.has(key)) {
        const otherId = seen.get(key)!;
        const other = sm.getShortcut(otherId);
        if (other) {
          // Check if when clauses make them context-safe
          if (s.whenClause && other.whenClause && s.whenClause !== other.whenClause) {
            allConflicts.push({
              shortcutId: s.id,
              conflictsWith: { source: 'INA Coding', command: other.command, keys: key },
              severity: 'context-safe',
              suggestion: 'Different contexts — no real conflict',
            });
          }
          // Same or overlapping when clause is a real conflict — but Escape with different contexts is expected
        }
      } else {
        seen.set(key, s.id);
      }
    }

    // Check against installed extensions
    const extConflicts = this.detectInstalledExtensionConflicts();
    allConflicts.push(...extConflicts);

    Logger.info(`[Shortcuts] Audit complete: ${allConflicts.length} conflicts found`);
    return allConflicts;
  }

  async resolveConflict(conflict: ShortcutConflict): Promise<'reassign' | 'override' | 'disable' | 'skip'> {
    const items = [
      { label: 'Reassign INA shortcut', description: 'Choose a new key combination', value: 'reassign' as const },
      { label: 'Override (INA wins)', description: 'Keep INA shortcut, other yields', value: 'override' as const },
      { label: 'Disable INA shortcut', description: 'Remove this INA shortcut', value: 'disable' as const },
      { label: 'Skip / Ignore', description: 'Leave as-is', value: 'skip' as const },
    ];

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: `"${conflict.conflictsWith.keys}" conflicts with ${conflict.conflictsWith.source}: ${conflict.conflictsWith.command}`,
    });

    return pick?.value || 'skip';
  }

  autoResolveConflicts(conflicts: ShortcutConflict[]): { resolved: number; remaining: ShortcutConflict[] } {
    const remaining = conflicts.filter(c => c.severity !== 'context-safe');
    const resolved = conflicts.length - remaining.length;
    return { resolved, remaining };
  }

  detectInstalledExtensionConflicts(): ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = [];
    const sm = ShortcutManager.getInstance();

    // Check for known conflicting extensions
    const knownConflicts: { extensionId: string; name: string; shortcuts: Record<string, string> }[] = [
      { extensionId: 'github.copilot', name: 'GitHub Copilot', shortcuts: { 'tab': 'copilot.accept', 'alt+]': 'copilot.next', 'alt+[': 'copilot.previous' } },
      { extensionId: 'tabnine.tabnine-vscode', name: 'TabNine', shortcuts: { 'tab': 'tabnine.accept' } },
      { extensionId: 'codeium.codeium', name: 'Codeium', shortcuts: { 'tab': 'codeium.accept' } },
    ];

    for (const ext of knownConflicts) {
      const installed = vscode.extensions.getExtension(ext.extensionId);
      if (installed) {
        for (const [key, cmd] of Object.entries(ext.shortcuts)) {
          const normalKey = this.normalizeKey(key);
          const inaShortcut = sm.getAllShortcuts().find(s => this.normalizeKey(s.keys[sm.getPlatform()]) === normalKey);
          if (inaShortcut) {
            conflicts.push({
              shortcutId: inaShortcut.id,
              conflictsWith: { source: ext.name, command: cmd, keys: normalKey },
              severity: inaShortcut.whenClause ? 'context-safe' : 'override',
              suggestion: `Both use "${key}" — context clauses should prevent conflict`,
            });
          }
        }
      }
    }

    return conflicts;
  }

  suggestAlternative(keys: string, whenClause: string | null): string[] {
    const sm = ShortcutManager.getInstance();
    const suggestions: string[] = [];
    const base = keys.replace(/^(Cmd|Ctrl)\+/, '');

    // Try adding Alt
    const withAlt = `Cmd+Alt+${base}`;
    if (sm.detectConflicts(withAlt, whenClause).length === 0) suggestions.push(withAlt);

    // Try adding Shift
    const withShift = `Cmd+Shift+${base}`;
    if (sm.detectConflicts(withShift, whenClause).length === 0) suggestions.push(withShift);

    // Try different base key (next letter)
    const lastChar = base.slice(-1);
    if (/[a-z]/i.test(lastChar)) {
      const nextChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);
      const withNext = keys.replace(lastChar, nextChar);
      if (sm.detectConflicts(withNext, whenClause).length === 0) suggestions.push(withNext);
    }

    return suggestions.slice(0, 3);
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/\s+/g, '').replace('cmd+', 'ctrl+');
  }
}
