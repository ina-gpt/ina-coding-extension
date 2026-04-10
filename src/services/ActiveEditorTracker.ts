import * as vscode from 'vscode';
import { languageDetector, LanguageInfo, LanguageFeatures } from './LanguageDetector';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface CursorPosition {
  line: number;
  character: number;
  offset: number;
}

export interface Selection {
  start: CursorPosition;
  end: CursorPosition;
  text: string;
  isEmpty: boolean;
  isSingleLine: boolean;
  lineCount: number;
}

export interface VisibleRange {
  startLine: number;
  endLine: number;
}

export interface FileContext {
  filePath: string;
  relativePath: string;
  fileName: string;
  fileExtension: string;

  language: LanguageInfo;
  languageFeatures: LanguageFeatures;

  content: string;
  lineCount: number;

  cursor: CursorPosition;
  selection: Selection;
  selections: Selection[];

  visibleRange: VisibleRange;

  isDirty: boolean;
  isUntitled: boolean;
  eol: 'LF' | 'CRLF';

  timestamp: number;
}

export interface ContextUpdate {
  type: 'full' | 'selection' | 'cursor' | 'content' | 'visibility';
  context: FileContext;
  changes?: {
    previousSelection?: Selection;
    contentChanges?: readonly vscode.TextDocumentContentChangeEvent[];
  };
}

export type ContextChangeCallback = (update: ContextUpdate) => void;

// ============ Configuration ============

interface TrackerConfig {
  maxContentLength: number;
  debounceMs: number;
  trackSelection: boolean;
  trackCursor: boolean;
  trackVisibleRange: boolean;
  includeFullContent: boolean;
}

const DEFAULT_CONFIG: TrackerConfig = {
  maxContentLength: 100000,
  debounceMs: 100,
  trackSelection: true,
  trackCursor: true,
  trackVisibleRange: true,
  includeFullContent: true,
};

// ============ Active Editor Tracker ============

export class ActiveEditorTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private listeners: Set<ContextChangeCallback> = new Set();
  private currentContext: FileContext | null = null;
  private config: TrackerConfig;

  private selectionDebounce: ReturnType<typeof setTimeout> | null = null;
  private contentDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  // ============ Initialization ============

  private initialize(): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.handleEditorChange(editor);
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          this.handleSelectionChange(event);
        }
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          this.handleVisibleRangeChange(event);
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && event.document === activeEditor.document) {
          this.handleContentChange(event);
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && document === activeEditor.document) {
          this.handleDocumentSave();
        }
      })
    );

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.handleEditorChange(activeEditor);
    }

    Logger.info('ActiveEditorTracker initialized');
  }

  // ============ Event Handlers ============

  private handleEditorChange(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      this.currentContext = null;
      return;
    }
    this.currentContext = this.extractContext(editor);
    this.notifyListeners({ type: 'full', context: this.currentContext });
  }

  private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    if (!this.config.trackSelection) { return; }

    if (this.selectionDebounce) { clearTimeout(this.selectionDebounce); }

    this.selectionDebounce = setTimeout(() => {
      const editor = event.textEditor;
      const previousSelection = this.currentContext?.selection;
      this.currentContext = this.extractContext(editor);
      this.notifyListeners({
        type: 'selection',
        context: this.currentContext,
        changes: { previousSelection },
      });
    }, this.config.debounceMs);
  }

  private handleVisibleRangeChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (!this.config.trackVisibleRange) { return; }
    const editor = event.textEditor;
    this.currentContext = this.extractContext(editor);
    this.notifyListeners({ type: 'visibility', context: this.currentContext });
  }

  private handleContentChange(event: vscode.TextDocumentChangeEvent): void {
    if (this.contentDebounce) { clearTimeout(this.contentDebounce); }

    this.contentDebounce = setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        this.currentContext = this.extractContext(editor);
        this.notifyListeners({
          type: 'content',
          context: this.currentContext,
          changes: { contentChanges: event.contentChanges },
        });
      }
    }, this.config.debounceMs * 2);
  }

  private handleDocumentSave(): void {
    if (this.currentContext) {
      this.currentContext.isDirty = false;
      this.notifyListeners({ type: 'content', context: this.currentContext });
    }
  }

  // ============ Context Extraction ============

  private extractContext(editor: vscode.TextEditor): FileContext {
    const document = editor.document;
    const selection = editor.selection;
    const visibleRanges = editor.visibleRanges;

    const language = languageDetector.detectFromDocument(document);
    const languageFeatures = languageDetector.getFeatures(language.id);

    const filePath = document.uri.fsPath;
    const relativePath = vscode.workspace.getWorkspaceFolder(document.uri)
      ? vscode.workspace.asRelativePath(document.uri)
      : filePath;
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const fileExtension = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';

    const fullContent = document.getText();
    const content = this.config.includeFullContent
      ? fullContent.substring(0, this.config.maxContentLength)
      : this.getRelevantContent(document, selection);

    const primarySelection = this.extractSelection(document, selection);
    const allSelections = editor.selections.map(sel => this.extractSelection(document, sel));

    const visibleRange = visibleRanges.length > 0
      ? {
          startLine: visibleRanges[0].start.line + 1,
          endLine: visibleRanges[visibleRanges.length - 1].end.line + 1,
        }
      : { startLine: 1, endLine: document.lineCount };

    const eol: 'LF' | 'CRLF' = document.eol === vscode.EndOfLine.LF ? 'LF' : 'CRLF';

    return {
      filePath,
      relativePath,
      fileName,
      fileExtension,
      language,
      languageFeatures,
      content,
      lineCount: document.lineCount,
      cursor: {
        line: selection.active.line + 1,
        character: selection.active.character + 1,
        offset: document.offsetAt(selection.active),
      },
      selection: primarySelection,
      selections: allSelections,
      visibleRange,
      isDirty: document.isDirty,
      isUntitled: document.isUntitled,
      eol,
      timestamp: Date.now(),
    };
  }

  private extractSelection(document: vscode.TextDocument, selection: vscode.Selection): Selection {
    const text = document.getText(selection);
    const lineCount = selection.end.line - selection.start.line + 1;

    return {
      start: {
        line: selection.start.line + 1,
        character: selection.start.character + 1,
        offset: document.offsetAt(selection.start),
      },
      end: {
        line: selection.end.line + 1,
        character: selection.end.character + 1,
        offset: document.offsetAt(selection.end),
      },
      text,
      isEmpty: selection.isEmpty,
      isSingleLine: selection.isSingleLine,
      lineCount,
    };
  }

  private getRelevantContent(document: vscode.TextDocument, selection: vscode.Selection): string {
    if (!selection.isEmpty) {
      const startLine = Math.max(0, selection.start.line - 20);
      const endLine = Math.min(document.lineCount, selection.end.line + 20);
      const range = new vscode.Range(startLine, 0, endLine, 0);
      return document.getText(range);
    }

    const cursorLine = selection.active.line;
    const startLine = Math.max(0, cursorLine - 50);
    const endLine = Math.min(document.lineCount, cursorLine + 50);
    const range = new vscode.Range(startLine, 0, endLine, 0);
    return document.getText(range);
  }

  // ============ Public API ============

  getCurrentContext(): FileContext | null {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.currentContext = this.extractContext(editor);
    }
    return this.currentContext;
  }

  getSelectedText(): string | null {
    return this.currentContext?.selection.text || null;
  }

  getCurrentFilePath(): string | null {
    return this.currentContext?.relativePath || null;
  }

  getCurrentLanguage(): LanguageInfo | null {
    return this.currentContext?.language || null;
  }

  getCursorPosition(): CursorPosition | null {
    return this.currentContext?.cursor || null;
  }

  // ============ Content Helpers ============

  async getFullContent(): Promise<string | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }
    return editor.document.getText();
  }

  async getContentRange(startLine: number, endLine: number): Promise<string | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }
    const document = editor.document;
    const start = Math.max(0, startLine - 1);
    const end = Math.min(document.lineCount, endLine);
    const range = new vscode.Range(start, 0, end, 0);
    return document.getText(range);
  }

  async getContentAroundCursor(linesBefore: number, linesAfter: number): Promise<string | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }
    const document = editor.document;
    const cursorLine = editor.selection.active.line;
    const startLine = Math.max(0, cursorLine - linesBefore);
    const endLine = Math.min(document.lineCount, cursorLine + linesAfter + 1);
    const range = new vscode.Range(startLine, 0, endLine, 0);
    return document.getText(range);
  }

  // ============ Symbol Extraction ============

  async getSymbolsAtCursor(): Promise<vscode.DocumentSymbol[] | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
      );
      if (!symbols) { return null; }
      const cursorPosition = editor.selection.active;
      return this.findSymbolsAtPosition(symbols, cursorPosition);
    } catch (error) {
      Logger.warn('Failed to get symbols:', error);
      return null;
    }
  }

  private findSymbolsAtPosition(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
  ): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];
    for (const symbol of symbols) {
      if (symbol.range.contains(position)) {
        result.push(symbol);
        if (symbol.children.length > 0) {
          result.push(...this.findSymbolsAtPosition(symbol.children, position));
        }
      }
    }
    return result;
  }

  // ============ Diagnostic Extraction ============

  getDiagnosticsAtCursor(): vscode.Diagnostic[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return []; }
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const cursorPosition = editor.selection.active;
    return diagnostics.filter(d => d.range.contains(cursorPosition));
  }

  getAllDiagnostics(): vscode.Diagnostic[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return []; }
    return vscode.languages.getDiagnostics(editor.document.uri);
  }

  // ============ Listener Management ============

  onContextChange(callback: ContextChangeCallback): vscode.Disposable {
    this.listeners.add(callback);

    if (this.currentContext) {
      callback({ type: 'full', context: this.currentContext });
    }

    return {
      dispose: () => { this.listeners.delete(callback); },
    };
  }

  private notifyListeners(update: ContextUpdate): void {
    this.listeners.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        Logger.error('Context change listener error:', error);
      }
    });
  }

  // ============ Cleanup ============

  dispose(): void {
    if (this.selectionDebounce) { clearTimeout(this.selectionDebounce); }
    if (this.contentDebounce) { clearTimeout(this.contentDebounce); }
    this.listeners.clear();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    Logger.info('ActiveEditorTracker disposed');
  }
}

export default ActiveEditorTracker;
