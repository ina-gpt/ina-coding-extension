/**
 * Phase 10.3 — Local Model Manager
 * Manages an optional local inference runtime for offline AI.
 *
 * Every runtime name and model id this class needs now comes from the cached
 * OfflineManifest, fetched from the server. Nothing is hardcoded and there is
 * no built-in fallback: with no manifest, offline mode reports that it is not
 * provisioned and stays disabled. A fallback list would have reintroduced the
 * eleven published identifiers the manifest exists to remove, and would have
 * done it in the code path that runs when the manifest is missing.
 */
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../utils/Logger';
import { LocalModelConfig } from './OfflineTypes';
import { OfflineManifest, OfflineManifestStore, OFFLINE_NOT_PROVISIONED } from './OfflineManifest';

const execAsync = promisify(exec);

export class LocalModelManager extends EventEmitter {
  private static instance: LocalModelManager;
  private isModelReady = false;
  private runtimeUrl: string | null = null;
  private availableModels: { name: string; size: string }[] = [];
  private selectedModel: string | null = null;
  private manifestStore: OfflineManifestStore | null = null;
  private manifest: OfflineManifest | null = null;

  static getInstance(): LocalModelManager {
    if (!LocalModelManager.instance) {
      LocalModelManager.instance = new LocalModelManager();
    }
    return LocalModelManager.instance;
  }

  private constructor() { super(); }

  /** Wire the manifest store. Until this is called, offline mode stays off. */
  useManifestStore(store: OfflineManifestStore): void {
    this.manifestStore = store;
  }

  async initialize(): Promise<void> {
    try {
      this.manifest = (await this.manifestStore?.get()) ?? null;
      if (!this.manifest) {
        Logger.info('[Offline] ' + OFFLINE_NOT_PROVISIONED);
        return;
      }
      const detection = await this.detectLocalRuntime(this.manifest);
      if (detection.available) {
        this.runtimeUrl = detection.url;
        const models = await this.listLocalModels();
        this.availableModels = models;
        const chosen = models.length > 0 ? this.selectBestOfflineModel(models) : null;
        if (chosen) {
          this.selectedModel = chosen;
          this.isModelReady = true;
          Logger.info(`[Offline] Local model ready: ${this.selectedModel}`);
          this.emit('local-model-ready', this.selectedModel);
        } else {
          Logger.info('[Offline] Local inference runtime found but no sanctioned model is installed');
        }
      } else {
        Logger.debug('[Offline] No local inference runtime detected');
      }
    } catch (e) {
      Logger.debug('[Offline] Local model detection failed:', e);
    }
  }

  isAvailable(): boolean { return this.isModelReady; }

  getAvailableModels(): { name: string; size: string }[] {
    return [...this.availableModels];
  }

  getSelectedModel(): string | null { return this.selectedModel; }

  async *chat(
    messages: { role: string; content: string }[],
    options?: { model?: string; maxTokens?: number; temperature?: number }
  ): AsyncGenerator<{ type: 'token' | 'done'; content: string }> {
    if (!this.runtimeUrl || !this.isModelReady || !this.selectedModel) {
      throw new Error(this.manifest ? 'Local model not available' : OFFLINE_NOT_PROVISIONED);
    }

    const model = options?.model || this.selectedModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${this.runtimeUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '[Running in offline mode with a smaller model. Responses may be less detailed.]' },
            ...messages,
          ],
          stream: true,
          options: {
            num_predict: options?.maxTokens || 1024,
            temperature: options?.temperature ?? 0.7,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Local model error: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              yield { type: 'token', content: json.message.content };
            }
            if (json.done) {
              yield { type: 'done', content: '' };
            }
          } catch { /* skip parse errors */ }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async complete(prefix: string, suffix: string, options?: { model?: string }): Promise<string> {
    if (!this.runtimeUrl || !this.isModelReady || !this.selectedModel) return '';

    const model = options?.model || this.selectedModel;
    try {
      const response = await fetch(`${this.runtimeUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `<|fim_prefix|>${prefix.slice(-2000)}<|fim_suffix|>${suffix.slice(0, 500)}<|fim_middle|>`,
          stream: false,
          options: { num_predict: 128, temperature: 0.2 },
        }),
      });

      if (!response.ok) return '';
      const data = await response.json();
      return data.response || '';
    } catch {
      return '';
    }
  }

  /**
   * The model to offer for download, or null when there is nothing to offer.
   *
   * `modelName` is rendered verbatim into a modal — `Download ${modelName}
   * (${size}) for offline AI?` — which is how an upstream model id used to
   * reach a user's screen. It now comes from the manifest, and is null when
   * there is no manifest, so the command shows the not-provisioned message
   * instead of a prompt that could not have worked.
   */
  suggestModelDownload(): { modelName: string; size: string; command: string } | null {
    if (this.isModelReady || !this.manifest) return null;
    const first = this.manifest.models[0];
    if (!first) return null;
    return {
      modelName: first,
      size: 'unknown',
      command: this.manifest.pullCommandTemplate.replace('{model}', first),
    };
  }

  async *downloadModel(modelName: string): AsyncGenerator<{ progress: number; status: string }> {
    if (!this.runtimeUrl) {
      yield { progress: 0, status: this.manifest ? 'Local AI model runtime not available' : OFFLINE_NOT_PROVISIONED };
      return;
    }
    // The manifest is the allowlist. Downloading an arbitrary caller-supplied
    // id would let a webview message pull anything onto the user's disk.
    if (!this.manifest?.models.includes(modelName)) {
      yield { progress: 0, status: 'That model is not in the offline manifest.' };
      return;
    }

    try {
      const response = await fetch(`${this.runtimeUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!response.ok || !response.body) {
        yield { progress: 0, status: `Error: HTTP ${response.status}` };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            const total = json.total || 1;
            const completed = json.completed || 0;
            yield { progress: Math.round((completed / total) * 100), status: json.status || 'downloading' };
          } catch { /* skip */ }
        }
      }

      // Refresh models list
      await this.initialize();
      yield { progress: 100, status: 'complete' };
    } catch (e: any) {
      yield { progress: 0, status: `Error: ${e?.message}` };
    }
  }

  private async detectLocalRuntime(
    manifest: OfflineManifest
  ): Promise<{ available: boolean; version: string | null; url: string | null }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${manifest.runtimeUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        return { available: true, version: null, url: manifest.runtimeUrl };
      }
    } catch { /* the runtime is not answering on its declared URL */ }

    try {
      // The command name comes from the manifest, which is server-controlled
      // input, so it is single-quoted with embedded quotes escaped rather than
      // interpolated raw into a shell string.
      const safe = manifest.runtimeCommand.replace(/'/g, `'\\''`);
      const { stdout } = await execAsync(`'${safe}' --version`, { timeout: 5000 });
      return { available: true, version: stdout.trim(), url: manifest.runtimeUrl };
    } catch {
      return { available: false, version: null, url: null };
    }
  }

  private async listLocalModels(): Promise<{ name: string; size: string }[]> {
    if (!this.runtimeUrl) return [];
    try {
      const response = await fetch(`${this.runtimeUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || []).map((m: any) => ({
        name: m.name || m.model,
        size: m.size ? `${Math.round(m.size / 1024 / 1024)}MB` : 'unknown',
      }));
    } catch {
      return [];
    }
  }

  private selectBestOfflineModel(models: { name: string; size: string }[]): string | null {
    for (const preferred of this.manifest?.models ?? []) {
      const found = models.find((m) => m.name.includes(preferred));
      if (found) return found.name;
    }
    // Nothing the manifest sanctions is installed. Falling back to the first
    // arbitrary local model would run offline inference on whatever the user
    // happened to have pulled, which is not a choice this code can make.
    return null;
  }

  dispose(): void { this.removeAllListeners(); }
}
