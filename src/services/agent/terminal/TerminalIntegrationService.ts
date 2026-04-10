import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import {
  TerminalCommand,
  TerminalExecution,
  TerminalExecutionStatus,
  TerminalCommandCategory,
  AutoFixRequest,
  AutoFixResult,
  AutoFixStrategy,
  COMMAND_TIMEOUTS,
} from './TerminalTypes';
import { CommandExecutor } from './CommandExecutor';
import { OutputParser } from './OutputParser';
import { AutoFixEngine } from './AutoFixEngine';
import { CommandSecurityValidator } from './CommandSecurityValidator';
import { TerminalSessionManager } from './TerminalSessionManager';
import { Logger } from '../../../utils/Logger';

export class TerminalIntegrationService extends EventEmitter {
  private static instance: TerminalIntegrationService;
  private commandExecutor: CommandExecutor;
  private outputParser: OutputParser;
  private autoFixEngine: AutoFixEngine;
  private securityValidator: CommandSecurityValidator;
  private sessionManager: TerminalSessionManager;

  private constructor() {
    super();
    this.commandExecutor = CommandExecutor.getInstance();
    this.outputParser = OutputParser.getInstance();
    this.autoFixEngine = AutoFixEngine.getInstance();
    this.securityValidator = CommandSecurityValidator.getInstance();
    this.sessionManager = TerminalSessionManager.getInstance();

    // Forward events from command executor
    this.commandExecutor.on('command-start', (data) => this.emit('command-start', data));
    this.commandExecutor.on('command-output', (data) => this.emit('command-output', data));
    this.commandExecutor.on('command-complete', (data) => this.emit('command-complete', data));
  }

  static getInstance(): TerminalIntegrationService {
    if (!TerminalIntegrationService.instance) {
      TerminalIntegrationService.instance = new TerminalIntegrationService();
    }
    return TerminalIntegrationService.instance;
  }

  setApiService(api: import('../../ApiService').ApiService): void {
    this.autoFixEngine.setApiService(api);
  }

  async runCommand(command: string, options?: {
    cwd?: string;
    category?: TerminalCommandCategory;
    timeout?: number;
    autoFix?: boolean;
    description?: string;
  }): Promise<TerminalExecution> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const category = options?.category || this.detectCategory(command);
    const timeout = options?.timeout || COMMAND_TIMEOUTS[category] || 60000;

    const cmd: TerminalCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      command,
      cwd: options?.cwd || workspaceRoot,
      description: options?.description || command,
      category,
      timeout,
      env: null,
      shell: null,
      requiresApproval: false,
      retryOnFail: false,
      maxRetries: 0,
      expectedExitCode: 0,
      captureOutput: true,
    };

    // Execute
    let execution = await this.commandExecutor.execute(cmd, workspaceRoot);

    // Parse output
    execution.parsedResult = this.outputParser.parseOutput(execution);

    // Track in session
    const session = this.sessionManager.getActiveSession() || this.sessionManager.createSession('default', workspaceRoot);
    this.sessionManager.addExecution(session.id, execution);

    // Auto-fix if enabled and there are fixable errors
    if (options?.autoFix && execution.parsedResult && !execution.parsedResult.success) {
      const fixableErrors = execution.parsedResult.errors.filter(e => e.fixable);
      if (fixableErrors.length > 0) {
        Logger.info(`Auto-fix: ${fixableErrors.length} fixable errors found`);
        const fixResult = await this.runAndAutoFix(command, 3);
        if (fixResult.autoFixResult?.success) {
          execution = fixResult.execution;
        }
      }
    }

    return execution;
  }

  async runInstall(packageManager?: 'npm' | 'yarn' | 'pnpm'): Promise<TerminalExecution> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const pm = packageManager || await this.detectPackageManager(workspaceRoot);
    const cmd = pm === 'yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : 'npm ci';
    return this.runCommand(cmd, { category: TerminalCommandCategory.INSTALL, description: `${pm} install` });
  }

  async runBuild(buildCommand?: string): Promise<TerminalExecution> {
    const cmd = buildCommand || await this.detectScript('build') || 'npm run build';
    return this.runCommand(cmd, { category: TerminalCommandCategory.BUILD, description: 'Build project' });
  }

  async runTests(testCommand?: string, testFile?: string): Promise<TerminalExecution> {
    let cmd = testCommand || await this.detectScript('test') || 'npm test';
    if (testFile) cmd += ` -- ${testFile}`;
    return this.runCommand(cmd, { category: TerminalCommandCategory.TEST, description: testFile ? `Test: ${testFile}` : 'Run tests' });
  }

  async runLint(fix?: boolean): Promise<TerminalExecution> {
    let cmd = await this.detectScript('lint') || 'npx eslint . --ext .ts,.tsx,.js,.jsx';
    if (fix) cmd += ' --fix';
    return this.runCommand(cmd, { category: TerminalCommandCategory.LINT, description: fix ? 'Lint & fix' : 'Lint' });
  }

  async runFormat(check?: boolean): Promise<TerminalExecution> {
    let cmd = await this.detectScript('format');
    if (!cmd) cmd = check ? 'npx prettier --check .' : 'npx prettier --write .';
    return this.runCommand(cmd, { category: TerminalCommandCategory.FORMAT, description: check ? 'Check formatting' : 'Format code' });
  }

  async runTypeCheck(): Promise<TerminalExecution> {
    return this.runCommand('npx tsc --noEmit', { category: TerminalCommandCategory.TYPE_CHECK, description: 'Type check' });
  }

  async runCustomScript(scriptName: string): Promise<TerminalExecution> {
    return this.runCommand(`npm run ${scriptName}`, { category: TerminalCommandCategory.SCRIPT, description: `Script: ${scriptName}` });
  }

  async runGit(subcommand: string, args?: string[]): Promise<TerminalExecution> {
    const cmd = args ? `git ${subcommand} ${args.join(' ')}` : `git ${subcommand}`;
    return this.runCommand(cmd, { category: TerminalCommandCategory.GIT, description: `git ${subcommand}` });
  }

  async runAndAutoFix(command: string, maxAttempts?: number): Promise<{ execution: TerminalExecution; autoFixResult: AutoFixResult | null }> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // First run
    let execution = await this.runCommand(command);

    if (execution.parsedResult?.success || !execution.parsedResult) {
      return { execution, autoFixResult: null };
    }

    const fixableErrors = execution.parsedResult.errors.filter(e => e.fixable);
    if (fixableErrors.length === 0) {
      return { execution, autoFixResult: null };
    }

    this.emit('auto-fix-start', { errorCount: fixableErrors.length });

    const request: AutoFixRequest = {
      errors: fixableErrors,
      sessionId: `autofix_${Date.now()}`,
      maxAttempts: maxAttempts || 3,
      strategy: AutoFixStrategy.BATCH_SIMILAR,
    };

    const autoFixResult = await this.autoFixEngine.attemptAutoFix(request, workspaceRoot);

    // Re-run to get final state
    if (autoFixResult.success || autoFixResult.filesModified.length > 0) {
      execution = await this.runCommand(command);
    }

    this.emit('auto-fix-complete', autoFixResult);

    return { execution, autoFixResult };
  }

  async detectPackageManager(workspaceRoot: string): Promise<'npm' | 'yarn' | 'pnpm'> {
    try {
      await fs.access(path.join(workspaceRoot, 'pnpm-lock.yaml'));
      return 'pnpm';
    } catch {}
    try {
      await fs.access(path.join(workspaceRoot, 'yarn.lock'));
      return 'yarn';
    } catch {}
    return 'npm';
  }

  async detectAvailableScripts(workspaceRoot: string): Promise<string[]> {
    try {
      const pkgJson = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'package.json'), 'utf-8'));
      return Object.keys(pkgJson.scripts || {});
    } catch {
      return [];
    }
  }

  private async detectScript(name: string): Promise<string | null> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const scripts = await this.detectAvailableScripts(workspaceRoot);
    if (scripts.includes(name)) return `npm run ${name}`;
    return null;
  }

  private detectCategory(command: string): TerminalCommandCategory {
    const cmd = command.toLowerCase();
    if (/\b(install|ci|add)\b/.test(cmd)) return TerminalCommandCategory.INSTALL;
    if (/\b(build|compile)\b/.test(cmd)) return TerminalCommandCategory.BUILD;
    if (/\b(test|jest|vitest|mocha|playwright|cypress)\b/.test(cmd)) return TerminalCommandCategory.TEST;
    if (/\b(lint|eslint)\b/.test(cmd)) return TerminalCommandCategory.LINT;
    if (/\b(format|prettier)\b/.test(cmd)) return TerminalCommandCategory.FORMAT;
    if (/\b(tsc|typecheck|type-check)\b/.test(cmd)) return TerminalCommandCategory.TYPE_CHECK;
    if (/^git\b/.test(cmd)) return TerminalCommandCategory.GIT;
    if (/\bnpm run\b/.test(cmd)) return TerminalCommandCategory.SCRIPT;
    return TerminalCommandCategory.CUSTOM;
  }

  dispose(): void {
    this.commandExecutor.dispose();
    this.sessionManager.dispose();
    this.removeAllListeners();
  }
}
