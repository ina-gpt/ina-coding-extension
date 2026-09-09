/**
 * TextToSpeech.ts — Phase 20 Step 20.2
 * Send text to the INA Text-to-Speech endpoint for audio feedback
 */

import { VoiceConfig, DEFAULT_VOICE_CONFIG } from './VoiceTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class TextToSpeech {
  private config: VoiceConfig;
  private currentAbort?: AbortController;
  private muted = false;

  constructor(config?: Partial<VoiceConfig>) {
    this.config = { ...DEFAULT_VOICE_CONFIG, ...config };
  }

  async speak(text: string): Promise<void> {
    if (this.muted) return;
    if (!ConfigManager.get<boolean>('voice.feedbackVoice', true)) return;

    // Cancel any current speech
    this.cancel();

    const endpoint = ConfigManager.get<string>('voice.ttsEndpoint', this.config.ttsEndpoint);
    this.currentAbort = new AbortController();

    try {
      const resp = await fetch(`${endpoint}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text.slice(0, 500),
          voice: 'default',
          speed: ConfigManager.get<number>('voice.ttsSpeed', 1.0),
          response_format: 'wav',
        }),
        signal: this.currentAbort.signal,
      });

      if (!resp.ok) {
        Logger.debug(`[TTS] Response ${resp.status}, skipping audio playback`);
        return;
      }

      // In VS Code extension context, we can't directly play audio
      // Log that TTS was generated successfully
      Logger.debug(`[TTS] Generated speech for: "${text.slice(0, 50)}..."`);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      Logger.debug(`[TTS] Error: ${e.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const endpoint = ConfigManager.get<string>('voice.ttsEndpoint', this.config.ttsEndpoint);
      const resp = await fetch(`${endpoint}/v1/models`, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return resp.ok;
    } catch {
      return false;
    }
  }

  cancel(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = undefined;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  isMuted(): boolean { return this.muted; }
}
