import {
  FIMTokens,
  FIMRequest,
  LANGUAGE_STOP_SEQUENCES,
  getFIMTokensForModel,
  getStopSequences,
} from './FIMTypes';

export class FIMPromptBuilder {
  private static instance: FIMPromptBuilder;
  private maxPrefixChars: number = 8000;
  private maxSuffixChars: number = 3000;
  private includeFileHeader: boolean = true;
  private includeRepositoryContext: boolean = false;

  static getInstance(): FIMPromptBuilder {
    if (!FIMPromptBuilder.instance) {
      FIMPromptBuilder.instance = new FIMPromptBuilder();
    }
    return FIMPromptBuilder.instance;
  }

  buildPrompt(request: FIMRequest): { prompt: string; stopSequences: string[] } {
    const tokens = getFIMTokensForModel(request.model);
    const prefix = this.preparePrefix(request.prefix, request);
    const suffix = this.prepareSuffix(request.suffix);
    const stopSequences = getStopSequences(request.language, request.model);

    const prompt = this.formatFIMPrompt(tokens, prefix, suffix, request);

    return { prompt, stopSequences };
  }

  formatFIMPrompt(
    tokens: FIMTokens,
    prefix: string,
    suffix: string,
    request: FIMRequest
  ): string {
    const parts: string[] = [];

    // Repository context (if model supports it)
    if (this.includeRepositoryContext && tokens.repository && request.repositoryContext) {
      parts.push(`${tokens.repository}${request.repositoryContext}`);
    }

    // File context (if model supports it)
    if (this.includeFileHeader && tokens.file && request.filePath) {
      parts.push(`${tokens.file}${request.filePath}`);
    }

    // FIM format: prefix + content + suffix + content + middle
    parts.push(`${tokens.prefix}${prefix}${tokens.suffix}${suffix}${tokens.middle}`);

    return parts.join('');
  }

  buildAlternativePrompt(request: FIMRequest): string {
    // For models without FIM support - instruction format
    const langName = this.getLanguageDisplayName(request.language);
    return [
      `Complete the following ${langName} code. Output ONLY the code that goes at the cursor position.`,
      '',
      '```' + request.language,
      request.prefix,
      '/* CURSOR - complete from here */',
      request.suffix,
      '```',
      '',
      'Completion:',
    ].join('\n');
  }

  buildMultiFilePrompt(
    request: FIMRequest,
    relatedFiles: Array<{ path: string; content: string }>
  ): string {
    const tokens = getFIMTokensForModel(request.model);

    if (!tokens.file) {
      // Model doesn't support multi-file, include as comments
      const comments = relatedFiles
        .map((f) => `// --- ${f.path} ---\n${f.content.split('\n').map((l) => `// ${l}`).join('\n')}`)
        .join('\n\n');
      const prefix = comments + '\n\n' + request.prefix;
      return `${tokens.prefix}${prefix}${tokens.suffix}${request.suffix}${tokens.middle}`;
    }

    // Multi-file FIM format
    const parts: string[] = [];

    if (tokens.repository && request.repositoryContext) {
      parts.push(`${tokens.repository}${request.repositoryContext}`);
    }

    // Add related files
    for (const file of relatedFiles) {
      parts.push(`${tokens.file}${file.path}`);
      parts.push(file.content);
    }

    // Add current file with FIM
    parts.push(`${tokens.file}${request.filePath}`);
    parts.push(`${tokens.prefix}${request.prefix}${tokens.suffix}${request.suffix}${tokens.middle}`);

    return parts.join('\n');
  }

  private preparePrefix(prefix: string, request: FIMRequest): string {
    let result = prefix;

    // Add file header comment if not using file tokens
    if (this.includeFileHeader && request.filePath) {
      const tokens = getFIMTokensForModel(request.model);
      if (!tokens.file) {
        const ext = request.filePath.split('.').pop() || '';
        const comment = this.getCommentStyle(request.language);
        result = `${comment} File: ${request.filePath}\n${result}`;
      }
    }

    // Smart truncation
    if (result.length > this.maxPrefixChars) {
      result = this.smartTruncatePrefix(result, this.maxPrefixChars);
    }

    return result;
  }

  private prepareSuffix(suffix: string): string {
    let result = suffix;

    if (result.length > this.maxSuffixChars) {
      result = this.smartTruncateSuffix(result, this.maxSuffixChars);
    }

    return result;
  }

  private smartTruncatePrefix(text: string, maxChars: number): string {
    const truncated = text.slice(-maxChars);
    const newlineIdx = truncated.indexOf('\n');
    return newlineIdx >= 0 ? truncated.slice(newlineIdx + 1) : truncated;
  }

  private smartTruncateSuffix(text: string, maxChars: number): string {
    const truncated = text.slice(0, maxChars);
    const newlineIdx = truncated.lastIndexOf('\n');
    return newlineIdx >= 0 ? truncated.slice(0, newlineIdx) : truncated;
  }

  private getCommentStyle(language: string): string {
    const hashComments = ['python', 'ruby', 'perl', 'bash', 'shell', 'yaml', 'toml'];
    const slashComments = ['javascript', 'typescript', 'typescriptreact', 'javascriptreact',
      'java', 'c', 'cpp', 'go', 'rust', 'swift', 'kotlin', 'php', 'dart'];
    const dashComments = ['lua', 'haskell', 'sql'];

    if (hashComments.includes(language)) return '#';
    if (dashComments.includes(language)) return '--';
    return '//'; // Default for most languages
  }

  private getLanguageDisplayName(language: string): string {
    const names: Record<string, string> = {
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      typescriptreact: 'TypeScript React',
      javascriptreact: 'JavaScript React',
      python: 'Python',
      go: 'Go',
      rust: 'Rust',
      java: 'Java',
      cpp: 'C++',
      c: 'C',
      ruby: 'Ruby',
      php: 'PHP',
      swift: 'Swift',
      kotlin: 'Kotlin',
    };
    return names[language] || language;
  }

  setMaxPrefixChars(chars: number): void {
    this.maxPrefixChars = chars;
  }

  setMaxSuffixChars(chars: number): void {
    this.maxSuffixChars = chars;
  }

  setIncludeFileHeader(include: boolean): void {
    this.includeFileHeader = include;
  }

  setIncludeRepositoryContext(include: boolean): void {
    this.includeRepositoryContext = include;
  }
}
