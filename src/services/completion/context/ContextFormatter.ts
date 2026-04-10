import {
  FullCompletionContext,
  ImportContext,
  RelatedFileContext,
  RecentEditContext,
  FileContext,
} from './ContextTypes';

export class ContextFormatter {
  private static instance: ContextFormatter;
  private includeLineNumbers: boolean = false;
  private includeFilePaths: boolean = true;
  private maxFormattedLength: number = 32000;

  static getInstance(): ContextFormatter {
    if (!ContextFormatter.instance) {
      ContextFormatter.instance = new ContextFormatter();
    }
    return ContextFormatter.instance;
  }

  formatForFIM(context: FullCompletionContext): { prefix: string; suffix: string } {
    const prefix = this.formatPrefix(context);
    const suffix = this.formatSuffix(context);
    return { prefix, suffix };
  }

  formatForInstruction(context: FullCompletionContext): string {
    const parts: string[] = [];

    parts.push(`<file path="${context.file.relativePath}" language="${context.file.language}">`);

    if (context.imports.imports.length > 0) {
      parts.push('<imports>');
      parts.push(this.formatImports(context.imports, 500));
      parts.push('</imports>');
    }

    if (context.relatedFiles.files.length > 0) {
      parts.push('<related_files>');
      parts.push(this.formatRelatedFiles(context.relatedFiles));
      parts.push('</related_files>');
    }

    parts.push('<code>');
    parts.push(context.prefix.text);
    parts.push('<cursor/>');
    parts.push(context.suffix.text);
    parts.push('</code>');

    parts.push('</file>');

    return parts.join('\n');
  }

  formatPrefix(context: FullCompletionContext): string {
    const parts: string[] = [];

    // Add related file snippets as comments at the top
    if (context.relatedFiles.files.length > 0) {
      const relatedComments = this.formatRelatedFiles(context.relatedFiles);
      if (relatedComments) {
        parts.push(relatedComments);
        parts.push('');
      }
    }

    // Add recent edit patterns as comments
    if (context.recentEdits.editPatterns.length > 0) {
      const patterns = context.recentEdits.editPatterns
        .slice(0, 3)
        .map((p) => p.pattern.replace(/_/g, ' '))
        .join(', ');
      parts.push(`// Recent editing pattern: ${patterns}`);
      parts.push('');
    }

    // Add the actual prefix code
    parts.push(context.prefix.text);

    return parts.join('\n');
  }

  formatSuffix(context: FullCompletionContext): string {
    return context.suffix.text;
  }

  formatImports(imports: ImportContext, tokenBudget: number): string {
    const lines: string[] = [];
    let tokenCount = 0;

    // Prioritize relevant imports
    const relevant = imports.relevantImports.length > 0
      ? imports.relevantImports
      : imports.imports;

    for (const imp of relevant) {
      const lineTokens = Math.ceil(imp.raw.length / 4);
      if (tokenCount + lineTokens > tokenBudget) break;
      lines.push(imp.raw);
      tokenCount += lineTokens;
    }

    return lines.join('\n');
  }

  formatRelatedFiles(relatedFiles: RelatedFileContext): string {
    if (relatedFiles.files.length === 0) return '';

    const parts: string[] = [];

    for (const file of relatedFiles.files) {
      const header = this.includeFilePaths
        ? `// From ${file.relativePath}:`
        : `// Related (${file.reason}):`;

      parts.push(header);

      // Add snippet as comments
      const snippetLines = file.snippet.split('\n').slice(0, 20);
      for (const line of snippetLines) {
        parts.push(`// ${line}`);
      }

      parts.push('');
    }

    return parts.join('\n');
  }

  formatRecentEdits(recentEdits: RecentEditContext): string {
    if (recentEdits.relevantEdits.length === 0) return '';

    const parts: string[] = ['// Recent changes:'];

    for (const edit of recentEdits.relevantEdits.slice(0, 5)) {
      if (edit.type === 'replace') {
        parts.push(`// - ${edit.oldText.split('\n')[0]}`);
        parts.push(`// + ${edit.newText.split('\n')[0]}`);
      } else if (edit.type === 'insert') {
        parts.push(`// + ${edit.newText.split('\n')[0]}`);
      }
    }

    return parts.join('\n');
  }

  formatFileContext(fileContext: FileContext): string {
    const parts: string[] = [];

    if (fileContext.diagnostics.length > 0) {
      const errors = fileContext.diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) {
        parts.push(`// Errors in file:`);
        for (const err of errors.slice(0, 3)) {
          parts.push(`// Line ${err.line}: ${err.message}`);
        }
      }
    }

    return parts.join('\n');
  }

  createContextComment(content: string, source: string): string {
    const lines = content.split('\n');
    const commented = lines.map((l) => `// ${l}`).join('\n');
    return `// --- ${source} ---\n${commented}\n// ---`;
  }

  truncateSection(
    content: string,
    maxTokens: number,
    priority: 'start' | 'end' | 'middle'
  ): string {
    const currentTokens = Math.ceil(content.length / 4);
    if (currentTokens <= maxTokens) return content;

    const maxChars = maxTokens * 4;

    switch (priority) {
      case 'start':
        return content.slice(0, maxChars);
      case 'end':
        return content.slice(-maxChars);
      case 'middle': {
        const half = Math.floor(maxChars / 2);
        return content.slice(0, half) + '\n...\n' + content.slice(-half);
      }
    }
  }

  estimateFormattedSize(context: FullCompletionContext): number {
    let total = 0;
    total += Math.ceil(context.prefix.text.length / 4);
    total += Math.ceil(context.suffix.text.length / 4);

    for (const file of context.relatedFiles.files) {
      total += Math.ceil(file.snippet.length / 4) + 10; // +10 for comment markers
    }

    for (const imp of context.imports.imports) {
      total += Math.ceil(imp.raw.length / 4);
    }

    return total;
  }

  setIncludeLineNumbers(include: boolean): void {
    this.includeLineNumbers = include;
  }

  setIncludeFilePaths(include: boolean): void {
    this.includeFilePaths = include;
  }
}
