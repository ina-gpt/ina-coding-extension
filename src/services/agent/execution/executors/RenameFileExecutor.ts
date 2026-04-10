import * as path from 'path';
import * as fs from 'fs/promises';
import {
  StepExecutor,
  StepResult,
  RollbackData,
  ExecutionContext,
} from '../ExecutionTypes';
import { PlanStep } from '../../planning/PlanningTypes';
import { Logger } from '../../../../utils/Logger';

/**
 * Executor for renaming and moving files.
 * Validates source exists, target is within workspace,
 * and target does not already exist.
 */
export class RenameFileExecutor implements StepExecutor {
  canExecute(step: PlanStep): boolean {
    return step.type === 'rename' || step.type === 'move';
  }

  estimateDuration(_step: PlanStep): number {
    return 5000;
  }

  async execute(step: PlanStep, context: ExecutionContext): Promise<StepResult> {
    const warnings: string[] = [];
    const filesChanged: string[] = [];
    const artifacts: Record<string, any> = {};

    const sourcePath = step.targetPath;
    const destinationPath = step.inputs?.destination as string | undefined;

    if (!sourcePath) {
      return {
        success: false,
        filesChanged: [],
        output: 'No source path specified for rename/move.',
        warnings: [],
        artifacts: {},
      };
    }

    if (!destinationPath) {
      return {
        success: false,
        filesChanged: [],
        output: 'No destination path specified for rename/move. Provide it via step.inputs.destination.',
        warnings: [],
        artifacts: {},
      };
    }

    // Resolve paths
    const resolvedSource = path.resolve(context.workspaceRoot, sourcePath);
    const resolvedDest = path.resolve(context.workspaceRoot, destinationPath);
    const workspaceResolved = path.resolve(context.workspaceRoot);

    // Validate both paths are within workspace
    if (!resolvedSource.startsWith(workspaceResolved)) {
      return {
        success: false,
        filesChanged: [],
        output: `Source path "${sourcePath}" resolves outside of workspace.`,
        warnings: [],
        artifacts: {},
      };
    }

    if (!resolvedDest.startsWith(workspaceResolved)) {
      return {
        success: false,
        filesChanged: [],
        output: `Destination path "${destinationPath}" resolves outside of workspace.`,
        warnings: [],
        artifacts: {},
      };
    }

    context.progress(`Renaming: ${sourcePath} → ${destinationPath}`);

    try {
      // Check source exists
      const sourceExists = await context.fileExists(resolvedSource);
      if (!sourceExists) {
        return {
          success: false,
          filesChanged: [],
          output: `Source file "${sourcePath}" does not exist.`,
          warnings: [],
          artifacts: {},
        };
      }

      // Check target does not exist
      const destExists = await context.fileExists(resolvedDest);
      if (destExists) {
        return {
          success: false,
          filesChanged: [],
          output: `Destination "${destinationPath}" already exists. Refusing to overwrite.`,
          warnings: [],
          artifacts: {},
        };
      }

      // Create target parent directory
      const destParent = path.dirname(resolvedDest);
      await fs.mkdir(destParent, { recursive: true });

      // Perform the rename/move
      await fs.rename(resolvedSource, resolvedDest);
      filesChanged.push(resolvedSource, resolvedDest);

      artifacts.from = resolvedSource;
      artifacts.to = resolvedDest;

      Logger.info(`RenameFileExecutor: Renamed ${resolvedSource} → ${resolvedDest}`);

      return {
        success: true,
        filesChanged,
        output: `File renamed successfully: ${sourcePath} → ${destinationPath}`,
        warnings,
        artifacts,
      };
    } catch (error: any) {
      Logger.error(`RenameFileExecutor: Failed to rename file: ${error.message}`);
      return {
        success: false,
        filesChanged,
        output: `Failed to rename "${sourcePath}" → "${destinationPath}": ${error.message}`,
        warnings,
        artifacts,
      };
    }
  }

  async rollback(data: RollbackData): Promise<void> {
    Logger.info(`RenameFileExecutor: Rolling back step ${data.stepId}`);

    for (const entry of data.renamedFiles) {
      try {
        // Rename back: to → from
        const parentDir = path.dirname(entry.from);
        await fs.mkdir(parentDir, { recursive: true });
        await fs.rename(entry.to, entry.from);
        Logger.info(`RenameFileExecutor: Reverted rename: ${entry.to} → ${entry.from}`);
      } catch (error: any) {
        Logger.warn(`RenameFileExecutor: Could not revert rename during rollback: ${error.message}`);
      }
    }
  }
}
