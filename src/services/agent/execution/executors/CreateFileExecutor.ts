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
 * Executor for creating new files.
 * Handles creating parent directories, backing up existing files,
 * and extracting code content from step details.
 */
export class CreateFileExecutor implements StepExecutor {
  canExecute(step: PlanStep): boolean {
    return step.type === 'create';
  }

  estimateDuration(_step: PlanStep): number {
    return 8000;
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
        output: 'No target path specified for file creation.',
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
        output: `Path "${targetPath}" resolves outside of workspace. Refusing to create file.`,
        warnings: [],
        artifacts: {},
      };
    }

    context.progress(`Creating file: ${targetPath}`);

    // Check abort signal
    if (context.abortSignal.aborted) {
      return {
        success: false,
        filesChanged: [],
        output: 'Aborted before file creation.',
        warnings: [],
        artifacts: {},
      };
    }

    try {
      // Check if file already exists
      let existingContent: string | null = null;
      const fileAlreadyExists = await context.fileExists(resolvedPath);

      if (fileAlreadyExists) {
        existingContent = await context.readFile(resolvedPath);
        warnings.push(`File "${targetPath}" already exists. Original content backed up.`);
        artifacts.originalContent = existingContent;
        artifacts.wasExisting = true;
        Logger.info(`CreateFileExecutor: File already exists, backing up: ${targetPath}`);
      }

      // Extract content from step details
      let content = this.extractContent(step);

      if (!content) {
        // Generate a minimal stub based on file extension
        content = this.generateStub(resolvedPath);
        warnings.push('No content provided in step details. Generated a stub file.');
      }

      // Create parent directories
      const parentDir = path.dirname(resolvedPath);
      await fs.mkdir(parentDir, { recursive: true });

      // Write the file
      await context.writeFile(resolvedPath, content);
      filesChanged.push(resolvedPath);

      Logger.info(`CreateFileExecutor: Created file: ${resolvedPath}`);

      return {
        success: true,
        filesChanged,
        output: `File created successfully: ${targetPath}${fileAlreadyExists ? ' (existing file was backed up)' : ''}`,
        warnings,
        artifacts,
      };
    } catch (error: any) {
      Logger.error(`CreateFileExecutor: Failed to create file: ${error.message}`);
      return {
        success: false,
        filesChanged,
        output: `Failed to create file "${targetPath}": ${error.message}`,
        warnings,
        artifacts,
      };
    }
  }

  async rollback(data: RollbackData): Promise<void> {
    Logger.info(`CreateFileExecutor: Rolling back step ${data.stepId}`);

    // Delete any files that were created
    for (const filePath of data.createdFiles) {
      try {
        await fs.unlink(filePath);
        Logger.info(`CreateFileExecutor: Deleted created file: ${filePath}`);
      } catch (error: any) {
        Logger.warn(`CreateFileExecutor: Could not delete file during rollback: ${filePath} — ${error.message}`);
      }
    }

    // Restore any files that were overwritten
    for (const [filePath, originalContent] of data.originalContent) {
      try {
        const parentDir = path.dirname(filePath);
        await fs.mkdir(parentDir, { recursive: true });
        await fs.writeFile(filePath, originalContent, 'utf-8');
        Logger.info(`CreateFileExecutor: Restored original file: ${filePath}`);
      } catch (error: any) {
        Logger.warn(`CreateFileExecutor: Could not restore file during rollback: ${filePath} — ${error.message}`);
      }
    }
  }

  /**
   * Extract content from step details.
   * Handles raw content or content wrapped in markdown code blocks.
   */
  private extractContent(step: PlanStep): string | null {
    const details = step.details;
    if (!details || details.trim().length === 0) {
      return null;
    }

    // Try to extract code from markdown code blocks
    const extracted = this.extractCodeFromResponse(details);
    if (extracted) {
      return extracted;
    }

    // Use details directly as content
    return details;
  }

  /**
   * Extract code from a response that may contain markdown code blocks.
   * Handles ```language\n...\n``` patterns.
   */
  private extractCodeFromResponse(response: string): string | null {
    const codeBlockRegex = /```(?:\w+)?\s*\n([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1].trimEnd();
    }

    return null;
  }

  /**
   * Generate a minimal stub file based on file extension.
   */
  private generateStub(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);

    switch (ext) {
      case '.ts':
      case '.tsx':
        return `// ${baseName}\n\nexport {};\n`;
      case '.js':
      case '.jsx':
        return `// ${baseName}\n\nmodule.exports = {};\n`;
      case '.css':
        return `/* ${baseName} */\n`;
      case '.json':
        return '{\n}\n';
      case '.html':
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${baseName}</title>\n</head>\n<body>\n</body>\n</html>\n`;
      case '.md':
        return `# ${baseName}\n`;
      default:
        return `// ${baseName}\n`;
    }
  }
}
