import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { Logger } from './Logger';
import {
  ModelCapability,
  defaultModel,
  getDisplayName as registryDisplayName,
  isInaModelId,
} from '../config/model-registry';

const CONFIG_SECTION = 'inaCoding';

// ============ Legacy settings migration ============
//
// This file used to hold a second model map — INA_MODEL_MAP / REVERSE_MODEL_MAP
// — that contradicted src/config/model-registry.ts and was the map the product
// actually used, because nothing imported the registry. That map translated an
// INA display name into an upstream model id and handed the upstream id to the
// server. The registry is now the single source of truth and the extension
// sends an INA id; the server resolves it.
//
// A user who has been running this extension already has a value like
// "INA-7 Pro" — or, if they used the webview retry picker, a raw upstream id —
// persisted in their VS Code settings. Those values must keep working, so they
// are migrated on read.
//
// WHY THE KEYS ARE DIGESTS
//   Half of these legacy values ARE upstream model ids. This repository is
//   public. A plaintext migration table would republish precisely the mapping
//   the registry rewrite exists to remove, in a file whose whole purpose is to
//   stop publishing it.
//
//   This is obfuscation, not confidentiality: a digest of a short, publicly
//   known model id is recoverable by anyone who thinks to try a dictionary of
//   model names. It is claimed as nothing more than "this repository no longer
//   advertises the list". The plaintext source lives in the private policy
//   repository and regenerates this table.
//
// Digests are SHA-256 of the exact persisted string, lower-cased before
// hashing so a settings value that differs only in case still migrates.
const LEGACY_MIGRATION = new Map<string, string>([
  ['931bd4ca2f5201c97b48f4062d5658ca4826865ac9a6b761e79d53f26ba511ff', 'ina-8-coding-pro'],
  ['e7fc5dc5f7c62d35933a9a11941c3f91b4a5e0bfabfad499ab70cb6f946df713', 'ina-8-coding'],
  ['54420446bca9f0970ea79ce1362be320d095680215247ac98129d58e5f7e656f', 'ina-8-coding-lite'],
  ['aa6fa1793d051621edb5811bb1dfc0faaafad350c4a59f1cffe5b5358bd2246a', 'ina-8-pro'],
  ['48b72a4400239554846e945f46d26068080c054f710a324a283daa60683fb2b4', 'ina-8'],
  ['60df1f77d9daff0df74ec20542cf9d1c630a9d619b7af84ae6ce496192443939', 'ina-embed'],
  ['5ab7d838bfb421ba95a78283ac0b266ec113163230c2ccf9c84d013c6c108bd7', 'ina-embed'],
  ['cccb702c301689328d378a6ffe96d90d23c3f292d228aa587c3905c6703d46df', 'ina-embed'],
  ['f557f27d36a5097270c3dba259dae3c424994e916d40b2f65600992febfb7dec', 'ina-8-vision'],
  ['848540ca64f06d9afb2529d59e9dd429db297657f695b170b94033c34836e871', 'ina-8-coding-pro'],
  ['255ca0fdae881eb48ac9aa8f17ec0b7f5b3962e23f0524b3bb5fedffd3fa3b17', 'ina-8-pro'],
  ['8286d092cb58243c94f0e7fbac787298cf96fdfd74ec1a82e8e98e5f0b17b451', 'ina-8-coding-lite'],
  ['0e7b0e8855b9def44e989c5825d28910a3d90c90e86dbec10a53f8847739f502', 'ina-8-coding-pro'],
  ['d9316f5ebed67d4014bd1b1c03076e665b7deeb53be6238120bedebf2c26f0c7', 'ina-8-coding'],
  ['49b7701263a8f32ec45e1ab690d6a43ca211955979df99970b40cc462a2ca973', 'ina-8-coding-lite'],
  ['4dbc741fbc7b50bd192f480d6dc3c985a8b67bd2862949b802e1892692a760a2', 'ina-8-coding-fast'],
  ['46a7fdadcb4d5c007019a9af98c586ee443ed2cb82dfca6bdb16cb23401cea3c', 'ina-8-coding-fast'],
  ['fa77660e39dcbad0f9af0bef3d5e9168a85f8679f0ec1d9fb777d4021d433232', 'ina-8-coding-fast'],
  ['442789f441d800436716d2621ca1f15f036b1210d6468724d9e7eaae457f7ab6', 'ina-8-coding-fast'],
  ['613573f7b5c9989c5860d1072fec711f3944931fdabb89d8abf292d21a3b7f20', 'ina-8-pro'],
  ['801dcad02f38c48984c325de964ab7c9213d4c51f101cd2f6aeacff576868987', 'ina-8'],
  ['0ef7445aefc83fdaf1914baedfb4b99289540d335c37eed656430cf3714ba456', 'ina-8-vision'],
  ['a4134b0e39785810a45922e0b9dcf450702ce8d7d2514ef5d4c4ef3c81a08e5b', 'ina-embed'],
  ['1aa5dd19c3d900f19e14fdc81f64128514d083934b997272a00e78061e766ac7', 'ina-embed'],
  ['a51ea6ac970865616f6442c59374278d9c611ea1696f2603c11bfee662247789', 'ina-embed'],
]);

/** SHA-256 of the lower-cased value, memoised — this runs on every request. */
const digestCache = new Map<string, string>();
function digest(value: string): string {
  let d = digestCache.get(value);
  if (d === undefined) {
    d = createHash('sha256').update(value.toLowerCase(), 'utf8').digest('hex');
    digestCache.set(value, d);
  }
  return d;
}

/**
 * Resolve any persisted settings value to a canonical INA model id.
 *
 * Order matters: a value that is ALREADY an INA id is returned untouched, so
 * the migration table never has to grow an identity row. An unrecognised value
 * falls back to the capability's default and logs once — echoing it back is how
 * an upstream id reaches a status bar or an API request.
 */
const warnedUnknown = new Set<string>();
function toInaModelId(value: string | undefined | null, capability: ModelCapability): string {
  const raw = (value ?? '').trim();
  if (raw && isInaModelId(raw)) return raw;
  if (raw) {
    const migrated = LEGACY_MIGRATION.get(digest(raw));
    if (migrated) return migrated;
    if (!warnedUnknown.has(raw)) {
      warnedUnknown.add(raw);
      Logger.warn(
        `[config] model setting is not a known INA model id; falling back to the ${capability} default. ` +
          'If this was a custom model, the server must be configured to resolve it.'
      );
    }
  }
  return defaultModel(capability).id;
}

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
  models: { chat: 'ina-8-coding-pro', customChat: '', completion: 'ina-8-coding-pro', customCompletion: '', embedding: 'ina-embed' },
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

  /**
   * The configured model for a capability, as a canonical INA id.
   *
   * This is the ONLY way a model id should leave configuration. It migrates a
   * legacy persisted value, and it can never return an upstream id — an
   * unrecognised setting resolves to the capability's default instead of being
   * passed through, which is what the old `INA_MODEL_MAP[x] || x` did.
   */
  getConfiguredModel(capability: ModelCapability): string {
    const m = this.getModels();
    switch (capability) {
      case 'coding':
        return toInaModelId(m.completion === 'custom' && m.customCompletion ? m.customCompletion : m.completion, 'coding');
      case 'embedding':
        return toInaModelId(m.embedding, 'embedding');
      case 'vision':
        return toInaModelId(null, 'vision');
      case 'general':
      default:
        return toInaModelId(m.chat === 'custom' && m.customChat ? m.customChat : m.chat, 'general');
    }
  }

  /**
   * Resolve ANY model value — a registry id, a legacy INA display name, or a
   * legacy upstream id persisted by an older build — to a canonical INA id.
   *
   * Exposed because per-request overrides arrive from the webview and from
   * stored conversation state, neither of which is configuration, and both of
   * which can still carry a value written by a previous version.
   */
  resolveModelId(value: string | null | undefined, capability: ModelCapability = 'general'): string {
    return toInaModelId(value, capability);
  }

  /** Persist a model choice. Refuses anything that is not a registry id. */
  async setConfiguredModel(capability: ModelCapability, inaId: string): Promise<void> {
    if (!isInaModelId(inaId)) {
      throw new Error(`setConfiguredModel: "${inaId}" is not a known INA model id`);
    }
    const key = capability === 'embedding' ? 'models.embedding' : capability === 'coding' ? 'models.completion' : 'models.chat';
    await this.set(key, inaId, vscode.ConfigurationTarget.Global);
  }

  /**
   * Chat model as an INA id.
   *
   * Kept as a named method because five call sites use it; it is now a thin
   * alias over getConfiguredModel so there is one resolution path, not two.
   */
  getChatModel(): string {
    return this.getConfiguredModel('general');
  }

  getCompletionModel(): string {
    return this.getConfiguredModel('coding');
  }

  getEmbeddingModel(): string {
    return this.getConfiguredModel('embedding');
  }

  /**
   * The label for any surface a human reads.
   *
   * Fails CLOSED: an id the registry does not know renders as a neutral label
   * rather than being echoed. Echoing is how a legacy settings value containing
   * an upstream id reaches a status bar, and a status bar is a screenshot away
   * from being public.
   */
  getDisplayName(id: string): string {
    return registryDisplayName(id);
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
