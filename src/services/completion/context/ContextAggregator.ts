import * as vscode from 'vscode';
import * as path from 'path';
import {
  FullCompletionContext,
  PrefixContext,
  SuffixContext,
  ImportContext,
  RelatedFileContext,
  RecentEditContext,
  FileContext,
  ProjectContext,
  TokenBudget,
  DocumentSymbol,
  DiagnosticInfo,
} from './ContextTypes';
import { CursorContext } from '../CompletionTypes';
import { PrefixExtractor } from './PrefixExtractor';
import { SuffixExtractor } from './SuffixExtractor';
import { ImportAnalyzer } from './ImportAnalyzer';
import { RelatedFileFinder } from './RelatedFileFinder';
import { RecentEditsTracker } from './RecentEditsTracker';
import { TokenBudgetManager } from './TokenBudgetManager';
import { CompletionContextBuilder } from '../CompletionContextBuilder';
import { SensitiveFileDetector } from '../../codesec/SensitiveFileDetector';

export class ContextAggregator implements vscode.Disposable {
  private prefixExtractor: PrefixExtractor;
  private suffixExtractor: SuffixExtractor;
  private importAnalyzer: ImportAnalyzer;
  private relatedFileFinder: RelatedFileFinder;
  private recentEditsTracker: RecentEditsTracker;
  private budgetManager: TokenBudgetManager;
  private contextCache: Map<string, { context: FullCompletionContext; timestamp: number }> =
    new Map();
  private cacheTTLMs: number = 5000;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.prefixExtractor = PrefixExtractor.getInstance();
    this.suffixExtractor = SuffixExtractor.getInstance();
    this.importAnalyzer = ImportAnalyzer.getInstance();
    this.relatedFileFinder = new RelatedFileFinder();
    this.recentEditsTracker = RecentEditsTracker.getInstance();
    this.budgetManager = TokenBudgetManager.getInstance();
  }

  async gatherFullContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    options?: {
      skipRelatedFiles?: boolean;
      skipRecentEdits?: boolean;
      tokenBudget?: number;
    }
  ): Promise<FullCompletionContext> {
    // Check cache
    const cacheKey = this.generateCacheKey(document, position);
    const cached = this.getCachedContext(cacheKey);
    if (cached) return cached;

    // Create budget
    const budget = this.budgetManager.createBudget(options?.tokenBudget);

    // Gather context in parallel where possible
    const [prefix, suffix, imports] = await Promise.all([
      Promise.resolve(this.gatherPrefix(document, position, budget)),
      Promise.resolve(this.gatherSuffix(document, position, budget)),
      Promise.resolve(this.gatherImports(document, budget)),
    ]);

    // Related files depend on imports
    let relatedFiles: RelatedFileContext = {
      files: [],
      totalCount: 0,
      maxIncluded: 0,
      tokenBudget: budget.relatedFiles,
      tokensUsed: 0,
    };
    if (!options?.skipRelatedFiles) {
      relatedFiles = await this.gatherRelatedFiles(document, position, imports, budget);
    }

    // Recent edits
    let recentEdits: RecentEditContext = {
      edits: [],
      totalEdits: 0,
      relevantEdits: [],
      editPatterns: [],
    };
    if (!options?.skipRecentEdits) {
      recentEdits = this.gatherRecentEdits(document, position, budget);
    }

    // Cursor context (from existing builder)
    const contextBuilder = CompletionContextBuilder.getInstance();
    const cursor = contextBuilder.buildCursorContext(document, position);

    // File and project context
    const file = await this.gatherFileContext(document);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const project = workspaceFolder
      ? this.gatherProjectContext(workspaceFolder)
      : { rootPath: '', name: 'unknown', type: 'unknown' as const, configFiles: [], dependencies: [] };

    const fullContext: FullCompletionContext = {
      prefix,
      suffix,
      imports,
      relatedFiles,
      recentEdits,
      cursor,
      file,
      project,
      tokenBudget: budget,
    };

    this.setCachedContext(cacheKey, fullContext);
    return fullContext;
  }

  gatherFastContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): FullCompletionContext {
    const budget = this.budgetManager.createBudget(4000); // Smaller budget for fast

    const prefix = this.gatherPrefix(document, position, budget);
    const suffix = this.gatherSuffix(document, position, budget);
    const contextBuilder = CompletionContextBuilder.getInstance();
    const cursor = contextBuilder.buildCursorContext(document, position);

    // Quick import scan
    const imports = this.gatherImports(document, budget);

    return {
      prefix,
      suffix,
      imports,
      relatedFiles: { files: [], totalCount: 0, maxIncluded: 0, tokenBudget: 0, tokensUsed: 0 },
      recentEdits: { edits: [], totalEdits: 0, relevantEdits: [], editPatterns: [] },
      cursor,
      file: {
        path: document.uri.fsPath,
        relativePath: vscode.workspace.asRelativePath(document.uri),
        language: document.languageId,
        lineCount: document.lineCount,
        size: document.getText().length,
        lastModified: Date.now(),
        symbols: [],
        diagnostics: [],
      },
      project: { rootPath: '', name: '', type: 'unknown', configFiles: [], dependencies: [] },
      tokenBudget: budget,
    };
  }

  gatherPrefix(
    document: vscode.TextDocument,
    position: vscode.Position,
    budget: TokenBudget
  ): PrefixContext {
    return this.prefixExtractor.extract(document, position, budget.prefix);
  }

  gatherSuffix(
    document: vscode.TextDocument,
    position: vscode.Position,
    budget: TokenBudget
  ): SuffixContext {
    return this.suffixExtractor.extract(document, position, budget.suffix);
  }

  gatherImports(document: vscode.TextDocument, budget: TokenBudget): ImportContext {
    return this.importAnalyzer.analyze(document);
  }

  async gatherRelatedFiles(
    document: vscode.TextDocument,
    position: vscode.Position,
    imports: ImportContext,
    budget: TokenBudget
  ): Promise<RelatedFileContext> {
    const result = await this.relatedFileFinder.findRelatedFiles(
      document,
      position,
      imports,
      budget.relatedFiles
    );

    // Filter out any sensitive files from the results
    const detector = SensitiveFileDetector.getInstance();
    result.files = result.files.filter(f => !detector.isSensitiveFile(f.path));

    return result;
  }

  gatherRecentEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    budget: TokenBudget
  ): RecentEditContext {
    return this.recentEditsTracker.getContext(
      document.uri.fsPath,
      position,
      10
    );
  }

  async gatherFileContext(document: vscode.TextDocument): Promise<FileContext> {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const diagInfos: DiagnosticInfo[] = diagnostics
      .filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning)
      .slice(0, 10)
      .map((d) => ({
        line: d.range.start.line,
        message: d.message,
        severity:
          d.severity === vscode.DiagnosticSeverity.Error
            ? 'error' as const
            : d.severity === vscode.DiagnosticSeverity.Warning
              ? 'warning' as const
              : 'info' as const,
        code: typeof d.code === 'object' ? String(d.code.value) : d.code ? String(d.code) : null,
      }));

    // Get document symbols
    let symbols: DocumentSymbol[] = [];
    try {
      const vscodeSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );
      if (vscodeSymbols) {
        symbols = vscodeSymbols.slice(0, 20).map((s) => ({
          name: s.name,
          kind: vscode.SymbolKind[s.kind],
          range: { start: s.range.start.line, end: s.range.end.line },
          children: s.children?.slice(0, 10).map((c) => ({
            name: c.name,
            kind: vscode.SymbolKind[c.kind],
            range: { start: c.range.start.line, end: c.range.end.line },
            children: [],
          })) || [],
        }));
      }
    } catch {
      // Symbol provider not available
    }

    return {
      path: document.uri.fsPath,
      relativePath: vscode.workspace.asRelativePath(document.uri),
      language: document.languageId,
      lineCount: document.lineCount,
      size: document.getText().length,
      lastModified: Date.now(),
      symbols,
      diagnostics: diagInfos,
    };
  }

  gatherProjectContext(workspaceFolder: vscode.WorkspaceFolder): ProjectContext {
    const rootPath = workspaceFolder.uri.fsPath;
    const name = workspaceFolder.name;

    // Detect project type by checking common config files
    let type: ProjectContext['type'] = 'unknown';
    const configFiles: string[] = [];

    // These are detected by name patterns, actual file existence is best-effort
    const configChecks: Array<{ file: string; type: ProjectContext['type'] }> = [
      { file: 'package.json', type: 'node' },
      { file: 'tsconfig.json', type: 'node' },
      { file: 'requirements.txt', type: 'python' },
      { file: 'pyproject.toml', type: 'python' },
      { file: 'Cargo.toml', type: 'rust' },
      { file: 'go.mod', type: 'go' },
      { file: 'pom.xml', type: 'java' },
      { file: 'build.gradle', type: 'java' },
    ];

    for (const check of configChecks) {
      configFiles.push(check.file);
      if (type === 'unknown') type = check.type;
    }

    return {
      rootPath,
      name,
      type,
      configFiles,
      dependencies: [],
    };
  }

  getCachedContext(cacheKey: string): FullCompletionContext | null {
    const entry = this.contextCache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < this.cacheTTLMs) {
      return entry.context;
    }
    if (entry) this.contextCache.delete(cacheKey);
    return null;
  }

  setCachedContext(cacheKey: string, context: FullCompletionContext): void {
    this.contextCache.set(cacheKey, { context, timestamp: Date.now() });

    // Prune old cache entries
    if (this.contextCache.size > 20) {
      const oldest = [...this.contextCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 10);
      for (const [key] of oldest) {
        this.contextCache.delete(key);
      }
    }
  }

  generateCacheKey(document: vscode.TextDocument, position: vscode.Position): string {
    return `${document.uri.fsPath}:${position.line}:${position.character}:${document.version}`;
  }

  invalidateCache(filePath?: string): void {
    if (filePath) {
      for (const [key] of this.contextCache) {
        if (key.startsWith(filePath)) {
          this.contextCache.delete(key);
        }
      }
    } else {
      this.contextCache.clear();
    }
  }

  clearCache(): void {
    this.contextCache.clear();
  }

  dispose(): void {
    this.contextCache.clear();
    this.relatedFileFinder.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
