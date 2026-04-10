/**
 * MCPBuiltinServers.ts
 * Phase 16.2 — Built-in INA MCP servers (in-process, no spawn)
 *
 * These wrap existing internal services so they can be exposed via the
 * MCP protocol uniformly with external servers. They register handlers
 * with MCPClient.registerBuiltinServer() and respond to:
 *   - tools/list
 *   - tools/call
 *   - resources/list
 *   - resources/read
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { MCPClient } from './MCPClient';
import { BUILTIN_MCP_SERVERS } from './MCPTypes';
import { Logger } from '../../utils/Logger';
import { CodebaseMentionHandler } from '../codebase/CodebaseMentionHandler';
import { MemoryClient } from '../memory/MemoryClient';

type ToolHandler = (args: any) => Promise<any>;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: any;
  handler: ToolHandler;
}

/** Wraps the result content into the MCP standard envelope */
function wrapText(text: string) {
  return { content: [{ type: 'text', text }] };
}

// ============================================================
// INA Filesystem server
// ============================================================

class INAFilesystemServer {
  private tools: ToolDef[];

  constructor() {
    this.tools = [
      {
        name: 'read_file',
        description: 'Read the content of a workspace file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Workspace-relative path' } },
          required: ['path'],
        },
        handler: this.readFile.bind(this),
      },
      {
        name: 'write_file',
        description: 'Write content to a workspace file (creates if missing)',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
        handler: this.writeFile.bind(this),
      },
      {
        name: 'list_directory',
        description: 'List entries in a workspace directory',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        handler: this.listDirectory.bind(this),
      },
      {
        name: 'search_files',
        description: 'Glob search for files',
        inputSchema: {
          type: 'object',
          properties: { pattern: { type: 'string' } },
          required: ['pattern'],
        },
        handler: this.searchFiles.bind(this),
      },
      {
        name: 'file_info',
        description: 'Get file metadata (size, mtime, type)',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        handler: this.fileInfo.bind(this),
      },
    ];
  }

  async handle(method: string, params: any): Promise<any> {
    if (method === 'tools/list') return { tools: this.tools.map(({ handler, ...rest }) => rest) };
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return tool.handler(args);
    }
    if (method === 'resources/list') return { resources: [] };
    throw new Error(`Method not implemented: ${method}`);
  }

  private resolveUri(p: string): vscode.Uri {
    if (path.isAbsolute(p)) return vscode.Uri.file(p);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) throw new Error('No workspace open');
    return vscode.Uri.joinPath(root, p);
  }

  private async readFile(args: { path: string }): Promise<any> {
    const uri = this.resolveUri(args.path);
    const data = await vscode.workspace.fs.readFile(uri);
    return wrapText(Buffer.from(data).toString('utf8'));
  }

  private async writeFile(args: { path: string; content: string }): Promise<any> {
    const uri = this.resolveUri(args.path);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(args.content, 'utf8'));
    return wrapText(`Wrote ${args.content.length} bytes to ${args.path}`);
  }

  private async listDirectory(args: { path: string }): Promise<any> {
    const uri = this.resolveUri(args.path);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    const formatted = entries
      .map(([name, type]) => `${type === vscode.FileType.Directory ? 'D' : 'F'} ${name}`)
      .join('\n');
    return wrapText(formatted || '(empty)');
  }

  private async searchFiles(args: { pattern: string }): Promise<any> {
    const files = await vscode.workspace.findFiles(args.pattern, '**/node_modules/**', 100);
    const list = files.map((f) => vscode.workspace.asRelativePath(f)).join('\n');
    return wrapText(list || 'No files matched');
  }

  private async fileInfo(args: { path: string }): Promise<any> {
    const uri = this.resolveUri(args.path);
    const stat = await vscode.workspace.fs.stat(uri);
    return wrapText(
      JSON.stringify(
        {
          size: stat.size,
          mtime: stat.mtime,
          type: stat.type === vscode.FileType.Directory ? 'directory' : 'file',
        },
        null,
        2
      )
    );
  }
}

// ============================================================
// INA Search server (semantic codebase search)
// ============================================================

class INASearchServer {
  private tools: ToolDef[];

  constructor() {
    this.tools = [
      {
        name: 'semantic_search',
        description: 'Search the indexed codebase for relevant code (RAG-based)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            topK: { type: 'number', default: 5 },
          },
          required: ['query'],
        },
        handler: this.semanticSearch.bind(this),
      },
      {
        name: 'symbol_search',
        description: 'Search for symbols (functions, classes, variables) by name',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        handler: this.symbolSearch.bind(this),
      },
      {
        name: 'reference_search',
        description: 'Find references to a symbol',
        inputSchema: {
          type: 'object',
          properties: { symbol: { type: 'string' } },
          required: ['symbol'],
        },
        handler: this.referenceSearch.bind(this),
      },
    ];
  }

  async handle(method: string, params: any): Promise<any> {
    if (method === 'tools/list') return { tools: this.tools.map(({ handler, ...rest }) => rest) };
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return tool.handler(args);
    }
    if (method === 'resources/list') return { resources: [] };
    throw new Error(`Method not implemented: ${method}`);
  }

  private async semanticSearch(args: { query: string; topK?: number }): Promise<any> {
    try {
      const handler = CodebaseMentionHandler.getInstance();
      const content = await handler.handleMention(args.query, `@codebase:${args.query}`);
      return wrapText(content || '(no results)');
    } catch (e) {
      return wrapText(`[INASearch] semantic_search unavailable: ${String(e)}`);
    }
  }

  private async symbolSearch(args: { name: string }): Promise<any> {
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      args.name
    );
    if (!symbols || symbols.length === 0) return wrapText('No symbols found');
    const formatted = symbols
      .slice(0, 20)
      .map((s) => `${s.name} (${vscode.SymbolKind[s.kind]}) - ${vscode.workspace.asRelativePath(s.location.uri)}:${s.location.range.start.line + 1}`)
      .join('\n');
    return wrapText(formatted);
  }

  private async referenceSearch(args: { symbol: string }): Promise<any> {
    // Use workspace symbol provider as a starting point, then references
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      args.symbol
    );
    if (!symbols || symbols.length === 0) return wrapText('Symbol not found');
    const symbol = symbols[0];
    const refs = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      symbol.location.uri,
      symbol.location.range.start
    );
    if (!refs || refs.length === 0) return wrapText('No references found');
    const formatted = refs
      .slice(0, 30)
      .map((r) => `${vscode.workspace.asRelativePath(r.uri)}:${r.range.start.line + 1}`)
      .join('\n');
    return wrapText(formatted);
  }
}

// ============================================================
// INA Git server
// ============================================================

class INAGitServer {
  private tools: ToolDef[];

  constructor() {
    this.tools = [
      {
        name: 'git_status',
        description: 'Get current git working tree status',
        inputSchema: { type: 'object', properties: {} },
        handler: this.gitStatus.bind(this),
      },
      {
        name: 'git_diff',
        description: 'Get diff for a file or all files',
        inputSchema: {
          type: 'object',
          properties: { file: { type: 'string' } },
        },
        handler: this.gitDiff.bind(this),
      },
      {
        name: 'git_log',
        description: 'Get recent commit history',
        inputSchema: {
          type: 'object',
          properties: { count: { type: 'number', default: 10 } },
        },
        handler: this.gitLog.bind(this),
      },
      {
        name: 'git_branch',
        description: 'Get current branch name',
        inputSchema: { type: 'object', properties: {} },
        handler: this.gitBranch.bind(this),
      },
    ];
  }

  async handle(method: string, params: any): Promise<any> {
    if (method === 'tools/list') return { tools: this.tools.map(({ handler, ...rest }) => rest) };
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return tool.handler(args);
    }
    if (method === 'resources/list') return { resources: [] };
    throw new Error(`Method not implemented: ${method}`);
  }

  private getRepo(): any | null {
    try {
      const ext = vscode.extensions.getExtension('vscode.git');
      if (!ext) return null;
      const api = ext.exports.getAPI(1);
      return api?.repositories?.[0] ?? null;
    } catch {
      return null;
    }
  }

  private async gitStatus(): Promise<any> {
    const repo = this.getRepo();
    if (!repo) return wrapText('Git extension not available');
    const changes = repo.state.workingTreeChanges as Array<{ uri: vscode.Uri }>;
    const list = changes.map((c) => vscode.workspace.asRelativePath(c.uri)).join('\n');
    return wrapText(`Modified files (${changes.length}):\n${list || '(none)'}`);
  }

  private async gitDiff(args: { file?: string }): Promise<any> {
    const repo = this.getRepo();
    if (!repo) return wrapText('Git extension not available');
    if (args.file) {
      const uri = vscode.Uri.file(
        path.isAbsolute(args.file)
          ? args.file
          : path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, args.file)
      );
      const diff = await repo.diffWithHEAD(uri.fsPath).catch(() => '');
      return wrapText(diff || '(no diff)');
    }
    const diff = await repo.diff().catch(() => '');
    return wrapText(diff || '(no diff)');
  }

  private async gitLog(args: { count?: number }): Promise<any> {
    const repo = this.getRepo();
    if (!repo) return wrapText('Git extension not available');
    const count = Math.min(Math.max(args.count ?? 10, 1), 50);
    try {
      const commits = await repo.log({ maxEntries: count });
      const formatted = commits
        .map((c: any) => `${(c.hash || '').substring(0, 8)} ${c.authorName || ''}: ${c.message}`)
        .join('\n');
      return wrapText(formatted || '(no commits)');
    } catch {
      return wrapText('(log unavailable)');
    }
  }

  private async gitBranch(): Promise<any> {
    const repo = this.getRepo();
    if (!repo) return wrapText('Git extension not available');
    return wrapText(`Current branch: ${repo.state.HEAD?.name ?? 'HEAD (detached)'}`);
  }
}

// ============================================================
// INA Memory server
// ============================================================

class INAMemoryServer {
  private tools: ToolDef[];

  constructor() {
    this.tools = [
      {
        name: 'recall',
        description: 'Search the memory store for relevant entries',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number', default: 5 },
          },
          required: ['query'],
        },
        handler: this.recall.bind(this),
      },
      {
        name: 'remember',
        description: 'Store a new memory entry',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
          },
          required: ['content'],
        },
        handler: this.remember.bind(this),
      },
      {
        name: 'forget',
        description: 'Delete a memory entry by ID',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        handler: this.forget.bind(this),
      },
    ];
  }

  async handle(method: string, params: any): Promise<any> {
    if (method === 'tools/list') return { tools: this.tools.map(({ handler, ...rest }) => rest) };
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return tool.handler(args);
    }
    if (method === 'resources/list') return { resources: [] };
    throw new Error(`Method not implemented: ${method}`);
  }

  private async recall(args: { query: string; limit?: number }): Promise<any> {
    try {
      const client: any = MemoryClient.getInstance();
      const results = await client.searchMemories?.(args.query, { limit: args.limit ?? 5 });
      const formatted = Array.isArray(results)
        ? results.map((r: any, i: number) => `${i + 1}. ${r.content || r.summary || JSON.stringify(r)}`).join('\n')
        : '(no results)';
      return wrapText(formatted);
    } catch (e) {
      return wrapText(`[INAMemory] recall unavailable: ${String(e)}`);
    }
  }

  private async remember(args: { content: string; type?: string }): Promise<any> {
    try {
      const client: any = MemoryClient.getInstance();
      await client.createMemory?.({
        content: args.content,
        summary: args.content.substring(0, 100),
        type: args.type ?? 'project',
        scope: 'workspace',
      });
      return wrapText('Memory stored.');
    } catch (e) {
      return wrapText(`[INAMemory] remember unavailable: ${String(e)}`);
    }
  }

  private async forget(args: { id: string }): Promise<any> {
    try {
      const client: any = MemoryClient.getInstance();
      await client.deleteMemory?.(args.id);
      return wrapText(`Forgot memory ${args.id}`);
    } catch (e) {
      return wrapText(`[INAMemory] forget unavailable: ${String(e)}`);
    }
  }
}

// ============================================================
// Registration helper
// ============================================================

/**
 * Register all built-in servers with the MCPClient.
 * Called once from extension.ts during activate.
 */
export function registerBuiltinMCPServers(client: MCPClient): void {
  const fs = new INAFilesystemServer();
  const search = new INASearchServer();
  const git = new INAGitServer();
  const memory = new INAMemoryServer();

  const fsConfig = BUILTIN_MCP_SERVERS.find((s) => s.name === 'ina-filesystem')!;
  const searchConfig = BUILTIN_MCP_SERVERS.find((s) => s.name === 'ina-search')!;
  const gitConfig = BUILTIN_MCP_SERVERS.find((s) => s.name === 'ina-git')!;
  const memoryConfig = BUILTIN_MCP_SERVERS.find((s) => s.name === 'ina-memory')!;

  client.registerBuiltinServer(fsConfig, (m, p) => fs.handle(m, p));
  client.registerBuiltinServer(searchConfig, (m, p) => search.handle(m, p));
  client.registerBuiltinServer(gitConfig, (m, p) => git.handle(m, p));
  client.registerBuiltinServer(memoryConfig, (m, p) => memory.handle(m, p));

  Logger.info('[MCP] Registered 4 built-in INA servers');
}
