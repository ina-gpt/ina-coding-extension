import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { AgentPlan, AgentSession, AgentStep } from '../AgentTypes';
import { PlanStep } from '../planning/PlanningTypes';
import { FileOperation, FileOpEntry, FileOpBatch, FileConflict, ConflictResolution, MultiFileEditResult, PostExecutionValidation, ImportUpdate } from './FileOpsTypes';
import { FileOpsExecutor } from './FileOpsExecutor';
import { ConflictResolver } from './ConflictResolver';
import { ImportGraphAnalyzer } from './ImportGraphAnalyzer';
import { FileSecurityGuard } from './FileSecurityGuard';
import { Logger } from '../../../utils/Logger';

export class MultiFileEditOrchestrator extends EventEmitter {
  private static instance: MultiFileEditOrchestrator;
  private fileOpsExecutor: FileOpsExecutor;
  private conflictResolver: ConflictResolver;
  private importAnalyzer: ImportGraphAnalyzer;
  private securityGuard: FileSecurityGuard;
  private activeBatch: FileOpBatch | null = null;

  private constructor() {
    super();
    this.fileOpsExecutor = FileOpsExecutor.getInstance();
    this.conflictResolver = ConflictResolver.getInstance();
    this.importAnalyzer = ImportGraphAnalyzer.getInstance();
    this.securityGuard = FileSecurityGuard.getInstance();
  }

  static getInstance(): MultiFileEditOrchestrator {
    if (!MultiFileEditOrchestrator.instance) {
      MultiFileEditOrchestrator.instance = new MultiFileEditOrchestrator();
    }
    return MultiFileEditOrchestrator.instance;
  }

  async executeMultiFileEdit(plan: AgentPlan, session: AgentSession): Promise<MultiFileEditResult> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // 1. Convert plan steps to file ops
    const ops = this.convertPlanToFileOps(plan.steps as PlanStep[]);

    // 2. Detect conflicts
    const conflicts = await this.conflictResolver.detectConflicts(ops, workspaceRoot);
    const criticalConflicts = conflicts.filter(c => c.type === 'circular-rename');
    if (criticalConflicts.length > 0) {
      return {
        batch: {
          id: `batch_${Date.now()}`,
          operations: ops,
          results: [],
          status: 'failed',
          startTime: Date.now(),
          endTime: Date.now(),
        },
        importUpdates: [],
        conflicts,
        postValidation: null,
        summary: `Blocked: ${criticalConflicts.length} critical conflicts`,
      };
    }

    // 3. Auto-resolve non-critical conflicts
    const resolutions = this.conflictResolver.autoResolve(conflicts, {});
    let resolvedOps = [...ops];
    for (const conflict of conflicts) {
      const resolution = resolutions.get(conflict.operationId);
      if (resolution) {
        const op = resolvedOps.find(o => o.id === conflict.operationId);
        if (op) {
          const resolved = this.conflictResolver.resolveConflict(conflict, resolution, op);
          if (resolved === null) {
            resolvedOps = resolvedOps.filter(o => o.id !== conflict.operationId);
          } else {
            resolvedOps = resolvedOps.map(o => o.id === conflict.operationId ? resolved : o);
          }
        }
      }
    }

    // 4. Add implicit operations (create folders, import updates for renames)
    resolvedOps = await this.addImplicitOperations(resolvedOps, workspaceRoot);

    // 5. Sort by dependency
    resolvedOps = this.sortOperationsByDependency(resolvedOps);

    // 6. Execute batch
    this.emit('batch-start', { operationCount: resolvedOps.length });
    const batch = await this.fileOpsExecutor.executeBatch({
      operations: resolvedOps,
      sessionId: session.id,
      dryRun: false,
      atomic: true,
    }, workspaceRoot);
    this.activeBatch = batch;

    // 7. Generate import updates for renames/moves
    const importUpdates: ImportUpdate[] = [];
    const renamedOps = batch.results.filter(
      r => r.success && (r.operation === FileOperation.RENAME || r.operation === FileOperation.MOVE) && r.targetPath
    );
    for (const r of renamedOps) {
      try {
        const updates = this.importAnalyzer.generateImportUpdates(
          r.sourcePath,
          r.targetPath!,
          [],
          workspaceRoot
        );
        importUpdates.push(...updates);
      } catch (e) {
        Logger.warn('Failed to generate import updates for rename:', e);
      }
    }
    if (importUpdates.length > 0) {
      this.emit('import-updates', importUpdates);
    }

    // 8. Post-execution validation
    let postValidation: PostExecutionValidation | null = null;
    try {
      postValidation = await this.validatePostExecution(batch, workspaceRoot);
    } catch (e) {
      Logger.warn('Post-execution validation failed:', e);
    }

    // 9. Build summary
    const completed = batch.results.filter(r => r.success).length;
    const failed = batch.results.filter(r => !r.success).length;
    const summary = `${completed}/${batch.operations.length} operations completed${
      failed > 0 ? `, ${failed} failed` : ''
    }${importUpdates.length > 0 ? `, ${importUpdates.length} imports updated` : ''}`;

    this.emit('batch-complete', { batch, summary });

    return { batch, importUpdates, conflicts, postValidation, summary };
  }

  convertPlanToFileOps(steps: PlanStep[]): FileOpEntry[] {
    return steps
      .filter(s => ['create', 'edit', 'delete', 'rename', 'move'].includes(s.type))
      .map((s, i) => ({
        id: s.id || `op_${i}`,
        operation: this.stepTypeToFileOp(s.type),
        sourcePath: s.filePath,
        targetPath: s.targetPath || null,
        content: s.details || null,
        insertPosition: null,
        replaceRange: null,
        appendContent: null,
        prependContent: null,
        patchDiff: null,
        description: s.description,
        dependencies: s.dependencies || [],
        metadata: { risk: s.risk, order: s.order },
      }));
  }

  private stepTypeToFileOp(type: string): FileOperation {
    switch (type) {
      case 'create': return FileOperation.CREATE;
      case 'edit': return FileOperation.EDIT;
      case 'delete': return FileOperation.DELETE;
      case 'rename': return FileOperation.RENAME;
      case 'move': return FileOperation.MOVE;
      default: return FileOperation.EDIT;
    }
  }

  async generateImportFixOps(
    renamedFiles: Array<{ from: string; to: string }>,
    workspaceRoot: string
  ): Promise<FileOpEntry[]> {
    const ops: FileOpEntry[] = [];
    for (const { from, to } of renamedFiles) {
      try {
        const updates = this.importAnalyzer.generateImportUpdates(from, to, [], workspaceRoot);
        for (const update of updates) {
          ops.push({
            id: `import_fix_${ops.length}`,
            operation: FileOperation.EDIT,
            sourcePath: update.filePath,
            targetPath: null,
            content: null,
            insertPosition: null,
            replaceRange: { startLine: update.lineNumber, endLine: update.lineNumber },
            appendContent: null,
            prependContent: null,
            patchDiff: null,
            description: `Update import: ${update.oldImport} → ${update.newImport}`,
            dependencies: [],
            metadata: { oldImport: update.oldImport, newImport: update.newImport },
          });
        }
      } catch (e) {
        Logger.warn(`Failed to generate import fixes for ${from} → ${to}:`, e);
      }
    }
    return ops;
  }

  async validatePostExecution(
    batch: FileOpBatch,
    workspaceRoot: string
  ): Promise<PostExecutionValidation> {
    const warnings: string[] = [];
    const brokenImports: any[] = [];
    const typeErrors: string[] = [];

    // Check for broken imports in changed files
    const changedFiles = batch.results
      .filter(r => r.success)
      .map(r => r.targetPath || r.sourcePath);

    try {
      const graph = await this.importAnalyzer.buildImportGraph(changedFiles, workspaceRoot);
      for (const [file, imports] of graph) {
        for (const imp of imports) {
          const resolvedPath = imp.toFile;
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(resolvedPath));
          } catch {
            brokenImports.push(imp);
          }
        }
      }
    } catch (e) {
      warnings.push(`Import validation failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }

    if (brokenImports.length > 0) {
      warnings.push(`${brokenImports.length} broken import(s) detected`);
    }

    return { brokenImports, typeErrors, warnings };
  }

  async revertBatch(batchId: string): Promise<void> {
    if (this.activeBatch && this.activeBatch.id === batchId) {
      const RollbackMgr = require('../execution/RollbackManager').RollbackManager;
      await RollbackMgr.getInstance().rollbackAll();
      this.activeBatch.status = 'rolledBack';
      this.emit('batch-reverted', { batchId });
    }
  }

  getActiveBatch(): FileOpBatch | null {
    return this.activeBatch;
  }

  private sortOperationsByDependency(ops: FileOpEntry[]): FileOpEntry[] {
    const ORDER: Record<string, number> = {
      [FileOperation.CREATE_FOLDER]: 0,
      [FileOperation.CREATE]: 1,
      [FileOperation.EDIT]: 2,
      [FileOperation.PATCH]: 2,
      [FileOperation.APPEND]: 2,
      [FileOperation.PREPEND]: 2,
      [FileOperation.INSERT_AT]: 2,
      [FileOperation.REPLACE_RANGE]: 2,
      [FileOperation.COPY]: 3,
      [FileOperation.RENAME]: 4,
      [FileOperation.MOVE]: 4,
      [FileOperation.DELETE]: 5,
    };
    return [...ops].sort((a, b) => (ORDER[a.operation] ?? 2) - (ORDER[b.operation] ?? 2));
  }

  private async addImplicitOperations(
    ops: FileOpEntry[],
    workspaceRoot: string
  ): Promise<FileOpEntry[]> {
    const result = [...ops];
    const addedDirs = new Set<string>();

    // Add CREATE_FOLDER for any directories that don't exist
    for (const op of ops) {
      if (op.operation === FileOperation.CREATE || op.operation === FileOperation.COPY) {
        const dir = require('path').dirname(op.sourcePath);
        if (dir && dir !== '.' && !addedDirs.has(dir)) {
          const absDir = require('path').resolve(workspaceRoot, dir);
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(absDir));
          } catch {
            addedDirs.add(dir);
            result.unshift({
              id: `mkdir_${addedDirs.size}`,
              operation: FileOperation.CREATE_FOLDER,
              sourcePath: dir,
              targetPath: null,
              content: null,
              insertPosition: null,
              replaceRange: null,
              appendContent: null,
              prependContent: null,
              patchDiff: null,
              description: `Create directory: ${dir}`,
              dependencies: [],
              metadata: { implicit: true },
            });
          }
        }
      }
    }
    return result;
  }

  dispose(): void {
    this.activeBatch = null;
    this.removeAllListeners();
  }
}
