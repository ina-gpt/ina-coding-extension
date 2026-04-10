import * as vscode from 'vscode';
import { FileWatcher } from './FileWatcher';
import { workspaceScanner, ScannedFile } from './WorkspaceScanner';
import { FileChange } from './ChangeQueue';
import { codeChunker, chunkProcessor, ProcessedChunk } from './chunking';
import { embeddingClient, EmbeddingJobStatus } from './EmbeddingClient';
import { embeddingCache, EmbeddingCache } from './EmbeddingCache';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

// ============ Types ============

export type IndexingState = 'idle' | 'scanning' | 'indexing' | 'paused' | 'error';

export interface IndexingProgress {
  state: IndexingState;
  phase: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
  startTime: number;
}

export interface IndexingStats {
  totalIndexed: number;
  totalFailed: number;
  lastFullScan: number | null;
  lastIncrementalUpdate: number | null;
}

export interface IndexingOptions {
  apiEndpoint: string;
  batchSize?: number;
  retryAttempts?: number;
  onProgress?: (progress: IndexingProgress) => void;
}

// ============ Indexing Coordinator ============

export class IndexingCoordinator implements vscode.Disposable {
  private state: IndexingState = 'idle';
  private progress: IndexingProgress;
  private stats: IndexingStats;
  private options: Required<IndexingOptions>;
  private fileWatcherInstance: FileWatcher;

  private onStateChangeEmitter = new vscode.EventEmitter<IndexingState>();
  private onProgressEmitter = new vscode.EventEmitter<IndexingProgress>();
  private onCompleteEmitter = new vscode.EventEmitter<IndexingStats>();
  private onErrorEmitter = new vscode.EventEmitter<Error>();

  readonly onStateChange = this.onStateChangeEmitter.event;
  readonly onProgress = this.onProgressEmitter.event;
  readonly onComplete = this.onCompleteEmitter.event;
  readonly onError = this.onErrorEmitter.event;

  constructor(options: IndexingOptions) {
    this.options = {
      apiEndpoint: options.apiEndpoint,
      batchSize: options.batchSize ?? 50,
      retryAttempts: options.retryAttempts ?? 3,
      onProgress: options.onProgress ?? (() => {}),
    };

    this.progress = { state: 'idle', phase: '', current: 0, total: 0, percentage: 0, message: '', startTime: Date.now() };
    this.stats = { totalIndexed: 0, totalFailed: 0, lastFullScan: null, lastIncrementalUpdate: null };

    this.fileWatcherInstance = new FileWatcher({
      onIndexingNeeded: (changes) => this.handleFileChanges(changes),
    });

    // Listen for embedding job events
    embeddingClient.onJobProgress((status) => {
      this.handleEmbeddingProgress(status);
    });

    embeddingClient.onJobCompleted((status) => {
      this.handleEmbeddingCompleted(status);
    });

    embeddingClient.onJobFailed((status) => {
      this.handleEmbeddingFailed(status);
    });
  }

  // ============ Lifecycle ============

  async start(): Promise<void> {
    Logger.info('IndexingCoordinator: Starting...');
    await this.fileWatcherInstance.start();
    Logger.info('IndexingCoordinator: Started');
  }

  stop(): void {
    this.fileWatcherInstance.stop();
    this.setState('idle');
    Logger.info('IndexingCoordinator: Stopped');
  }

  pause(): void {
    if (this.state === 'indexing' || this.state === 'scanning') { this.setState('paused'); }
  }

  resume(): void {
    if (this.state === 'paused') { this.setState('idle'); }
  }

  // ============ Full Scan ============

  async runFullScan(): Promise<void> {
    if (this.state === 'scanning' || this.state === 'indexing') {
      Logger.warn('IndexingCoordinator: Already scanning/indexing');
      return;
    }

    this.setState('scanning');
    this.updateProgress({ phase: 'Scanning workspace', current: 0, total: 0, percentage: 0, message: 'Discovering files...' });

    try {
      const scanResult = await workspaceScanner.scanWorkspace({
        onProgress: (scanned, total) => {
          this.updateProgress({ current: scanned, total, percentage: total > 0 ? Math.round((scanned / total) * 100) : 0, message: `Found ${scanned} files...` });
        },
      });

      Logger.info(`Scan complete: ${scanResult.stats.totalFiles} files found`);

      if (scanResult.files.length > 0) {
        await this.indexFiles(scanResult.files);
      }

      this.stats.lastFullScan = Date.now();
      this.setState('idle');
      this.onCompleteEmitter.fire(this.stats);
    } catch (error) {
      Logger.error('Full scan failed:', error);
      this.setState('error');
      this.onErrorEmitter.fire(error as Error);
    }
  }

  // ============ Incremental Indexing ============

  async handleFileChanges(changes: FileChange[]): Promise<void> {
    if (this.state === 'paused') { return; }

    Logger.debug(`IndexingCoordinator: Processing ${changes.length} changes`);
    this.setState('indexing');
    this.updateProgress({ phase: 'Incremental indexing', current: 0, total: changes.length, percentage: 0, message: `Processing ${changes.length} changes...` });

    try {
      const creates = changes.filter(c => c.type === 'create');
      const updates = changes.filter(c => c.type === 'change');
      const deletes = changes.filter(c => c.type === 'delete');
      const renames = changes.filter(c => c.type === 'rename');

      if (deletes.length > 0) { await this.processDeletes(deletes); }
      if (renames.length > 0) { await this.processRenames(renames); }

      const toIndex = [...creates, ...updates];
      if (toIndex.length > 0) {
        const files = await this.changesToScannedFiles(toIndex);
        await this.indexFiles(files);
      }

      this.stats.lastIncrementalUpdate = Date.now();
      this.setState('idle');
    } catch (error) {
      Logger.error('Incremental indexing failed:', error);
      this.setState('error');
      this.onErrorEmitter.fire(error as Error);
    }
  }

  private async changesToScannedFiles(changes: FileChange[]): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];
    for (const change of changes) {
      try {
        const stat = await vscode.workspace.fs.stat(change.uri);
        const relativePath = vscode.workspace.asRelativePath(change.uri);
        files.push({
          uri: change.uri,
          relativePath,
          size: stat.size,
          modified: new Date(stat.mtime),
          language: change.metadata?.language || 'plaintext',
        });
      } catch { continue; }
    }
    return files;
  }

  // ============ API Communication ============

  private async indexFiles(files: ScannedFile[]): Promise<void> {
    if (files.length === 0) { return; }

    let processed = 0;
    const allChunks: ProcessedChunk[] = [];

    // Phase 1: Chunk all files
    this.updateProgress({
      phase: 'Chunking files',
      current: 0,
      total: files.length,
      percentage: 0,
      message: 'Analyzing code structure...',
    });

    for (const file of files) {
      if (this.state === 'paused') { break; }

      try {
        const contentBuffer = await vscode.workspace.fs.readFile(file.uri);
        const content = new TextDecoder().decode(contentBuffer);

        // Chunk the file using AST-based chunking
        const chunkingResult = await codeChunker.chunkCode(content, file.relativePath, file.language);

        if (chunkingResult.chunks.length > 0) {
          const processedChunks = chunkProcessor.processChunks(chunkingResult.chunks);
          allChunks.push(...processedChunks);
        }

        processed++;
        this.updateProgress({
          current: processed,
          percentage: Math.round((processed / files.length) * 100),
          message: `Chunked ${processed}/${files.length} files (${allChunks.length} chunks)`,
        });
      } catch (error) {
        Logger.error(`Failed to chunk ${file.relativePath}:`, error);
        this.stats.totalFailed++;
        processed++;
      }
    }

    if (allChunks.length === 0) {
      Logger.info('No chunks to embed');
      return;
    }

    // Phase 2: Generate embeddings
    this.updateProgress({
      phase: 'Generating embeddings',
      current: 0,
      total: allChunks.length,
      percentage: 0,
      message: 'Starting embedding generation...',
    });

    await this.submitForEmbedding(allChunks);
  }

  private async sendChunksToBackend(chunks: ProcessedChunk[]): Promise<void> {
    const payload = chunks.map(c => ({
      id: c.id, type: c.type, content: c.content, embeddingText: c.embeddingText,
      language: c.language, file: c.file, startLine: c.startLine, endLine: c.endLine,
      name: c.name, signature: c.signature, documentation: c.documentation,
      parentName: c.parentName, tokens: c.tokens, hash: c.hash,
      keywords: c.keywords, searchableText: c.searchableText, path: c.path,
    }));
    await this.sendToBackend('/index/chunks', { chunks: payload });
  }

  private async processDeletes(changes: FileChange[]): Promise<void> {
    const paths = changes.map(c => vscode.workspace.asRelativePath(c.uri));
    try { await this.sendToBackend('/index/delete', { paths }); }
    catch (error) { Logger.error('Delete processing failed:', error); }
  }

  private async processRenames(changes: FileChange[]): Promise<void> {
    const renames = changes.map(c => ({
      oldPath: c.oldUri ? vscode.workspace.asRelativePath(c.oldUri) : '',
      newPath: vscode.workspace.asRelativePath(c.uri),
    }));
    try { await this.sendToBackend('/index/rename', { renames }); }
    catch (error) { Logger.error('Rename processing failed:', error); }
  }

  private async sendToBackend(endpoint: string, data: unknown): Promise<unknown> {
    const url = `${this.options.apiEndpoint}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.options.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) { throw new Error(`HTTP ${response.status}: ${response.statusText}`); }
        return await response.json();
      } catch (error) {
        lastError = error as Error;
        Logger.warn(`Backend request failed (attempt ${attempt + 1}):`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw lastError || new Error('Backend request failed');
  }

  // ============ Embedding Integration ============

  private async submitForEmbedding(chunks: ProcessedChunk[]): Promise<void> {
    // Filter chunks that are not in cache
    const uncachedChunks = chunks.filter(chunk => {
      const hash = EmbeddingCache.generateChunkHash(
        chunk.embeddingText || chunk.content,
        chunk.file,
        chunk.startLine
      );
      return !embeddingCache.has(hash);
    });

    if (uncachedChunks.length === 0) {
      Logger.info('All chunks already in cache');
      return;
    }

    Logger.info(`Submitting ${uncachedChunks.length} chunks for embedding (${chunks.length - uncachedChunks.length} cached)`);

    const projectId = this.getProjectId();

    try {
      const jobs = await embeddingClient.submitJobBatched(projectId, uncachedChunks, {
        batchSize: 500,
        priority: 'normal',
        onBatchSubmitted: (batch, total) => {
          Logger.debug(`Submitted embedding batch ${batch}/${total}`);
        },
      });

      Logger.info(`Submitted ${jobs.length} embedding jobs`);
    } catch (error) {
      Logger.error('Failed to submit embedding jobs:', error);
      throw error;
    }
  }

  private handleEmbeddingProgress(status: EmbeddingJobStatus): void {
    this.updateProgress({
      phase: 'Generating embeddings',
      current: status.progress.completed,
      total: status.progress.total,
      percentage: status.progress.percentage,
      message: `Embedding ${status.progress.completed}/${status.progress.total} chunks`,
    });

    this.onProgressEmitter.fire(this.progress);
  }

  private handleEmbeddingCompleted(status: EmbeddingJobStatus): void {
    Logger.info(`Embedding job completed: ${status.jobId}`);
    this.stats.totalIndexed += status.progress.completed;
  }

  private handleEmbeddingFailed(status: EmbeddingJobStatus): void {
    Logger.error(`Embedding job failed: ${status.jobId} - ${status.error}`);
    this.stats.totalFailed += status.progress.failed;
  }

  private getProjectId(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }
    return 'default';
  }

  // ============ State ============

  private setState(state: IndexingState): void {
    if (this.state !== state) {
      this.state = state;
      this.progress.state = state;
      this.onStateChangeEmitter.fire(state);
      this.emitProgress();
    }
  }

  private updateProgress(partial: Partial<IndexingProgress>): void {
    Object.assign(this.progress, partial);
    this.emitProgress();
  }

  private emitProgress(): void {
    this.onProgressEmitter.fire({ ...this.progress });
    this.options.onProgress(this.progress);
  }

  getState(): IndexingState { return this.state; }
  getProgress(): IndexingProgress { return { ...this.progress }; }
  getStats(): IndexingStats { return { ...this.stats }; }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) { chunks.push(array.slice(i, i + size)); }
    return chunks;
  }

  dispose(): void {
    this.stop();
    this.fileWatcherInstance.dispose();
    embeddingClient.dispose();
    embeddingCache.dispose();
    this.onStateChangeEmitter.dispose();
    this.onProgressEmitter.dispose();
    this.onCompleteEmitter.dispose();
    this.onErrorEmitter.dispose();
  }
}

export function createIndexingCoordinator(apiEndpoint: string): IndexingCoordinator {
  return new IndexingCoordinator({ apiEndpoint });
}
