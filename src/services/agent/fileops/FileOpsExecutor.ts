import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import {
  FileOperation,
  FileOpsRequest,
  FileOpEntry,
  FileOpResult,
  FileOpBatch,
  FileSnapshot,
} from './FileOpsTypes';
import { RollbackData, RollbackType } from '../execution/ExecutionTypes';
import { FileSecurityGuard } from './FileSecurityGuard';
import { ImportGraphAnalyzer } from './ImportGraphAnalyzer';
import { DiffPatcher } from './DiffPatcher';
import { RollbackManager } from '../execution/RollbackManager';
import { Logger } from '../../../utils/Logger';

const OPERATION_ORDER: FileOperation[] = [
  FileOperation.CREATE_FOLDER,
  FileOperation.CREATE,
  FileOperation.EDIT,
  FileOperation.PATCH,
  FileOperation.APPEND,
  FileOperation.PREPEND,
  FileOperation.INSERT_AT,
  FileOperation.REPLACE_RANGE,
  FileOperation.RENAME,
  FileOperation.MOVE,
  FileOperation.COPY,
  FileOperation.DELETE,
];

export class FileOpsExecutor {
  private static instance: FileOpsExecutor;
  private securityGuard: FileSecurityGuard;
  private importAnalyzer: ImportGraphAnalyzer;
  private diffPatcher: DiffPatcher;
  private rollbackManager: RollbackManager;
  private fileSnapshots: Map<string, FileSnapshot> = new Map();

  static getInstance(): FileOpsExecutor {
    if (!FileOpsExecutor.instance) {
      FileOpsExecutor.instance = new FileOpsExecutor();
    }
    return FileOpsExecutor.instance;
  }

  private constructor() {
    this.securityGuard = FileSecurityGuard.getInstance();
    this.importAnalyzer = ImportGraphAnalyzer.getInstance();
    this.diffPatcher = DiffPatcher.getInstance();
    this.rollbackManager = RollbackManager.getInstance();
  }

  async executeBatch(request: FileOpsRequest, workspaceRoot: string): Promise<FileOpBatch> {
    const batchId = crypto.randomUUID();
    const startTime = Date.now();

    const batch: FileOpBatch = {
      id: batchId,
      operations: request.operations,
      results: [],
      status: 'pending',
      startTime,
      endTime: null,
    };

    Logger.info(`Executing batch ${batchId} with ${request.operations.length} operations`);

    // 1. Validate via securityGuard
    const validation = this.securityGuard.validateBatch(request.operations, workspaceRoot);

    if (validation.warnings.length > 0) {
      for (const w of validation.warnings) {
        Logger.warn(`Batch ${batchId}: ${w}`);
      }
    }

    // 2. If critical errors, reject batch
    if (!validation.safe) {
      Logger.error(`Batch ${batchId} rejected: ${validation.errors.join('; ')}`);
      batch.status = 'failed';
      batch.endTime = Date.now();
      batch.results = request.operations.map((op) => ({
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        error: validation.errors.join('; '),
        rollbackData: null,
        diff: null,
        duration: 0,
      }));
      return batch;
    }

    // 3. Take snapshots of affected files
    for (const op of request.operations) {
      const absPath = path.resolve(workspaceRoot, op.sourcePath);
      try {
        const snapshot = await this.takeSnapshot(absPath);
        this.fileSnapshots.set(absPath, snapshot);
      } catch {
        // File may not exist yet (e.g. CREATE), that's fine
      }
      if (op.targetPath) {
        const absTarget = path.resolve(workspaceRoot, op.targetPath);
        try {
          const snapshot = await this.takeSnapshot(absTarget);
          this.fileSnapshots.set(absTarget, snapshot);
        } catch {
          // Target may not exist yet
        }
      }
    }

    // 4. Sort operations by execution order
    const sorted = [...request.operations].sort((a, b) => {
      const aIdx = OPERATION_ORDER.indexOf(a.operation);
      const bIdx = OPERATION_ORDER.indexOf(b.operation);
      return aIdx - bIdx;
    });

    // 5. Execute each sequentially
    batch.status = 'executing';
    const completedResults: FileOpResult[] = [];

    for (const op of sorted) {
      if (request.dryRun) {
        completedResults.push({
          id: op.id,
          operation: op.operation,
          success: true,
          sourcePath: op.sourcePath,
          targetPath: op.targetPath,
          error: null,
          rollbackData: null,
          diff: null,
          duration: 0,
        });
        continue;
      }

      const result = await this.executeOperation(op, workspaceRoot);
      completedResults.push(result);

      // 6. If atomic and any failure, rollback all completed ops
      if (!result.success && request.atomic) {
        Logger.warn(`Batch ${batchId}: operation ${op.id} failed, rolling back all completed operations`);
        await this.rollbackManager.rollbackAll();
        batch.status = 'rolledBack';
        batch.results = completedResults;
        batch.endTime = Date.now();
        return batch;
      }
    }

    // 7. Return batch
    batch.results = completedResults;
    const hasFailures = completedResults.some((r) => !r.success);
    batch.status = hasFailures ? 'partial' : 'completed';
    batch.endTime = Date.now();

    Logger.info(`Batch ${batchId} ${batch.status}: ${completedResults.filter((r) => r.success).length}/${completedResults.length} succeeded`);
    return batch;
  }

  private async executeOperation(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    switch (op.operation) {
      case FileOperation.CREATE:
        return this.executeCreate(op, workspaceRoot);
      case FileOperation.EDIT:
        return this.executeEdit(op, workspaceRoot);
      case FileOperation.DELETE:
        return this.executeDelete(op, workspaceRoot);
      case FileOperation.RENAME:
        return this.executeRename(op, workspaceRoot);
      case FileOperation.MOVE:
        return this.executeMove(op, workspaceRoot);
      case FileOperation.COPY:
        return this.executeCopy(op, workspaceRoot);
      case FileOperation.CREATE_FOLDER:
        return this.executeCreateFolder(op, workspaceRoot);
      case FileOperation.PATCH:
        return this.executePatch(op, workspaceRoot);
      case FileOperation.APPEND:
        return this.executeAppend(op, workspaceRoot);
      case FileOperation.PREPEND:
        return this.executePrepend(op, workspaceRoot);
      case FileOperation.INSERT_AT:
        return this.executeInsertAt(op, workspaceRoot);
      case FileOperation.REPLACE_RANGE:
        return this.executeReplaceRange(op, workspaceRoot);
      default:
        return {
          id: op.id,
          operation: op.operation,
          success: false,
          sourcePath: op.sourcePath,
          targetPath: op.targetPath,
          error: `Unknown operation: ${op.operation}`,
          rollbackData: null,
          diff: null,
          duration: 0,
        };
    }
  }

  async executeCreate(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, op.content ?? '', 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_DELETE,
        originalContent: new Map(),
        createdFiles: [absPath],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      Logger.info(`Created file: ${op.sourcePath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff: null,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to create ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeEdit(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      const original = await fs.readFile(absPath, 'utf-8');
      this.fileSnapshots.set(absPath, await this.takeSnapshot(absPath));

      const newContent = op.content ?? '';
      await fs.writeFile(absPath, newContent, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RESTORE,
        originalContent: new Map([[absPath, original]]),
        createdFiles: [],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      const diff = this.computeDiff(original, newContent);
      Logger.info(`Edited file: ${op.sourcePath} (+${diff.added} -${diff.removed} ~${diff.changed})`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to edit ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeDelete(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      const content = await fs.readFile(absPath, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RESTORE,
        originalContent: new Map(),
        createdFiles: [],
        renamedFiles: [],
        deletedFiles: new Map([[absPath, content]]),
        terminalCommands: [],
      };

      await fs.unlink(absPath);
      this.rollbackManager.pushRollback(rollbackData);

      Logger.info(`Deleted file: ${op.sourcePath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff: null,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to delete ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeRename(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absSource = path.resolve(workspaceRoot, op.sourcePath);
    const absTarget = path.resolve(workspaceRoot, op.targetPath!);
    try {
      // Validate target doesn't exist
      try {
        await fs.access(absTarget);
        throw new Error(`Target already exists: ${op.targetPath}`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }

      await fs.rename(absSource, absTarget);

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RENAME,
        originalContent: new Map(),
        createdFiles: [],
        renamedFiles: [{ from: absSource, to: absTarget }],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      Logger.info(`Renamed: ${op.sourcePath} -> ${op.targetPath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        error: null,
        rollbackData,
        diff: null,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to rename ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeMove(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absSource = path.resolve(workspaceRoot, op.sourcePath);
    const absTarget = path.resolve(workspaceRoot, op.targetPath!);
    try {
      await fs.mkdir(path.dirname(absTarget), { recursive: true });
      await fs.rename(absSource, absTarget);

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RENAME,
        originalContent: new Map(),
        createdFiles: [],
        renamedFiles: [{ from: absSource, to: absTarget }],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      Logger.info(`Moved: ${op.sourcePath} -> ${op.targetPath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        error: null,
        rollbackData,
        diff: null,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to move ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeCopy(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absSource = path.resolve(workspaceRoot, op.sourcePath);
    const absTarget = path.resolve(workspaceRoot, op.targetPath!);
    try {
      const content = await fs.readFile(absSource, 'utf-8');
      await fs.mkdir(path.dirname(absTarget), { recursive: true });
      await fs.writeFile(absTarget, content, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_DELETE,
        originalContent: new Map(),
        createdFiles: [absTarget],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      Logger.info(`Copied: ${op.sourcePath} -> ${op.targetPath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        error: null,
        rollbackData,
        diff: null,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to copy ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeCreateFolder(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      await fs.mkdir(absPath, { recursive: true });

      Logger.info(`Created folder: ${op.sourcePath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to create folder ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executePatch(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      const original = await fs.readFile(absPath, 'utf-8');
      const patchResult = this.diffPatcher.applyUnifiedDiff(original, op.patchDiff!);
      const patched = patchResult.result;
      await fs.writeFile(absPath, patched, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RESTORE,
        originalContent: new Map([[absPath, original]]),
        createdFiles: [],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      const diff = this.computeDiff(original, patched);
      Logger.info(`Patched file: ${op.sourcePath} (+${diff.added} -${diff.removed} ~${diff.changed})`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to patch ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeAppend(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      const original = await fs.readFile(absPath, 'utf-8');
      const newContent = original + (op.appendContent ?? '');
      await fs.writeFile(absPath, newContent, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RESTORE,
        originalContent: new Map([[absPath, original]]),
        createdFiles: [],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      const diff = this.computeDiff(original, newContent);
      Logger.debug(`Appended to file: ${op.sourcePath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to append to ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executePrepend(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      const original = await fs.readFile(absPath, 'utf-8');
      const newContent = (op.prependContent ?? '') + original;
      await fs.writeFile(absPath, newContent, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RESTORE,
        originalContent: new Map([[absPath, original]]),
        createdFiles: [],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      const diff = this.computeDiff(original, newContent);
      Logger.debug(`Prepended to file: ${op.sourcePath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to prepend to ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeInsertAt(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      const original = await fs.readFile(absPath, 'utf-8');
      const lines = original.split('\n');
      const insertLine = op.insertPosition?.line ?? 0;
      const clampedLine = Math.max(0, Math.min(insertLine, lines.length));
      lines.splice(clampedLine, 0, op.content ?? '');
      const newContent = lines.join('\n');
      await fs.writeFile(absPath, newContent, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RESTORE,
        originalContent: new Map([[absPath, original]]),
        createdFiles: [],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      const diff = this.computeDiff(original, newContent);
      Logger.debug(`Inserted at line ${clampedLine} in: ${op.sourcePath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to insert at ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  async executeReplaceRange(op: FileOpEntry, workspaceRoot: string): Promise<FileOpResult> {
    const start = Date.now();
    const absPath = path.resolve(workspaceRoot, op.sourcePath);
    try {
      const original = await fs.readFile(absPath, 'utf-8');
      const lines = original.split('\n');
      const startLine = op.replaceRange?.startLine ?? 0;
      const endLine = op.replaceRange?.endLine ?? startLine;
      const clampedStart = Math.max(0, Math.min(startLine, lines.length));
      const clampedEnd = Math.max(clampedStart, Math.min(endLine, lines.length));
      const replacementLines = (op.content ?? '').split('\n');
      lines.splice(clampedStart, clampedEnd - clampedStart, ...replacementLines);
      const newContent = lines.join('\n');
      await fs.writeFile(absPath, newContent, 'utf-8');

      const rollbackData: RollbackData = {
        stepId: op.id,
        type: RollbackType.FILE_RESTORE,
        originalContent: new Map([[absPath, original]]),
        createdFiles: [],
        renamedFiles: [],
        deletedFiles: new Map(),
        terminalCommands: [],
      };
      this.rollbackManager.pushRollback(rollbackData);

      const diff = this.computeDiff(original, newContent);
      Logger.debug(`Replaced lines ${clampedStart}-${clampedEnd} in: ${op.sourcePath}`);
      return {
        id: op.id,
        operation: op.operation,
        success: true,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: null,
        rollbackData,
        diff,
        duration: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to replace range in ${op.sourcePath}: ${msg}`);
      return {
        id: op.id,
        operation: op.operation,
        success: false,
        sourcePath: op.sourcePath,
        targetPath: null,
        error: msg,
        rollbackData: null,
        diff: null,
        duration: Date.now() - start,
      };
    }
  }

  private async takeSnapshot(filePath: string): Promise<FileSnapshot> {
    const content = await fs.readFile(filePath, 'utf-8');
    const stat = await fs.stat(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    return {
      path: filePath,
      content,
      stat: {
        size: stat.size,
        mtime: stat.mtimeMs,
      },
      hash,
    };
  }

  private computeDiff(original: string, modified: string): { added: number; removed: number; changed: number } {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');
    let added = 0;
    let removed = 0;
    let changed = 0;

    const maxLen = Math.max(origLines.length, modLines.length);
    const minLen = Math.min(origLines.length, modLines.length);

    for (let i = 0; i < minLen; i++) {
      if (origLines[i] !== modLines[i]) {
        changed++;
      }
    }

    if (modLines.length > origLines.length) {
      added = modLines.length - origLines.length;
    } else if (origLines.length > modLines.length) {
      removed = origLines.length - modLines.length;
    }

    return { added, removed, changed };
  }

  dispose(): void {
    this.fileSnapshots.clear();
    Logger.debug('FileOpsExecutor disposed');
  }
}
