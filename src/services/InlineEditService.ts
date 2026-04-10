/**
 * Inline Edit Service
 *
 * Core service for managing inline edit operations.
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/Logger';
import { DiffPreviewController } from '../controllers/DiffPreviewController';
import { DiffPreviewState } from './diff/DiffTypes';
import { MultiCursorEditController } from '../controllers/MultiCursorEditController';
import { MultiCursorDetector } from './multicursor/MultiCursorDetector';
import { MultiCursorSession } from './multicursor/MultiCursorTypes';

// ============ Enums & Types ============

export enum TriggerMode {
  SELECTION = 'selection',
  LINE = 'line',
  BLOCK = 'block',
  FUNCTION = 'function',
}

export interface InlineEditContext {
  selection: vscode.Selection;
  content: string;
  language: string;
  filePath: string;
  lineRange: [number, number];
  surroundingCode: {
    before: string;
    after: string;
    beforeLines: number;
    afterLines: number;
  };
  symbols: string[];
  indentation: string;
  cursorPosition: vscode.Position;
}

export interface InlineEditSession {
  id: string;
  context: InlineEditContext;
  status: 'idle' | 'input' | 'generating' | 'preview' | 'applied' | 'rejected';
  prompt: string;
  originalContent: string;
  generatedContent: string | null;
  startTime: number;
  editor: vscode.TextEditor;
}

// ============ Inline Edit Service ============

export class InlineEditService {
  private static instance: InlineEditService;
  private sessions: Map<string, InlineEditSession> = new Map();
  private diffPreviewController: DiffPreviewController | null = null;
  private multiCursorController: MultiCursorEditController | null = null;
  private multiCursorDetector: MultiCursorDetector;

  private onSessionStartEmitter = new vscode.EventEmitter<InlineEditSession>();
  private onSessionEndEmitter = new vscode.EventEmitter<InlineEditSession>();
  private onSessionUpdateEmitter = new vscode.EventEmitter<InlineEditSession>();

  readonly onSessionStart = this.onSessionStartEmitter.event;
  readonly onSessionEnd = this.onSessionEndEmitter.event;
  readonly onSessionUpdate = this.onSessionUpdateEmitter.event;

  private constructor() {
    this.multiCursorDetector = MultiCursorDetector.getInstance();
  }

  static getInstance(): InlineEditService {
    if (!InlineEditService.instance) {
      InlineEditService.instance = new InlineEditService();
    }
    return InlineEditService.instance;
  }

  // ============ Session Management ============

  async triggerInlineEdit(editor: vscode.TextEditor, mode: TriggerMode): Promise<InlineEditSession> {
    // Check for multi-cursor - delegate to multi-cursor controller
    if (this.multiCursorDetector.hasMultipleCursors(editor) && this.multiCursorController) {
      this.multiCursorController.triggerMultiCursorEdit(editor);
      // Return a placeholder session with valid context fields
      const selection = editor.selection;
      const document = editor.document;
      return {
        id: 'multi-cursor-delegated',
        context: {
          selection,
          content: document.getText(selection),
          language: document.languageId,
          filePath: vscode.workspace.asRelativePath(document.uri),
          lineRange: [selection.start.line, selection.end.line] as [number, number],
          surroundingCode: { before: '', after: '', beforeLines: 0, afterLines: 0 },
          symbols: [],
          indentation: '',
          cursorPosition: selection.active,
        },
        status: 'generating',
        prompt: '',
        originalContent: document.getText(selection),
        generatedContent: null,
        startTime: Date.now(),
        editor,
      };
    }

    const context = await this.getEditContext(editor, mode);

    const session: InlineEditSession = {
      id: uuidv4(),
      context,
      status: 'input',
      prompt: '',
      originalContent: context.content,
      generatedContent: null,
      startTime: Date.now(),
      editor,
    };

    this.sessions.set(session.id, session);
    this.onSessionStartEmitter.fire(session);

    Logger.info(`Inline edit session started: ${session.id} (${mode})`);
    return session;
  }

  updateSession(sessionId: string, updates: Partial<InlineEditSession>): InlineEditSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    Object.assign(session, updates);
    this.onSessionUpdateEmitter.fire(session);
    return session;
  }

  endSession(sessionId: string, status: 'applied' | 'rejected'): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    this.onSessionEndEmitter.fire(session);
    this.sessions.delete(sessionId);

    Logger.info(`Inline edit session ended: ${sessionId} (${status})`);
  }

  getSession(sessionId: string): InlineEditSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSession(): InlineEditSession | undefined {
    // Return the most recent non-ended session
    const sessions = Array.from(this.sessions.values());
    return sessions.find(s => s.status !== 'applied' && s.status !== 'rejected');
  }

  getActiveSessions(): InlineEditSession[] {
    return Array.from(this.sessions.values());
  }

  cancelActiveSession(): void {
    const active = this.getActiveSession();
    if (active) {
      this.endSession(active.id, 'rejected');
    }
  }

  handlePromptReceived(session: InlineEditSession, prompt: string): void {
    session.prompt = prompt;
    session.status = 'generating';
    this.onSessionUpdateEmitter.fire(session);
  }

  setDiffPreviewController(controller: DiffPreviewController): void {
    this.diffPreviewController = controller;
  }

  handleGenerationComplete(sessionId: string, generatedContent: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.generatedContent = generatedContent;
    session.status = 'preview';
    this.onSessionUpdateEmitter.fire(session);

    // Show diff preview if controller available
    if (this.diffPreviewController) {
      this.diffPreviewController.showPreview(session).catch(err => {
        Logger.error(`Failed to show diff preview for ${sessionId}:`, err);
      });
    }
  }

  handleGenerationError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'idle';
    this.onSessionUpdateEmitter.fire(session);
    Logger.warn(`Generation error for ${sessionId}: ${error}`);
  }

  async applyEdit(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.generatedContent) return false;

    try {
      // Use diff controller if available (handles partial accept, etc.)
      if (this.diffPreviewController) {
        await this.diffPreviewController.acceptAll(sessionId);
        this.endSession(sessionId, 'applied');
        return true;
      }

      // Fallback: direct replacement
      const editor = session.editor;
      const selection = session.context.selection;

      const success = await editor.edit(editBuilder => {
        editBuilder.replace(selection, session.generatedContent!);
      });

      if (success) {
        this.endSession(sessionId, 'applied');
        Logger.info(`Edit applied for session ${sessionId}`);
      }

      return success;
    } catch (error) {
      Logger.error(`Failed to apply edit for ${sessionId}:`, error);
      return false;
    }
  }

  /** Alias for applyEdit — more intuitive naming */
  async acceptEdit(sessionId: string): Promise<boolean> {
    return this.applyEdit(sessionId);
  }

  async rejectEdit(sessionId: string): Promise<void> {
    if (this.diffPreviewController) {
      await this.diffPreviewController.rejectAll(sessionId);
    }
    this.endSession(sessionId, 'rejected');
  }

  async acceptHunk(sessionId: string, hunkId: string): Promise<void> {
    if (this.diffPreviewController) {
      await this.diffPreviewController.acceptHunk(sessionId, hunkId);
    }
  }

  async rejectHunk(sessionId: string, hunkId: string): Promise<void> {
    if (this.diffPreviewController) {
      await this.diffPreviewController.rejectHunk(sessionId, hunkId);
    }
  }

  async toggleDiffViewMode(sessionId: string): Promise<void> {
    if (this.diffPreviewController) {
      await this.diffPreviewController.toggleViewMode(sessionId);
    }
  }

  async startEditMode(sessionId: string): Promise<void> {
    if (this.diffPreviewController) {
      await this.diffPreviewController.startEditMode(sessionId);
    }
  }

  async finishEditMode(sessionId: string, accept: boolean): Promise<void> {
    if (this.diffPreviewController) {
      await this.diffPreviewController.finishEditMode(sessionId, accept);
      if (accept) {
        this.endSession(sessionId, 'applied');
      }
    }
  }

  navigateHunk(sessionId: string, direction: 'next' | 'prev'): void {
    if (!this.diffPreviewController) return;
    if (direction === 'next') {
      this.diffPreviewController.navigateToNextHunk(sessionId);
    } else {
      this.diffPreviewController.navigateToPrevHunk(sessionId);
    }
  }

  // ============ Multi-Cursor ============

  setMultiCursorController(controller: MultiCursorEditController): void {
    this.multiCursorController = controller;
  }

  isMultiCursorActive(): boolean {
    return this.multiCursorController !== null &&
      this.multiCursorController !== undefined;
  }

  getMultiCursorSession(): MultiCursorSession | undefined {
    // Accessed via the controller's service
    return undefined;
  }

  async acceptMultiCursorEdit(cursorId?: string): Promise<void> {
    if (!this.multiCursorController) return;
    // Delegation handled in extension.ts command handlers
  }

  async rejectMultiCursorEdit(cursorId?: string): Promise<void> {
    if (!this.multiCursorController) return;
  }

  navigateMultiCursor(direction: 'next' | 'prev'): void {
    if (this.multiCursorController) {
      this.multiCursorController.navigateCursor(direction);
    }
  }

  // ============ Context Extraction ============

  async getEditContext(editor: vscode.TextEditor, mode: TriggerMode): Promise<InlineEditContext> {
    const document = editor.document;
    let selection = editor.selection;

    // Expand selection based on mode
    if (mode === TriggerMode.LINE && selection.isEmpty) {
      const line = selection.active.line;
      selection = new vscode.Selection(
        new vscode.Position(line, 0),
        new vscode.Position(line, document.lineAt(line).text.length)
      );
    } else if (mode === TriggerMode.BLOCK) {
      selection = this.expandSelectionToLogicalBlock(editor);
    } else if (mode === TriggerMode.FUNCTION) {
      selection = await this.expandSelectionToFunction(editor) || selection;
    }

    const content = document.getText(selection.isEmpty ? undefined : selection);
    const lineRange: [number, number] = selection.isEmpty
      ? [0, document.lineCount - 1]
      : [selection.start.line, selection.end.line];

    const surroundingCode = this.getSurroundingCode(document, selection.isEmpty
      ? new vscode.Range(0, 0, document.lineCount - 1, 0)
      : selection, 25, 25);

    const symbols = await this.getNearbySymbols(document, selection.start);

    return {
      selection,
      content,
      language: document.languageId,
      filePath: vscode.workspace.asRelativePath(document.uri),
      lineRange,
      surroundingCode,
      symbols,
      indentation: this.getIndentationAtLine(document, selection.start.line),
      cursorPosition: selection.active,
    };
  }

  // ============ Selection Expansion ============

  expandSelectionToLogicalBlock(editor: vscode.TextEditor): vscode.Selection {
    const document = editor.document;
    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    // Try bracket matching first (C-style languages)
    const language = document.languageId;
    const useBraces = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact',
      'java', 'c', 'cpp', 'csharp', 'rust', 'go', 'kotlin', 'scala', 'swift', 'php'].includes(language);

    if (useBraces) {
      // Scan upward to find opening brace
      let blockStart = startLine;
      let braceCount = 0;
      for (let i = startLine; i >= 0; i--) {
        const line = document.lineAt(i).text;
        for (let j = line.length - 1; j >= 0; j--) {
          if (line[j] === '}') braceCount++;
          else if (line[j] === '{') {
            braceCount--;
            if (braceCount < 0) { blockStart = i; braceCount = 0; break; }
          }
        }
        if (braceCount < 0) break;
      }

      // Scan downward to find closing brace
      let blockEnd = endLine;
      braceCount = 0;
      for (let i = blockStart; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        for (const ch of line) {
          if (ch === '{') braceCount++;
          else if (ch === '}') {
            braceCount--;
            if (braceCount === 0) { blockEnd = i; break; }
          }
        }
        if (braceCount === 0 && i > blockStart) break;
      }

      return new vscode.Selection(
        new vscode.Position(blockStart, 0),
        new vscode.Position(blockEnd, document.lineAt(blockEnd).text.length)
      );
    }

    // Indentation-based (Python, YAML, etc.)
    const startIndent = document.lineAt(startLine).firstNonWhitespaceCharacterIndex;

    let blockStart = startLine;
    for (let i = startLine - 1; i >= 0; i--) {
      const line = document.lineAt(i);
      if (line.isEmptyOrWhitespace) continue;
      if (line.firstNonWhitespaceCharacterIndex < startIndent) {
        blockStart = i;
        break;
      }
      blockStart = i;
    }

    let blockEnd = endLine;
    for (let i = endLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.isEmptyOrWhitespace) continue;
      if (line.firstNonWhitespaceCharacterIndex <= startIndent) break;
      blockEnd = i;
    }

    return new vscode.Selection(
      new vscode.Position(blockStart, 0),
      new vscode.Position(blockEnd, document.lineAt(blockEnd).text.length)
    );
  }

  private async expandSelectionToFunction(editor: vscode.TextEditor): Promise<vscode.Selection | null> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', editor.document.uri
      );
      if (!symbols) return null;

      const pos = editor.selection.active;
      const fn = this.findContainingSymbol(symbols, pos, [
        vscode.SymbolKind.Function,
        vscode.SymbolKind.Method,
        vscode.SymbolKind.Class,
      ]);

      if (fn) {
        return new vscode.Selection(fn.range.start, fn.range.end);
      }
    } catch (error) {
      Logger.debug('Function symbol expansion failed, using fallback:', error);
    }
    return null;
  }

  private findContainingSymbol(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position,
    kinds: vscode.SymbolKind[]
  ): vscode.DocumentSymbol | null {
    for (const sym of symbols) {
      if (sym.range.contains(position)) {
        // Check children first (more specific)
        const child = this.findContainingSymbol(sym.children, position, kinds);
        if (child) return child;
        if (kinds.includes(sym.kind)) return sym;
      }
    }
    return null;
  }

  // ============ Trigger Mode Detection ============

  detectTriggerMode(editor: vscode.TextEditor): TriggerMode {
    const selection = editor.selection;

    if (!selection.isEmpty) {
      const lines = selection.end.line - selection.start.line;
      if (lines > 10) return TriggerMode.BLOCK;
      return TriggerMode.SELECTION;
    }

    return TriggerMode.LINE;
  }

  // ============ Context Helpers ============

  getSurroundingCode(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    linesBefore: number = 25,
    linesAfter: number = 25
  ): { before: string; after: string; beforeLines: number; afterLines: number } {
    const startLine = Math.max(0, range.start.line - linesBefore);
    const endLine = Math.min(document.lineCount - 1, range.end.line + linesAfter);

    const actualBefore = range.start.line - startLine;
    const actualAfter = endLine - range.end.line;

    const beforeRange = new vscode.Range(startLine, 0, range.start.line, 0);
    const afterRange = new vscode.Range(
      range.end.line + 1, 0,
      Math.min(endLine + 1, document.lineCount - 1),
      document.lineAt(Math.min(endLine, document.lineCount - 1)).text.length
    );

    return {
      before: document.getText(beforeRange),
      after: range.end.line + 1 < document.lineCount ? document.getText(afterRange) : '',
      beforeLines: actualBefore,
      afterLines: actualAfter,
    };
  }

  getIndentationAtLine(document: vscode.TextDocument, line: number): string {
    if (line < 0 || line >= document.lineCount) return '';
    const text = document.lineAt(line).text;
    const match = text.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  private async getNearbySymbols(document: vscode.TextDocument, position: vscode.Position): Promise<string[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', document.uri
      );
      if (!symbols) return [];

      const names: string[] = [];
      const collectNearby = (syms: vscode.DocumentSymbol[]) => {
        for (const s of syms) {
          if (Math.abs(s.range.start.line - position.line) < 50) {
            names.push(s.name);
          }
          collectNearby(s.children);
        }
      };
      collectNearby(symbols);
      return names.slice(0, 10);
    } catch (error) {
      Logger.debug('Failed to get nearby symbols:', error);
      return [];
    }
  }

  // ============ Cleanup ============

  dispose(): void {
    for (const [id] of this.sessions) {
      this.endSession(id, 'rejected');
    }
    this.diffPreviewController?.dispose();
    this.multiCursorController?.dispose();
    this.onSessionStartEmitter.dispose();
    this.onSessionEndEmitter.dispose();
    this.onSessionUpdateEmitter.dispose();
  }
}
