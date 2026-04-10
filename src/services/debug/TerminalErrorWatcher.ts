/**
 * TerminalErrorWatcher.ts — Phase 19 Step 19.1
 * Watches terminal output for errors and auto-triggers analysis
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export interface TerminalErrorEvent {
  terminalName: string;
  rawOutput: string;
  detectedPattern: string;
}

const ERROR_PATTERNS = [
  /\b(?:Error|Exception|FAILED|FAIL|panic|FATAL|Traceback|Segmentation fault)[:!\s]/i,
  /\bexited?\s+(?:with\s+)?(?:code|status)\s+[1-9]\d*/i,
  /npm ERR!/,
  /error\[E\d+\]/i, // Rust compiler errors
  /FAILED\s+\[/i,   // Test failures
  /AssertionError/i,
  /TypeError|ReferenceError|SyntaxError/,
];

export class TerminalErrorWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private buffer: Map<string, string[]> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private listeners: Array<(event: TerminalErrorEvent) => void> = [];
  private maxBufferLines = 200;

  constructor() {
    // Use onDidWriteTerminalData if available (proposed API)
    try {
      const onWrite = (vscode.window as any).onDidWriteTerminalData;
      if (onWrite) {
        this.disposables.push(
          onWrite((e: { terminal: vscode.Terminal; data: string }) => {
            this.onTerminalData(e.terminal.name, e.data);
          })
        );
        Logger.info('[TerminalErrorWatcher] Registered terminal data watcher');
      }
    } catch {
      Logger.info('[TerminalErrorWatcher] onDidWriteTerminalData not available, using fallback');
    }

    // Also watch for terminal close with non-zero exit
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        const exitStatus = (terminal as any).exitStatus;
        if (exitStatus && exitStatus.code && exitStatus.code !== 0) {
          const buffered = this.buffer.get(terminal.name);
          if (buffered && buffered.length > 0) {
            this.emitError(terminal.name, buffered.join('\n'), `exit code ${exitStatus.code}`);
          }
        }
      })
    );
  }

  onError(listener: (event: TerminalErrorEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  getBuffer(terminalName?: string): string {
    if (terminalName) {
      return (this.buffer.get(terminalName) || []).join('\n');
    }
    // Return all terminal output
    const all: string[] = [];
    for (const [name, lines] of this.buffer) {
      all.push(`--- Terminal: ${name} ---\n${lines.join('\n')}`);
    }
    return all.join('\n\n');
  }

  private onTerminalData(terminalName: string, data: string): void {
    if (!this.buffer.has(terminalName)) this.buffer.set(terminalName, []);
    const buf = this.buffer.get(terminalName)!;

    const lines = data.split('\n');
    buf.push(...lines);
    while (buf.length > this.maxBufferLines) buf.shift();

    // Check if autoAnalyze is enabled
    if (!ConfigManager.get<boolean>('debug.autoAnalyze', false)) return;

    // Check for error patterns
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(data)) {
        // Debounce: wait 500ms for full stack trace to arrive
        const existing = this.debounceTimers.get(terminalName);
        if (existing) clearTimeout(existing);
        this.debounceTimers.set(terminalName, setTimeout(() => {
          this.debounceTimers.delete(terminalName);
          const recentOutput = buf.slice(-50).join('\n');
          this.emitError(terminalName, recentOutput, pattern.source);
        }, 500));
        break;
      }
    }
  }

  private emitError(terminalName: string, rawOutput: string, detectedPattern: string): void {
    const event: TerminalErrorEvent = { terminalName, rawOutput, detectedPattern };
    for (const listener of this.listeners) {
      try { listener(event); } catch (e) { Logger.error('[TerminalErrorWatcher] listener error', e); }
    }
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.buffer.clear();
    this.disposables.forEach(d => d.dispose());
  }
}
