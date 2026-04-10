import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import {
  FileOperation,
  FileOpEntry,
  FileConflict,
  ConflictResolution,
  ImportReference,
} from './FileOpsTypes';
import { ImportGraphAnalyzer } from './ImportGraphAnalyzer';
import { Logger } from '../../../utils/Logger';

export class ConflictResolver {
  private static instance: ConflictResolver;
  private importAnalyzer: ImportGraphAnalyzer;

  static getInstance(): ConflictResolver {
    if (!ConflictResolver.instance) {
      ConflictResolver.instance = new ConflictResolver();
    }
    return ConflictResolver.instance;
  }

  private constructor() {
    this.importAnalyzer = ImportGraphAnalyzer.getInstance();
  }

  async detectConflicts(operations: FileOpEntry[], workspaceRoot: string): Promise<FileConflict[]> {
    const conflicts: FileConflict[] = [];

    for (const op of operations) {
      const absSource = path.resolve(workspaceRoot, op.sourcePath);
      const absTarget = op.targetPath ? path.resolve(workspaceRoot, op.targetPath) : null;

      switch (op.operation) {
        case FileOperation.CREATE:
        case FileOperation.CREATE_FOLDER: {
          // Check if target already exists
          if (await this.fileExists(absSource)) {
            conflicts.push({
              operationId: op.id,
              type: 'already-exists',
              description: `Cannot create "${op.sourcePath}": path already exists`,
              resolution: null,
            });
          }
          break;
        }

        case FileOperation.EDIT:
        case FileOperation.PATCH:
        case FileOperation.APPEND:
        case FileOperation.PREPEND:
        case FileOperation.INSERT_AT:
        case FileOperation.REPLACE_RANGE: {
          // Check if source exists
          if (!(await this.fileExists(absSource))) {
            conflicts.push({
              operationId: op.id,
              type: 'not-found',
              description: `Cannot edit "${op.sourcePath}": file not found`,
              resolution: null,
            });
          }
          break;
        }

        case FileOperation.DELETE: {
          // Check if source exists
          if (!(await this.fileExists(absSource))) {
            conflicts.push({
              operationId: op.id,
              type: 'not-found',
              description: `Cannot delete "${op.sourcePath}": file not found`,
              resolution: null,
            });
          } else {
            // Check if imports will break
            const brokenImports = await this.checkBrokenImports(op.sourcePath, workspaceRoot);
            if (brokenImports.length > 0) {
              conflicts.push({
                operationId: op.id,
                type: 'import-broken',
                description: `Deleting "${op.sourcePath}" will break imports in: ${brokenImports.join(', ')}`,
                resolution: null,
              });
            }
          }
          break;
        }

        case FileOperation.RENAME:
        case FileOperation.MOVE: {
          // Check if source exists
          if (!(await this.fileExists(absSource))) {
            conflicts.push({
              operationId: op.id,
              type: 'not-found',
              description: `Cannot ${op.operation} "${op.sourcePath}": file not found`,
              resolution: null,
            });
          }

          // Check if target already exists
          if (absTarget && (await this.fileExists(absTarget))) {
            conflicts.push({
              operationId: op.id,
              type: 'already-exists',
              description: `Cannot ${op.operation} to "${op.targetPath}": target already exists`,
              resolution: null,
            });
          }

          // Check if imports will break
          const brokenImports = await this.checkBrokenImports(op.sourcePath, workspaceRoot);
          if (brokenImports.length > 0) {
            conflicts.push({
              operationId: op.id,
              type: 'import-broken',
              description: `Renaming/moving "${op.sourcePath}" will break imports in: ${brokenImports.join(', ')}`,
              resolution: null,
            });
          }
          break;
        }

        case FileOperation.COPY: {
          if (!(await this.fileExists(absSource))) {
            conflicts.push({
              operationId: op.id,
              type: 'not-found',
              description: `Cannot copy "${op.sourcePath}": source not found`,
              resolution: null,
            });
          }
          if (absTarget && (await this.fileExists(absTarget))) {
            conflicts.push({
              operationId: op.id,
              type: 'already-exists',
              description: `Cannot copy to "${op.targetPath}": target already exists`,
              resolution: null,
            });
          }
          break;
        }
      }

      // Check if file is open with unsaved changes
      const isLocked = await this.isFileLocked(absSource);
      if (isLocked) {
        conflicts.push({
          operationId: op.id,
          type: 'locked',
          description: `File "${op.sourcePath}" is open with unsaved changes`,
          resolution: null,
        });
      }
    }

    return conflicts;
  }

  resolveConflict(conflict: FileConflict, resolution: ConflictResolution, op: FileOpEntry): FileOpEntry | null {
    switch (resolution) {
      case ConflictResolution.OVERWRITE:
        Logger.info(`Conflict resolved for ${conflict.operationId}: overwrite`);
        return op;

      case ConflictResolution.SKIP:
        Logger.info(`Conflict resolved for ${conflict.operationId}: skip`);
        return null;

      case ConflictResolution.RENAME_NEW: {
        const ext = path.extname(op.targetPath || op.sourcePath);
        const base = path.basename(op.targetPath || op.sourcePath, ext);
        const dir = path.dirname(op.targetPath || op.sourcePath);
        let counter = 1;
        let newName = `${base}_${counter}${ext}`;
        // We return the first candidate; actual uniqueness check should happen at execution
        const newPath = path.join(dir, newName);

        Logger.info(`Conflict resolved for ${conflict.operationId}: rename to ${newPath}`);
        return {
          ...op,
          targetPath: op.targetPath ? newPath : null,
          sourcePath: op.targetPath ? op.sourcePath : newPath,
        };
      }

      case ConflictResolution.MERGE:
        Logger.warn(`Conflict resolved for ${conflict.operationId}: merge (not fully implemented)`);
        return op;

      case ConflictResolution.ABORT:
        throw new Error(`Operation aborted due to conflict: ${conflict.description}`);

      case ConflictResolution.ASK_USER:
        Logger.info(`Conflict for ${conflict.operationId}: deferred to user`);
        return null;

      default:
        Logger.warn(`Unknown resolution for ${conflict.operationId}: ${resolution}`);
        return op;
    }
  }

  autoResolve(conflicts: FileConflict[], config: Record<string, any>): Map<string, ConflictResolution> {
    const resolutions = new Map<string, ConflictResolution>();

    for (const conflict of conflicts) {
      let resolution: ConflictResolution;

      switch (conflict.type) {
        case 'already-exists':
          resolution = config.overwriteExisting
            ? ConflictResolution.OVERWRITE
            : ConflictResolution.RENAME_NEW;
          break;

        case 'not-found':
          resolution = ConflictResolution.SKIP;
          break;

        case 'modified-externally':
          resolution = config.forceOverwrite
            ? ConflictResolution.OVERWRITE
            : ConflictResolution.ASK_USER;
          break;

        case 'locked':
          resolution = ConflictResolution.ASK_USER;
          break;

        case 'circular-rename':
          resolution = ConflictResolution.ABORT;
          break;

        case 'import-broken':
          resolution = config.allowBrokenImports
            ? ConflictResolution.OVERWRITE
            : ConflictResolution.ASK_USER;
          break;

        default:
          resolution = ConflictResolution.ASK_USER;
          break;
      }

      resolutions.set(conflict.operationId, resolution);
      Logger.debug(`Auto-resolved conflict ${conflict.operationId} (${conflict.type}): ${resolution}`);
    }

    return resolutions;
  }

  private async promptUserForResolution(conflict: FileConflict): Promise<ConflictResolution> {
    const message = `File conflict: ${conflict.description}`;
    const options = ['Overwrite', 'Skip', 'Rename', 'Abort'];

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      ...options,
    );

    switch (choice) {
      case 'Overwrite':
        return ConflictResolution.OVERWRITE;
      case 'Skip':
        return ConflictResolution.SKIP;
      case 'Rename':
        return ConflictResolution.RENAME_NEW;
      case 'Abort':
        return ConflictResolution.ABORT;
      default:
        return ConflictResolution.SKIP;
    }
  }

  private async fileExists(absPath: string): Promise<boolean> {
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  private async isFileLocked(absPath: string): Promise<boolean> {
    // Check if any VS Code editor has this file open with unsaved changes
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.fsPath === absPath && doc.isDirty) {
        return true;
      }
    }
    return false;
  }

  private async checkBrokenImports(filePath: string, workspaceRoot: string): Promise<string[]> {
    try {
      const impact = await this.importAnalyzer.analyzeDeleteImpact(filePath, workspaceRoot);
      return impact.dependentFiles;
    } catch {
      // Import analysis may not be available for all file types
      return [];
    }
  }
}
