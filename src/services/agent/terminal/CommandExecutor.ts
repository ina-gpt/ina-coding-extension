import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  TerminalCommand,
  TerminalExecution,
  TerminalExecutionStatus,
  TerminalError,
  COMMAND_TIMEOUTS,
  MAX_OUTPUT_BUFFER,
} from './TerminalTypes';
import { CommandSecurityValidator } from './CommandSecurityValidator';
import { CommandSecurityLevel } from './TerminalTypes';
import { Logger } from '../../../utils/Logger';

export class CommandExecutor extends EventEmitter {
  private static instance: CommandExecutor;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private securityValidator: CommandSecurityValidator;

  private constructor() {
    super();
    this.securityValidator = CommandSecurityValidator.getInstance();
  }

  static getInstance(): CommandExecutor {
    if (!CommandExecutor.instance) {
      CommandExecutor.instance = new CommandExecutor();
    }
    return CommandExecutor.instance;
  }

  async execute(command: TerminalCommand, workspaceRoot: string): Promise<TerminalExecution> {
    const executionId = command.id || `exec_${Date.now()}`;
    const startTime = Date.now();

    // Security validation
    const validation = this.securityValidator.validateCommand(command.command);
    if (validation.level === CommandSecurityLevel.BLOCKED) {
      return this.buildExecution(executionId, command, {
        status: TerminalExecutionStatus.FAILED,
        startTime,
        error: { message: validation.reason || 'Command blocked', code: 'BLOCKED', recoverable: false, suggestion: null },
      });
    }
    if (validation.level === CommandSecurityLevel.DANGEROUS) {
      return this.buildExecution(executionId, command, {
        status: TerminalExecutionStatus.FAILED,
        startTime,
        error: { message: validation.reason || 'Dangerous command', code: 'DANGEROUS', recoverable: false, suggestion: 'Use a safer alternative' },
      });
    }

    this.emit('command-start', { id: executionId, command: command.command });

    try {
      const timeout = command.timeout || COMMAND_TIMEOUTS[command.category] || 60000;
      const cwd = command.cwd || workspaceRoot;
      const env = {
        ...process.env,
        ...(command.env || {}),
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        CI: '1',
      };

      const result = await this.spawnWithTimeout(command.command, {
        cwd,
        env,
        shell: command.shell || true,
      }, timeout, executionId);

      const endTime = Date.now();
      const success = result.exitCode === command.expectedExitCode;

      return this.buildExecution(executionId, command, {
        status: success ? TerminalExecutionStatus.COMPLETED : TerminalExecutionStatus.FAILED,
        startTime,
        endTime,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        combinedOutput: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
      });
    } catch (error) {
      const endTime = Date.now();
      const isTimeout = error instanceof Error && error.message.includes('timed out');

      return this.buildExecution(executionId, command, {
        status: isTimeout ? TerminalExecutionStatus.TIMED_OUT : TerminalExecutionStatus.FAILED,
        startTime,
        endTime,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: isTimeout ? 'TIMEOUT' : 'EXEC_ERROR',
          recoverable: !isTimeout,
          suggestion: isTimeout ? 'Increase timeout or check for hanging process' : null,
        },
      });
    } finally {
      this.activeProcesses.delete(executionId);
    }
  }

  cancel(executionId: string): void {
    const proc = this.activeProcesses.get(executionId);
    if (proc) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
      this.activeProcesses.delete(executionId);
      Logger.info(`Cancelled command: ${executionId}`);
    }
  }

  cancelAll(): void {
    for (const [id, proc] of this.activeProcesses) {
      proc.kill('SIGTERM');
      Logger.info(`Cancelled command: ${id}`);
    }
    this.activeProcesses.clear();
  }

  isRunning(executionId: string): boolean {
    return this.activeProcesses.has(executionId);
  }

  private spawnWithTimeout(
    cmd: string,
    options: { cwd: string; env: Record<string, string | undefined>; shell: string | boolean },
    timeoutMs: number,
    executionId: string
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(cmd, [], {
        ...options,
        shell: options.shell as any,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(executionId, proc);

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 3000);
      }, timeoutMs);

      proc.stdout?.on('data', (data: Buffer) => {
        const text = this.stripAnsi(data.toString());
        if (stdout.length + text.length < MAX_OUTPUT_BUFFER) {
          stdout += text;
        }
        this.emit('command-output', { id: executionId, line: text.trim(), stream: 'stdout' });
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = this.stripAnsi(data.toString());
        if (stderr.length + text.length < MAX_OUTPUT_BUFFER) {
          stderr += text;
        }
        this.emit('command-output', { id: executionId, line: text.trim(), stream: 'stderr' });
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        } else {
          resolve({ exitCode: code ?? 1, stdout, stderr });
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  private buildExecution(
    id: string,
    command: TerminalCommand,
    overrides: Partial<TerminalExecution>
  ): TerminalExecution {
    const exec: TerminalExecution = {
      id,
      command,
      status: TerminalExecutionStatus.QUEUED,
      startTime: 0,
      endTime: null,
      exitCode: null,
      stdout: '',
      stderr: '',
      combinedOutput: '',
      parsedResult: null,
      retryCount: 0,
      error: null,
      ...overrides,
    };
    this.emit('command-complete', exec);
    return exec;
  }

  async executeRaw(command: string, workspaceRoot: string): Promise<TerminalExecution> {
    const cmd: TerminalCommand = {
      id: `raw_${Date.now()}`,
      command,
      cwd: workspaceRoot,
      description: command,
      category: 'custom' as any,
      timeout: 120000,
      env: null,
      shell: null,
      requiresApproval: false,
      retryOnFail: false,
      maxRetries: 0,
      expectedExitCode: 0,
      captureOutput: true,
    };
    return this.execute(cmd, workspaceRoot);
  }

  dispose(): void {
    this.cancelAll();
    this.removeAllListeners();
  }
}
