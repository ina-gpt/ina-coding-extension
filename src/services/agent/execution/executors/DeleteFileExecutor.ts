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

/** Paths that should never be deleted by the agent. */
const PROTECTED_PATHS = [
  '.git',
  'node_modules',
  'package-lock.json',
  '.env',
  '.env.local',
  '.env.production',
];

/**
 * Executor for deleting files.
 * Backs up content before deletion and refuses to delete protected paths.
 */
export class DeleteFileExecutor implements StepExecutor {
  canExecute(step: PlanStep): boolean {
    return step.type === 'delete';
  }

  estimateDuration(_step: PlanStep): number {
    return 3000;
  }

  async execute(step: PlanStep, context: ExecutionContext): Promise<StepResult> {
    const warnings: string[] = [];
    const filesChanged: string[] = [];
    const artifacts: Record<string, any> = {};

    const targetPath = step.targetPath;
    if (!targetPath) {
      return {
        success: false,
        filesChanged: [],
        output: 'No target path specified for file deletion.',
        warnings: [],
        artifacts: {},
      };
    }

    // Resolve to absolute path within workspace
    const resolvedPath = path.resolve(context.workspaceRoot, targetPath);

    // Validate path is within workspace
    if (!resolvedPath.startsWith(path.resolve(context.workspaceRoot))) {
      return {
        success: false,
        filesChanged: [],
        output: `Path "${targetPath}" resolves outside of workspace. Refusing to delete.`,
        warnings: [],
        artifacts: {},
      };
    }

    // Check protected paths
    const relativePath = path.relative(context.workspaceRoot, resolvedPath);
    const pathSegments = relativePath.split(path.sep);
    for (const protectedPath of PROTECTED_PATHS) {
      if (pathSegments[0] === protectedPath || relativePath === protectedPath) {
        return {
          success: false,
          filesChanged: [],
          output: `Refusing to delete protected path: "${protectedPath}".`,
          warnings: [],
          artifacts: {},
        };
      }
    }

    context.progress(`Deleting file: ${targetPath}`);

    try {
      // Check file exists
      const fileExists = await context.fileExists(resolvedPath);
      if (!fileExists) {
        warnings.push(`File "${targetPath}" does not exist. Nothing to delete.`);
        return {
          success: true,
          filesChanged: [],
          output: `File "${targetPath}" does not exist. Skipped deletion.`,
          warnings,
          artifacts: {},
        };
      }

      // Read and store content for rollback
      const originalContent = await context.readFile(resolvedPath);
      artifacts.originalContent = originalContent;
      artifacts.originalLength = originalContent.length;

      // Delete the file
      await fs.unlink(resolvedPath);
      filesChanged.push(resolvedPath);

      Logger.info(`DeleteFileExecutor: Deleted file: ${resolvedPath}`);

      return {
        success: true,
        filesChanged,
        output: `File deleted successfully: ${targetPath}`,
        warnings,
        artifacts,
      };
    } catch (error: any) {
      Logger.error(`DeleteFileExecutor: Failed to delete file: ${error.message}`);
      return {
        success: false,
        filesChanged,
        output: `Failed to delete file "${targetPath}": ${error.message}`,
        warnings,
        artifacts,
      };
    }
  }

  async rollback(data: RollbackData): Promise<void> {
    Logger.info(`DeleteFileExecutor: Rolling back step ${data.stepId}`);

    for (const [filePath, originalContent] of data.deletedFiles) {
      try {
        const parentDir = path.dirname(filePath);
        await fs.mkdir(parentDir, { recursive: true });
        await fs.writeFile(filePath, originalContent, 'utf-8');
        Logger.info(`DeleteFileExecutor: Restored deleted file: ${filePath}`);
      } catch (error: any) {
        Logger.warn(`DeleteFileExecutor: Could not restore file during rollback: ${filePath} — ${error.message}`);
      }
    }
  }
}
