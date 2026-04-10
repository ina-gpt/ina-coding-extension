/**
 * Phase 17.7 — Micro Interactions
 *
 * Small but high-impact UX services that make chat feel alive:
 *   - TypingIndicator: animated dots while the model generates
 *   - MessageEditManager: edit-and-resend previously sent messages
 *   - RegenerateManager: regenerate the last AI response
 *   - ConversationBranch: fork conversation from any message
 *   - InputHistory: up/down arrow recall of prior messages
 *   - PlaceholderRotation: cycling input placeholder with coding tips
 *   - SoundManager: optional notification sounds on completion
 *
 * Every subsystem is an isolated singleton so the ChatViewProvider can
 * consume whichever it needs without pulling in the full polish module.
 */
import * as vscode from 'vscode';

// ============ Typing Indicator ============

export class TypingIndicator {
  private static instance: TypingIndicator;
  private emitter = new vscode.EventEmitter<boolean>();
  readonly onDidChange = this.emitter.event;
  private active = false;

  static getInstance(): TypingIndicator {
    if (!TypingIndicator.instance) TypingIndicator.instance = new TypingIndicator();
    return TypingIndicator.instance;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.emitter.fire(true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.emitter.fire(false);
  }

  isActive(): boolean {
    return this.active;
  }
}

// ============ Message Edit Manager ============

export interface EditableMessage {
  id: string;
  originalContent: string;
  editedContent?: string;
  editedAt?: number;
  editCount: number;
}

export class MessageEditManager {
  private static instance: MessageEditManager;
  private edits = new Map<string, EditableMessage>();

  static getInstance(): MessageEditManager {
    if (!MessageEditManager.instance) MessageEditManager.instance = new MessageEditManager();
    return MessageEditManager.instance;
  }

  register(messageId: string, originalContent: string): void {
    if (!this.edits.has(messageId)) {
      this.edits.set(messageId, { id: messageId, originalContent, editCount: 0 });
    }
  }

  applyEdit(messageId: string, newContent: string): EditableMessage | null {
    const entry = this.edits.get(messageId);
    if (!entry) return null;
    entry.editedContent = newContent;
    entry.editedAt = Date.now();
    entry.editCount += 1;
    return entry;
  }

  getCurrentContent(messageId: string): string | null {
    const entry = this.edits.get(messageId);
    if (!entry) return null;
    return entry.editedContent ?? entry.originalContent;
  }

  getHistory(messageId: string): EditableMessage | null {
    return this.edits.get(messageId) ?? null;
  }

  clear(): void {
    this.edits.clear();
  }
}

// ============ Regenerate Manager ============

export interface RegenerateContext {
  lastUserMessage: string;
  lastAssistantMessage: string;
  attachedMentions?: unknown[];
  modelName?: string;
}

export class RegenerateManager {
  private static instance: RegenerateManager;
  private lastContext: RegenerateContext | null = null;

  static getInstance(): RegenerateManager {
    if (!RegenerateManager.instance) RegenerateManager.instance = new RegenerateManager();
    return RegenerateManager.instance;
  }

  recordContext(context: RegenerateContext): void {
    this.lastContext = context;
  }

  canRegenerate(): boolean {
    return this.lastContext !== null;
  }

  takeContext(): RegenerateContext | null {
    return this.lastContext;
  }

  clear(): void {
    this.lastContext = null;
  }
}

// ============ Conversation Branching ============

export interface ConversationBranchSnapshot {
  id: string;
  parentBranchId: string | null;
  forkedAtMessageId: string;
  createdAt: number;
  label: string;
}

export class ConversationBranchManager {
  private static instance: ConversationBranchManager;
  private branches = new Map<string, ConversationBranchSnapshot>();

  static getInstance(): ConversationBranchManager {
    if (!ConversationBranchManager.instance) ConversationBranchManager.instance = new ConversationBranchManager();
    return ConversationBranchManager.instance;
  }

  fork(parentBranchId: string | null, atMessageId: string, label?: string): ConversationBranchSnapshot {
    const id = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot: ConversationBranchSnapshot = {
      id,
      parentBranchId,
      forkedAtMessageId: atMessageId,
      createdAt: Date.now(),
      label: label || `Branch ${this.branches.size + 1}`,
    };
    this.branches.set(id, snapshot);
    return snapshot;
  }

  list(): ConversationBranchSnapshot[] {
    return Array.from(this.branches.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  delete(branchId: string): boolean {
    return this.branches.delete(branchId);
  }
}

// ============ Input History (ring buffer) ============

const INPUT_HISTORY_MAX = 50;

export class InputHistory {
  private static instance: InputHistory;
  private entries: string[] = [];
  private cursor: number | null = null;

  static getInstance(): InputHistory {
    if (!InputHistory.instance) InputHistory.instance = new InputHistory();
    return InputHistory.instance;
  }

  push(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (this.entries[this.entries.length - 1] === trimmed) return;
    this.entries.push(trimmed);
    if (this.entries.length > INPUT_HISTORY_MAX) this.entries.shift();
    this.cursor = null;
  }

  previous(): string | null {
    if (this.entries.length === 0) return null;
    if (this.cursor === null) this.cursor = this.entries.length - 1;
    else if (this.cursor > 0) this.cursor -= 1;
    return this.entries[this.cursor] ?? null;
  }

  next(): string | null {
    if (this.cursor === null) return null;
    if (this.cursor < this.entries.length - 1) {
      this.cursor += 1;
      return this.entries[this.cursor];
    }
    this.cursor = null;
    return '';
  }

  reset(): void {
    this.cursor = null;
  }

  snapshot(): string[] {
    return [...this.entries];
  }
}

// ============ Placeholder Rotation ============

const PLACEHOLDER_TIPS = [
  'Ask INA-7 Pro anything about your code…',
  'Type @ to mention a file, folder, or symbol',
  'Try "explain this function" on the active file',
  'Use /commit to generate a commit message',
  'Press Ctrl+L to open the chat from anywhere',
  'Select code in the editor and ask "what does this do?"',
  'Type @docs to search the built-in documentation',
  'Run "review my diff" for a quick PR feedback',
  'Try @codebase to search the full project',
  'Say "fix the failing test" and INA-7 Pro will try',
];

export class PlaceholderRotation {
  private static instance: PlaceholderRotation;
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private emitter = new vscode.EventEmitter<string>();
  readonly onDidChange = this.emitter.event;

  static getInstance(): PlaceholderRotation {
    if (!PlaceholderRotation.instance) PlaceholderRotation.instance = new PlaceholderRotation();
    return PlaceholderRotation.instance;
  }

  start(intervalMs: number = 10_000): void {
    if (this.timer) return;
    this.emitter.fire(PLACEHOLDER_TIPS[this.index]);
    this.timer = setInterval(() => {
      this.index = (this.index + 1) % PLACEHOLDER_TIPS.length;
      this.emitter.fire(PLACEHOLDER_TIPS[this.index]);
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  current(): string {
    return PLACEHOLDER_TIPS[this.index];
  }
}

// ============ Sound Manager ============

export class SoundManager {
  private static instance: SoundManager;
  private constructor() {}

  static getInstance(): SoundManager {
    if (!SoundManager.instance) SoundManager.instance = new SoundManager();
    return SoundManager.instance;
  }

  private get enabled(): boolean {
    return vscode.workspace.getConfiguration('inaCoding').get<boolean>('sounds.enabled', false);
  }

  playMessageComplete(): void {
    if (!this.enabled) return;
    // VS Code does not expose audio APIs from the extension host, so we ask the
    // webview to play a short tone by emitting a notification event. Callers
    // can post a 'playSound' message to the webview if they want actual audio.
    vscode.commands.executeCommand('inaCoding.internal.playSound', 'messageComplete').then(undefined, () => {});
  }

  playError(): void {
    if (!this.enabled) return;
    vscode.commands.executeCommand('inaCoding.internal.playSound', 'error').then(undefined, () => {});
  }
}
