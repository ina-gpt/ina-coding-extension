import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  context?: MessageContext;
}

export interface MessageContext {
  file?: string;
  selection?: { startLine: number; endLine: number; text: string };
  language?: string;
  referencedFiles?: string[];
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const MAX_HISTORY = 50;
const MAX_MESSAGES = 100;

export class ChatService {
  private context: vscode.ExtensionContext;
  private _history: ChatHistoryItem[] = [];
  private _currentChatId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.load();
  }

  get history(): ChatHistoryItem[] { return this._history; }
  get currentChatId(): string | null { return this._currentChatId; }

  createChat(title?: string): ChatHistoryItem {
    const chat: ChatHistoryItem = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title || 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this._history.unshift(chat);
    this._currentChatId = chat.id;
    this.trim();
    this.scheduleSave();
    return chat;
  }

  getChat(id: string): ChatHistoryItem | undefined {
    return this._history.find(c => c.id === id);
  }

  getCurrentChat(): ChatHistoryItem | null {
    return this._currentChatId ? this.getChat(this._currentChatId) || null : null;
  }

  getOrCreateCurrentChat(): ChatHistoryItem {
    return this.getCurrentChat() || this.createChat();
  }

  updateChat(id: string, updates: Partial<Omit<ChatHistoryItem, 'id' | 'createdAt'>>): void {
    const idx = this._history.findIndex(c => c.id === id);
    if (idx === -1) { return; }
    this._history[idx] = { ...this._history[idx], ...updates, updatedAt: Date.now() };
    if (this._history[idx].messages.length > MAX_MESSAGES) {
      this._history[idx].messages = this._history[idx].messages.slice(-MAX_MESSAGES);
    }
    this.scheduleSave();
  }

  deleteChat(id: string): void {
    this._history = this._history.filter(c => c.id !== id);
    if (this._currentChatId === id) { this._currentChatId = this._history[0]?.id || null; }
    this.scheduleSave();
  }

  setCurrentChat(id: string | null): void {
    this._currentChatId = id;
    this.scheduleSave();
  }

  addMessage(chatId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const chat = this.getChat(chatId);
    if (!chat) { throw new Error(`Chat not found: ${chatId}`); }
    const full: ChatMessage = { ...message, id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, timestamp: Date.now() };
    chat.messages.push(full);
    chat.updatedAt = Date.now();
    if (chat.messages.length === 1 && message.role === 'user') {
      const clean = message.content.replace(/```[\s\S]*?```/g, '').replace(/\n+/g, ' ').trim();
      chat.title = clean.length <= 40 ? clean : clean.substring(0, 40) + '...';
    }
    this.scheduleSave();
    return full;
  }

  clearHistory(): void {
    this._history = [];
    this._currentChatId = null;
    this.scheduleSave();
  }

  clearChat(id: string): void {
    const chat = this.getChat(id);
    if (chat) { chat.messages = []; chat.updatedAt = Date.now(); this.scheduleSave(); }
  }

  searchChats(query: string): ChatHistoryItem[] {
    const q = query.toLowerCase().trim();
    if (!q) { return this._history; }
    return this._history.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
    );
  }

  exportHistory(): string { return JSON.stringify(this._history, null, 2); }

  private load(): void {
    try {
      const json = this.context.globalState.get<string>('inaCoding.chatHistory');
      if (json) { this._history = JSON.parse(json); }
      this._currentChatId = this.context.globalState.get<string>('inaCoding.currentChatId') || null;
    } catch (error) {
      Logger.error('Failed to load chat history:', error);
      this._history = [];
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); }
    this.saveTimer = setTimeout(() => this.save(), 1000);
  }

  private async save(): Promise<void> {
    try {
      await this.context.globalState.update('inaCoding.chatHistory', JSON.stringify(this._history));
      await this.context.globalState.update('inaCoding.currentChatId', this._currentChatId);
    } catch (error) { Logger.error('Failed to save chat history:', error); }
  }

  private trim(): void {
    if (this._history.length > MAX_HISTORY) { this._history = this._history.slice(0, MAX_HISTORY); }
  }

  dispose(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.save(); }
  }
}
