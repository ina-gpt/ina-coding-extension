import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface IgnorePattern {
  pattern: string;
  regex: RegExp;
  negation: boolean;
  source: 'default' | 'gitignore' | 'inaignore' | 'settings';
  directory: boolean;
}

export interface IgnoreConfig {
  patterns: IgnorePattern[];
  extensions: Set<string>;
  directories: Set<string>;
  maxFileSize: number;
  maxFiles: number;
}

export interface IgnoreCheckResult {
  ignored: boolean;
  reason?: string;
  pattern?: string;
  source?: string;
}

// ============ Default Patterns ============

const DEFAULT_IGNORE_DIRS = [
  'node_modules', 'bower_components', '.pnpm',
  'dist', 'build', 'out', 'output', '.next', '.nuxt', '.output', '.svelte-kit',
  '__pycache__', '*.egg-info', 'target', 'bin', 'obj',
  '.git', '.svn', '.hg',
  '.idea', '.vscode', '.vs',
  '.env', '.venv', 'venv', 'virtualenv',
  '.cache', '.parcel-cache', '.turbo', '.eslintcache', '.npm', '.yarn',
  'logs', 'coverage', '.nyc_output',
  'tmp', 'temp', '.tmp',
];

const DEFAULT_IGNORE_EXTENSIONS = [
  '.exe', '.dll', '.so', '.dylib', '.o', '.obj', '.a', '.lib',
  '.pyc', '.pyo', '.class', '.jar', '.war',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff',
  '.psd', '.ai', '.sketch',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac',
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.sqlite', '.db', '.mdb',
  '.lock', '.map',
];

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_FILES = 50000;

// ============ Ignore Manager Class ============

export class IgnoreManager {
  private configs: Map<string, IgnoreConfig> = new Map();
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private onConfigChangeEmitter = new vscode.EventEmitter<string>();

  readonly onConfigChange = this.onConfigChangeEmitter.event;

  // ============ Initialization ============

  async initialize(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const folderPath = workspaceFolder.uri.fsPath;
    await this.buildConfig(folderPath);
    this.watchIgnoreFiles(workspaceFolder);
    Logger.info(`IgnoreManager initialized for: ${folderPath}`);
  }

  async initializeAll(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return; }
    await Promise.all(folders.map(f => this.initialize(f)));
  }

  // ============ Config Building ============

  private async buildConfig(folderPath: string): Promise<IgnoreConfig> {
    const patterns: IgnorePattern[] = [];

    // 1. Default patterns
    for (const dir of DEFAULT_IGNORE_DIRS) {
      patterns.push(this.createPattern(dir, 'default', true));
    }
    for (const ext of DEFAULT_IGNORE_EXTENSIONS) {
      patterns.push(this.createPattern(`*${ext}`, 'default', false));
    }

    // 2. .gitignore
    patterns.push(...await this.parseIgnoreFile(path.join(folderPath, '.gitignore'), 'gitignore'));

    // 3. .ina-ignore
    patterns.push(...await this.parseIgnoreFile(path.join(folderPath, '.ina-ignore'), 'inaignore'));

    // 4. VS Code settings
    const filesExclude = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('exclude', {});
    for (const [pat, enabled] of Object.entries(filesExclude)) {
      if (enabled) { patterns.push(this.createPattern(pat, 'settings', false)); }
    }

    const searchExclude = vscode.workspace.getConfiguration('search').get<Record<string, boolean>>('exclude', {});
    for (const [pat, enabled] of Object.entries(searchExclude)) {
      if (enabled) { patterns.push(this.createPattern(pat, 'settings', false)); }
    }

    const inaExclude = vscode.workspace.getConfiguration('inaCoding.indexing').get<string[]>('excludePatterns', []);
    for (const pat of inaExclude) {
      patterns.push(this.createPattern(pat, 'settings', false));
    }

    // Build lookup sets
    const extensions = new Set<string>(DEFAULT_IGNORE_EXTENSIONS);
    const directories = new Set<string>(DEFAULT_IGNORE_DIRS);

    for (const p of patterns) {
      if (p.pattern.startsWith('*.')) { extensions.add(p.pattern.slice(1)); }
      else if (p.directory) { directories.add(p.pattern.replace(/\/$/, '')); }
    }

    const config: IgnoreConfig = {
      patterns,
      extensions,
      directories,
      maxFileSize: vscode.workspace.getConfiguration('inaCoding.indexing').get<number>('maxFileSize', DEFAULT_MAX_FILE_SIZE),
      maxFiles: DEFAULT_MAX_FILES,
    };

    this.configs.set(folderPath, config);
    Logger.debug(`Built ignore config for ${folderPath}: ${patterns.length} patterns`);
    return config;
  }

  // ============ Pattern Parsing ============

  private async parseIgnoreFile(filePath: string, source: 'gitignore' | 'inaignore'): Promise<IgnorePattern[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseIgnoreContent(content, source);
    } catch {
      return [];
    }
  }

  private parseIgnoreContent(content: string, source: 'gitignore' | 'inaignore'): IgnorePattern[] {
    const patterns: IgnorePattern[] = [];

    for (let line of content.split('\n')) {
      line = line.trim();
      if (!line || line.startsWith('#')) { continue; }

      const negation = line.startsWith('!');
      if (negation) { line = line.slice(1); }

      const directory = line.endsWith('/');
      if (directory) { line = line.slice(0, -1); }

      patterns.push(this.createPattern(line, source, directory, negation));
    }

    return patterns;
  }

  private createPattern(pattern: string, source: IgnorePattern['source'], directory: boolean, negation: boolean = false): IgnorePattern {
    return { pattern, regex: this.globToRegex(pattern, directory), negation, source, directory };
  }

  private globToRegex(pattern: string, directory: boolean): RegExp {
    let regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/{{GLOBSTAR}}/g, '.*');

    if (!pattern.includes('/')) {
      regexStr = `(^|/)${regexStr}`;
    } else if (pattern.startsWith('/')) {
      regexStr = `^${regexStr.slice(2)}`;
    }

    regexStr = directory ? `${regexStr}(/.*)?$` : `${regexStr}$`;

    return new RegExp(regexStr);
  }

  // ============ Ignore Checking ============

  shouldIgnore(filePath: string, workspaceFolder?: string): IgnoreCheckResult {
    const folders = vscode.workspace.workspaceFolders;
    let relativePath = filePath;
    let folderPath = workspaceFolder;

    if (!folderPath && folders) {
      for (const folder of folders) {
        if (filePath.startsWith(folder.uri.fsPath)) {
          folderPath = folder.uri.fsPath;
          relativePath = filePath.slice(folder.uri.fsPath.length + 1);
          break;
        }
      }
    } else if (folderPath && filePath.startsWith(folderPath)) {
      relativePath = filePath.slice(folderPath.length + 1);
    }

    if (!folderPath) { return { ignored: false }; }

    relativePath = relativePath.replace(/\\/g, '/');
    const config = this.configs.get(folderPath);
    if (!config) { return { ignored: false }; }

    // 1. Quick extension check
    const ext = path.extname(filePath).toLowerCase();
    if (ext && config.extensions.has(ext)) {
      return { ignored: true, reason: 'Extension ignored', pattern: `*${ext}`, source: 'default' };
    }

    // 2. Quick directory check
    const parts = relativePath.split('/');
    for (const part of parts) {
      if (config.directories.has(part)) {
        return { ignored: true, reason: 'Directory ignored', pattern: part, source: 'default' };
      }
    }

    // 3. Full pattern match
    let ignored = false;
    let matchedPattern: IgnorePattern | undefined;

    for (const pattern of config.patterns) {
      if (pattern.regex.test(relativePath)) {
        if (pattern.negation) { ignored = false; matchedPattern = undefined; }
        else { ignored = true; matchedPattern = pattern; }
      }
    }

    if (ignored && matchedPattern) {
      return { ignored: true, reason: 'Pattern matched', pattern: matchedPattern.pattern, source: matchedPattern.source };
    }

    return { ignored: false };
  }

  isFileTooLarge(size: number, workspaceFolder?: string): boolean {
    const maxSize = workspaceFolder ? this.configs.get(workspaceFolder)?.maxFileSize || DEFAULT_MAX_FILE_SIZE : DEFAULT_MAX_FILE_SIZE;
    return size > maxSize;
  }

  shouldIndex(filePath: string, stats?: { size: number }): IgnoreCheckResult {
    const result = this.shouldIgnore(filePath);
    if (result.ignored) { return result; }
    if (stats && this.isFileTooLarge(stats.size)) {
      return { ignored: true, reason: 'File too large', pattern: `>${Math.round(stats.size / 1024)}KB`, source: 'default' };
    }
    return { ignored: false };
  }

  // ============ File Watching ============

  private watchIgnoreFiles(workspaceFolder: vscode.WorkspaceFolder): void {
    const folderPath = workspaceFolder.uri.fsPath;

    const handleChange = async () => {
      Logger.info(`Ignore file changed in ${folderPath}, rebuilding config...`);
      await this.buildConfig(folderPath);
      this.onConfigChangeEmitter.fire(folderPath);
    };

    for (const filename of ['.gitignore', '.ina-ignore']) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, filename)
      );
      watcher.onDidChange(handleChange);
      watcher.onDidCreate(handleChange);
      watcher.onDidDelete(handleChange);
      this.watchers.set(`${folderPath}:${filename}`, watcher);
    }
  }

  getConfig(folderPath: string): IgnoreConfig | undefined {
    return this.configs.get(folderPath);
  }

  getStats(folderPath: string): { totalPatterns: number; bySource: Record<string, number>; directories: number; extensions: number } {
    const config = this.configs.get(folderPath);
    if (!config) { return { totalPatterns: 0, bySource: {}, directories: 0, extensions: 0 }; }
    const bySource: Record<string, number> = {};
    for (const p of config.patterns) { bySource[p.source] = (bySource[p.source] || 0) + 1; }
    return { totalPatterns: config.patterns.length, bySource, directories: config.directories.size, extensions: config.extensions.size };
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) { watcher.dispose(); }
    this.watchers.clear();
    this.configs.clear();
    this.onConfigChangeEmitter.dispose();
  }
}

// ============ Singleton Export ============

export const ignoreManager = new IgnoreManager();
