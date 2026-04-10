import * as vscode from 'vscode';
import { Logger } from './Logger';

const CONFIG_SECTION = 'inaCoding';

// ============ INA Model Branding ============

const INA_MODEL_MAP: Record<string, string> = {
  'INA-7 Pro': 'qwen2.5-coder:32b',
  'INA-7': 'qwen2.5-coder:14b',
  'INA-7 Lite': 'qwen2.5-coder:7b',
  'INA-6.2 Pro': 'qwen3:14b',
  'INA-6.2': 'qwen3:8b',
  'INA Embed': 'nomic-embed-text',
  'INA Embed Large': 'mxbai-embed-large',
  'INA Embed Mini': 'all-minilm',
  'INA Vision': 'qwen2.5vl:7b',
};

const REVERSE_MODEL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(INA_MODEL_MAP).map(([k, v]) => [v, k])
);

// ============ Type Definitions ============

export interface GeneralConfig { enabled: boolean; language: string; }
export interface ApiConfig { endpoint: string; timeout: number; retryAttempts: number; }
export interface ModelsConfig { chat: string; customChat: string; completion: string; customCompletion: string; embedding: string; }
export interface ChatConfig { temperature: number; maxTokens: number; contextLines: number; includeImports: boolean; includeRecentFiles: number; systemPrompt: string; }
export interface CompletionConfig { enabled: boolean; delay: number; maxTokens: number; temperature: number; disabledLanguages: string[]; }
export interface InlineEditConfig { enabled: boolean; showDiff: boolean; autoApply: boolean; keepHistory: boolean; historySize: number; }
export interface IndexingConfig { enabled: boolean; autoIndex: boolean; watchFiles: boolean; excludePatterns: string[]; includeExtensions: string[]; maxFileSize: number; chunkSize: number; }
export interface PrivacyConfig { telemetry: 'off' | 'errors' | 'anonymous' | 'full'; sendCodeToServer: boolean; storeConversations: boolean; clearDataOnExit: boolean; excludeFromContext: string[]; }
export interface UIConfig { theme: 'auto' | 'light' | 'dark' | 'highContrast'; fontSize: number; fontFamily: string; showStatusBar: boolean; compactMode: boolean; showAvatars: boolean; codeBlockTheme: string; }
export interface AdvancedConfig { debug: boolean; experimentalFeatures: boolean; cacheResponses: boolean; cacheTTL: number; maxConcurrentRequests: number; proxyUrl: string; }

export interface FullConfig {
  general: GeneralConfig; api: ApiConfig; models: ModelsConfig; chat: ChatConfig;
  completion: CompletionConfig; inlineEdit: InlineEditConfig; indexing: IndexingConfig;
  privacy: PrivacyConfig; ui: UIConfig; advanced: AdvancedConfig;
}

// ============ Default Values ============

export const CONFIG_DEFAULTS: FullConfig = {
  general: { enabled: true, language: 'auto' },
  api: { endpoint: 'https://coding-api.inagpt.com', timeout: 60000, retryAttempts: 3 },
  models: { chat: 'INA-7 Pro', customChat: '', completion: 'INA-7 Pro', customCompletion: '', embedding: 'INA Embed' },
  chat: { temperature: 0.7, maxTokens: 4096, contextLines: 100, includeImports: true, includeRecentFiles: 3, systemPrompt: '' },
  completion: { enabled: true, delay: 300, maxTokens: 256, temperature: 0.2, disabledLanguages: ['markdown', 'plaintext', 'json', 'yaml'] },
  inlineEdit: { enabled: true, showDiff: true, autoApply: false, keepHistory: true, historySize: 20 },
  indexing: { enabled: true, autoIndex: true, watchFiles: true, excludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**'], includeExtensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs'], maxFileSize: 500, chunkSize: 512 },
  privacy: { telemetry: 'off', sendCodeToServer: true, storeConversations: true, clearDataOnExit: false, excludeFromContext: ['**/.env*', '**/secrets/**'] },
  ui: { theme: 'auto', fontSize: 14, fontFamily: '', showStatusBar: true, compactMode: false, showAvatars: true, codeBlockTheme: 'auto' },
  advanced: { debug: false, experimentalFeatures: false, cacheResponses: true, cacheTTL: 3600, maxConcurrentRequests: 3, proxyUrl: '' },
};

// ============ ConfigManager Class ============

class ConfigManagerClass {
  private disposables: vscode.Disposable[] = [];
  private listeners: Map<string, Set<(value: unknown) => void>> = new Map();
  private cache: Map<string, unknown> = new Map();

  initialize(context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
          this.cache.clear();
          this.notifyListeners(e);
          Logger.debug('Configuration changed');
        }
      })
    );

    if (this.get('advanced.debug', false)) {
      Logger.setLevel('debug');
    }

    context.subscriptions.push({ dispose: () => this.dispose() });
    Logger.info('ConfigManager initialized');
  }

  // ============ Core ============

  get<T>(key: string, defaultValue?: T): T {
    if (this.cache.has(key)) { return this.cache.get(key) as T; }
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const value = config.get<T>(key, defaultValue as T);
    this.cache.set(key, value);
    return value;
  }

  async set<T>(key: string, value: T, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(key, value, target);
    this.cache.delete(key);
  }

  async reset(key: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    this.cache.delete(key);
  }

  // ============ Section Getters ============

  getGeneral(): GeneralConfig {
    return { enabled: this.get('general.enabled', CONFIG_DEFAULTS.general.enabled), language: this.get('general.language', CONFIG_DEFAULTS.general.language) };
  }

  getApi(): ApiConfig {
    return { endpoint: this.get('api.endpoint', CONFIG_DEFAULTS.api.endpoint), timeout: this.get('api.timeout', CONFIG_DEFAULTS.api.timeout), retryAttempts: this.get('api.retryAttempts', CONFIG_DEFAULTS.api.retryAttempts) };
  }

  getModels(): ModelsConfig {
    return {
      chat: this.get('models.chat', CONFIG_DEFAULTS.models.chat), customChat: this.get('models.customChat', CONFIG_DEFAULTS.models.customChat),
      completion: this.get('models.completion', CONFIG_DEFAULTS.models.completion), customCompletion: this.get('models.customCompletion', CONFIG_DEFAULTS.models.customCompletion),
      embedding: this.get('models.embedding', CONFIG_DEFAULTS.models.embedding),
    };
  }

  getChat(): ChatConfig {
    return {
      temperature: this.get('chat.temperature', CONFIG_DEFAULTS.chat.temperature), maxTokens: this.get('chat.maxTokens', CONFIG_DEFAULTS.chat.maxTokens),
      contextLines: this.get('chat.contextLines', CONFIG_DEFAULTS.chat.contextLines), includeImports: this.get('chat.includeImports', CONFIG_DEFAULTS.chat.includeImports),
      includeRecentFiles: this.get('chat.includeRecentFiles', CONFIG_DEFAULTS.chat.includeRecentFiles), systemPrompt: this.get('chat.systemPrompt', CONFIG_DEFAULTS.chat.systemPrompt),
    };
  }

  getCompletion(): CompletionConfig {
    return {
      enabled: this.get('completion.enabled', CONFIG_DEFAULTS.completion.enabled), delay: this.get('completion.delay', CONFIG_DEFAULTS.completion.delay),
      maxTokens: this.get('completion.maxTokens', CONFIG_DEFAULTS.completion.maxTokens), temperature: this.get('completion.temperature', CONFIG_DEFAULTS.completion.temperature),
      disabledLanguages: this.get('completion.disabledLanguages', CONFIG_DEFAULTS.completion.disabledLanguages),
    };
  }

  getInlineEdit(): InlineEditConfig {
    return {
      enabled: this.get('inlineEdit.enabled', CONFIG_DEFAULTS.inlineEdit.enabled), showDiff: this.get('inlineEdit.showDiff', CONFIG_DEFAULTS.inlineEdit.showDiff),
      autoApply: this.get('inlineEdit.autoApply', CONFIG_DEFAULTS.inlineEdit.autoApply), keepHistory: this.get('inlineEdit.keepHistory', CONFIG_DEFAULTS.inlineEdit.keepHistory),
      historySize: this.get('inlineEdit.historySize', CONFIG_DEFAULTS.inlineEdit.historySize),
    };
  }

  getIndexing(): IndexingConfig {
    return {
      enabled: this.get('indexing.enabled', CONFIG_DEFAULTS.indexing.enabled), autoIndex: this.get('indexing.autoIndex', CONFIG_DEFAULTS.indexing.autoIndex),
      watchFiles: this.get('indexing.watchFiles', CONFIG_DEFAULTS.indexing.watchFiles), excludePatterns: this.get('indexing.excludePatterns', CONFIG_DEFAULTS.indexing.excludePatterns),
      includeExtensions: this.get('indexing.includeExtensions', CONFIG_DEFAULTS.indexing.includeExtensions), maxFileSize: this.get('indexing.maxFileSize', CONFIG_DEFAULTS.indexing.maxFileSize),
      chunkSize: this.get('indexing.chunkSize', CONFIG_DEFAULTS.indexing.chunkSize),
    };
  }

  getPrivacy(): PrivacyConfig {
    return {
      telemetry: this.get('privacy.telemetry', CONFIG_DEFAULTS.privacy.telemetry) as PrivacyConfig['telemetry'],
      sendCodeToServer: this.get('privacy.sendCodeToServer', CONFIG_DEFAULTS.privacy.sendCodeToServer),
      storeConversations: this.get('privacy.storeConversations', CONFIG_DEFAULTS.privacy.storeConversations),
      clearDataOnExit: this.get('privacy.clearDataOnExit', CONFIG_DEFAULTS.privacy.clearDataOnExit),
      excludeFromContext: this.get('privacy.excludeFromContext', CONFIG_DEFAULTS.privacy.excludeFromContext),
    };
  }

  getUI(): UIConfig {
    return {
      theme: this.get('ui.theme', CONFIG_DEFAULTS.ui.theme) as UIConfig['theme'], fontSize: this.get('ui.fontSize', CONFIG_DEFAULTS.ui.fontSize),
      fontFamily: this.get('ui.fontFamily', CONFIG_DEFAULTS.ui.fontFamily), showStatusBar: this.get('ui.showStatusBar', CONFIG_DEFAULTS.ui.showStatusBar),
      compactMode: this.get('ui.compactMode', CONFIG_DEFAULTS.ui.compactMode), showAvatars: this.get('ui.showAvatars', CONFIG_DEFAULTS.ui.showAvatars),
      codeBlockTheme: this.get('ui.codeBlockTheme', CONFIG_DEFAULTS.ui.codeBlockTheme),
    };
  }

  getAdvanced(): AdvancedConfig {
    return {
      debug: this.get('advanced.debug', CONFIG_DEFAULTS.advanced.debug), experimentalFeatures: this.get('advanced.experimentalFeatures', CONFIG_DEFAULTS.advanced.experimentalFeatures),
      cacheResponses: this.get('advanced.cacheResponses', CONFIG_DEFAULTS.advanced.cacheResponses), cacheTTL: this.get('advanced.cacheTTL', CONFIG_DEFAULTS.advanced.cacheTTL),
      maxConcurrentRequests: this.get('advanced.maxConcurrentRequests', CONFIG_DEFAULTS.advanced.maxConcurrentRequests), proxyUrl: this.get('advanced.proxyUrl', CONFIG_DEFAULTS.advanced.proxyUrl),
    };
  }

  // ============ Convenience ============

  getAll(): FullConfig {
    return { general: this.getGeneral(), api: this.getApi(), models: this.getModels(), chat: this.getChat(), completion: this.getCompletion(), inlineEdit: this.getInlineEdit(), indexing: this.getIndexing(), privacy: this.getPrivacy(), ui: this.getUI(), advanced: this.getAdvanced() };
  }

  getChatModel(): string {
    const m = this.getModels();
    const selected = m.chat === 'custom' && m.customChat ? m.customChat : m.chat;
    return this.resolveModelName(selected);
  }

  getCompletionModel(): string {
    const m = this.getModels();
    const selected = m.completion === 'custom' && m.customCompletion ? m.customCompletion : m.completion;
    return this.resolveModelName(selected);
  }

  getEmbeddingModel(): string {
    const m = this.getModels();
    return this.resolveModelName(m.embedding);
  }

  /** Translate INA brand name → real model name for API calls */
  resolveModelName(inaName: string): string {
    return INA_MODEL_MAP[inaName] || inaName;
  }

  /** Translate real model name → INA brand name for UI display */
  getDisplayName(realName: string): string {
    return REVERSE_MODEL_MAP[realName] || realName;
  }

  getApiEndpoint(): string { return this.getApi().endpoint; }
  isEnabled(): boolean { return this.getGeneral().enabled; }
  isCompletionEnabled(): boolean { return this.isEnabled() && this.getCompletion().enabled; }
  isIndexingEnabled(): boolean { return this.isEnabled() && this.getIndexing().enabled; }

  getLanguage(): string {
    const lang = this.getGeneral().language;
    return lang === 'auto' ? (vscode.env.language.split('-')[0] || 'en') : lang;
  }

  getEffectiveTheme(): 'light' | 'dark' | 'highContrast' {
    const t = this.getUI().theme;
    if (t !== 'auto') { return t as 'light' | 'dark' | 'highContrast'; }
    const k = vscode.window.activeColorTheme.kind;
    if (k === vscode.ColorThemeKind.Light) { return 'light'; }
    if (k === vscode.ColorThemeKind.HighContrast || k === vscode.ColorThemeKind.HighContrastLight) { return 'highContrast'; }
    return 'dark';
  }

  shouldSendCode(): boolean { return this.getPrivacy().sendCodeToServer; }

  // ============ Change Listeners ============

  onChange(key: string, callback: (value: unknown) => void): vscode.Disposable {
    if (!this.listeners.has(key)) { this.listeners.set(key, new Set()); }
    this.listeners.get(key)!.add(callback);
    return { dispose: () => { this.listeners.get(key)?.delete(callback); } };
  }

  onAnyChange(callback: (value: unknown) => void): vscode.Disposable {
    return this.onChange('*', callback);
  }

  private notifyListeners(e: vscode.ConfigurationChangeEvent) {
    for (const [key, callbacks] of this.listeners) {
      if (key === '*' || e.affectsConfiguration(`${CONFIG_SECTION}.${key}`)) {
        const value = key === '*' ? null : this.get(key);
        callbacks.forEach(cb => { try { cb(value); } catch (err) { Logger.error(`Config listener error for ${key}:`, err); } });
      }
    }
  }

  // ============ Validation ============

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const c = this.getAll();
    try { new URL(c.api.endpoint); } catch { errors.push('Invalid API endpoint URL'); }
    if (c.chat.temperature < 0 || c.chat.temperature > 2) { errors.push('Chat temperature must be between 0 and 2'); }
    if (c.completion.temperature < 0 || c.completion.temperature > 1) { errors.push('Completion temperature must be between 0 and 1'); }
    if (c.chat.maxTokens < 256) { errors.push('Chat max tokens must be at least 256'); }
    if (c.completion.delay < 50) { errors.push('Completion delay must be at least 50ms'); }
    return { valid: errors.length === 0, errors };
  }

  // ============ Export/Import ============

  async exportConfig(): Promise<string> { return JSON.stringify(this.getAll(), null, 2); }

  async importConfig(json: string): Promise<{ success: boolean; errors: string[] }> {
    try {
      const config = JSON.parse(json);
      const errors: string[] = [];
      for (const [section, values] of Object.entries(config)) {
        if (typeof values === 'object' && values !== null) {
          for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
            try { await this.set(`${section}.${key}`, value); } catch { errors.push(`Failed to set ${section}.${key}`); }
          }
        }
      }
      return { success: errors.length === 0, errors };
    } catch { return { success: false, errors: ['Invalid JSON format'] }; }
  }

  // ============ Reset ============

  async resetAll(): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    for (const [section, values] of Object.entries(CONFIG_DEFAULTS)) {
      for (const key of Object.keys(values as unknown as Record<string, unknown>)) {
        await config.update(`${section}.${key}`, undefined, vscode.ConfigurationTarget.Global);
        await config.update(`${section}.${key}`, undefined, vscode.ConfigurationTarget.Workspace);
      }
    }
    this.cache.clear();
    Logger.info('All settings reset to defaults');
  }

  async resetSection(section: keyof FullConfig): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    for (const key of Object.keys(CONFIG_DEFAULTS[section] as unknown as Record<string, unknown>)) {
      await config.update(`${section}.${key}`, undefined, vscode.ConfigurationTarget.Global);
      await config.update(`${section}.${key}`, undefined, vscode.ConfigurationTarget.Workspace);
    }
    this.cache.clear();
  }

  dispose() { this.disposables.forEach(d => d.dispose()); this.listeners.clear(); this.cache.clear(); }
}

export const ConfigManager = new ConfigManagerClass();
