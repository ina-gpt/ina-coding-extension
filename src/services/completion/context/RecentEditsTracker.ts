import * as vscode from 'vscode';
import { SessionEdit, EditPattern, RecentEditContext } from './ContextTypes';

export class RecentEditsTracker implements vscode.Disposable {
  private static instance: RecentEditsTracker;
  private edits: SessionEdit[] = [];
  private editPatterns: Map<string, EditPattern> = new Map();
  private maxEdits: number = 100;
  private maxAgeMs: number = 300000; // 5 minutes
  private disposables: vscode.Disposable[] = [];
  private patternDetectionEnabled: boolean = true;
  private editIdCounter: number = 0;

  static getInstance(): RecentEditsTracker {
    if (!RecentEditsTracker.instance) {
      RecentEditsTracker.instance = new RecentEditsTracker();
    }
    return RecentEditsTracker.instance;
  }

  startTracking(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.isUserEdit(event)) return;

        for (const change of event.contentChanges) {
          this.recordEdit(change, event.document);
        }
      })
    );
  }

  recordEdit(
    event: vscode.TextDocumentContentChangeEvent,
    document: vscode.TextDocument
  ): void {
    this.editIdCounter++;
    const editType = this.analyzeEditType(event);

    const sessionEdit: SessionEdit = {
      id: `se-${this.editIdCounter}`,
      filePath: document.uri.fsPath,
      range: {
        startLine: event.range.start.line,
        endLine: event.range.end.line,
        startColumn: event.range.start.character,
        endColumn: event.range.end.character,
      },
      oldText: document.getText(event.range).slice(0, 200), // Limit stored text
      newText: event.text.slice(0, 200),
      timestamp: Date.now(),
      type: editType,
      language: document.languageId,
    };

    this.edits.push(sessionEdit);

    if (this.patternDetectionEnabled) {
      this.detectPatterns(this.edits.slice(-20)); // Analyze last 20 edits
    }

    this.pruneOldEdits();
  }

  getRecentEdits(filePath?: string, maxAgeMs?: number): SessionEdit[] {
    const cutoff = Date.now() - (maxAgeMs ?? this.maxAgeMs);
    return this.edits.filter((e) => {
      if (e.timestamp < cutoff) return false;
      if (filePath && e.filePath !== filePath) return false;
      return true;
    });
  }

  getRelevantEdits(
    currentFile: string,
    cursorPosition: vscode.Position,
    limit: number
  ): SessionEdit[] {
    const cutoff = Date.now() - this.maxAgeMs;
    const recent = this.edits.filter((e) => e.timestamp >= cutoff);

    // Score edits by relevance
    const scored = recent.map((edit) => {
      let score = 0;

      // Same file bonus
      if (edit.filePath === currentFile) score += 10;

      // Same language bonus
      // (we'd need language info, approximate by extension)
      score += 2;

      // Proximity to cursor bonus
      if (edit.filePath === currentFile) {
        const distance = Math.abs(edit.range.startLine - cursorPosition.line);
        score += Math.max(0, 5 - distance / 10);
      }

      // Recency bonus
      const ageMs = Date.now() - edit.timestamp;
      score += Math.max(0, 5 - ageMs / 60000);

      // Non-trivial edit bonus
      if (edit.newText.trim().length > 3) score += 2;

      return { edit, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.edit);
  }

  getContext(
    currentFile: string,
    cursorPosition: vscode.Position,
    limit: number = 10
  ): RecentEditContext {
    const relevantEdits = this.getRelevantEdits(currentFile, cursorPosition, limit);
    return {
      edits: this.edits.slice(-50),
      totalEdits: this.edits.length,
      relevantEdits,
      editPatterns: this.getEditPatterns(),
    };
  }

  detectPatterns(edits: SessionEdit[]): void {
    // Detect common edit patterns
    const patternChecks: Array<{
      name: string;
      test: (edit: SessionEdit) => boolean;
    }> = [
      {
        name: 'adding_types',
        test: (e) =>
          e.type === 'replace' &&
          (e.newText.includes(':') || e.newText.includes('<')) &&
          !e.oldText.includes(':'),
      },
      {
        name: 'adding_semicolons',
        test: (e) => e.type === 'insert' && e.newText.trim() === ';',
      },
      {
        name: 'var_to_const',
        test: (e) =>
          e.type === 'replace' &&
          (e.oldText.includes('var ') || e.oldText.includes('let ')) &&
          e.newText.includes('const '),
      },
      {
        name: 'adding_async',
        test: (e) =>
          e.type === 'replace' &&
          e.newText.includes('async') &&
          !e.oldText.includes('async'),
      },
      {
        name: 'adding_error_handling',
        test: (e) =>
          e.newText.includes('try') ||
          e.newText.includes('catch') ||
          e.newText.includes('.catch('),
      },
    ];

    for (const check of patternChecks) {
      const matches = edits.filter(check.test);
      if (matches.length >= 2) {
        const existing = this.editPatterns.get(check.name);
        this.editPatterns.set(check.name, {
          pattern: check.name,
          frequency: matches.length,
          lastOccurrence: Math.max(...matches.map((m) => m.timestamp)),
          examples: matches.slice(-3).map((m) => `${m.oldText} → ${m.newText}`),
        });
      }
    }
  }

  getEditPatterns(): EditPattern[] {
    return [...this.editPatterns.values()].sort((a, b) => b.frequency - a.frequency);
  }

  formatEditsForPrompt(edits: SessionEdit[], maxTokens: number): string {
    const lines: string[] = ['// Recent edits in session:'];
    let tokenCount = 10;

    for (const edit of edits) {
      const entry =
        edit.type === 'insert'
          ? `// + ${edit.newText.split('\n')[0]}`
          : edit.type === 'delete'
            ? `// - ${edit.oldText.split('\n')[0]}`
            : `// ${edit.oldText.split('\n')[0]} → ${edit.newText.split('\n')[0]}`;

      const entryTokens = Math.ceil(entry.length / 4);
      if (tokenCount + entryTokens > maxTokens) break;
      lines.push(entry);
      tokenCount += entryTokens;
    }

    // Add detected patterns
    const patterns = this.getEditPatterns();
    if (patterns.length > 0) {
      lines.push(`// Detected patterns: ${patterns.map((p) => p.pattern.replace(/_/g, ' ')).join(', ')}`);
    }

    return lines.join('\n');
  }

  private analyzeEditType(event: vscode.TextDocumentContentChangeEvent): 'insert' | 'delete' | 'replace' {
    const hasOld = event.rangeLength > 0;
    const hasNew = event.text.length > 0;

    if (hasOld && hasNew) return 'replace';
    if (hasOld) return 'delete';
    return 'insert';
  }

  groupEditsByFile(): Map<string, SessionEdit[]> {
    const groups = new Map<string, SessionEdit[]>();
    for (const edit of this.edits) {
      const group = groups.get(edit.filePath) || [];
      group.push(edit);
      groups.set(edit.filePath, group);
    }
    return groups;
  }

  getEditVelocity(): { editsPerMinute: number; averageSize: number } {
    if (this.edits.length < 2) return { editsPerMinute: 0, averageSize: 0 };

    const oldest = this.edits[0].timestamp;
    const newest = this.edits[this.edits.length - 1].timestamp;
    const minuteSpan = Math.max(1, (newest - oldest) / 60000);

    const totalSize = this.edits.reduce((sum, e) => sum + e.newText.length, 0);

    return {
      editsPerMinute: this.edits.length / minuteSpan,
      averageSize: totalSize / this.edits.length,
    };
  }

  clearEdits(): void {
    this.edits = [];
    this.editPatterns.clear();
  }

  clearEditsForFile(filePath: string): void {
    this.edits = this.edits.filter((e) => e.filePath !== filePath);
  }

  private pruneOldEdits(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    this.edits = this.edits.filter((e) => e.timestamp >= cutoff);

    if (this.edits.length > this.maxEdits) {
      this.edits = this.edits.slice(-this.maxEdits);
    }
  }

  private isUserEdit(event: vscode.TextDocumentChangeEvent): boolean {
    // Filter out non-user changes
    if (event.document.uri.scheme !== 'file') return false;
    if (event.contentChanges.length === 0) return false;

    // Filter out large automated changes (>10 changes at once = likely formatting)
    if (event.contentChanges.length > 10) return false;

    return true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.edits = [];
    this.editPatterns.clear();
  }
}
