import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  StepExecutor,
  StepResult,
  RollbackData,
  ExecutionContext,
} from '../ExecutionTypes';
import { PlanStep } from '../../planning/PlanningTypes';
import { Logger } from '../../../../utils/Logger';

const execAsync = promisify(exec);

/** Commands allowed to be executed by the agent. */
const ALLOWED_COMMANDS = [
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'node',
  'tsc',
  'eslint',
  'prettier',
  'jest',
  'vitest',
  'mocha',
  'mkdir',
  'cp',
  'mv',
  'cat',
  'echo',
  'ls',
  'grep',
  'find',
];

/** Patterns that indicate dangerous commands. */
const DANGEROUS_PATTERNS = [
  'rm -rf /',
  'sudo rm',
  'mkfs',
  'dd if=',
  'chmod 777',
  'curl|bash',
  'curl | bash',
  'wget|sh',
  'wget | sh',
  'shutdown',
  'reboot',
];

/**
 * Executor for running terminal commands.
 * Validates commands against an allowlist and checks for dangerous patterns.
 */
export class TerminalExecutor implements StepExecutor {
  canExecute(step: PlanStep): boolean {
    return step.type === 'terminal';
  }

  estimateDuration(_step: PlanStep): number {
    return 30000;
  }

  async execute(step: PlanStep, context: ExecutionContext): Promise<StepResult> {
    const warnings: string[] = [];
    const artifacts: Record<string, any> = {};

    // Check if terminal execution is allowed by config
    if (context.config.dryRun) {
      return {
        success: true,
        filesChanged: [],
        output: `[Dry run] Would execute: ${step.details}`,
        warnings: ['Terminal command skipped in dry-run mode.'],
        artifacts: {},
      };
    }

    const command = this.extractCommand(step);
    if (!command) {
      return {
        success: false,
        filesChanged: [],
        output: 'No command found in step details.',
        warnings: [],
        artifacts: {},
      };
    }

    // Security validation
    const securityCheck = this.validateCommand(command);
    if (!securityCheck.allowed) {
      return {
        success: false,
        filesChanged: [],
        output: `Command rejected: ${securityCheck.reason}`,
        warnings: [],
        artifacts: { rejectedCommand: command },
      };
    }

    if (securityCheck.warnings.length > 0) {
      warnings.push(...securityCheck.warnings);
    }

    context.progress(`Running command: ${command}`);

    // Check abort signal
    if (context.abortSignal.aborted) {
      return {
        success: false,
        filesChanged: [],
        output: 'Aborted before command execution.',
        warnings: [],
        artifacts: {},
      };
    }

    try {
      const timeoutMs = context.config.stepTimeoutMs || 120000;
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.workspaceRoot,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'development',
        },
      });

      const output = [
        stdout ? `stdout:\n${stdout.trim()}` : '',
        stderr ? `stderr:\n${stderr.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      artifacts.command = command;
      artifacts.stdout = stdout;
      artifacts.stderr = stderr;
      artifacts.exitCode = 0;

      if (stderr && stderr.trim().length > 0) {
        warnings.push('Command produced stderr output. Review output for potential issues.');
      }

      Logger.info(`TerminalExecutor: Command completed: ${command}`);

      return {
        success: true,
        filesChanged: [],
        output: output || 'Command completed with no output.',
        warnings,
        artifacts,
      };
    } catch (error: any) {
      const exitCode = error.code ?? error.exitCode ?? 1;
      const stdout = error.stdout || '';
      const stderr = error.stderr || error.message || '';

      artifacts.command = command;
      artifacts.stdout = stdout;
      artifacts.stderr = stderr;
      artifacts.exitCode = exitCode;

      Logger.error(`TerminalExecutor: Command failed (exit ${exitCode}): ${command}`);

      return {
        success: false,
        filesChanged: [],
        output: `Command failed (exit ${exitCode}):\n${stderr}\n${stdout}`.trim(),
        warnings,
        artifacts,
      };
    }
  }

  async rollback(data: RollbackData): Promise<void> {
    Logger.warn(
      `TerminalExecutor: Rolling back step ${data.stepId} — ` +
      'terminal commands cannot be automatically rolled back. ' +
      `Commands executed: ${data.terminalCommands.join(', ') || 'none recorded'}`
    );
  }

  /**
   * Extract the command string from step details.
   */
  private extractCommand(step: PlanStep): string | null {
    const details = step.details;
    if (!details || details.trim().length === 0) {
      return null;
    }

    // Try to extract from code block
    const codeBlockRegex = /```(?:bash|sh|shell|zsh|terminal)?\s*\n([\s\S]*?)```/;
    const match = details.match(codeBlockRegex);
    if (match && match[1]) {
      // Take first non-empty line as the command
      const lines = match[1].trim().split('\n').filter((l: string) => l.trim().length > 0);
      return lines.join(' && ');
    }

    // Use the details directly, trim whitespace
    return details.trim();
  }

  /**
   * Validate a command against the allowlist and dangerous patterns.
   */
  private validateCommand(command: string): { allowed: boolean; reason: string; warnings: string[] } {
    const warnings: string[] = [];

    // Check for dangerous patterns
    const lowerCommand = command.toLowerCase();
    for (const pattern of DANGEROUS_PATTERNS) {
      if (lowerCommand.includes(pattern.toLowerCase())) {
        return {
          allowed: false,
          reason: `Command contains dangerous pattern: "${pattern}"`,
          warnings: [],
        };
      }
    }

    // Extract the base command (first word, ignoring env vars)
    const baseCommand = this.extractBaseCommand(command);
    if (!baseCommand) {
      return {
        allowed: false,
        reason: 'Could not determine the base command.',
        warnings: [],
      };
    }

    // Check against allowlist
    if (!ALLOWED_COMMANDS.includes(baseCommand)) {
      return {
        allowed: false,
        reason: `Command "${baseCommand}" is not in the allowed commands list. Allowed: ${ALLOWED_COMMANDS.join(', ')}`,
        warnings: [],
      };
    }

    // Additional warnings
    if (command.includes('--force') || command.includes('-f')) {
      warnings.push('Command uses --force flag. Results may not be reversible.');
    }

    if (command.includes('|')) {
      warnings.push('Command uses piping. Output may be redirected.');
    }

    return { allowed: true, reason: '', warnings };
  }

  /**
   * Extract the base command name, skipping env variable assignments.
   */
  private extractBaseCommand(command: string): string | null {
    const parts = command.trim().split(/\s+/);

    for (const part of parts) {
      // Skip env variable assignments (KEY=value)
      if (part.includes('=') && !part.startsWith('-')) {
        continue;
      }
      // Return the basename of the command (handles paths like /usr/bin/node)
      return path.basename(part);
    }

    return null;
  }
}
