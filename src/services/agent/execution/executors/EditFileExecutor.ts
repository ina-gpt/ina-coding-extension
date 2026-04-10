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
 * Executor for editing existing files.
 * Reads the current content, applies changes from step details,
 * and validates the result.
 */
export class EditFileExecutor implements StepExecutor {
  canExecute(step: PlanStep): boolean {
    return step.type === 'edit';
  }

  estimateDuration(step: PlanStep): number {
    // Estimate based on file size hint from inputs, default 10s
    const fileSizeHint = step.inputs?.fileSizeBytes as number | undefined;
    if (fileSizeHint) {
      if (fileSizeHint > 100000) {
        return 20000;
      }
      if (fileSizeHint > 10000) {
        return 15000;
      }
    }
    return 10000;
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
        output: 'No target path specified for file edit.',
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
        output: `Path "${targetPath}" resolves outside of workspace. Refusing to edit file.`,
        warnings: [],
        artifacts: {},
      };
    }

    context.progress(`Editing file: ${targetPath}`);

    // Check abort signal
    if (context.abortSignal.aborted) {
      return {
        success: false,
        filesChanged: [],
        output: 'Aborted before file edit.',
        warnings: [],
        artifacts: {},
      };
    }

    try {
      // Read current file content
      const fileExists = await context.fileExists(resolvedPath);
      if (!fileExists) {
        return {
          success: false,
          filesChanged: [],
          output: `File "${targetPath}" does not exist. Cannot edit a non-existent file.`,
          warnings: [],
          artifacts: {},
        };
      }

      const originalContent = await context.readFile(resolvedPath);
      artifacts.originalContent = originalContent;
      artifacts.originalLength = originalContent.length;

      // Build the new content from step details
      let newContent = this.buildNewContent(step, originalContent);

      if (newContent === null) {
        // No actionable edit content found — use original as placeholder
        warnings.push('No edit content found in step details. File was not modified.');
        return {
          success: true,
          filesChanged: [],
          output: `No changes applied to "${targetPath}". Step details did not contain actionable edit content.`,
          warnings,
          artifacts,
        };
      }

      // Validate the edit result
      const validationWarnings = this.validateEditResult(originalContent, newContent, step);
      warnings.push(...validationWarnings);

      // Write the new content
      await context.writeFile(resolvedPath, newContent);
      filesChanged.push(resolvedPath);

      artifacts.newLength = newContent.length;
      artifacts.lengthDelta = newContent.length - originalContent.length;

      Logger.info(`EditFileExecutor: Edited file: ${resolvedPath} (${originalContent.length} → ${newContent.length} bytes)`);

      return {
        success: true,
        filesChanged,
        output: `File edited successfully: ${targetPath} (${originalContent.length} → ${newContent.length} bytes)`,
        warnings,
        artifacts,
      };
    } catch (error: any) {
      Logger.error(`EditFileExecutor: Failed to edit file: ${error.message}`);
      return {
        success: false,
        filesChanged,
        output: `Failed to edit file "${targetPath}": ${error.message}`,
        warnings,
        artifacts,
      };
    }
  }

  async rollback(data: RollbackData): Promise<void> {
    Logger.info(`EditFileExecutor: Rolling back step ${data.stepId}`);

    for (const [filePath, originalContent] of data.originalContent) {
      try {
        const parentDir = path.dirname(filePath);
        await fs.mkdir(parentDir, { recursive: true });
        await fs.writeFile(filePath, originalContent, 'utf-8');
        Logger.info(`EditFileExecutor: Restored original content: ${filePath}`);
      } catch (error: any) {
        Logger.warn(`EditFileExecutor: Could not restore file during rollback: ${filePath} — ${error.message}`);
      }
    }
  }

  /**
   * Build new content from step details.
   * Tries to extract code from the details. If the details contain a full file
   * replacement (code block), use that. Otherwise returns null.
   */
  private buildNewContent(step: PlanStep, _originalContent: string): string | null {
    const details = step.details;
    if (!details || details.trim().length === 0) {
      return null;
    }

    // Try to extract a code block (full file replacement)
    const codeBlockContent = this.extractCodeFromResponse(details);
    if (codeBlockContent !== null) {
      return codeBlockContent;
    }

    // If details look like actual file content (not a description), use directly
    if (this.looksLikeCode(details)) {
      return details;
    }

    // Details are descriptive text, not direct content — cannot apply automatically
    return null;
  }

  /**
   * Extract code from a response that may contain markdown code blocks.
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
   * Basic heuristic to determine if a string looks like code content
   * rather than a natural language description.
   */
  private looksLikeCode(text: string): boolean {
    const codeIndicators = [
      /^import\s+/m,
      /^export\s+/m,
      /^const\s+/m,
      /^let\s+/m,
      /^var\s+/m,
      /^function\s+/m,
      /^class\s+/m,
      /^interface\s+/m,
      /^type\s+/m,
      /^\/\//m,
      /^\/\*/m,
      /^\s*\{/m,
      /^\s*<\w+/m,
    ];

    let matchCount = 0;
    for (const indicator of codeIndicators) {
      if (indicator.test(text)) {
        matchCount++;
      }
    }

    // If multiple code indicators match, it's likely code
    return matchCount >= 2;
  }

  /**
   * Validate the edit result and return warnings for suspicious changes.
   */
  private validateEditResult(
    originalContent: string,
    newContent: string,
    step: PlanStep
  ): string[] {
    const warnings: string[] = [];

    // Check if file was emptied
    if (newContent.trim().length === 0 && originalContent.trim().length > 0) {
      warnings.push('WARNING: Edit resulted in an empty file. This may be unintended.');
    }

    // Check for drastic shortening (more than 50% reduction)
    if (
      originalContent.length > 100 &&
      newContent.length < originalContent.length * 0.5
    ) {
      const reductionPct = Math.round(
        ((originalContent.length - newContent.length) / originalContent.length) * 100
      );
      warnings.push(
        `WARNING: File was reduced by ${reductionPct}% (${originalContent.length} → ${newContent.length} bytes). ` +
        'Verify no content was accidentally removed.'
      );
    }

    // Check for drastic lengthening (more than 5x)
    if (
      originalContent.length > 100 &&
      newContent.length > originalContent.length * 5
    ) {
      warnings.push(
        `WARNING: File grew significantly (${originalContent.length} → ${newContent.length} bytes). ` +
        'Verify no duplicate content was added.'
      );
    }

    // Warn on high-risk steps
    if (step.risk === 'high') {
      warnings.push('This was a high-risk edit. Manual review recommended.');
    }

    return warnings;
  }
}
