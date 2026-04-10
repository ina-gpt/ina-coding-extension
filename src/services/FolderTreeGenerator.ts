import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { languageDetector } from './LanguageDetector';
import { tokenCounter } from './TokenCounter';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface TreeNode {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  metadata?: NodeMetadata;
}

export interface NodeMetadata {
  size?: number;
  language?: string;
  lineCount?: number;
  modified?: Date;
}

export interface TreeOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  includeMetadata?: boolean;
  sortOrder?: 'name' | 'type' | 'size';
  extensions?: string[];
  excludePatterns?: string[];
}

export interface TreeStats {
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  maxDepth: number;
  languageBreakdown: Map<string, number>;
}

export interface FlattenedNode {
  path: string;
  relativePath: string;
  depth: number;
  type: 'file' | 'directory';
  name: string;
}

// ============ Constants ============

const DEFAULT_OPTIONS: TreeOptions = {
  maxDepth: 5,
  includeHidden: false,
  includeMetadata: false,
  sortOrder: 'type',
  excludePatterns: [
    'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
    '.venv', 'venv', '.idea', '.vscode', '.DS_Store', 'Thumbs.db',
  ],
};

const TREE_CHARS = {
  branch: '\u251C\u2500\u2500 ',
  lastBranch: '\u2514\u2500\u2500 ',
  vertical: '\u2502   ',
  space: '    ',
};

// ============ Folder Tree Generator ============

export class FolderTreeGenerator {

  async generateTree(folderPath: string, options: TreeOptions = {}): Promise<TreeNode | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const absolutePath = await this.resolvePath(folderPath);
      if (!absolutePath) { return null; }

      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) { return null; }

      return this.buildTree(absolutePath, opts, 0);
    } catch (error) {
      Logger.error(`Failed to generate tree: ${folderPath}`, error);
      return null;
    }
  }

  private async buildTree(dirPath: string, options: TreeOptions, depth: number): Promise<TreeNode> {
    const name = path.basename(dirPath);
    const relativePath = vscode.workspace.asRelativePath(dirPath);

    const node: TreeNode = { name, path: dirPath, relativePath, type: 'directory', children: [] };

    if (options.maxDepth !== undefined && depth >= options.maxDepth) { return node; }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (!this.shouldInclude(entry, options)) { continue; }

        if (entry.isDirectory()) {
          node.children!.push(await this.buildTree(entryPath, options, depth + 1));
        } else if (entry.isFile()) {
          const fileNode: TreeNode = {
            name: entry.name,
            path: entryPath,
            relativePath: vscode.workspace.asRelativePath(entryPath),
            type: 'file',
          };

          if (options.includeMetadata) {
            try {
              const stats = await fs.stat(entryPath);
              const langInfo = languageDetector.detectFromExtension(path.extname(entry.name));
              fileNode.metadata = {
                size: stats.size,
                language: langInfo?.id,
                modified: stats.mtime,
              };
            } catch { /* skip metadata */ }
          }

          node.children!.push(fileNode);
        }
      }

      // Sort: directories first, then by name
      node.children!.sort((a, b) => {
        if (a.type !== b.type) { return a.type === 'directory' ? -1 : 1; }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      Logger.debug(`Cannot read directory: ${dirPath}`, error);
    }

    return node;
  }

  private shouldInclude(entry: { name: string; isFile: () => boolean }, options: TreeOptions): boolean {
    const name = entry.name;
    if (!options.includeHidden && name.startsWith('.')) { return false; }
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (pattern.includes('*')) {
          if (new RegExp('^' + pattern.replace(/\*/g, '.*') + '$').test(name)) { return false; }
        } else if (name === pattern) { return false; }
      }
    }
    if (entry.isFile() && options.extensions && options.extensions.length > 0) {
      const ext = path.extname(name).toLowerCase();
      if (!options.extensions.includes(ext) && !options.extensions.includes(ext.slice(1))) { return false; }
    }
    return true;
  }

  // ============ Formatting ============

  formatAsText(tree: TreeNode, options: { showSize?: boolean; showLanguage?: boolean } = {}): string {
    const lines: string[] = [];
    this.formatNode(tree, '', true, lines, options);
    return lines.join('\n');
  }

  private formatNode(
    node: TreeNode, prefix: string, isLast: boolean, lines: string[],
    options: { showSize?: boolean; showLanguage?: boolean }
  ): void {
    const branch = isLast ? TREE_CHARS.lastBranch : TREE_CHARS.branch;
    let line = `${prefix}${branch}${node.name}`;

    if (options.showSize && node.metadata?.size) {
      line += ` (${this.formatSize(node.metadata.size)})`;
    }
    if (options.showLanguage && node.metadata?.language) {
      line += ` [${node.metadata.language}]`;
    }

    lines.push(line);

    if (node.children) {
      const newPrefix = prefix + (isLast ? TREE_CHARS.space : TREE_CHARS.vertical);
      node.children.forEach((child, i) => {
        this.formatNode(child, newPrefix, i === node.children!.length - 1, lines, options);
      });
    }
  }

  formatForPrompt(tree: TreeNode, maxLines: number = 100): string {
    const lines: string[] = [`<folder path="${tree.relativePath}">`];
    const flattened = this.flatten(tree).filter(n => n.type === 'file').slice(0, maxLines);

    for (const file of flattened) {
      lines.push(`${'  '.repeat(file.depth)}${file.name}`);
    }

    const total = this.flatten(tree).filter(n => n.type === 'file').length;
    if (total > maxLines) { lines.push(`  ... and ${total - maxLines} more files`); }

    lines.push('</folder>');
    return lines.join('\n');
  }

  // ============ Tree Operations ============

  flatten(tree: TreeNode, depth: number = 0): FlattenedNode[] {
    const result: FlattenedNode[] = [{ path: tree.path, relativePath: tree.relativePath, depth, type: tree.type, name: tree.name }];
    if (tree.children) {
      for (const child of tree.children) { result.push(...this.flatten(child, depth + 1)); }
    }
    return result;
  }

  getFilePaths(tree: TreeNode): string[] {
    return this.flatten(tree).filter(n => n.type === 'file').map(n => n.relativePath);
  }

  getStats(tree: TreeNode): TreeStats {
    const stats: TreeStats = { totalFiles: 0, totalDirectories: 0, totalSize: 0, maxDepth: 0, languageBreakdown: new Map() };
    this.collectStats(tree, stats, 0);
    return stats;
  }

  private collectStats(node: TreeNode, stats: TreeStats, depth: number): void {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    if (node.type === 'directory') { stats.totalDirectories++; }
    else {
      stats.totalFiles++;
      if (node.metadata?.size) { stats.totalSize += node.metadata.size; }
      if (node.metadata?.language) {
        stats.languageBreakdown.set(node.metadata.language, (stats.languageBreakdown.get(node.metadata.language) || 0) + 1);
      }
    }
    if (node.children) { for (const child of node.children) { this.collectStats(child, stats, depth + 1); } }
  }

  find(tree: TreeNode, pattern: string | RegExp): TreeNode[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    const results: TreeNode[] = [];
    this.findRecursive(tree, regex, results);
    return results;
  }

  private findRecursive(node: TreeNode, pattern: RegExp, results: TreeNode[]): void {
    if (pattern.test(node.name) || pattern.test(node.relativePath)) { results.push(node); }
    if (node.children) { for (const child of node.children) { this.findRecursive(child, pattern, results); } }
  }

  // ============ Utilities ============

  private async resolvePath(folderPath: string): Promise<string | null> {
    if (path.isAbsolute(folderPath)) {
      try { await fs.access(folderPath); return folderPath; } catch { return null; }
    }
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders) {
      for (const folder of wsFolders) {
        const abs = path.join(folder.uri.fsPath, folderPath);
        try { await fs.access(abs); return abs; } catch { continue; }
      }
    }
    return null;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) { return `${bytes}B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)}KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

// ============ Singleton Export ============

export const folderTreeGenerator = new FolderTreeGenerator();
