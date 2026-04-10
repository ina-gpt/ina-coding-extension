import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

// ============ Types ============

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  context?: MessageContext;
  metadata?: MessageMetadata;
}

export interface MessageContext {
  file?: string;
  selection?: {
    startLine: number;
    endLine: number;
    text: string;
  };
  language?: string;
  referencedFiles?: string[];
  workspaceFolder?: string;
}

export interface MessageMetadata {
  model?: string;
  tokens?: number;
  duration?: number;
  edited?: boolean;
  editedAt?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  metadata: ConversationMetadata;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
}

export interface ConversationMetadata {
  messageCount: number;
  totalTokens: number;
  lastModel?: string;
  workspaceFolder?: string;
  branch?: string;
}

export interface SearchResult {
  conversation: Conversation;
  matches: SearchMatch[];
  score: number;
}

export interface SearchMatch {
  messageId: string;
  messageIndex: number;
  content: string;
  highlight: string;
  role: 'user' | 'assistant';
}

export interface HistoryStats {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  oldestConversation: number | null;
  newestConversation: number | null;
  storageSize: number;
}

export interface ExportOptions {
  format: 'json' | 'markdown' | 'html';
  includeMetadata: boolean;
  includeContext: boolean;
  dateRange?: { start: number; end: number };
  conversationIds?: string[];
}

export interface SyncStatus {
  lastSyncAt: number | null;
  pendingChanges: number;
  isSyncing: boolean;
  error: string | null;
}

// ============ Storage Keys ============

const STORAGE_KEYS = {
  CONVERSATIONS: 'inaCoding.conversations',
  CURRENT_ID: 'inaCoding.currentConversationId',
  SYNC_STATUS: 'inaCoding.syncStatus',
  SETTINGS: 'inaCoding.historySettings',
};

const LIMITS = {
  MAX_CONVERSATIONS: 100,
  MAX_MESSAGES_PER_CONVERSATION: 200,
  MAX_STORAGE_MB: 50,
  AUTO_ARCHIVE_DAYS: 30,
};

// ============ History Manager Class ============

export class HistoryManager {
  private context: vscode.ExtensionContext;
  private conversations: Map<string, Conversation> = new Map();
  private currentConversationId: string | null = null;
  private syncStatus: SyncStatus = {
    lastSyncAt: null,
    pendingChanges: 0,
    isSyncing: false,
    error: null,
  };
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private changeListeners: Set<(event: HistoryEvent) => void> = new Set();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadFromStorage();
  }

  // ============ Initialization ============

  private loadFromStorage(): void {
    try {
      const conversationsJson = this.context.globalState.get<string>(STORAGE_KEYS.CONVERSATIONS);
      if (conversationsJson) {
        const parsed = JSON.parse(conversationsJson) as Conversation[];
        parsed.forEach(conv => {
          this.conversations.set(conv.id, conv);
        });
      }

      this.currentConversationId = this.context.globalState.get<string>(STORAGE_KEYS.CURRENT_ID) || null;

      const syncJson = this.context.globalState.get<string>(STORAGE_KEYS.SYNC_STATUS);
      if (syncJson) {
        this.syncStatus = JSON.parse(syncJson);
      }

      Logger.info(`Loaded ${this.conversations.size} conversations from storage`);
    } catch (error) {
      Logger.error('Failed to load history from storage:', error);
      this.conversations = new Map();
      this.currentConversationId = null;
    }
  }

  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.saveToStorage();
    }, 1000);
  }

  private readonly MAX_STORED_CONVERSATIONS = 50;
  private readonly MAX_STORED_MESSAGES = 100;

  private async saveToStorage(): Promise<void> {
    try {
      const conversationsArray = Array.from(this.conversations.values())
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, this.MAX_STORED_CONVERSATIONS)
        .map(conv => ({
          ...conv,
          messages: conv.messages.slice(-this.MAX_STORED_MESSAGES),
        }));

      await this.context.globalState.update(
        STORAGE_KEYS.CONVERSATIONS,
        JSON.stringify(conversationsArray)
      );

      await this.context.globalState.update(
        STORAGE_KEYS.CURRENT_ID,
        this.currentConversationId
      );

      await this.context.globalState.update(
        STORAGE_KEYS.SYNC_STATUS,
        JSON.stringify(this.syncStatus)
      );

      Logger.debug(`Saved ${conversationsArray.length} conversations`);
    } catch (error) {
      Logger.error('Failed to save history:', error);
    }
  }

  // ============ Conversation CRUD ============

  createConversation(title?: string, metadata?: Partial<ConversationMetadata>): Conversation {
    const id = this.generateId();
    const now = Date.now();

    const conversation: Conversation = {
      id,
      title: title || 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: {
        messageCount: 0,
        totalTokens: 0,
        workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.name,
        ...metadata,
      },
      pinned: false,
      archived: false,
    };

    this.conversations.set(id, conversation);
    this.currentConversationId = id;
    this.trimConversations();
    this.scheduleSave();
    this.emitEvent({ type: 'created', conversationId: id });

    Logger.debug(`Created conversation: ${id}`);
    return conversation;
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  getCurrentConversation(): Conversation | null {
    if (!this.currentConversationId) return null;
    return this.conversations.get(this.currentConversationId) || null;
  }

  getOrCreateCurrentConversation(): Conversation {
    const current = this.getCurrentConversation();
    if (current) return current;
    return this.createConversation();
  }

  updateConversation(id: string, updates: Partial<Omit<Conversation, 'id' | 'createdAt'>>): void {
    const conversation = this.conversations.get(id);
    if (!conversation) {
      Logger.warn(`Conversation not found: ${id}`);
      return;
    }

    Object.assign(conversation, updates, { updatedAt: Date.now() });

    if (updates.messages) {
      conversation.metadata.messageCount = updates.messages.length;
    }

    this.scheduleSave();
    this.emitEvent({ type: 'updated', conversationId: id });
  }

  deleteConversation(id: string): boolean {
    if (!this.conversations.has(id)) return false;

    this.conversations.delete(id);

    if (this.currentConversationId === id) {
      const sorted = this.getRecentConversations(1);
      this.currentConversationId = sorted[0]?.id || null;
    }

    this.scheduleSave();
    this.emitEvent({ type: 'deleted', conversationId: id });

    Logger.debug(`Deleted conversation: ${id}`);
    return true;
  }

  setCurrentConversation(id: string | null): void {
    if (id && !this.conversations.has(id)) {
      Logger.warn(`Conversation not found: ${id}`);
      return;
    }

    this.currentConversationId = id;
    this.scheduleSave();
    this.emitEvent({ type: 'switched', conversationId: id });
  }

  // ============ Message Operations ============

  addMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const fullMessage: ChatMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    conversation.messages.push(fullMessage);
    conversation.updatedAt = Date.now();
    conversation.metadata.messageCount = conversation.messages.length;

    if (fullMessage.metadata?.tokens) {
      conversation.metadata.totalTokens += fullMessage.metadata.tokens;
    }

    // Auto-generate title from first user message
    if (conversation.messages.length === 1 && message.role === 'user') {
      conversation.title = this.generateTitle(message.content);
    }

    // Trim messages if too many
    if (conversation.messages.length > LIMITS.MAX_MESSAGES_PER_CONVERSATION) {
      conversation.messages = conversation.messages.slice(-LIMITS.MAX_MESSAGES_PER_CONVERSATION);
    }

    this.scheduleSave();
    this.emitEvent({ type: 'messageAdded', conversationId, messageId: fullMessage.id });

    return fullMessage;
  }

  updateMessage(conversationId: string, messageId: string, updates: Partial<ChatMessage>): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    conversation.messages[messageIndex] = {
      ...conversation.messages[messageIndex],
      ...updates,
      metadata: {
        ...conversation.messages[messageIndex].metadata,
        edited: true,
        editedAt: Date.now(),
      },
    };

    conversation.updatedAt = Date.now();
    this.scheduleSave();
    this.emitEvent({ type: 'messageUpdated', conversationId, messageId });
  }

  deleteMessage(conversationId: string, messageId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.messages = conversation.messages.filter(m => m.id !== messageId);
    conversation.metadata.messageCount = conversation.messages.length;
    conversation.updatedAt = Date.now();

    this.scheduleSave();
    this.emitEvent({ type: 'messageDeleted', conversationId, messageId });
  }

  // ============ Query Operations ============

  getRecentConversations(limit: number = 20, includeArchived: boolean = false): Conversation[] {
    return Array.from(this.conversations.values())
      .filter(c => includeArchived || !c.archived)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, limit);
  }

  getConversationsByDate(startDate: number, endDate: number): Conversation[] {
    return Array.from(this.conversations.values())
      .filter(c => c.createdAt >= startDate && c.createdAt <= endDate)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getPinnedConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .filter(c => c.pinned)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getArchivedConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .filter(c => c.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ============ Search ============

  search(query: string, options: { limit?: number; includeArchived?: boolean } = {}): SearchResult[] {
    const { limit = 20, includeArchived = false } = options;
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery) return [];

    const results: SearchResult[] = [];
    const queryWords = normalizedQuery.split(/\s+/);

    for (const conversation of this.conversations.values()) {
      if (!includeArchived && conversation.archived) continue;

      const matches: SearchMatch[] = [];
      let totalScore = 0;

      // Search in title
      if (conversation.title.toLowerCase().includes(normalizedQuery)) {
        totalScore += 10;
      }

      // Search in messages
      conversation.messages.forEach((message, index) => {
        const contentLower = message.content.toLowerCase();

        const wordMatches = queryWords.filter(word => contentLower.includes(word));
        if (wordMatches.length === 0) return;

        const score = wordMatches.length / queryWords.length;
        totalScore += score * 5;

        const highlight = this.createHighlight(message.content, queryWords);

        matches.push({
          messageId: message.id,
          messageIndex: index,
          content: message.content.substring(0, 200),
          highlight,
          role: message.role as 'user' | 'assistant',
        });
      });

      if (matches.length > 0 || totalScore > 0) {
        results.push({
          conversation,
          matches: matches.slice(0, 3),
          score: totalScore,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private createHighlight(content: string, queryWords: string[]): string {
    const contentLower = content.toLowerCase();

    let firstIndex = content.length;
    for (const word of queryWords) {
      const index = contentLower.indexOf(word);
      if (index !== -1 && index < firstIndex) {
        firstIndex = index;
      }
    }

    const snippetStart = Math.max(0, firstIndex - 50);
    const snippetEnd = Math.min(content.length, firstIndex + 150);
    let result = content.substring(snippetStart, snippetEnd);

    if (snippetStart > 0) result = '...' + result;
    if (snippetEnd < content.length) result = result + '...';

    for (const word of queryWords) {
      const regex = new RegExp(`(${this.escapeRegex(word)})`, 'gi');
      result = result.replace(regex, '**$1**');
    }

    return result;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ============ Pin/Archive ============

  togglePin(id: string): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    conversation.pinned = !conversation.pinned;
    conversation.updatedAt = Date.now();
    this.scheduleSave();
    this.emitEvent({ type: 'updated', conversationId: id });
  }

  toggleArchive(id: string): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    conversation.archived = !conversation.archived;
    if (conversation.archived) {
      conversation.pinned = false;
    }
    conversation.updatedAt = Date.now();
    this.scheduleSave();
    this.emitEvent({ type: 'updated', conversationId: id });
  }

  // ============ Tags ============

  addTag(id: string, tag: string): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    if (!conversation.tags) {
      conversation.tags = [];
    }

    if (!conversation.tags.includes(tag)) {
      conversation.tags.push(tag);
      conversation.updatedAt = Date.now();
      this.scheduleSave();
      this.emitEvent({ type: 'updated', conversationId: id });
    }
  }

  removeTag(id: string, tag: string): void {
    const conversation = this.conversations.get(id);
    if (!conversation || !conversation.tags) return;

    conversation.tags = conversation.tags.filter(t => t !== tag);
    conversation.updatedAt = Date.now();
    this.scheduleSave();
    this.emitEvent({ type: 'updated', conversationId: id });
  }

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const conversation of this.conversations.values()) {
      conversation.tags?.forEach(tag => tags.add(tag));
    }
    return Array.from(tags).sort();
  }

  // ============ Export ============

  async export(options: ExportOptions): Promise<string> {
    let conversations = Array.from(this.conversations.values());

    if (options.conversationIds?.length) {
      conversations = conversations.filter(c => options.conversationIds!.includes(c.id));
    }

    if (options.dateRange) {
      conversations = conversations.filter(
        c => c.createdAt >= options.dateRange!.start && c.createdAt <= options.dateRange!.end
      );
    }

    switch (options.format) {
      case 'json':
        return this.exportToJson(conversations, options);
      case 'markdown':
        return this.exportToMarkdown(conversations, options);
      case 'html':
        return this.exportToHtml(conversations, options);
      default:
        throw new Error(`Unknown export format: ${options.format}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private exportToJson(conversations: Conversation[], options: ExportOptions): string {
    const data = conversations.map(conv => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exported: any = {
        id: conv.id,
        title: conv.title,
        createdAt: new Date(conv.createdAt).toISOString(),
        updatedAt: new Date(conv.updatedAt).toISOString(),
        messages: conv.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp).toISOString(),
          ...(options.includeContext && msg.context ? { context: msg.context } : {}),
          ...(options.includeMetadata && msg.metadata ? { metadata: msg.metadata } : {}),
        })),
      };

      if (options.includeMetadata) {
        exported.metadata = conv.metadata;
        exported.tags = conv.tags;
      }

      return exported;
    });

    return JSON.stringify(data, null, 2);
  }

  private exportToMarkdown(conversations: Conversation[], options: ExportOptions): string {
    const lines: string[] = [];
    lines.push('# INA Coding Chat History');
    lines.push('');
    lines.push(`Exported: ${new Date().toISOString()}`);
    lines.push(`Total Conversations: ${conversations.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const conv of conversations) {
      lines.push(`## ${conv.title}`);
      lines.push('');
      lines.push(`*Created: ${new Date(conv.createdAt).toLocaleString()}*`);
      if (conv.tags?.length) {
        lines.push(`*Tags: ${conv.tags.join(', ')}*`);
      }
      lines.push('');

      for (const msg of conv.messages) {
        const roleLabel = msg.role === 'user' ? '**You:**' : '**INA:**';
        lines.push(roleLabel);
        lines.push('');
        lines.push(msg.content);
        lines.push('');

        if (options.includeContext && msg.context?.file) {
          lines.push(`> Context: ${msg.context.file}`);
          lines.push('');
        }
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  private exportToHtml(conversations: Conversation[], _options: ExportOptions): string {
    const html: string[] = [];
    html.push('<!DOCTYPE html>');
    html.push('<html lang="en">');
    html.push('<head>');
    html.push('<meta charset="UTF-8">');
    html.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    html.push('<title>INA Coding Chat History</title>');
    html.push('<style>');
    html.push(`
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
      h1 { border-bottom: 1px solid #444; padding-bottom: 10px; }
      .conversation { margin-bottom: 40px; border: 1px solid #333; border-radius: 8px; overflow: hidden; }
      .conv-header { background: #252526; padding: 12px 16px; border-bottom: 1px solid #333; }
      .conv-title { font-size: 18px; font-weight: 600; margin: 0; }
      .conv-meta { font-size: 12px; color: #888; margin-top: 4px; }
      .messages { padding: 16px; }
      .message { margin-bottom: 16px; padding: 12px; border-radius: 8px; }
      .message.user { background: #264f78; margin-left: 40px; }
      .message.assistant { background: #2d2d2d; margin-right: 40px; }
      .message-role { font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #888; }
      .message-content { white-space: pre-wrap; line-height: 1.5; }
      pre { background: #1a1a1a; padding: 12px; border-radius: 4px; overflow-x: auto; }
      code { font-family: 'Fira Code', Consolas, monospace; }
    `);
    html.push('</style>');
    html.push('</head>');
    html.push('<body>');
    html.push('<h1>INA Coding Chat History</h1>');
    html.push(`<p>Exported: ${new Date().toLocaleString()} | Conversations: ${conversations.length}</p>`);

    for (const conv of conversations) {
      html.push('<div class="conversation">');
      html.push('<div class="conv-header">');
      html.push(`<h2 class="conv-title">${this.escapeHtml(conv.title)}</h2>`);
      html.push(`<div class="conv-meta">${new Date(conv.createdAt).toLocaleString()} | ${conv.messages.length} messages</div>`);
      html.push('</div>');
      html.push('<div class="messages">');

      for (const msg of conv.messages) {
        html.push(`<div class="message ${msg.role}">`);
        html.push(`<div class="message-role">${msg.role === 'user' ? 'You' : 'INA'}</div>`);
        html.push(`<div class="message-content">${this.formatHtmlContent(msg.content)}</div>`);
        html.push('</div>');
      }

      html.push('</div>');
      html.push('</div>');
    }

    html.push('</body>');
    html.push('</html>');

    return html.join('\n');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private formatHtmlContent(content: string): string {
    let result = this.escapeHtml(content);
    result = result.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return result;
  }

  // ============ Import ============

  async import(content: string, _format: 'json'): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        return { imported: 0, errors: ['Invalid format: expected array'] };
      }

      for (const item of data) {
        if (!this.validateConversation(item)) {
          errors.push(`Invalid conversation: ${item.id || 'unknown'}`);
          continue;
        }

        if (this.conversations.has(item.id)) {
          item.id = this.generateId();
        }

        this.conversations.set(item.id, item);
        imported++;
      }

      this.trimConversations();
      this.scheduleSave();

      return { imported, errors };
    } catch (error) {
      return { imported: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
    }
  }

  private validateConversation(item: unknown): item is Conversation {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      typeof obj.title === 'string' &&
      Array.isArray(obj.messages) &&
      typeof obj.createdAt === 'number' &&
      typeof obj.updatedAt === 'number'
    );
  }

  // ============ Statistics ============

  getStats(): HistoryStats {
    let totalMessages = 0;
    let totalTokens = 0;
    let oldestConversation: number | null = null;
    let newestConversation: number | null = null;

    for (const conv of this.conversations.values()) {
      totalMessages += conv.messages.length;
      totalTokens += conv.metadata.totalTokens || 0;

      if (!oldestConversation || conv.createdAt < oldestConversation) {
        oldestConversation = conv.createdAt;
      }
      if (!newestConversation || conv.createdAt > newestConversation) {
        newestConversation = conv.createdAt;
      }
    }

    const storageSize = Buffer.byteLength(JSON.stringify(Array.from(this.conversations.values())), 'utf8');

    return {
      totalConversations: this.conversations.size,
      totalMessages,
      totalTokens,
      oldestConversation,
      newestConversation,
      storageSize,
    };
  }

  // ============ Cleanup ============

  clearAll(): void {
    this.conversations.clear();
    this.currentConversationId = null;
    this.scheduleSave();
    this.emitEvent({ type: 'cleared' });
    Logger.info('All history cleared');
  }

  clearOld(daysOld: number): number {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let deleted = 0;

    for (const [id, conv] of this.conversations) {
      if (conv.updatedAt < cutoff && !conv.pinned) {
        this.conversations.delete(id);
        deleted++;
      }
    }

    if (this.currentConversationId && !this.conversations.has(this.currentConversationId)) {
      this.currentConversationId = null;
    }

    this.scheduleSave();
    Logger.info(`Cleared ${deleted} old conversations`);

    return deleted;
  }

  // For backward compatibility with ChatService interface
  clearChat(id: string): void {
    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.messages = [];
      conversation.metadata.messageCount = 0;
      conversation.updatedAt = Date.now();
      this.scheduleSave();
      this.emitEvent({ type: 'updated', conversationId: id });
    }
  }

  private trimConversations(): void {
    if (this.conversations.size <= LIMITS.MAX_CONVERSATIONS) return;

    const sorted = Array.from(this.conversations.entries())
      .sort((a, b) => {
        if (a[1].pinned && !b[1].pinned) return -1;
        if (!a[1].pinned && b[1].pinned) return 1;
        return b[1].updatedAt - a[1].updatedAt;
      });

    while (sorted.length > LIMITS.MAX_CONVERSATIONS) {
      const [id] = sorted.pop()!;
      this.conversations.delete(id);
    }
  }

  // ============ Utilities ============

  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTitle(content: string): string {
    const cleaned = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length <= 50) return cleaned;

    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 30
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  // ============ Event System ============

  private emitEvent(event: HistoryEvent): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        Logger.error('History event listener error:', error);
      }
    });
  }

  onChange(callback: (event: HistoryEvent) => void): vscode.Disposable {
    this.changeListeners.add(callback);
    return {
      dispose: () => {
        this.changeListeners.delete(callback);
      },
    };
  }

  // ============ Sync (Optional) ============

  async syncToServer(): Promise<boolean> {
    if (!ConfigManager.get('sync.enabled', false)) {
      return false;
    }

    this.syncStatus.isSyncing = true;
    this.syncStatus.error = null;

    try {
      this.syncStatus.lastSyncAt = Date.now();
      this.syncStatus.pendingChanges = 0;
      this.scheduleSave();

      return true;
    } catch (error) {
      this.syncStatus.error = error instanceof Error ? error.message : 'Sync failed';
      return false;
    } finally {
      this.syncStatus.isSyncing = false;
    }
  }

  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  // ============ Dispose ============

  dispose(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveToStorage();
    }
    this.changeListeners.clear();
  }
}

// ============ Event Types ============

export type HistoryEvent =
  | { type: 'created'; conversationId: string }
  | { type: 'updated'; conversationId: string }
  | { type: 'deleted'; conversationId: string }
  | { type: 'switched'; conversationId: string | null }
  | { type: 'messageAdded'; conversationId: string; messageId: string }
  | { type: 'messageUpdated'; conversationId: string; messageId: string }
  | { type: 'messageDeleted'; conversationId: string; messageId: string }
  | { type: 'cleared' };
