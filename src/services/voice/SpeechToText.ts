/**
 * SpeechToText.ts — Phase 20 Step 20.2
 * Send audio to Whisper STT endpoint
 */

import { VoiceCommand, VoiceConfig, DEFAULT_VOICE_CONFIG } from './VoiceTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class SpeechToText {
  private config: VoiceConfig;

  constructor(config?: Partial<VoiceConfig>) {
    this.config = { ...DEFAULT_VOICE_CONFIG, ...config };
  }

  async transcribe(audioBuffer: ArrayBuffer | Buffer, format: string = 'wav'): Promise<VoiceCommand> {
    const endpoint = ConfigManager.get<string>('voice.sttEndpoint', this.config.sttEndpoint);
    const language = ConfigManager.get<string>('voice.language', this.config.language);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const formData = new FormData();
        const blob = new Blob([audioBuffer instanceof ArrayBuffer ? audioBuffer : new Uint8Array(audioBuffer)], { type: `audio/${format}` });
        formData.append('file', blob, `recording.${format}`);
        if (language && language !== 'auto') {
          formData.append('language', language);
        }
        formData.append('response_format', 'json');

        const resp = await fetch(`${endpoint}/v1/audio/transcriptions`, {
          method: 'POST',
          body: formData,
        });

        if (!resp.ok) throw new Error(`STT error: ${resp.status}`);

        const data = await resp.json();
        const transcript = data.text?.trim() || '';
        const confidence = data.confidence ?? (transcript.length > 0 ? 0.8 : 0);

        if (confidence < 0.3 || !transcript) {
          Logger.debug('[STT] Low confidence or empty transcript, skipping');
          return { transcript: '', confidence: 0, language: language || 'unknown', timestamp: Date.now(), duration: 0 };
        }

        // Post-processing
        const processed = this.postProcess(transcript);

        return {
          transcript: processed,
          confidence,
          language: data.language || language || 'auto',
          timestamp: Date.now(),
          duration: data.duration || 0,
        };
      } catch (e: any) {
        Logger.warn(`[STT] Attempt ${attempt + 1} failed: ${e.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }

    return { transcript: '', confidence: 0, language: 'unknown', timestamp: Date.now(), duration: 0 };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const endpoint = ConfigManager.get<string>('voice.sttEndpoint', this.config.sttEndpoint);
      const resp = await fetch(`${endpoint}/v1/models`, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return resp.ok;
    } catch {
      return false;
    }
  }

  private postProcess(transcript: string): string {
    let result = transcript.trim();
    // Capitalize first letter
    if (result.length > 0) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }
    return result;
  }
}
