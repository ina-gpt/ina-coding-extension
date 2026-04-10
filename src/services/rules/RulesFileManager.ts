import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ProjectRules, ParsedRules, RulesFileEvent, RULES_CONSTANTS } from './RulesTypes';
import { RulesParser } from './RulesParser';
import { Logger } from '../../utils/Logger';

export class RulesFileManager extends EventEmitter {
  private static instance: RulesFileManager;
  private watcher: vscode.FileSystemWatcher | null = null;
  private currentRules: ProjectRules | null = null;
  private workspaceRoot: string | null = null;
  private parser: RulesParser;

  static getInstance(): RulesFileManager {
    if (!RulesFileManager.instance) {
      RulesFileManager.instance = new RulesFileManager();
    }
    return RulesFileManager.instance;
  }

  private constructor() {
    super();
    this.parser = RulesParser.getInstance();
  }

  initialize(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    this.loadRules().catch(e => Logger.warn('Initial rules load failed:', e));
    this.startWatching();
  }

  discoverRulesFile(workspaceRoot?: string): string | null {
    const root = workspaceRoot || this.workspaceRoot;
    if (!root) return null;

    const candidates = [
      path.join(root, RULES_CONSTANTS.FILE_NAME),
      ...RULES_CONSTANTS.ALT_FILE_NAMES.map(n => path.join(root, n)),
      path.join(root, '.vscode', RULES_CONSTANTS.FILE_NAME),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  async loadRules(): Promise<ProjectRules | null> {
    const filePath = this.discoverRulesFile();
    if (!filePath) {
      this.currentRules = null;
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);
      const parsed = this.parser.parse(content, filePath);
      const validation = this.parser.validate(content);

      this.currentRules = {
        raw: content,
        parsed,
        filePath,
        lastModified: stat.mtimeMs,
        hash: this.hashContent(content),
        isValid: validation.isValid,
        errors: validation.errors.map(e => e.message),
      };

      this.emit('loaded', this.currentRules);
      Logger.info(`Rules loaded: ${validation.ruleCount} rules from ${filePath}`);
      return this.currentRules;
    } catch (error) {
      Logger.error('Failed to load rules:', error);
      this.emit('error', error);
      return null;
    }
  }

  getRules(): ProjectRules | null {
    return this.currentRules;
  }

  async createRulesFile(template?: string, workspaceRoot?: string): Promise<string> {
    const root = workspaceRoot || this.workspaceRoot;
    if (!root) throw new Error('No workspace root');

    const filePath = path.join(root, RULES_CONSTANTS.FILE_NAME);
    const content = template || await this.generateFromProject(root);

    fs.writeFileSync(filePath, content, 'utf-8');
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);

    await this.loadRules();
    return filePath;
  }

  async generateFromProject(workspaceRoot: string): Promise<string> {
    const parts: string[] = [];
    let projectName = 'MyProject';
    let language = '';
    let framework = '';
    const techStack: string[] = [];

    // Detect from package.json
    const pkgPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        projectName = pkg.name || projectName;
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.typescript) { language = 'typescript'; techStack.push('TypeScript'); }
        if (deps.next) { framework = 'next.js'; techStack.push(`Next.js ${deps.next.replace('^', '')}`); }
        else if (deps.react) { framework = 'react'; techStack.push('React'); }
        else if (deps.vue) { framework = 'vue'; techStack.push('Vue.js'); }
        else if (deps.express) { framework = 'express'; techStack.push('Express'); }
        if (deps.tailwindcss) techStack.push('Tailwind CSS');
        if (deps.prisma || deps['@prisma/client']) techStack.push('Prisma');
        if (deps.zod) techStack.push('Zod');
        if (deps.jest || deps.vitest) techStack.push(deps.jest ? 'Jest' : 'Vitest');
      } catch { /* ignore */ }
    }

    // Detect from tsconfig
    if (fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))) {
      if (!language) language = 'typescript';
      if (!techStack.includes('TypeScript')) techStack.push('TypeScript with strict mode');
    }

    // Detect Python
    if (fs.existsSync(path.join(workspaceRoot, 'requirements.txt')) || fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) {
      language = language || 'python';
      techStack.push('Python');
    }

    // Detect Go
    if (fs.existsSync(path.join(workspaceRoot, 'go.mod'))) {
      language = language || 'go';
      techStack.push('Go');
    }

    // Build frontmatter
    parts.push('---');
    parts.push(`project: ${projectName}`);
    if (language) parts.push(`language: ${language}`);
    if (framework) parts.push(`framework: ${framework}`);
    parts.push('---\n');

    // Tech Stack
    if (techStack.length > 0) {
      parts.push('# Tech Stack');
      for (const t of techStack) parts.push(`- ${t}`);
      parts.push('');
    }

    // Defaults
    parts.push('# Coding Style');
    parts.push('- [Add your coding style rules]');
    parts.push('');
    parts.push('# Architecture');
    parts.push('- [Describe your project architecture]');
    parts.push('');
    parts.push('# Do');
    parts.push('- Follow existing patterns in the codebase');
    parts.push('- Write meaningful variable and function names');
    parts.push('- Handle errors gracefully');
    parts.push('');
    parts.push("# Don't");
    parts.push("- Don't leave TODO comments without a ticket reference");
    parts.push("- Don't use magic numbers — use named constants");
    parts.push("- Don't ignore linting warnings");
    parts.push('');

    return parts.join('\n');
  }

  async updateRules(content: string): Promise<void> {
    if (!this.currentRules) return;
    fs.writeFileSync(this.currentRules.filePath, content, 'utf-8');
    await this.loadRules();
  }

  async deleteRulesFile(): Promise<void> {
    if (!this.currentRules) return;
    fs.unlinkSync(this.currentRules.filePath);
    this.currentRules = null;
    this.emit('deleted');
  }

  private startWatching(): void {
    if (!this.workspaceRoot) return;

    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, '.ina-rules*')
    );

    this.watcher.onDidChange(() => {
      this.loadRules().then(() => this.emit('changed', this.currentRules));
    });
    this.watcher.onDidCreate(() => {
      this.loadRules().then(() => this.emit('created', this.currentRules));
    });
    this.watcher.onDidDelete(() => {
      this.currentRules = null;
      this.emit('deleted');
    });
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  dispose(): void {
    this.watcher?.dispose();
  }
}
