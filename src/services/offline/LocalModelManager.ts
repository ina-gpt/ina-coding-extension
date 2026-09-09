/**
 * Phase 10.3 — Local Model Manager
 * Manages an optional local INA Inference Runtime model for offline AI.
 */
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../utils/Logger';
import { LocalModelConfig } from './OfflineTypes';

const execAsync = promisify(exec);

const PREFERRED_OFFLINE_MODELS = [
  'qwen2.5-coder:1.5b',
  'qwen2.5:1.5b',
  'qwen2.5-coder:3b',
  'qwen2.5:3b',
  'phi3:mini',
  'tinyllama',
];

export class LocalModelManager extends EventEmitter {
  private static instance: LocalModelManager;
  private isModelReady = false;
  private ollamaLocalUrl: string | null = null;
  private availableModels: { name: string; size: string }[] = [];
  private selectedModel: string | null = null;

  static getInstance(): LocalModelManager {
    if (!LocalModelManager.instance) {
      LocalModelManager.instance = new LocalModelManager();
    }
    return LocalModelManager.instance;
  }

  private constructor() { super(); }

  async initialize(): Promise<void> {
    try {
      const detection = await this.detectLocalOllama();
      if (detection.available) {
        this.ollamaLocalUrl = detection.url;
        const models = await this.listLocalModels();
        this.availableModels = models;
        if (models.length > 0) {
          this.selectedModel = this.selectBestOfflineModel(models);
          this.isModelReady = true;
          Logger.info(`[Offline] Local model ready: ${this.selectedModel}`);
          this.emit('local-model-ready', this.selectedModel);
        } else {
          Logger.info('[Offline] Local INA Inference Runtime found but no small models available');
        }
      } else {
        Logger.debug('[Offline] No local INA Inference Runtime installation detected');
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
    if (!this.ollamaLocalUrl || !this.isModelReady) {
      throw new Error('Local model not available');
    }

    const model = options?.model || this.selectedModel || 'qwen2.5-coder:1.5b';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${this.ollamaLocalUrl}/api/chat`, {
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
    if (!this.ollamaLocalUrl || !this.isModelReady) return '';

    const model = options?.model || this.selectedModel || 'qwen2.5-coder:1.5b';
    try {
      const response = await fetch(`${this.ollamaLocalUrl}/api/generate`, {
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

  suggestModelDownload(): { modelName: string; size: string; command: string } | null {
    if (this.isModelReady) return null;
    return {
      modelName: 'qwen2.5-coder:1.5b',
      size: '1.1GB',
      command: 'ollama pull qwen2.5-coder:1.5b',
    };
  }

  async *downloadModel(modelName: string): AsyncGenerator<{ progress: number; status: string }> {
    if (!this.ollamaLocalUrl) {
      yield { progress: 0, status: 'Local AI model runtime not available' };
      return;
    }

    try {
      const response = await fetch(`${this.ollamaLocalUrl}/api/pull`, {
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

  private async detectLocalOllama(): Promise<{ available: boolean; version: string | null; url: string | null }> {
    try {
      // Check if the local runtime responds on its default port
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        return { available: true, version: null, url: 'http://localhost:11434' };
      }
    } catch { /* not on default port */ }

    try {
      const { stdout } = await execAsync('ollama --version', { timeout: 5000 });
      const version = stdout.trim();
      return { available: true, version, url: 'http://localhost:11434' };
    } catch {
      return { available: false, version: null, url: null };
    }
  }

  private async listLocalModels(): Promise<{ name: string; size: string }[]> {
    if (!this.ollamaLocalUrl) return [];
    try {
      const response = await fetch(`${this.ollamaLocalUrl}/api/tags`);
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

  private selectBestOfflineModel(models: { name: string; size: string }[]): string {
    for (const preferred of PREFERRED_OFFLINE_MODELS) {
      const found = models.find(m => m.name.includes(preferred));
      if (found) return found.name;
    }
    // Return smallest available model
    return models[0]?.name || 'qwen2.5-coder:1.5b';
  }

  dispose(): void { this.removeAllListeners(); }
}
