import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { DocsClient } from './DocsClient';
import { DocSuggestion } from './DocsTypes';
import { Logger } from '../../utils/Logger';

export class DocsAutoSuggestService extends EventEmitter {
  private static instance: DocsAutoSuggestService;
  private docsClient: DocsClient;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastContextHash: string = '';
  private cache: Map<string, DocSuggestion[]> = new Map();
  private disposables: vscode.Disposable[] = [];
  private enabled: boolean = false;

  static getInstance(): DocsAutoSuggestService {
    if (!DocsAutoSuggestService.instance) {
      DocsAutoSuggestService.instance = new DocsAutoSuggestService();
    }
    return DocsAutoSuggestService.instance;
  }

  private constructor() {
    super();
    this.docsClient = DocsClient.getInstance();
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) this.onEditorChange(editor);
      })
    );

    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics(e => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const uri = editor.document.uri;
        if (e.uris.some(u => u.toString() === uri.toString())) {
          const diagnostics = vscode.languages.getDiagnostics(uri);
          const errors = diagnostics
            .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
            .map(d => d.message);
          if (errors.length > 0) {
            this.onDiagnosticsChange(errors, uri.fsPath);
          }
        }
      })
    );

    if (vscode.window.activeTextEditor) {
      this.onEditorChange(vscode.window.activeTextEditor);
    }

    Logger.info('Docs auto-suggest enabled');
  }

  disable(): void {
    this.enabled = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    Logger.info('Docs auto-suggest disabled');
  }

  onEditorChange(editor: vscode.TextEditor): void {
    if (!this.enabled) return;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const debounceMs = vscode.workspace.getConfiguration('inaCoding.docs').get<number>('suggestDebounceMs', 2000);

    this.debounceTimer = setTimeout(async () => {
      try {
        const context = this.extractContext(editor);
        const hash = this.hashContext(context);

        if (hash === this.lastContextHash) return;
        this.lastContextHash = hash;

        const cached = this.cache.get(hash);
        if (cached) {
          this.emit('suggestions-ready', cached);
          return;
        }

        const suggestions = await this.docsClient.getSuggestions(context);
        if (suggestions.length > 0) {
          this.cache.set(hash, suggestions);
          this.emit('suggestions-ready', suggestions);
        }
      } catch (error) {
        Logger.warn('Auto-suggest failed:', error);
      }
    }, debounceMs);
  }

  onDiagnosticsChange(errors: string[], filePath: string): void {
    if (!this.enabled) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.fsPath !== filePath) return;

    const context = this.extractContext(editor);
    context.errors = errors;

    this.docsClient.getSuggestions(context).then(suggestions => {
      if (suggestions.length > 0) {
        this.emit('suggestions-ready', suggestions);
      }
    }).catch(e => Logger.warn('Error suggest failed:', e));
  }

  async getSuggestionsForFile(filePath: string): Promise<DocSuggestion[]> {
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
    if (!editor) return [];

    const context = this.extractContext(editor);
    return this.docsClient.getSuggestions(context);
  }

  private extractContext(editor: vscode.TextEditor): { filePath: string; language: string; code: string; errors: string[]; imports: string[] } {
    const doc = editor.document;
    const code = doc.getText().slice(0, 2000);
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    const errors = diagnostics
      .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
      .map(d => d.message);

    const importLines: string[] = [];
    const importRegex = /^(?:import\s+.+|const\s+\w+\s*=\s*require\s*\(.+\))/;
    for (let i = 0; i < Math.min(doc.lineCount, 50); i++) {
      const line = doc.lineAt(i).text.trim();
      if (importRegex.test(line)) importLines.push(line);
    }

    return {
      filePath: doc.uri.fsPath,
      language: doc.languageId,
      code,
      errors,
      imports: importLines,
    };
  }

  private hashContext(ctx: { filePath: string; language: string; errors: string[]; imports: string[] }): string {
    const key = `${ctx.filePath}:${ctx.language}:${ctx.errors.join(',')}:${ctx.imports.join(',')}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  dispose(): void {
    this.disable();
    this.cache.clear();
  }
}
