/**
 * Embedding Client Service
 *
 * Manages embedding jobs and progress tracking from the extension side.
 */

import * as vscode from 'vscode';
import { ProcessedChunk } from './chunking';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface EmbeddingJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: JobProgress;
  error?: string;
}

export interface JobProgress {
  total: number;
  completed: number;
  failed: number;
  cached: number;
  percentage: number;
  estimatedRemaining?: number;
}

export interface EmbeddingClientConfig {
  apiEndpoint: string;
  timeout: number;
}

// ============ Embedding Client ============

export class EmbeddingClient implements vscode.Disposable {
  private config: EmbeddingClientConfig;
  private activeJobs: Map<string, EmbeddingJobStatus> = new Map();
  private progressListeners: Map<string, Set<(progress: JobProgress) => void>> = new Map();
  private disposables: vscode.Disposable[] = [];

  // Events
  private onJobStartedEmitter = new vscode.EventEmitter<EmbeddingJobStatus>();
  private onJobProgressEmitter = new vscode.EventEmitter<EmbeddingJobStatus>();
  private onJobCompletedEmitter = new vscode.EventEmitter<EmbeddingJobStatus>();
  private onJobFailedEmitter = new vscode.EventEmitter<EmbeddingJobStatus>();

  readonly onJobStarted = this.onJobStartedEmitter.event;
  readonly onJobProgress = this.onJobProgressEmitter.event;
  readonly onJobCompleted = this.onJobCompletedEmitter.event;
  readonly onJobFailed = this.onJobFailedEmitter.event;

  constructor(config: Partial<EmbeddingClientConfig> = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || this.getConfiguredEndpoint(),
      timeout: config.timeout || 30000,
    };
  }

  /** Read endpoint from VS Code settings, fallback to localhost */
  private getConfiguredEndpoint(): string {
    try {
      // vscode is already imported at the top of this file
      const endpoint = vscode.workspace.getConfiguration('inaCoding').get<string>('api.endpoint');
      return endpoint ? `${endpoint}/api` : 'http://localhost:3200/api';
    } catch {
      return 'http://localhost:3200/api';
    }
  }

  // ============ Job Submission ============

  async submitJob(
    projectId: string,
    chunks: ProcessedChunk[],
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<EmbeddingJobStatus> {
    try {
      // Prepare chunk data for API
      const chunkData = chunks.map(chunk => ({
        id: chunk.id,
        text: chunk.embeddingText || chunk.content,
        file: chunk.file,
        hash: chunk.hash,
        metadata: {
          type: chunk.type,
          name: chunk.name,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          language: chunk.language,
          keywords: chunk.keywords,
        },
      }));

      const response = await fetch(`${this.config.apiEndpoint}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          chunks: chunkData,
          priority,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      const status: EmbeddingJobStatus = {
        jobId: data.job.id,
        status: data.job.status,
        progress: data.job.progress,
      };

      this.activeJobs.set(status.jobId, status);
      this.onJobStartedEmitter.fire(status);

      // Start listening for progress
      this.watchJobProgress(status.jobId);

      return status;

    } catch (error) {
      Logger.error('Failed to submit embedding job:', error);
      throw error;
    }
  }

  async submitJobBatched(
    projectId: string,
    chunks: ProcessedChunk[],
    options: {
      batchSize?: number;
      priority?: 'high' | 'normal' | 'low';
      onBatchSubmitted?: (batchIndex: number, totalBatches: number) => void;
    } = {}
  ): Promise<EmbeddingJobStatus[]> {
    const { batchSize = 500, priority = 'normal', onBatchSubmitted } = options;
    const batches = this.chunkArray(chunks, batchSize);
    const jobs: EmbeddingJobStatus[] = [];

    for (let i = 0; i < batches.length; i++) {
      const job = await this.submitJob(projectId, batches[i], priority);
      jobs.push(job);
      onBatchSubmitted?.(i + 1, batches.length);

      // Small delay between batches
      if (i < batches.length - 1) {
        await this.sleep(100);
      }
    }

    return jobs;
  }

  // ============ Progress Tracking ============

  private watchJobProgress(jobId: string): void {
    if (this.progressListeners.has(jobId)) return;

    this.progressListeners.set(jobId, new Set());

    const url = `${this.config.apiEndpoint}/embeddings/progress?jobId=${jobId}`;
    this.connectSSE(url, jobId);
  }

  private async connectSSE(url: string, jobId: string): Promise<void> {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const eventBlock of lines) {
          this.handleSSEEvent(eventBlock, jobId);
        }
      }

    } catch (error) {
      Logger.warn(`SSE connection error for job ${jobId}:`, error);

      // Fallback to polling
      this.pollJobStatus(jobId);
    }
  }

  private handleSSEEvent(eventBlock: string, jobId: string): void {
    const lines = eventBlock.split('\n');
    let event = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (!event || !data) return;

    try {
      const parsed = JSON.parse(data);

      switch (event) {
        case 'progress':
        case 'status':
          this.updateJobStatus(jobId, 'processing', parsed.progress);
          break;

        case 'completed':
          this.updateJobStatus(jobId, 'completed', parsed.progress);
          this.progressListeners.delete(jobId);
          break;

        case 'failed':
          this.updateJobStatus(jobId, 'failed', parsed.progress, parsed.error);
          this.progressListeners.delete(jobId);
          break;
      }

    } catch (error) {
      Logger.warn('Failed to parse SSE event:', error);
    }
  }

  private updateJobStatus(
    jobId: string,
    status: EmbeddingJobStatus['status'],
    progress: JobProgress,
    error?: string
  ): void {
    const jobStatus: EmbeddingJobStatus = {
      jobId,
      status,
      progress,
      error,
    };

    this.activeJobs.set(jobId, jobStatus);

    switch (status) {
      case 'processing':
        this.onJobProgressEmitter.fire(jobStatus);
        break;
      case 'completed':
        this.onJobCompletedEmitter.fire(jobStatus);
        this.activeJobs.delete(jobId);
        break;
      case 'failed':
        this.onJobFailedEmitter.fire(jobStatus);
        this.activeJobs.delete(jobId);
        break;
    }

    // Notify listeners
    const listeners = this.progressListeners.get(jobId);
    if (listeners) {
      for (const listener of listeners) {
        listener(progress);
      }
    }
  }

  private static readonly MAX_POLL_ATTEMPTS = 900; // 30 min at 2s intervals

  private async pollJobStatus(jobId: string): Promise<void> {
    const pollInterval = 2000;
    let attempts = 0;

    const poll = async () => {
      if (!this.progressListeners.has(jobId)) return;
      if (++attempts > EmbeddingClient.MAX_POLL_ATTEMPTS) {
        Logger.warn(`Job ${jobId} polling timeout after ${attempts} attempts`);
        this.updateJobStatus(jobId, 'failed', { total: 0, completed: 0, failed: 0, cached: 0, percentage: 0 }, 'Polling timeout');
        return;
      }

      try {
        const response = await fetch(
          `${this.config.apiEndpoint}/embeddings?jobId=${jobId}`,
          { signal: AbortSignal.timeout(10000) }
        );

        if (!response.ok) {
          setTimeout(poll, pollInterval);
          return;
        }

        const data = await response.json();
        const job = data.job;

        if (job) {
          this.updateJobStatus(jobId, job.status, job.progress, job.error);

          if (job.status === 'pending' || job.status === 'processing') {
            setTimeout(poll, pollInterval);
          }
        }

      } catch (error) {
        Logger.warn(`Poll error for job ${jobId}:`, error);
        setTimeout(poll, pollInterval * 2); // Back off on error
      }
    };

    poll();
  }

  // ============ Job Management ============

  async getJobStatus(jobId: string): Promise<EmbeddingJobStatus | null> {
    const cached = this.activeJobs.get(jobId);
    if (cached) return cached;

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/embeddings?jobId=${jobId}`
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.job;

    } catch (error) {
      Logger.error('Failed to get job status:', error);
      return null;
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/embeddings?jobId=${jobId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        this.activeJobs.delete(jobId);
        this.progressListeners.delete(jobId);
        return true;
      }

      return false;

    } catch (error) {
      Logger.error('Failed to cancel job:', error);
      return false;
    }
  }

  async waitForJob(
    jobId: string,
    onProgress?: (progress: JobProgress) => void
  ): Promise<EmbeddingJobStatus> {
    return new Promise((resolve, reject) => {
      if (onProgress) {
        const listeners = this.progressListeners.get(jobId) || new Set();
        listeners.add(onProgress);
        this.progressListeners.set(jobId, listeners);
      }

      const onCompleted = this.onJobCompleted((status) => {
        if (status.jobId === jobId) {
          cleanup();
          resolve(status);
        }
      });

      const onFailed = this.onJobFailed((status) => {
        if (status.jobId === jobId) {
          cleanup();
          reject(new Error(status.error || 'Job failed'));
        }
      });

      const cleanup = () => {
        onCompleted.dispose();
        onFailed.dispose();
        if (onProgress) {
          const listeners = this.progressListeners.get(jobId);
          if (listeners) {
            listeners.delete(onProgress);
          }
        }
      };
    });
  }

  // ============ Statistics ============

  async getStats(): Promise<{
    queue: any;
    service: any;
  }> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/embeddings`);
      return await response.json();
    } catch (error) {
      Logger.error('Failed to get stats:', error);
      return { queue: {}, service: {} };
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    model: string;
    latency?: number;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/embeddings/health`);
      return await response.json();
    } catch (error) {
      return {
        healthy: false,
        model: 'unknown',
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // ============ Utilities ============

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getActiveJobs(): EmbeddingJobStatus[] {
    return Array.from(this.activeJobs.values());
  }

  // ============ Cleanup ============

  dispose(): void {
    this.progressListeners.clear();
    this.activeJobs.clear();
    this.onJobStartedEmitter.dispose();
    this.onJobProgressEmitter.dispose();
    this.onJobCompletedEmitter.dispose();
    this.onJobFailedEmitter.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

// ============ Singleton Export ============

export const embeddingClient = new EmbeddingClient();
