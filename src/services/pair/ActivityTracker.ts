/**
 * ActivityTracker.ts — Phase 20 Step 20.1
 * Real-time developer activity tracking via VS Code APIs
 */

import * as vscode from 'vscode';
import { CodingPattern, CodingPatternType, DeveloperState, ActivityEvent } from './PairTypes';
import { Logger } from '../../utils/Logger';

const MAX_PATTERNS = 50;
const WINDOW_MS = 10000;
const FOCUS_THRESHOLD_MS = 120000;

export class ActivityTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private events: ActivityEvent[] = [];
  private state: DeveloperState;
  private listeners: Array<(state: DeveloperState) => void> = [];
  private updateTimer?: ReturnType<typeof setInterval>;
  private lastFile = '';
  private fileSwitchTimes: number[] = [];
  private undoTimestamps: number[] = [];
  private deleteRuns: { file: string; line: number; count: number; ts: number }[] = [];

  constructor() {
    this.state = {
      currentPattern: null, sessionPatterns: [],
      frustrationScore: 0, focusScore: 0, currentIntent: '',
      activeFiles: [], editVelocity: 0, deletionRatio: 0,
      undoCount: 0, sessionStartTime: Date.now(),
    };
  }

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.scheme !== 'file') return;
        const file = vscode.workspace.asRelativePath(e.document.uri);
        for (const change of e.contentChanges) {
          const line = change.range.start.line;
          if (change.text.length === 0 && change.rangeLength > 0) {
            this.addEvent({ type: 'delete', timestamp: Date.now(), file, line });
            this.trackDeletion(file, line);
          } else if (change.text.length > 10) {
            this.addEvent({ type: 'paste', timestamp: Date.now(), file, line });
          } else {
            this.addEvent({ type: 'keystroke', timestamp: Date.now(), file, line });
          }
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return;
        const file = vscode.workspace.asRelativePath(editor.document.uri);
        if (file !== this.lastFile) {
          this.addEvent({ type: 'file_switch', timestamp: Date.now(), file, line: 0 });
          this.fileSwitchTimes.push(Date.now());
          this.lastFile = file;
          if (!this.state.activeFiles.includes(file)) {
            this.state.activeFiles.push(file);
            if (this.state.activeFiles.length > 20) this.state.activeFiles.shift();
          }
        }
      }),
      vscode.window.onDidChangeTextEditorSelection(e => {
        const file = vscode.workspace.asRelativePath(e.textEditor.document.uri);
        this.addEvent({ type: 'selection', timestamp: Date.now(), file, line: e.selections[0]?.active.line || 0 });
      }),
    );

    // Detect undo via command execution
    this.disposables.push(
      vscode.commands.registerCommand('inaCoding.pair._trackUndo', () => {
        this.undoTimestamps.push(Date.now());
        this.state.undoCount++;
      })
    );

    this.updateTimer = setInterval(() => this.updateState(), 2000);
    Logger.info('[ActivityTracker] Started');
  }

  onStateChange(listener: (state: DeveloperState) => void): () => void {
    this.listeners.push(listener);
    return () => { const i = this.listeners.indexOf(listener); if (i >= 0) this.listeners.splice(i, 1); };
  }

  getState(): DeveloperState { return this.state; }

  private addEvent(event: ActivityEvent): void {
    this.events.push(event);
    if (this.events.length > 500) this.events = this.events.slice(-300);
  }

  private trackDeletion(file: string, line: number): void {
    const last = this.deleteRuns[this.deleteRuns.length - 1];
    if (last && last.file === file && Math.abs(last.line - line) <= 2 && Date.now() - last.ts < 5000) {
      last.count++;
      last.ts = Date.now();
    } else {
      this.deleteRuns.push({ file, line, count: 1, ts: Date.now() });
      if (this.deleteRuns.length > 30) this.deleteRuns.shift();
    }
  }

  private updateState(): void {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const recentEvents = this.events.filter(e => e.timestamp > windowStart);

    // Classify current pattern
    const keystrokes = recentEvents.filter(e => e.type === 'keystroke').length;
    const deletes = recentEvents.filter(e => e.type === 'delete').length;
    const pastes = recentEvents.filter(e => e.type === 'paste').length;
    const totalEdits = keystrokes + deletes + pastes;

    let patternType: CodingPatternType = 'pausing';
    if (totalEdits > 20) patternType = 'typing';
    else if (deletes > keystrokes && deletes > 3) patternType = 'deleting';
    else if (pastes > 0) patternType = 'pasting';
    else if (recentEvents.filter(e => e.type === 'selection').length > 10) patternType = 'scrolling';
    else if (recentEvents.filter(e => e.type === 'file_switch').length > 3) patternType = 'searching';

    const currentFile = this.lastFile || '';
    const currentLine = recentEvents[recentEvents.length - 1]?.line || 0;

    this.state.currentPattern = {
      type: patternType,
      duration: WINDOW_MS,
      intensity: totalEdits / (WINDOW_MS / 1000),
      file: currentFile,
      position: { line: currentLine, character: 0 },
      timestamp: now,
    };

    this.state.sessionPatterns.push(this.state.currentPattern);
    if (this.state.sessionPatterns.length > MAX_PATTERNS) this.state.sessionPatterns.shift();

    // Edit velocity (changes per minute over last 60s)
    const minute = this.events.filter(e => e.timestamp > now - 60000 && ['keystroke', 'delete', 'paste'].includes(e.type)).length;
    this.state.editVelocity = minute;

    // Deletion ratio
    const recent60 = this.events.filter(e => e.timestamp > now - 60000);
    const totalOps = recent60.filter(e => ['keystroke', 'delete'].includes(e.type)).length;
    const delOps = recent60.filter(e => e.type === 'delete').length;
    this.state.deletionRatio = totalOps > 0 ? delOps / totalOps : 0;

    // Frustration score
    this.state.frustrationScore = this.computeFrustration(now);

    // Focus score
    this.state.focusScore = this.computeFocus(now);

    // Notify listeners
    for (const listener of this.listeners) {
      try { listener(this.state); } catch { /* */ }
    }
  }

  private computeFrustration(now: number): number {
    let score = 0;

    // Rapid delete-retype cycles
    const recentDeletes = this.deleteRuns.filter(d => now - d.ts < 30000 && d.count >= 3);
    score += Math.min(30, recentDeletes.length * 10);

    // Excessive undo
    const recentUndos = this.undoTimestamps.filter(t => now - t < 30000).length;
    if (recentUndos >= 5) score += 20;
    else if (recentUndos >= 3) score += 10;

    // Rapid file switching
    const recentSwitches = this.fileSwitchTimes.filter(t => now - t < 10000).length;
    if (recentSwitches >= 5) score += 20;
    else if (recentSwitches >= 3) score += 10;

    // High deletion ratio
    if (this.state.deletionRatio > 0.5) score += 15;

    return Math.min(100, score);
  }

  private computeFocus(now: number): number {
    // Sustained typing in one file
    const recentPatterns = this.state.sessionPatterns.filter(p => now - p.timestamp < FOCUS_THRESHOLD_MS);
    if (recentPatterns.length === 0) return 0;

    const sameFile = recentPatterns.every(p => p.file === this.lastFile);
    const typing = recentPatterns.filter(p => p.type === 'typing').length;
    const ratio = typing / recentPatterns.length;

    if (sameFile && ratio > 0.6) return Math.min(100, Math.round(ratio * 100));
    return Math.round(ratio * 50);
  }

  dispose(): void {
    if (this.updateTimer) clearInterval(this.updateTimer);
    this.disposables.forEach(d => d.dispose());
    this.events = [];
    Logger.info('[ActivityTracker] Disposed');
  }
}
