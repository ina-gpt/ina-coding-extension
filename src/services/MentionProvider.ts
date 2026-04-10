import * as vscode from 'vscode';
import * as path from 'path';
import {
  Mention,
  MentionType,
  ResolvedMention,
  MentionSuggestion,
  MentionContext,
} from './MentionParser';
import { languageDetector } from './LanguageDetector';
import { DocsMentionHandler } from './docs/DocsMentionHandler';
import { GitMentionHandler } from './git/GitMentionHandler';
import { LSPMentionHandler } from './lsp/LSPMentionHandler';
import { Logger } from '../utils/Logger';
import { CodeSecurityGate } from './codesec/CodeSecurityGate';
import { SensitiveFileDetector } from './codesec/SensitiveFileDetector';
import { CodebaseMentionHandler } from './codebase/CodebaseMentionHandler';
import { DeepMentionHandler } from './deepcontext/DeepMentionHandler';
import { WebMentionHandler } from './websearch/WebMentionHandler';
import { MCPClient } from './mcp/MCPClient';
import { NotepadManager } from './notepads/NotepadManager';

// ============ Icon Mapping ============

const MENTION_ICONS: Record<MentionType, string> = {
  file: '$(file)',
  folder: '$(folder)',
  symbol: '$(symbol-method)',
  docs: '$(book)',
  web: '$(globe)',
  mcp: '$(tools)',
  notepad: '$(notebook)',
  skill: '$(sparkle)',
  codebase: '$(database)',
  selection: '$(selection)',
  terminal: '$(terminal)',
  git: '$(git-branch)',
  problems: '$(warning)',
  type: '$(symbol-class)',
  def: '$(go-to-file)',
  refs: '$(references)',
  errors: '$(error)',
  signature: '$(symbol-method)',
  hierarchy: '$(type-hierarchy)',
  image: '$(device-camera)',
  screenshot: '$(screen-normal)',
  design: '$(paintcan)',
  link: '$(link)',
  'recently-changed': '$(history)',
  'past-chats': '$(comment-discussion)',
  'open-editors': '$(files)',
  'last-command': '$(terminal)',
  'file-range': '$(file-code)',
  'lint-errors': '$(error)',
};

const SYMBOL_ICONS: Partial<Record<vscode.SymbolKind, string>> = {
  [vscode.SymbolKind.Class]: '$(symbol-class)',
  [vscode.SymbolKind.Method]: '$(symbol-method)',
  [vscode.SymbolKind.Function]: '$(symbol-function)',
  [vscode.SymbolKind.Variable]: '$(symbol-variable)',
  [vscode.SymbolKind.Interface]: '$(symbol-interface)',
  [vscode.SymbolKind.Property]: '$(symbol-property)',
  [vscode.SymbolKind.Field]: '$(symbol-field)',
  [vscode.SymbolKind.Enum]: '$(symbol-enum)',
  [vscode.SymbolKind.Constant]: '$(symbol-constant)',
  [vscode.SymbolKind.Constructor]: '$(symbol-method)',
  [vscode.SymbolKind.Module]: '$(package)',
  [vscode.SymbolKind.Namespace]: '$(symbol-namespace)',
};

// ============ Mention Provider Class ============

export class MentionProvider {

  // ============ Get Suggestions ============

  async getSuggestions(context: MentionContext): Promise<MentionSuggestion[]> {
    const { query, type } = context;

    // No type specified - show type suggestions
    if (!type && query.length === 0) {
      return this.getTypeSuggestions();
    }

    // Typing type name - filter types + quick file search
    if (!type && query.length > 0) {
      const typeSuggs = this.getTypeSuggestions().filter(s =>
        s.value.toLowerCase().startsWith(query.toLowerCase()) ||
        s.displayName.toLowerCase().includes(query.toLowerCase())
      );
      const fileSuggs = await this.getFileSuggestions(query, 5);
      return [...typeSuggs, ...fileSuggs];
    }

    switch (type) {
      case 'file': return this.getFileSuggestions(query);
      case 'folder': return this.getFolderSuggestions(query);
      case 'symbol': return this.getSymbolSuggestions(query);
      case 'docs': return this.getDocsSuggestions(query);
      case 'web': return this.getWebSuggestions(query);
      case 'mcp': return this.getMcpSuggestions(query);
      case 'notepad': return this.getNotepadSuggestions(query);
      case 'codebase': return this.getCodebaseSuggestions(query);
      case 'git': return this.getGitSuggestions(query);
      case 'type':
      case 'def':
      case 'refs':
      case 'signature':
      case 'hierarchy':
        try { return (await LSPMentionHandler.getInstance().getSuggestions(type, query)) as any; } catch { return []; }
      case 'errors': return [{ type: 'errors' as MentionType, value: 'errors', displayName: 'Current Errors', description: 'Errors in current file', icon: '$(error)', insertText: '@errors ', sortOrder: 0 }];
      default: return [];
    }
  }

  // ============ Type Suggestions ============

  private getTypeSuggestions(): MentionSuggestion[] {
    return [
      { type: 'file', value: 'file', displayName: 'File', description: 'Reference a specific file', icon: MENTION_ICONS.file, insertText: '@file:', sortOrder: 1 },
      { type: 'folder', value: 'folder', displayName: 'Folder', description: 'Reference a folder and its contents', icon: MENTION_ICONS.folder, insertText: '@folder:', sortOrder: 2 },
      { type: 'symbol', value: 'symbol', displayName: 'Symbol', description: 'Reference a function, class, or variable', icon: MENTION_ICONS.symbol, insertText: '@symbol:', sortOrder: 3 },
      { type: 'selection', value: 'selection', displayName: 'Selection', description: 'Include current editor selection', icon: MENTION_ICONS.selection, insertText: '@selection ', sortOrder: 4 },
      { type: 'codebase', value: 'codebase', displayName: 'Codebase', description: 'Search entire codebase for relevant context', icon: MENTION_ICONS.codebase, insertText: '@codebase ', sortOrder: 5 },
      { type: 'docs', value: 'docs', displayName: 'Docs', description: 'Reference documentation', icon: MENTION_ICONS.docs, insertText: '@docs:', sortOrder: 6 },
      { type: 'web', value: 'web', displayName: 'Web', description: 'Search the web', icon: MENTION_ICONS.web, insertText: '@web ', sortOrder: 7 },
      { type: 'mcp', value: 'mcp', displayName: 'MCP Tools', description: 'Use Model Context Protocol tools', icon: MENTION_ICONS.mcp, insertText: '@mcp:', sortOrder: 7.5 },
      { type: 'notepad', value: 'notepad', displayName: 'Notepad', description: 'Include notepad context', icon: MENTION_ICONS.notepad, insertText: '@notepad:', sortOrder: 7.7 },
      { type: 'terminal', value: 'terminal', displayName: 'Terminal', description: 'Include recent terminal output', icon: MENTION_ICONS.terminal, insertText: '@terminal ', sortOrder: 8 },
      { type: 'git', value: 'git', displayName: 'Git', description: 'Include git changes or history', icon: MENTION_ICONS.git, insertText: '@git ', sortOrder: 9 },
      { type: 'problems', value: 'problems', displayName: 'Problems', description: 'Include current errors and warnings', icon: MENTION_ICONS.problems, insertText: '@problems ', sortOrder: 10 },
      { type: 'recently-changed' as MentionType, value: 'recently-changed', displayName: 'Recently Changed', description: 'Recently modified files (git)', icon: MENTION_ICONS['recently-changed'], insertText: '@recently-changed ', sortOrder: 11 },
      { type: 'past-chats' as MentionType, value: 'past-chats', displayName: 'Past Chats', description: 'Previous chat session context', icon: MENTION_ICONS['past-chats'], insertText: '@past-chats ', sortOrder: 12 },
      { type: 'open-editors' as MentionType, value: 'open-editors', displayName: 'Open Editors', description: 'All currently open editor tabs', icon: MENTION_ICONS['open-editors'], insertText: '@open-editors ', sortOrder: 13 },
      { type: 'last-command' as MentionType, value: 'last-command', displayName: 'Last Command', description: 'Last terminal command and output', icon: MENTION_ICONS['last-command'], insertText: '@last-command ', sortOrder: 14 },
      { type: 'lint-errors' as MentionType, value: 'lint-errors', displayName: 'Lint Errors', description: 'Current workspace errors only', icon: MENTION_ICONS['lint-errors'], insertText: '@lint-errors ', sortOrder: 15 },
    ];
  }

  // ============ File Suggestions ============

  private async getFileSuggestions(query: string, limit: number = 15): Promise<MentionSuggestion[]> {
    if (!vscode.workspace.workspaceFolders) { return []; }

    try {
      const pattern = query ? `**/*${query}*` : '**/*';
      const files = await vscode.workspace.findFiles(
        pattern,
        '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}',
        limit * 2
      );

      const suggestions: MentionSuggestion[] = files.map(file => {
        const relativePath = vscode.workspace.asRelativePath(file);
        const fileName = path.basename(file.fsPath);
        const ext = path.extname(fileName);
        const langInfo = languageDetector.detectFromExtension(ext);

        return {
          type: 'file' as MentionType,
          value: relativePath,
          displayName: fileName,
          description: relativePath,
          icon: MENTION_ICONS.file,
          detail: langInfo?.name,
          insertText: `@file:${relativePath} `,
          sortOrder: this.scoreMatch(fileName, relativePath, query),
        };
      });

      suggestions.sort((a, b) => a.sortOrder - b.sortOrder);
      return suggestions.slice(0, limit);
    } catch (error) {
      Logger.error('Failed to get file suggestions:', error);
      return [];
    }
  }

  // ============ Folder Suggestions ============

  private async getFolderSuggestions(query: string, limit: number = 10): Promise<MentionSuggestion[]> {
    if (!vscode.workspace.workspaceFolders) { return []; }

    try {
      const files = await vscode.workspace.findFiles(
        query ? `**/*${query}*/**/*` : '**/*',
        '{**/node_modules/**,**/.git/**}',
        limit * 5
      );

      const directories = new Set<string>();
      for (const file of files) {
        const relativePath = vscode.workspace.asRelativePath(file);
        const dirPath = path.dirname(relativePath);
        if (dirPath !== '.') {
          const parts = dirPath.split('/');
          let current = '';
          for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!query || current.toLowerCase().includes(query.toLowerCase())) {
              directories.add(current);
            }
          }
        }
      }

      return Array.from(directories).slice(0, limit).map((dir, i) => ({
        type: 'folder' as MentionType,
        value: dir,
        displayName: path.basename(dir),
        description: dir,
        icon: MENTION_ICONS.folder,
        insertText: `@folder:${dir} `,
        sortOrder: i,
      }));
    } catch (error) {
      Logger.error('Failed to get folder suggestions:', error);
      return [];
    }
  }

  // ============ Symbol Suggestions ============

  private async getSymbolSuggestions(query: string, limit: number = 15): Promise<MentionSuggestion[]> {
    if (!query || query.length < 2) {
      return this.getCurrentFileSymbols(limit);
    }

    try {
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query
      );
      if (!symbols) { return []; }

      return symbols.slice(0, limit).map((symbol, i) => {
        const relativePath = vscode.workspace.asRelativePath(symbol.location.uri);
        const icon = SYMBOL_ICONS[symbol.kind] || '$(symbol-misc)';

        return {
          type: 'symbol' as MentionType,
          value: symbol.name,
          displayName: symbol.name,
          description: relativePath,
          icon,
          detail: symbol.containerName ? `in ${symbol.containerName}` : undefined,
          insertText: `@symbol:${symbol.name} `,
          sortOrder: i,
        };
      });
    } catch (error) {
      Logger.error('Failed to get symbol suggestions:', error);
      return [];
    }
  }

  private async getCurrentFileSymbols(limit: number): Promise<MentionSuggestion[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return []; }

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
      );
      if (!symbols) { return []; }

      const suggestions: MentionSuggestion[] = [];
      this.flattenSymbols(symbols, suggestions, '', limit);
      return suggestions;
    } catch {
      return [];
    }
  }

  private flattenSymbols(
    symbols: vscode.DocumentSymbol[],
    out: MentionSuggestion[],
    prefix: string,
    limit: number
  ): void {
    for (const symbol of symbols) {
      if (out.length >= limit) { return; }
      const fullName = prefix ? `${prefix}.${symbol.name}` : symbol.name;
      const icon = SYMBOL_ICONS[symbol.kind] || '$(symbol-misc)';

      out.push({
        type: 'symbol',
        value: fullName,
        displayName: symbol.name,
        description: prefix || 'Current file',
        icon,
        detail: vscode.SymbolKind[symbol.kind],
        insertText: `@symbol:${fullName} `,
        sortOrder: out.length,
      });

      if (symbol.children.length > 0) {
        this.flattenSymbols(symbol.children, out, fullName, limit);
      }
    }
  }

  // ============ Docs Suggestions ============

  private getDocsSuggestions(query: string): MentionSuggestion[] {
    // Try to get live suggestions from indexed docs via DocsMentionHandler
    try {
      const handler = DocsMentionHandler.getInstance();
      // Fire and forget — return static fallbacks, but also trigger async fetch
      handler.getSuggestions(query).then(suggestions => {
        // These will be available for next autocomplete cycle
      }).catch(() => {});
    } catch {
      // DocsMentionHandler not initialized yet
    }

    // Static fallback suggestions
    const docTopics = [
      { value: 'react', displayName: 'React' },
      { value: 'typescript', displayName: 'TypeScript' },
      { value: 'nextjs', displayName: 'Next.js' },
      { value: 'nodejs', displayName: 'Node.js' },
      { value: 'tailwind', displayName: 'Tailwind CSS' },
      { value: 'vscode-api', displayName: 'VS Code API' },
      { value: 'prisma', displayName: 'Prisma' },
      { value: 'python', displayName: 'Python' },
      { value: 'rust', displayName: 'Rust' },
      { value: 'go', displayName: 'Go' },
    ];

    return docTopics
      .filter(t => !query || t.value.toLowerCase().includes(query.toLowerCase()) || t.displayName.toLowerCase().includes(query.toLowerCase()))
      .map((t, i) => ({
        type: 'docs' as MentionType,
        value: t.value,
        displayName: t.displayName,
        description: `${t.displayName} documentation`,
        icon: MENTION_ICONS.docs,
        insertText: `@docs:${t.value} `,
        sortOrder: i,
      }));
  }

  // ============ Web Suggestions ============

  private getWebSuggestions(query: string): MentionSuggestion[] {
    const completions = WebMentionHandler.getInstance().getCompletions(query || '');
    const out: MentionSuggestion[] = completions.map((c, i) => ({
      type: 'web' as MentionType,
      value: c.label.replace(/^@web:?/, ''),
      displayName: c.label,
      description: c.detail,
      icon: MENTION_ICONS.web,
      insertText: `${c.label} `,
      sortOrder: i,
    }));
    if (query) {
      out.unshift({
        type: 'web',
        value: query,
        displayName: `Search: "${query}"`,
        description: 'Search the web',
        icon: MENTION_ICONS.web,
        insertText: `@web:${query} `,
        sortOrder: -1,
      });
    }
    return out;
  }

  // ============ Notepad Suggestions ============

  private getNotepadSuggestions(query: string): MentionSuggestion[] {
    try {
      const manager = NotepadManager.getInstance();
      const all = manager.getAll();
      const filtered = query
        ? all.filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
        : all;
      if (filtered.length === 0) {
        return [
          {
            type: 'notepad' as MentionType,
            value: '',
            displayName: 'Notepads',
            description: 'No notepads — create one in the Notepads panel',
            icon: MENTION_ICONS.notepad,
            insertText: '@notepad ',
            sortOrder: 0,
          },
        ];
      }
      return filtered.slice(0, 20).map((n, i) => ({
        type: 'notepad' as MentionType,
        value: n.name,
        displayName: n.name,
        description: `${n.tokenCount}t · ${n.type}${n.isPinned ? ' · pinned' : ''}`,
        icon: MENTION_ICONS.notepad,
        detail: 'Notepad',
        insertText: `@notepad:${n.name} `,
        sortOrder: n.isPinned ? -1 : i,
      }));
    } catch {
      return [];
    }
  }

  // ============ MCP Suggestions ============

  private getMcpSuggestions(query: string): MentionSuggestion[] {
    try {
      const client = MCPClient.getInstance();
      const tools = client.listTools();
      const filtered = query
        ? tools.filter(
            (t) =>
              t.name.toLowerCase().includes(query.toLowerCase()) ||
              t.serverName.toLowerCase().includes(query.toLowerCase())
          )
        : tools;
      return filtered.slice(0, 20).map((t, i) => ({
        type: 'mcp' as MentionType,
        value: `${t.serverName}.${t.name}`,
        displayName: `${t.serverName}.${t.name}`,
        description: t.description,
        icon: MENTION_ICONS.mcp,
        detail: 'MCP tool',
        insertText: `@mcp:${t.serverName}.${t.name} `,
        sortOrder: i,
      }));
    } catch {
      return [
        {
          type: 'mcp' as MentionType,
          value: '',
          displayName: 'MCP Tools',
          description: 'No MCP servers connected',
          icon: MENTION_ICONS.mcp,
          insertText: '@mcp ',
          sortOrder: 0,
        },
      ];
    }
  }

  // ============ Codebase Suggestions ============

  private getCodebaseSuggestions(query: string): MentionSuggestion[] {
    // Fire and forget async completions for next cycle
    try {
      const handler = CodebaseMentionHandler.getInstance();
      handler.getCompletions(query).catch(() => {});
    } catch {
      // CodebaseMentionHandler not initialized
    }

    const suggestions: MentionSuggestion[] = [
      { type: 'codebase', value: '', displayName: 'Entire Codebase', description: 'Search all code for relevant context', icon: MENTION_ICONS.codebase, insertText: '@codebase ', sortOrder: 0 },
    ];
    if (query) {
      suggestions.unshift({
        type: 'codebase', value: query, displayName: `Search: "${query}"`, description: 'Search codebase for this query', icon: MENTION_ICONS.codebase, insertText: `@codebase:${query} `, sortOrder: -1,
      });
    }
    return suggestions;
  }

  // ============ Git Suggestions ============

  private getGitSuggestions(query: string): MentionSuggestion[] {
    const gitOptions = [
      { value: 'status', displayName: 'Git Status', description: 'Current repository status', icon: '$(git-branch)' },
      { value: 'diff', displayName: 'Git Diff', description: 'Uncommitted changes', icon: '$(diff)' },
      { value: 'staged', displayName: 'Staged Changes', description: 'Changes staged for commit', icon: '$(diff-added)' },
      { value: 'log', displayName: 'Git Log', description: 'Recent commit history', icon: '$(history)' },
      { value: 'blame', displayName: 'Git Blame', description: 'File authorship', icon: '$(person)' },
      { value: 'branch', displayName: 'Branch Info', description: 'Current branch information', icon: '$(git-branch)' },
      { value: 'stash', displayName: 'Git Stash', description: 'Stashed changes', icon: '$(archive)' },
      { value: 'pr', displayName: 'PR Context', description: 'Pull request context', icon: '$(git-pull-request)' },
    ];

    return gitOptions
      .filter(o => !query || o.value.toLowerCase().includes(query.toLowerCase()) || o.displayName.toLowerCase().includes(query.toLowerCase()))
      .map((o, i) => ({
        type: 'git' as MentionType,
        value: o.value,
        displayName: o.displayName,
        description: o.description,
        icon: o.icon,
        insertText: `@git:${o.value} `,
        sortOrder: i,
      }));
  }

  // ============ Resolve Mention ============

  async resolveMention(mention: Mention): Promise<ResolvedMention> {
    try {
      switch (mention.type) {
        case 'file': return this.resolveFile(mention.value);
        case 'folder': return this.resolveFolder(mention.value);
        case 'symbol': return this.resolveSymbol(mention.value);
        case 'selection': return this.resolveSelection();
        case 'terminal': return await this.resolveTerminal(mention);
        case 'recently-changed': return await this.resolveRecentlyChanged(mention);
        case 'problems': return this.resolveProblems();
        case 'past-chats': return await this.resolvePastChats(mention);
        case 'open-editors': return this.resolveOpenEditors();
        case 'last-command': return await this.resolveLastCommand();
        case 'file-range': return await this.resolveFileRange(mention);
        case 'lint-errors': return this.resolveLintErrors();
        case 'git': {
          try {
            const gitHandler = GitMentionHandler.getInstance();
            const content = await gitHandler.resolveMention(mention);
            return { type: 'git', content };
          } catch {
            return this.resolveGit(mention.value);
          }
        }
        case 'codebase': {
          try {
            const handler = CodebaseMentionHandler.getInstance();
            const content = await handler.handleMention(mention.value || '', mention.raw);
            return { type: 'codebase', content };
          } catch {
            return { type: 'codebase', content: mention.value ? `[Searching codebase for: ${mention.value}]` : '[Searching entire codebase]' };
          }
        }
        case 'docs': {
          try {
            const handler = DocsMentionHandler.getInstance();
            const content = await handler.resolveMention(mention);
            return { type: 'docs', content };
          } catch {
            return { type: 'docs', content: mention.value };
          }
        }
        case 'web': {
          try {
            const handler = WebMentionHandler.getInstance();
            const ctx = await handler.handleMention(mention.value || '', '');
            return {
              type: 'web',
              content: ctx.formatted,
              tokens: ctx.tokenCount,
              metadata: { resultCount: ctx.results.length },
            };
          } catch (e) {
            return { type: 'web', content: `[Web search failed: ${String(e)}]` };
          }
        }
        case 'notepad': {
          try {
            const manager = NotepadManager.getInstance();
            if (mention.value) {
              const all = manager.getAll();
              const found = all.find((n) => n.name === mention.value);
              if (found) {
                return {
                  type: 'notepad',
                  content: found.content,
                  tokens: found.tokenCount,
                  metadata: { name: found.name, type: found.type, isPinned: found.isPinned },
                };
              }
              return { type: 'notepad', error: `Notepad not found: ${mention.value}` };
            }
            // No specific notepad — return list
            const list = manager
              .getAll()
              .map((n) => `- ${n.name} (${n.type}, ${n.tokenCount}t)`)
              .join('\n');
            return {
              type: 'notepad',
              content: list || 'No notepads',
              metadata: { count: manager.getAll().length },
            };
          } catch (e) {
            return { type: 'notepad', error: `Notepads unavailable: ${String(e)}` };
          }
        }
        case 'mcp': {
          try {
            const client = MCPClient.getInstance();
            const tools = client.listTools();
            if (mention.value) {
              // Specific tool reference: server.tool
              const dot = mention.value.indexOf('.');
              if (dot > 0) {
                const serverName = mention.value.substring(0, dot);
                const toolName = mention.value.substring(dot + 1);
                const tool = tools.find(
                  (t) => t.serverName === serverName && t.name === toolName
                );
                if (tool) {
                  return {
                    type: 'mcp',
                    content: `MCP tool: ${tool.serverName}.${tool.name}\nDescription: ${tool.description}\nInput schema: ${JSON.stringify(tool.inputSchema, null, 2)}`,
                    metadata: { tool: tool.name, server: tool.serverName },
                  };
                }
              }
            }
            // List all tools
            const list = tools
              .map((t) => `- ${t.serverName}.${t.name}: ${t.description}`)
              .join('\n');
            return {
              type: 'mcp',
              content: list || 'No MCP tools available',
              metadata: { toolCount: tools.length },
            };
          } catch (e) {
            return { type: 'mcp', content: `[MCP unavailable: ${String(e)}]` };
          }
        }
        case 'type':
        case 'def':
        case 'refs': {
          // Try deep context first for @def/@type/@refs
          try {
            const deepHandler = DeepMentionHandler.getInstance();
            const editor = vscode.window.activeTextEditor;
            if (editor && mention.value) {
              const pos = editor.selection.active;
              let content: string;
              if (mention.type === 'def') {
                content = await deepHandler.handleDefMention(mention.value, editor.document, pos);
              } else if (mention.type === 'type') {
                content = await deepHandler.handleTypeMention(mention.value, editor.document, pos);
              } else {
                content = await deepHandler.handleRefsMention(mention.value, editor.document, pos);
              }
              if (content) return { type: mention.type, content };
            }
          } catch {
            // Fall through to LSP handler
          }
          try {
            const lspHandler = LSPMentionHandler.getInstance();
            const content = await lspHandler.resolveMention(mention);
            return { type: mention.type, content };
          } catch {
            return { type: mention.type, content: `[LSP ${mention.type} not available]` };
          }
        }
        case 'errors':
        case 'signature':
        case 'hierarchy': {
          try {
            const lspHandler = LSPMentionHandler.getInstance();
            const content = await lspHandler.resolveMention(mention);
            return { type: mention.type, content };
          } catch {
            return { type: mention.type, content: `[LSP ${mention.type} not available]` };
          }
        }
        default:
          return { type: mention.type, error: 'Unknown mention type' };
      }
    } catch (error) {
      Logger.error(`Failed to resolve mention: ${mention.raw}`, error);
      return { type: mention.type, error: error instanceof Error ? error.message : 'Resolution failed' };
    }
  }

  private async resolveFile(filePath: string): Promise<ResolvedMention> {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws) { return { type: 'file', error: 'No workspace open' }; }

    try {
      const workspaceRoot = ws[0].uri.fsPath;
      let fullPath: string;

      if (path.isAbsolute(filePath)) {
        fullPath = filePath;
      } else {
        // SECURITY: Normalize to prevent path traversal (e.g. ../../etc/passwd)
        const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
        fullPath = path.resolve(workspaceRoot, normalized);
      }

      // SECURITY: Ensure resolved path is within a workspace folder
      const resolvedFull = path.resolve(fullPath);
      const isInsideWorkspace = ws.some(folder => {
        const folderPath = path.resolve(folder.uri.fsPath);
        return resolvedFull.startsWith(folderPath + path.sep) || resolvedFull === folderPath;
      });

      if (!isInsideWorkspace) {
        Logger.warn(`Path traversal attempt blocked: ${filePath}`);
        return { type: 'file', error: `Access denied: path must be within workspace` };
      }

      // Security: check if file is sensitive before including content
      const detector = SensitiveFileDetector.getInstance();
      if (detector.isSensitiveFile(fullPath)) {
        Logger.warn(`Sensitive file excluded from mention: ${filePath}`);
        return { type: 'file', error: `File excluded: ${filePath} is flagged as sensitive` };
      }

      const uri = vscode.Uri.file(fullPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const maxLen = 50000;
      const truncated = content.length > maxLen ? content.substring(0, maxLen) + '\n\n[... truncated ...]' : content;

      return {
        type: 'file',
        content: truncated,
        metadata: { path: filePath, language: document.languageId, lineCount: document.lineCount },
      };
    } catch {
      return { type: 'file', error: `File not found: ${filePath}` };
    }
  }

  private async resolveFolder(folderPath: string): Promise<ResolvedMention> {
    if (!vscode.workspace.workspaceFolders) { return { type: 'folder', error: 'No workspace open' }; }

    try {
      const files = await vscode.workspace.findFiles(`${folderPath}/**/*`, '**/node_modules/**', 50);
      const fileList = files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
      return {
        type: 'folder',
        content: `Files in ${folderPath}:\n${fileList}`,
        metadata: { path: folderPath, fileCount: files.length },
      };
    } catch {
      return { type: 'folder', error: `Folder not found: ${folderPath}` };
    }
  }

  private async resolveSymbol(symbolName: string): Promise<ResolvedMention> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        symbolName
      );

      if (!symbols || symbols.length === 0) {
        return { type: 'symbol', error: `Symbol not found: ${symbolName}` };
      }

      const exactMatch = symbols.find(s => s.name === symbolName);
      const symbol = exactMatch || symbols[0];

      const document = await vscode.workspace.openTextDocument(symbol.location.uri);
      const symbolRange = symbol.location.range;

      // Expand range to include full definition context
      const startLine = Math.max(0, symbolRange.start.line - 2);
      const endLine = Math.min(document.lineCount, symbolRange.end.line + 10);
      const range = new vscode.Range(startLine, 0, endLine, 0);
      const content = document.getText(range);

      return {
        type: 'symbol',
        content,
        metadata: {
          name: symbol.name,
          kind: vscode.SymbolKind[symbol.kind],
          file: vscode.workspace.asRelativePath(symbol.location.uri),
          line: symbolRange.start.line + 1,
        },
      };
    } catch {
      return { type: 'symbol', error: `Failed to resolve symbol: ${symbolName}` };
    }
  }

  private resolveSelection(): ResolvedMention {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return { type: 'selection', error: 'No active editor' }; }
    if (editor.selection.isEmpty) { return { type: 'selection', error: 'No text selected' }; }

    const content = editor.document.getText(editor.selection);
    const relativePath = vscode.workspace.asRelativePath(editor.document.uri);

    return {
      type: 'selection',
      content,
      metadata: {
        file: relativePath,
        startLine: editor.selection.start.line + 1,
        endLine: editor.selection.end.line + 1,
        language: editor.document.languageId,
      },
    };
  }

  private resolveProblems(): ResolvedMention {
    const diagnostics = vscode.languages.getDiagnostics();
    const problems: string[] = [];

    for (const [uri, fileDiags] of diagnostics) {
      const relativePath = vscode.workspace.asRelativePath(uri);
      for (const diag of fileDiags) {
        const severity = diag.severity === vscode.DiagnosticSeverity.Error ? 'ERROR'
          : diag.severity === vscode.DiagnosticSeverity.Warning ? 'WARNING' : 'INFO';
        problems.push(`[${severity}] ${relativePath}:${diag.range.start.line + 1} - ${diag.message}`);
      }
    }

    if (problems.length === 0) {
      return { type: 'problems', content: 'No problems found in workspace' };
    }

    return {
      type: 'problems',
      content: problems.slice(0, 50).join('\n'),
      metadata: { totalCount: problems.length },
    };
  }

  private async resolveGit(subCommand: string): Promise<ResolvedMention> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) { return { type: 'git', error: 'Git extension not available' }; }

      const git = gitExtension.exports;
      const api = git.getAPI(1);
      if (!api || api.repositories.length === 0) { return { type: 'git', error: 'No git repository found' }; }

      const repo = api.repositories[0];

      switch (subCommand || 'diff') {
        case 'diff': {
          const changes = repo.state.workingTreeChanges;
          const changedFiles = changes.map((c: { uri: vscode.Uri }) => vscode.workspace.asRelativePath(c.uri)).join('\n');
          return { type: 'git', content: `Changed files:\n${changedFiles || 'No changes'}`, metadata: { changeCount: changes.length } };
        }
        case 'staged': {
          const staged = repo.state.indexChanges;
          const stagedFiles = staged.map((c: { uri: vscode.Uri }) => vscode.workspace.asRelativePath(c.uri)).join('\n');
          return { type: 'git', content: `Staged files:\n${stagedFiles || 'Nothing staged'}`, metadata: { stagedCount: staged.length } };
        }
        case 'branch': {
          const head = repo.state.HEAD;
          return { type: 'git', content: `Current branch: ${head?.name || 'HEAD'}`, metadata: { branch: head?.name } };
        }
        default:
          return { type: 'git', content: `[Unknown git command: ${subCommand}]` };
      }
    } catch {
      return { type: 'git', error: 'Failed to get git info' };
    }
  }

  // ============ Scoring ============

  private scoreMatch(fileName: string, relativePath: string, query: string): number {
    let score = 100;
    if (!query) { return score; }

    const lq = query.toLowerCase();
    const lf = fileName.toLowerCase();
    const lp = relativePath.toLowerCase();

    if (lf === lq) { score -= 50; }
    else if (lf.startsWith(lq)) { score -= 40; }
    else if (lf.includes(lq)) { score -= 30; }
    else if (lp.includes(lq)) { score -= 20; }

    if (relativePath.includes('src/')) { score -= 5; }
    return score;
  }

  // ============ @recently-changed resolver ============

  private async resolveRecentlyChanged(mention: Mention): Promise<ResolvedMention> {
    const count = parseInt(mention.value) || 5;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return { type: 'recently-changed' as MentionType, content: '[No workspace open]' };

    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync(`git diff --name-only HEAD~${Math.min(count, 20)} HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null`, { cwd: workspaceRoot, timeout: 5000 });
      const files = stdout.trim().split('\n').filter(Boolean).slice(0, 20);

      if (files.length === 0) return { type: 'recently-changed' as MentionType, content: '[No recently changed files found]' };

      const fs = require('fs').promises;
      const contents: string[] = [];
      for (const f of files) {
        try {
          const filePath = path.join(workspaceRoot, f);
          const content = await fs.readFile(filePath, 'utf-8');
          contents.push(`// File: ${f}\n${content.slice(0, 3000)}`);
        } catch { /* skip unreadable files */ }
      }

      return {
        type: 'recently-changed' as MentionType,
        content: `Recently changed files (${files.length}):\n\n${contents.join('\n\n---\n\n')}`,
        metadata: { fileCount: files.length, files },
      };
    } catch (e: any) {
      Logger.warn(`@recently-changed resolution failed: ${e.message}`);
      return { type: 'recently-changed' as MentionType, content: '[Git not available or no recent changes]' };
    }
  }

  // ============ @terminal resolver ============

  private async resolveTerminal(_mention: Mention): Promise<ResolvedMention> {
    // Use TerminalIntegrationService if available, else collect from active terminal
    try {
      const { TerminalIntegrationService } = require('./agent/terminal/TerminalIntegrationService');
      const termService = TerminalIntegrationService.getInstance();
      if (termService && typeof termService.getRecentOutput === 'function') {
        const output = await termService.getRecentOutput(100);
        if (output) {
          return { type: 'terminal', content: `Terminal output (recent):\n\`\`\`\n${output}\n\`\`\`` };
        }
      }
    } catch { /* TerminalIntegrationService not available */ }

    // Fallback: try to read from active terminal shell integration
    try {
      const terminal = vscode.window.activeTerminal;
      if (terminal) {
        return {
          type: 'terminal',
          content: `[Active terminal: "${terminal.name}" — output capture requires shell integration. Use agent mode for full terminal access.]`,
        };
      }
    } catch { /* no terminal */ }

    return { type: 'terminal', content: '[No terminal output available. Run commands via agent mode for captured output.]' };
  }

  // ============ @past-chats resolver ============

  private async resolvePastChats(mention: Mention): Promise<ResolvedMention> {
    const count = parseInt(mention.value) || 3;
    try {
      const { HistorySearchService } = require('./history/HistorySearchService');
      const svc = HistorySearchService.getInstance();
      const conversations = svc.getConversations(count);
      if (!conversations || conversations.length === 0) {
        return { type: 'past-chats' as MentionType, content: '[No previous chat sessions found]' };
      }
      const summaries = conversations.map((c: any) => {
        const date = new Date(c.createdAt || c.timestamp || Date.now()).toLocaleDateString();
        const title = c.title || 'Untitled';
        const preview = c.preview || c.lastMessage || '';
        return `- [${date}] ${title}: ${preview.slice(0, 200)}`;
      });
      return { type: 'past-chats' as MentionType, content: `Previous conversations (${summaries.length}):\n${summaries.join('\n')}` };
    } catch {
      return { type: 'past-chats' as MentionType, content: '[Chat history not available]' };
    }
  }

  // ============ @open-editors resolver ============

  private resolveOpenEditors(): ResolvedMention {
    try {
      const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const editorFiles: string[] = [];
      for (const tab of tabs) {
        if (tab.input && (tab.input as any).uri) {
          const uri = (tab.input as any).uri as vscode.Uri;
          if (uri.scheme === 'file') {
            editorFiles.push(path.relative(workspaceRoot, uri.fsPath));
          }
        }
      }
      if (editorFiles.length === 0) return { type: 'open-editors' as MentionType, content: '[No open editors]' };
      return { type: 'open-editors' as MentionType, content: `Open editors (${editorFiles.length}):\n${editorFiles.map(f => `- ${f}`).join('\n')}` };
    } catch {
      return { type: 'open-editors' as MentionType, content: '[Unable to read open editors]' };
    }
  }

  // ============ @last-command resolver ============

  private async resolveLastCommand(): Promise<ResolvedMention> {
    try {
      const { TerminalIntegrationService } = require('./agent/terminal/TerminalIntegrationService');
      const termService = TerminalIntegrationService.getInstance();
      if (termService && typeof termService.getRecentOutput === 'function') {
        const output = await termService.getRecentOutput(100);
        if (output) {
          return { type: 'last-command' as MentionType, content: `Last terminal output:\n\`\`\`\n${output.slice(0, 4000)}\n\`\`\`` };
        }
      }
    } catch { /* */ }

    // Fallback: try TerminalErrorWatcher buffer
    try {
      const { TerminalErrorWatcher } = require('./debug/TerminalErrorWatcher');
      // Can't access instance directly — fall back to active terminal info
    } catch { /* */ }

    const terminal = vscode.window.activeTerminal;
    if (terminal) {
      return { type: 'last-command' as MentionType, content: `[Active terminal: "${terminal.name}" — use agent mode or @terminal for output capture]` };
    }
    return { type: 'last-command' as MentionType, content: '[No terminal command history available]' };
  }

  // ============ @file-range resolver ============

  private async resolveFileRange(mention: Mention): Promise<ResolvedMention> {
    // Parse file:start-end from raw mention
    const match = mention.raw.match(/@file:([^\s]+):(\d+)-(\d+)/);
    if (!match) return { type: 'file-range' as MentionType, content: '[Invalid file range format. Use @file:path:start-end]' };

    const filePath = match[1];
    const startLine = parseInt(match[2], 10);
    const endLine = parseInt(match[3], 10);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    try {
      const fs = require('fs');
      const fullPath = path.resolve(workspaceRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').slice(startLine - 1, endLine);
      const ext = path.extname(filePath).replace('.', '');
      return {
        type: 'file-range' as MentionType,
        content: `File: ${filePath} (lines ${startLine}-${endLine}):\n\`\`\`${ext}\n${lines.join('\n')}\n\`\`\``,
      };
    } catch {
      return { type: 'file-range' as MentionType, content: `[File not found: ${filePath}]` };
    }
  }

  // ============ @lint-errors resolver ============

  private resolveLintErrors(): ResolvedMention {
    try {
      const diagnostics = vscode.languages.getDiagnostics();
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const errors: string[] = [];

      for (const [uri, diags] of diagnostics) {
        for (const d of diags) {
          if (d.severity !== vscode.DiagnosticSeverity.Error) continue;
          const relPath = path.relative(workspaceRoot, uri.fsPath);
          if (relPath.includes('node_modules')) continue;
          errors.push(`${relPath}:${d.range.start.line + 1}: ${d.message}`);
        }
      }

      if (errors.length === 0) return { type: 'lint-errors' as MentionType, content: '[No lint errors found]' };
      return { type: 'lint-errors' as MentionType, content: `Lint errors (${errors.length}):\n${errors.slice(0, 50).join('\n')}` };
    } catch {
      return { type: 'lint-errors' as MentionType, content: '[Unable to read diagnostics]' };
    }
  }
}

// ============ Export ============

export const mentionProvider = new MentionProvider();
