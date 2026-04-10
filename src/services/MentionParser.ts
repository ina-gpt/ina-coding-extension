import * as vscode from 'vscode';
import * as path from 'path';
import { contentFetcher } from './ContentFetcher';
import { folderTreeGenerator } from './FolderTreeGenerator';
import { symbolExtractor } from './SymbolExtractor';
import { tokenCounter } from './TokenCounter';
import { Logger } from '../utils/Logger';

// ============ Types ============

export type MentionType =
  | 'file'
  | 'folder'
  | 'symbol'
  | 'docs'
  | 'web'
  | 'mcp'
  | 'notepad'
  | 'skill'
  | 'codebase'
  | 'selection'
  | 'terminal'
  | 'git'
  | 'problems'
  | 'type'
  | 'def'
  | 'refs'
  | 'errors'
  | 'signature'
  | 'hierarchy'
  | 'image'
  | 'screenshot'
  | 'design'
  | 'link'
  | 'recently-changed'
  | 'past-chats'
  | 'open-editors'
  | 'last-command'
  | 'file-range'
  | 'lint-errors';

export interface Mention {
  type: MentionType;
  raw: string;
  value: string;
  displayName: string;
  startIndex: number;
  endIndex: number;
  resolved?: ResolvedMention;
  tokens?: number;
}

export interface ResolvedMention {
  type: MentionType;
  content?: string;
  tokens?: number;
  truncated?: boolean;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface MentionSuggestion {
  type: MentionType;
  value: string;
  displayName: string;
  description?: string;
  icon: string;
  detail?: string;
  insertText: string;
  sortOrder: number;
}

export interface ParseResult {
  mentions: Mention[];
  cleanedText: string;
  hasUnresolvedMentions: boolean;
}

export interface MentionContext {
  query: string;
  type: MentionType | null;
  startIndex: number;
  isComplete: boolean;
}

export interface ParseOptions {
  maxTokensPerMention?: number;
  totalMentionBudget?: number;
}

// ============ Mention Patterns ============

const MENTION_PATTERNS: Record<MentionType, RegExp> = {
  file: /@file:([^\s]+)/g,
  folder: /@folder:([^\s]+)/g,
  symbol: /@symbol:([^\s]+)/g,
  docs: /@docs:([^\s]+)/g,
  // @web — value optional (e.g. "@web how to use react hooks" or "@web:stackoverflow")
  web: /@web(?::([^\s]+))?/g,
  // @mcp — invokes MCP tools (e.g. "@mcp:filesystem.read_file")
  mcp: /@mcp(?::([^\s]+))?/g,
  // @notepad — include a persistent notepad in context (e.g. "@notepad:api-spec")
  notepad: /@notepad(?::([^\s]+))?/g,
  // @skill — invoke a marketplace skill (e.g. "@skill:bug-fix")
  skill: /@skill(?::([^\s]+))?/g,
  codebase: /@codebase(?::([^\s]+))?/g,
  selection: /@selection/g,
  terminal: /@terminal/g,
  git: /@git(?::([^\s]+))?/g,
  problems: /@problems/g,
  type: /@type(?::([^\s]+))?/g,
  def: /@def(?::([^\s]+))?/g,
  refs: /@refs(?::([^\s]+))?/g,
  errors: /@errors(?::([^\s]+))?/g,
  signature: /@signature(?::([^\s]+))?/g,
  hierarchy: /@hierarchy(?::([^\s]+))?/g,
  image: /@image/g,
  screenshot: /@screenshot/g,
  design: /@design/g,
  link: /@link:(https?:\/\/[^\s]+)/g,
  'recently-changed': /@recently[- ]?changed(?::(\d+))?/g,
  'past-chats': /@past[- ]?chats?(?::(\d+))?/g,
  'open-editors': /@open[- ]?editors?/g,
  'last-command': /@last[- ]?command/g,
  'file-range': /@file:([^\s]+):(\d+)-(\d+)/g,
  'lint-errors': /@lint[- ]?errors?/g,
};

const MENTION_TYPES: MentionType[] = [
  'file', 'folder', 'symbol', 'docs', 'web', 'mcp', 'notepad', 'skill',
  'codebase', 'selection', 'terminal', 'git', 'problems',
  'type', 'def', 'refs', 'errors', 'signature', 'hierarchy',
  'image', 'screenshot', 'design', 'link', 'recently-changed',
  'past-chats', 'open-editors', 'last-command', 'file-range', 'lint-errors',
];

// Short aliases
const MENTION_ALIASES: Record<string, MentionType> = {
  '@f:': 'file',
  '@d:': 'folder',
  '@s:': 'symbol',
  '@doc:': 'docs',
  '@w:': 'web',
  '@cb': 'codebase',
  '@sel': 'selection',
  '@term': 'terminal',
  '@g:': 'git',
  '@prob': 'problems',
  '@t:': 'type',
  '@r:': 'refs',
  '@e:': 'errors',
  '@sig:': 'signature',
  '@rc': 'recently-changed',
  '@recent': 'recently-changed',
  '@chats': 'past-chats',
  '@editors': 'open-editors',
  '@lastcmd': 'last-command',
  '@lint': 'lint-errors',
};

// ============ Mention Parser Class ============

export class MentionParser {

  // ============ Core Parsing ============

  parse(input: string): ParseResult {
    const expanded = this.expandAliases(input);
    const mentions: Mention[] = [];
    let cleanedText = input;

    for (const [type, pattern] of Object.entries(MENTION_PATTERNS)) {
      const regex = new RegExp(pattern.source, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(expanded)) !== null) {
        const mention: Mention = {
          type: type as MentionType,
          raw: match[0],
          value: match[1] || '',
          displayName: this.getDisplayName(type as MentionType, match[1] || ''),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        };

        if (this.validateMention(mention)) {
          mentions.push(mention);
        }
      }
    }

    mentions.sort((a, b) => a.startIndex - b.startIndex);

    // Deduplicate
    const seen = new Set<string>();
    const unique = mentions.filter(m => {
      const key = `${m.type}:${m.value}`;
      if (seen.has(key)) { return false; }
      seen.add(key);
      return true;
    });

    // Remove mentions from text (reverse order)
    const sortedReverse = [...unique].sort((a, b) => b.startIndex - a.startIndex);
    for (const mention of sortedReverse) {
      cleanedText = cleanedText.slice(0, mention.startIndex) + cleanedText.slice(mention.endIndex);
    }
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

    return {
      mentions: unique,
      cleanedText,
      hasUnresolvedMentions: unique.some(m => !m.resolved),
    };
  }

  /**
   * Parse and resolve all mentions using advanced services
   */
  async parseAndResolve(input: string, options: ParseOptions = {}): Promise<ParseResult> {
    const result = this.parse(input);
    const maxPerMention = options.maxTokensPerMention || 2000;
    const totalBudget = options.totalMentionBudget || 15000;
    const perMention = Math.min(maxPerMention, Math.floor(totalBudget / Math.max(result.mentions.length, 1)));

    const resolved = await Promise.all(
      result.mentions.map(m => this.resolveMentionAdvanced(m, perMention))
    );

    resolved.forEach((r, i) => {
      result.mentions[i].resolved = r;
      result.mentions[i].tokens = r.tokens;
    });

    return result;
  }

  // ============ Alias Expansion ============

  private expandAliases(input: string): string {
    let result = input;
    for (const [alias, type] of Object.entries(MENTION_ALIASES)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped + '(\\S+)?', 'g');
      result = result.replace(regex, (_, value) => {
        if (value) { return `@${type}:${value}`; }
        if (!alias.endsWith(':')) { return `@${type}`; }
        return alias;
      });
    }
    return result;
  }

  // ============ Active Mention Detection ============

  detectActiveMention(input: string, cursorPosition: number): MentionContext | null {
    const beforeCursor = input.slice(0, cursorPosition);
    const lastAtIndex = beforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) { return null; }

    const textAfterAt = beforeCursor.slice(lastAtIndex);

    const spaceIdx = textAfterAt.indexOf(' ');
    if (spaceIdx !== -1 && !textAfterAt.endsWith(':')) {
      return null;
    }

    let type: MentionType | null = null;
    let query = '';

    const typeMatch = textAfterAt.match(/^@(\w+):/);
    if (typeMatch) {
      const possibleType = typeMatch[1] as MentionType;
      if (MENTION_TYPES.includes(possibleType)) {
        type = possibleType;
        query = textAfterAt.slice(typeMatch[0].length);
      }
    }

    // Check aliases
    if (!type) {
      for (const [alias, mentionType] of Object.entries(MENTION_ALIASES)) {
        if (textAfterAt.startsWith(alias)) {
          type = mentionType;
          query = textAfterAt.slice(alias.length);
          break;
        }
      }
    }

    if (!type) {
      query = textAfterAt.slice(1);
    }

    return { query, type, startIndex: lastAtIndex, isComplete: false };
  }

  // ============ Display Names ============

  private getDisplayName(type: MentionType, value: string): string {
    switch (type) {
      case 'file': return path.basename(value) || value;
      case 'folder': return path.basename(value) || value;
      case 'symbol': return value.split('.').pop() || value;
      case 'docs': return value;
      case 'web': return value ? (value.length > 30 ? value.slice(0, 30) + '...' : value) : 'Web Search';
      case 'mcp': return value ? `MCP: ${value}` : 'MCP Tools';
      case 'notepad': return value ? `Notepad: ${value}` : 'Notepads';
      case 'skill': return value ? `Skill: ${value}` : 'Skills';
      case 'codebase': return value ? `Codebase: ${value}` : 'Entire Codebase';
      case 'selection': return 'Current Selection';
      case 'terminal': return 'Terminal Output';
      case 'git': return value ? `Git: ${value}` : 'Git Changes';
      case 'problems': return 'Current Problems';
      default: return value;
    }
  }

  // ============ Validation ============

  private validateMention(mention: Mention): boolean {
    switch (mention.type) {
      case 'file':
      case 'folder':
      case 'symbol':
      case 'docs':
        return mention.value.length > 0;
      // @web, @mcp, @notepad, @skill accept empty value
      case 'web':
      case 'mcp':
      case 'notepad':
      case 'skill':
        return true;
      case 'codebase':
      case 'selection':
      case 'terminal':
      case 'problems':
      case 'git':
        return true;
      default:
        return false;
    }
  }

  // ============ Advanced Resolution (uses new services) ============

  private async resolveMentionAdvanced(mention: Mention, maxTokens: number): Promise<ResolvedMention> {
    try {
      switch (mention.type) {
        case 'file':
          return this.resolveFileAdvanced(mention.value, maxTokens);
        case 'folder':
          return this.resolveFolderAdvanced(mention.value, maxTokens);
        case 'symbol':
          return this.resolveSymbolAdvanced(mention.value, maxTokens);
        case 'selection':
          return this.resolveSelectionAdvanced(maxTokens);
        case 'problems':
          return this.resolveProblemsAdvanced(maxTokens);
        case 'git':
          return this.resolveGitAdvanced(mention.value, maxTokens);
        case 'terminal':
          return { type: 'terminal', content: '[Terminal output capture pending]', tokens: 10 };
        case 'codebase':
        case 'docs':
          return { type: mention.type, content: mention.value, tokens: tokenCounter.quickEstimate(mention.value) };
        case 'web':
          // Resolution happens in MentionProvider via WebMentionHandler — fall through with placeholder
          return { type: 'web', content: `[Pending web search: ${mention.value || '(query from message)'}]`, tokens: 10 };
        case 'mcp':
          return { type: 'mcp', content: `[MCP tool reference: ${mention.value || 'all tools'}]`, tokens: 10 };
        case 'notepad':
          // Resolved by MentionProvider via NotepadManager
          return { type: 'notepad', content: `[Notepad: ${mention.value || 'list'}]`, tokens: 10 };
        case 'skill':
          return { type: 'skill', content: `[Skill: ${mention.value || 'list'}]`, tokens: 10 };
        default:
          return { type: mention.type, error: `Unknown mention type: ${mention.type}`, tokens: 0 };
      }
    } catch (error) {
      Logger.error(`Failed to resolve mention: ${mention.raw}`, error);
      return { type: mention.type, error: error instanceof Error ? error.message : 'Resolution failed', tokens: 0 };
    }
  }

  private async resolveFileAdvanced(filePath: string, maxTokens: number): Promise<ResolvedMention> {
    const file = await contentFetcher.fetchFile(filePath, { maxTokens });
    if (!file) {
      return { type: 'file', error: `File not found: ${filePath}`, tokens: 0 };
    }
    return {
      type: 'file',
      content: file.content,
      tokens: file.tokens,
      truncated: file.truncated,
      metadata: { path: file.relativePath, language: file.language, lineCount: file.metadata.lineCount },
    };
  }

  private async resolveFolderAdvanced(folderPath: string, maxTokens: number): Promise<ResolvedMention> {
    const tree = await folderTreeGenerator.generateTree(folderPath, { maxDepth: 3, includeMetadata: true });
    if (!tree) {
      return { type: 'folder', error: `Folder not found: ${folderPath}`, tokens: 0 };
    }
    const stats = folderTreeGenerator.getStats(tree);
    const formatted = folderTreeGenerator.formatForPrompt(tree, 100);
    const result = tokenCounter.truncateToFit(formatted, maxTokens);
    return {
      type: 'folder',
      content: result.content,
      tokens: result.tokens,
      truncated: result.truncated,
      metadata: { path: tree.relativePath, fileCount: stats.totalFiles },
    };
  }

  private async resolveSymbolAdvanced(symbolName: string, maxTokens: number): Promise<ResolvedMention> {
    const symbol = await symbolExtractor.findByName(symbolName, {
      includeContent: true,
      includeDocumentation: true,
      maxTokensPerSymbol: maxTokens,
    });
    if (!symbol) {
      return { type: 'symbol', error: `Symbol not found: ${symbolName}`, tokens: 0 };
    }
    const content = symbolExtractor.formatForPrompt(symbol);
    return {
      type: 'symbol',
      content,
      tokens: tokenCounter.quickEstimate(content),
      metadata: { path: symbol.relativePath, symbolKind: symbol.kind },
    };
  }

  private resolveSelectionAdvanced(maxTokens: number): ResolvedMention {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return { type: 'selection', error: 'No active selection', tokens: 0 };
    }
    const text = editor.document.getText(editor.selection);
    const result = tokenCounter.truncateToFit(text, maxTokens);
    return {
      type: 'selection',
      content: result.content,
      tokens: result.tokens,
      truncated: result.truncated,
      metadata: {
        file: vscode.workspace.asRelativePath(editor.document.uri),
        startLine: editor.selection.start.line + 1,
        endLine: editor.selection.end.line + 1,
        language: editor.document.languageId,
      },
    };
  }

  private resolveProblemsAdvanced(maxTokens: number): ResolvedMention {
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
    const content = problems.length > 0 ? problems.slice(0, 50).join('\n') : 'No problems found';
    const result = tokenCounter.truncateToFit(content, maxTokens);
    return { type: 'problems', content: result.content, tokens: result.tokens, truncated: result.truncated };
  }

  private async resolveGitAdvanced(subCommand: string, maxTokens: number): Promise<ResolvedMention> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) { return { type: 'git', error: 'Git extension not available', tokens: 0 }; }
      const git = gitExtension.exports;
      const api = git.getAPI(1);
      if (!api || api.repositories.length === 0) { return { type: 'git', error: 'No git repository', tokens: 0 }; }

      const repo = api.repositories[0];
      let content: string;

      switch (subCommand || 'diff') {
        case 'diff': {
          const files = repo.state.workingTreeChanges.map((c: { uri: vscode.Uri }) => vscode.workspace.asRelativePath(c.uri));
          content = `Changed files (${files.length}):\n${files.join('\n') || 'No changes'}`;
          break;
        }
        case 'staged': {
          const files = repo.state.indexChanges.map((c: { uri: vscode.Uri }) => vscode.workspace.asRelativePath(c.uri));
          content = `Staged files (${files.length}):\n${files.join('\n') || 'Nothing staged'}`;
          break;
        }
        case 'branch': {
          content = `Current branch: ${repo.state.HEAD?.name || 'HEAD'}`;
          break;
        }
        default:
          content = `Unknown git command: ${subCommand}`;
      }

      const result = tokenCounter.truncateToFit(content, maxTokens);
      return { type: 'git', content: result.content, tokens: result.tokens, truncated: result.truncated };
    } catch {
      return { type: 'git', error: 'Failed to get git info', tokens: 0 };
    }
  }

  // ============ Prompt Formatting ============

  formatMentionForPrompt(mention: Mention): string {
    if (!mention.resolved) {
      return `[Unresolved: ${mention.raw}]`;
    }
    if (mention.resolved.error) {
      return `[Error: ${mention.resolved.error}]`;
    }

    const content = mention.resolved.content || '[Content unavailable]';

    switch (mention.type) {
      case 'file':
        return `<file path="${mention.value}">\n${content}\n</file>`;
      case 'folder':
        return `<folder path="${mention.value}">\n${content}\n</folder>`;
      case 'symbol':
        return `<symbol name="${mention.value}">\n${content}\n</symbol>`;
      case 'docs':
        return `<documentation topic="${mention.value}">\n${content}\n</documentation>`;
      case 'web':
        return `<web_search query="${mention.value || ''}">\n${content}\n</web_search>`;
      case 'mcp':
        return `<mcp_tools server="${mention.value || 'all'}">\n${content}\n</mcp_tools>`;
      case 'notepad':
        return `<notepad name="${mention.value || 'all'}">\n${content}\n</notepad>`;
      case 'skill':
        return `<skill slug="${mention.value || 'all'}">\n${content}\n</skill>`;
      case 'codebase':
        return `<codebase_search query="${mention.value || 'relevant context'}">\n${content}\n</codebase_search>`;
      case 'selection':
        return `<selection>\n${content}\n</selection>`;
      case 'terminal':
        return `<terminal_output>\n${content}\n</terminal_output>`;
      case 'git':
        return `<git_context type="${mention.value || 'changes'}">\n${content}\n</git_context>`;
      case 'problems':
        return `<problems>\n${content}\n</problems>`;
      default:
        return content;
    }
  }

  /**
   * Format all resolved mentions for prompt injection
   */
  formatMentionsForPrompt(mentions: Mention[]): string {
    return mentions
      .filter(m => m.resolved && !m.resolved.error)
      .map(m => this.formatMentionForPrompt(m))
      .join('\n\n');
  }

  /**
   * Get combined token count for all resolved mentions
   */
  getTotalMentionTokens(mentions: Mention[]): number {
    return mentions.reduce((sum, m) => sum + (m.tokens || 0), 0);
  }
}

// ============ Singleton Export ============

export const mentionParser = new MentionParser();
