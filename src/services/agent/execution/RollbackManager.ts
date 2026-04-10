import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { RollbackData, RollbackType, ExecutionCheckpoint } from './ExecutionTypes';
import { Logger } from '../../../utils/Logger';

export interface RollbackResult {
  success: boolean;
  stepsRolledBack: number;
  errors: string[];
}

export class RollbackManager extends EventEmitter {
  private static instance: RollbackManager;
  private rollbackStack: RollbackData[] = [];
  private checkpoints: Map<string, ExecutionCheckpoint> = new Map();

  static getInstance(): RollbackManager {
    if (!RollbackManager.instance) {
      RollbackManager.instance = new RollbackManager();
    }
    return RollbackManager.instance;
  }

  pushRollback(data: RollbackData): void {
    this.rollbackStack.push(data);
  }

  createCheckpoint(sessionId: string, stepIndex: number, completedStepIds: string[]): string {
    const id = `cp_${sessionId}_${stepIndex}_${Date.now()}`;
    this.checkpoints.set(id, {
      sessionId,
      stepIndex,
      timestamp: Date.now(),
      rollbackStack: [...this.rollbackStack],
      completedStepIds: [...completedStepIds],
    });
    return id;
  }

  async rollbackToCheckpoint(checkpointId: string): Promise<RollbackResult> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false, stepsRolledBack: 0, errors: ['Checkpoint not found'] };
    }

    // Roll back everything added after checkpoint
    const stepsToRollback = this.rollbackStack.slice(checkpoint.rollbackStack.length);
    const result = await this.rollbackSteps(stepsToRollback.reverse());
    this.rollbackStack = [...checkpoint.rollbackStack];
    return result;
  }

  async rollbackLastStep(): Promise<RollbackResult> {
    if (this.rollbackStack.length === 0) {
      return { success: true, stepsRolledBack: 0, errors: [] };
    }
    const last = this.rollbackStack.pop()!;
    return this.rollbackSteps([last]);
  }

  async rollbackAll(): Promise<RollbackResult> {
    const all = [...this.rollbackStack].reverse();
    const result = await this.rollbackSteps(all);
    this.rollbackStack = [];
    return result;
  }

  private async rollbackSteps(steps: RollbackData[]): Promise<RollbackResult> {
    const errors: string[] = [];
    let stepsRolledBack = 0;

    this.emit('rollback-start', { totalSteps: steps.length });

    for (const data of steps) {
      try {
        await this.executeRollback(data);
        stepsRolledBack++;
        this.emit('rollback-step', { stepId: data.stepId, success: true });
      } catch (error) {
        const msg = `Failed to rollback step ${data.stepId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(msg);
        Logger.error(msg, error);
        this.emit('rollback-step', { stepId: data.stepId, success: false, error: msg });
      }
    }

    const success = errors.length === 0;
    this.emit('rollback-complete', { success, stepsRolledBack, errors });
    return { success, stepsRolledBack, errors };
  }

  private async executeRollback(data: RollbackData): Promise<void> {
    switch (data.type) {
      case RollbackType.FILE_RESTORE:
        for (const [filePath, content] of data.originalContent) {
          await this.restoreFileContent(filePath, content);
        }
        break;

      case RollbackType.FILE_DELETE:
        for (const filePath of data.createdFiles) {
          await this.deleteCreatedFile(filePath);
        }
        break;

      case RollbackType.FILE_RENAME:
        for (const { from, to } of data.renamedFiles) {
          await this.renameBack(to, from); // reverse: rename 'to' back to 'from'
        }
        break;

      case RollbackType.TERMINAL_UNDO:
        if (data.terminalCommands.length > 0) {
          Logger.warn('Terminal commands cannot be automatically rolled back:', data.terminalCommands);
        }
        break;

      case RollbackType.COMPOSITE:
        // Handle all sub-types
        for (const [filePath, content] of data.originalContent) {
          await this.restoreFileContent(filePath, content);
        }
        for (const filePath of data.createdFiles) {
          await this.deleteCreatedFile(filePath);
        }
        for (const { from, to } of data.renamedFiles) {
          await this.renameBack(to, from);
        }
        break;
    }
  }

  private async restoreFileContent(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    Logger.debug(`Restored file: ${filePath}`);
  }

  private async deleteCreatedFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      Logger.debug(`Deleted created file: ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async renameBack(currentPath: string, originalPath: string): Promise<void> {
    const dir = path.dirname(originalPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(currentPath, originalPath);
    Logger.debug(`Renamed back: ${currentPath} → ${originalPath}`);
  }

  getRollbackStack(): RollbackData[] {
    return [...this.rollbackStack];
  }

  getCheckpoints(): ExecutionCheckpoint[] {
    return [...this.checkpoints.values()];
  }

  clearRollbackData(sessionId: string): void {
    this.rollbackStack = this.rollbackStack.filter((r) => !r.stepId.startsWith(sessionId));
    for (const [id, cp] of this.checkpoints) {
      if (cp.sessionId === sessionId) this.checkpoints.delete(id);
    }
  }

  canRollback(): boolean {
    return this.rollbackStack.length > 0;
  }

  dispose(): void {
    this.rollbackStack = [];
    this.checkpoints.clear();
    this.removeAllListeners();
  }
}
