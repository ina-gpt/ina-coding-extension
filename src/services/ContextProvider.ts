import * as vscode from 'vscode';
import { ActiveEditorTracker, ContextUpdate } from './ActiveEditorTracker';
import { LanguageInfo } from './LanguageDetector';
import { Logger } from '../utils/Logger';
import { CodeSecurityGate } from './codesec/CodeSecurityGate';
import { SensitiveFileDetector } from './codesec/SensitiveFileDetector';

// ============ Types ============

export interface ChatContext {
  activeFile: ActiveFileContext | null;
  workspace: WorkspaceContext | null;
  referencedFiles: ReferencedFile[];
  git: GitContext | null;
  diagnostics: DiagnosticsSummary | null;
  timestamp: number;
}

export interface ActiveFileContext {
  path: string;
  relativePath: string;
  fileName: string;
  language: LanguageInfo;

  fullContent?: string;
  selectedContent?: string;
  surroundingContent?: string;

  cursorLine: number;
  cursorColumn: number;
  selectionRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };

  isDirty: boolean;
  lineCount: number;

  currentSymbol?: string;
  symbolPath?: string[];
}

export interface WorkspaceContext {
  name: string;
  rootPath: string;
  folders: string[];
  openFiles: string[];
}

export interface ReferencedFile {
  path: string;
  relativePath: string;
  language: string;
  content?: string;
  lineRange?: { start: number; end: number };
}

export interface GitContext {
  branch: string;
  repoRoot: string;
  hasChanges: boolean;
  changedFiles?: string[];
}

export interface DiagnosticsSummary {
  errors: number;
  warnings: number;
  hints: number;
  topIssues: {
    severity: 'error' | 'warning' | 'hint';
    message: string;
    line: number;
  }[];
}

export interface ContextOptions {
  includeFullContent?: boolean;
  includeSelection?: boolean;
  includeSurrounding?: boolean;
  surroundingLines?: number;
  includeSymbols?: boolean;
  includeDiagnostics?: boolean;
  includeGit?: boolean;
  includeWorkspace?: boolean;
  maxContentLength?: number;
}

const DEFAULT_OPTIONS: ContextOptions = {
  includeFullContent: false,
  includeSelection: true,
  includeSurrounding: true,
  surroundingLines: 30,
  includeSymbols: true,
  includeDiagnostics: true,
  includeGit: true,
  includeWorkspace: true,
  maxContentLength: 50000,
};

// ============ Context Provider ============

export class ContextProvider implements vscode.Disposable {
  private editorTracker: ActiveEditorTracker;
  private disposables: vscode.Disposable[] = [];
  private contextChangeCallbacks: Set<(context: ChatContext) => void> = new Set();

  constructor() {
    this.editorTracker = new ActiveEditorTracker({
      maxContentLength: 100000,
      debounceMs: 150,
      trackSelection: true,
      trackCursor: true,
      trackVisibleRange: true,
      includeFullContent: false,
    });

    this.disposables.push(
      this.editorTracker.onContextChange((update) => {
        this.handleContextUpdate(update);
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.rebuildAndNotify();
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.rebuildAndNotify();
      })
    );

    Logger.info('ContextProvider initialized');
  }

  // ============ Event Handling ============

  private handleContextUpdate(_update: ContextUpdate): void {
    this.rebuildAndNotify();
  }

  private rebuildAndNotify(): void {
    this.getContext().then(context => {
      this.notifyContextChange(context);
    }).catch(err => {
      Logger.debug('Context rebuild failed:', err);
    });
  }

  // ============ Context Building ============

  async getContext(options: ContextOptions = {}): Promise<ChatContext> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const activeFile = await this.buildActiveFileContext(opts);
    const workspace = opts.includeWorkspace ? this.buildWorkspaceContext() : null;
    const git = opts.includeGit ? await this.buildGitContext() : null;
    const diagnostics = opts.includeDiagnostics ? this.buildDiagnosticsSummary() : null;

    return {
      activeFile,
      workspace,
      referencedFiles: [],
      git,
      diagnostics,
      timestamp: Date.now(),
    };
  }

  // ============ Active File Context ============

  private async buildActiveFileContext(options: ContextOptions): Promise<ActiveFileContext | null> {
    const fileContext = this.editorTracker.getCurrentContext();
    if (!fileContext) { return null; }

    const result: ActiveFileContext = {
      path: fileContext.filePath,
      relativePath: fileContext.relativePath,
      fileName: fileContext.fileName,
      language: fileContext.language,
      cursorLine: fileContext.cursor.line,
      cursorColumn: fileContext.cursor.character,
      isDirty: fileContext.isDirty,
      lineCount: fileContext.lineCount,
    };

    if (!fileContext.selection.isEmpty) {
      result.selectionRange = {
        startLine: fileContext.selection.start.line,
        startColumn: fileContext.selection.start.character,
        endLine: fileContext.selection.end.line,
        endColumn: fileContext.selection.end.character,
      };

      if (options.includeSelection) {
        result.selectedContent = this.truncateContent(
          fileContext.selection.text,
          options.maxContentLength || 50000
        );
      }
    }

    if (options.includeSurrounding) {
      const surrounding = await this.editorTracker.getContentAroundCursor(
        options.surroundingLines || 30,
        options.surroundingLines || 30
      );
      if (surrounding) {
        result.surroundingContent = this.truncateContent(
          surrounding,
          options.maxContentLength || 50000
        );
      }
    }

    if (options.includeFullContent) {
      const fullContent = await this.editorTracker.getFullContent();
      if (fullContent) {
        result.fullContent = this.sanitizeForSecurity(
          this.truncateContent(fullContent, options.maxContentLength || 100000),
          result.path
        );
      }
    }

    if (options.includeSymbols) {
      try {
        const symbols = await this.editorTracker.getSymbolsAtCursor();
        if (symbols && symbols.length > 0) {
          const currentSymbol = symbols[symbols.length - 1];
          result.currentSymbol = currentSymbol.name;
          result.symbolPath = symbols.map(s => s.name);
        }
      } catch {
        // Symbols not available for this language
      }
    }

    return result;
  }

  // ============ Workspace Context ============

  private buildWorkspaceContext(): WorkspaceContext | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) { return null; }

    const primaryFolder = workspaceFolders[0];

    const openFiles = vscode.window.tabGroups.all
      .flatMap(group => group.tabs)
      .filter(tab => tab.input instanceof vscode.TabInputText)
      .map(tab => {
        const input = tab.input as vscode.TabInputText;
        return vscode.workspace.asRelativePath(input.uri);
      });

    return {
      name: primaryFolder.name,
      rootPath: primaryFolder.uri.fsPath,
      folders: workspaceFolders.map(f => f.name),
      openFiles,
    };
  }

  // ============ Git Context ============

  private async buildGitContext(): Promise<GitContext | null> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) { return null; }

      const git = gitExtension.exports;
      if (!git) { return null; }

      const api = git.getAPI(1);
      if (!api || api.repositories.length === 0) { return null; }

      const repo = api.repositories[0];
      const head = repo.state.HEAD;

      return {
        branch: head?.name || 'HEAD',
        repoRoot: repo.rootUri.fsPath,
        hasChanges: repo.state.workingTreeChanges.length > 0 || repo.state.indexChanges.length > 0,
        changedFiles: [
          ...repo.state.workingTreeChanges.map((c: { uri: vscode.Uri }) => c.uri.fsPath),
          ...repo.state.indexChanges.map((c: { uri: vscode.Uri }) => c.uri.fsPath),
        ],
      };
    } catch (error) {
      Logger.debug('Git context not available:', error);
      return null;
    }
  }

  // ============ Diagnostics ============

  private buildDiagnosticsSummary(): DiagnosticsSummary | null {
    const diagnostics = this.editorTracker.getAllDiagnostics();
    if (diagnostics.length === 0) { return null; }

    let errors = 0;
    let warnings = 0;
    let hints = 0;
    const topIssues: DiagnosticsSummary['topIssues'] = [];

    for (const diag of diagnostics) {
      switch (diag.severity) {
        case vscode.DiagnosticSeverity.Error:
          errors++;
          break;
        case vscode.DiagnosticSeverity.Warning:
          warnings++;
          break;
        case vscode.DiagnosticSeverity.Hint:
        case vscode.DiagnosticSeverity.Information:
          hints++;
          break;
      }

      if (topIssues.length < 5) {
        const severity = diag.severity === vscode.DiagnosticSeverity.Error
          ? 'error' as const
          : diag.severity === vscode.DiagnosticSeverity.Warning
            ? 'warning' as const
            : 'hint' as const;

        topIssues.push({
          severity,
          message: diag.message,
          line: diag.range.start.line + 1,
        });
      }
    }

    topIssues.sort((a, b) => {
      const order = { error: 0, warning: 1, hint: 2 };
      return order[a.severity] - order[b.severity];
    });

    return { errors, warnings, hints, topIssues };
  }

  // ============ Prompt Generation ============

  formatContextForPrompt(context: ChatContext, options: {
    maxLength?: number;
    format?: 'full' | 'compact' | 'minimal';
  } = {}): string {
    const { maxLength = 10000, format = 'compact' } = options;
    const parts: string[] = [];

    if (!context.activeFile) {
      return '';
    }

    const file = context.activeFile;

    parts.push(`<context>`);
    parts.push(`<file path="${file.relativePath}" language="${file.language.id}">`);

    if (file.selectionRange) {
      parts.push(`<selection lines="${file.selectionRange.startLine}-${file.selectionRange.endLine}">`);
      if (file.selectedContent) {
        parts.push(file.selectedContent);
      }
      parts.push(`</selection>`);
    } else {
      parts.push(`<cursor line="${file.cursorLine}" column="${file.cursorColumn}" />`);
    }

    if (file.symbolPath && file.symbolPath.length > 0) {
      parts.push(`<symbol path="${file.symbolPath.join(' > ')}" />`);
    }

    if (format !== 'minimal' && file.surroundingContent && !file.selectedContent) {
      parts.push(`<surrounding>`);
      parts.push(this.truncateContent(file.surroundingContent, maxLength / 2));
      parts.push(`</surrounding>`);
    }

    if (format === 'full' && file.fullContent) {
      parts.push(`<content>`);
      parts.push(this.truncateContent(file.fullContent, maxLength));
      parts.push(`</content>`);
    }

    parts.push(`</file>`);

    if (context.diagnostics && context.diagnostics.errors > 0) {
      parts.push(`<diagnostics errors="${context.diagnostics.errors}" warnings="${context.diagnostics.warnings}">`);
      for (const issue of context.diagnostics.topIssues.slice(0, 3)) {
        parts.push(`  <issue severity="${issue.severity}" line="${issue.line}">${issue.message}</issue>`);
      }
      parts.push(`</diagnostics>`);
    }

    if (format === 'full' && context.workspace) {
      parts.push(`<workspace name="${context.workspace.name}">`);
      parts.push(`  <open-files>${context.workspace.openFiles.slice(0, 10).join(', ')}</open-files>`);
      parts.push(`</workspace>`);
    }

    if (context.git) {
      parts.push(`<git branch="${context.git.branch || ''}">`);
      if (context.git.changedFiles && context.git.changedFiles.length > 0) {
        parts.push(`  <changes count="${context.git.changedFiles.length}">`);
        for (const f of context.git.changedFiles.slice(0, 5)) {
          parts.push(`    <file>${f}</file>`);
        }
        parts.push(`  </changes>`);
      }
      parts.push(`</git>`);
    }

    parts.push(`</context>`);

    return parts.join('\n');
  }

  // ============ Security ============

  private sanitizeForSecurity(content: string, filePath: string): string {
    try {
      const gate = CodeSecurityGate.getInstance();
      const result = gate.scanOutgoingCode(content, filePath, 'context');
      return result.sanitizedCode;
    } catch {
      return content;
    }
  }

  // ============ Utilities ============

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) { return content; }
    const half = Math.floor(maxLength / 2);
    const truncationMessage = `\n\n... [${content.length - maxLength} characters truncated] ...\n\n`;
    return content.substring(0, half) + truncationMessage + content.substring(content.length - half);
  }

  // ============ Listener Management ============

  onContextChange(callback: (context: ChatContext) => void): vscode.Disposable {
    this.contextChangeCallbacks.add(callback);
    return {
      dispose: () => { this.contextChangeCallbacks.delete(callback); },
    };
  }

  private notifyContextChange(context: ChatContext): void {
    this.contextChangeCallbacks.forEach(callback => {
      try {
        callback(context);
      } catch (error) {
        Logger.error('Context change callback error:', error);
      }
    });
  }

  // ============ Quick Access ============

  getActiveFilePath(): string | null {
    return this.editorTracker.getCurrentFilePath();
  }

  getSelectedText(): string | null {
    return this.editorTracker.getSelectedText();
  }

  getCurrentLanguage(): LanguageInfo | null {
    return this.editorTracker.getCurrentLanguage();
  }

  // ============ Referenced Files ============

  async addReferencedFile(filePath: string, options: {
    includeContent?: boolean;
    lineRange?: { start: number; end: number };
  } = {}): Promise<ReferencedFile | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);

      let content: string | undefined;
      if (options.includeContent) {
        if (options.lineRange) {
          const range = new vscode.Range(
            options.lineRange.start - 1, 0,
            options.lineRange.end, 0
          );
          content = document.getText(range);
        } else {
          content = document.getText();
        }
      }

      const relativePath = vscode.workspace.asRelativePath(uri);

      return {
        path: filePath,
        relativePath,
        language: document.languageId,
        content,
        lineRange: options.lineRange,
      };
    } catch (error) {
      Logger.warn(`Failed to read file: ${filePath}`, error);
      return null;
    }
  }

  // ============ Cleanup ============

  dispose(): void {
    this.contextChangeCallbacks.clear();
    this.editorTracker.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    Logger.info('ContextProvider disposed');
  }
}

export default ContextProvider;
