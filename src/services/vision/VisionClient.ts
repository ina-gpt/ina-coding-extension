import { EventEmitter } from 'events';
import { ConfigManager } from '../../utils/ConfigManager';
import { AuthService } from '../AuthService';
import { ImageAttachment, VisionImage, VisionAnalysis, DesignToCodeConfig, VisionAnnotation } from './VisionTypes';
import { Logger } from '../../utils/Logger';

export class VisionClient extends EventEmitter {
  private static instance: VisionClient;
  private authService: AuthService | null = null;

  static getInstance(): VisionClient {
    if (!VisionClient.instance) {
      VisionClient.instance = new VisionClient();
    }
    return VisionClient.instance;
  }

  setAuthService(auth: AuthService): void {
    this.authService = auth;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authService) {
      const authHeaders = await this.authService.getAuthHeaders();
      Object.assign(headers, authHeaders);
    }
    return headers;
  }

  private getBaseUrl(): string {
    return ConfigManager.getApiEndpoint();
  }

  async *chatWithImages(prompt: string, images: ImageAttachment[], options?: { systemPrompt?: string; temperature?: number; maxTokens?: number }): AsyncGenerator<{ type: 'token' | 'done' | 'error'; content: string }> {
    const headers = await this.getHeaders();
    const visionImages = images.map(img => this.buildVisionImage(img));

    let annotationPrompt = '';
    for (const img of images) {
      if (img.annotations.length > 0) {
        annotationPrompt += this.buildAnnotationPrompt(img.annotations);
      }
    }

    const fullPrompt = annotationPrompt ? `${annotationPrompt}\n\n${prompt}` : prompt;

    const response = await fetch(`${this.getBaseUrl()}/api/vision/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        images: visionImages, prompt: fullPrompt,
        systemPrompt: options?.systemPrompt || null,
        temperature: options?.temperature || 0.3,
        maxTokens: options?.maxTokens || 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', content: `Vision API error: ${response.status}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              yield data;
            } catch { /* skip */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async analyzeImage(image: ImageAttachment, detailLevel: string = 'detailed'): Promise<VisionAnalysis> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.getBaseUrl()}/api/vision/analyze`, {
      method: 'POST', headers,
      body: JSON.stringify({ image: this.buildVisionImage(image), detailLevel }),
    });
    if (!response.ok) throw new Error(`Analyze failed: ${response.status}`);
    const data = await response.json();
    return data.analysis;
  }

  async *designToCode(image: ImageAttachment, config: DesignToCodeConfig): AsyncGenerator<{ type: 'token' | 'done'; content: string }> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.getBaseUrl()}/api/vision/design-to-code`, {
      method: 'POST', headers,
      body: JSON.stringify({ image: this.buildVisionImage(image), ...config }),
    });

    if (!response.ok) throw new Error(`Design to code failed: ${response.status}`);
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { yield JSON.parse(line.slice(6)); } catch { /* skip */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async processImage(image: ImageAttachment, operations: string[], options?: any): Promise<ImageAttachment> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.getBaseUrl()}/api/vision/process`, {
      method: 'POST', headers,
      body: JSON.stringify({ image: this.buildVisionImage(image), operations, options }),
    });
    if (!response.ok) throw new Error(`Process failed: ${response.status}`);
    const data = await response.json();
    return { ...image, data: data.image.data, mimeType: data.image.mimeType, width: data.image.width || image.width, height: data.image.height || image.height, sizeBytes: data.image.sizeBytes || image.sizeBytes };
  }

  private buildVisionImage(attachment: ImageAttachment): VisionImage {
    return {
      id: attachment.id,
      data: attachment.data,
      mimeType: attachment.mimeType,
      width: attachment.width,
      height: attachment.height,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
      annotations: attachment.annotations.length > 0 ? attachment.annotations : null,
    };
  }

  private buildAnnotationPrompt(annotations: VisionAnnotation[]): string {
    const parts = annotations.map(a => {
      const pos = `(${a.coordinates.x}, ${a.coordinates.y})`;
      switch (a.type) {
        case 'rectangle': return `Red rectangle at ${pos} ${a.coordinates.width}x${a.coordinates.height}${a.label ? ` labeled "${a.label}"` : ''}`;
        case 'circle': return `Circle at ${pos}${a.label ? ` labeled "${a.label}"` : ''}`;
        case 'arrow': return `Arrow from ${pos} to (${a.coordinates.x2}, ${a.coordinates.y2})${a.label ? ` labeled "${a.label}"` : ''}`;
        case 'text': return `Text annotation at ${pos}: "${a.label}"`;
        case 'highlight': return `Highlighted region at ${pos} ${a.coordinates.width}x${a.coordinates.height}${a.label ? ` labeled "${a.label}"` : ''}`;
        default: return '';
      }
    }).filter(Boolean);

    return `The user has annotated the image with:\n${parts.map(p => `- ${p}`).join('\n')}\nPay attention to the annotated areas.`;
  }
}
