export class CacheKeyGenerator {
  private static instance: CacheKeyGenerator;

  static getInstance(): CacheKeyGenerator {
    if (!CacheKeyGenerator.instance) {
      CacheKeyGenerator.instance = new CacheKeyGenerator();
    }
    return CacheKeyGenerator.instance;
  }

  forResponse(model: string, systemPrompt: string, userMessage: string, contextHash: string): string {
    return 'resp:' + this.djb2(model + systemPrompt.slice(0, 200) + userMessage + contextHash);
  }

  forEmbedding(text: string, model: string): string {
    return 'emb:' + this.djb2(text + model);
  }

  forFileContent(filePath: string, mtime: number): string {
    return 'file:' + this.djb2(filePath) + ':' + mtime;
  }

  forSymbols(filePath: string, version: number): string {
    return 'sym:' + this.djb2(filePath) + ':' + version;
  }

  forCompletion(prefix: string, suffix: string, filePath: string): string {
    return 'comp:' + this.djb2(prefix.slice(-500) + suffix.slice(0, 200) + filePath);
  }

  forGitStatus(workspaceRoot: string): string {
    return 'git:' + this.djb2(workspaceRoot) + ':' + Math.floor(Date.now() / 3000);
  }

  forBlame(filePath: string, contentHash: string): string {
    return 'blame:' + this.djb2(filePath + contentHash);
  }

  forDocSearch(query: string, sourceIds: string): string {
    return 'docsearch:' + this.djb2(query + sourceIds);
  }

  forMemoryRecall(contextHash: string): string {
    return 'recall:' + contextHash;
  }

  forType(filePath: string, line: number, col: number, version: number): string {
    return 'type:' + this.djb2(filePath) + ':' + line + ':' + col + ':' + version;
  }

  forDefinition(filePath: string, line: number, col: number): string {
    return 'def:' + this.djb2(filePath) + ':' + line + ':' + col;
  }

  filePrefix(filePath: string): string {
    return this.djb2(filePath);
  }

  djb2(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
