/**
 * Phase 15.2 — File Detector
 * Detects which file a code block should be applied to.
 */
import * as vscode from 'vscode';
import { ApplyTarget, CodeBlockInfo } from './ApplyTypes';
import { Logger } from '../../utils/Logger';

export class FileDetector {
  private static instance: FileDetector;
  private constructor() {}
  static getInstance(): FileDetector {
    if (!FileDetector.instance) FileDetector.instance = new FileDetector();
    return FileDetector.instance;
  }

  async detectTarget(codeBlock: CodeBlockInfo, workspaceRoot?: string): Promise<ApplyTarget> {
    // 1. Explicit file path from code block header
    if (codeBlock.filename) {
      const files = await this.findFileByName(codeBlock.filename);
      if (files.length === 1) {
        return { filePath: files[0], matchMethod: 'explicit', confidence: 1.0, alternatives: [] };
      }
      if (files.length > 1) {
        return { filePath: files[0], matchMethod: 'explicit', confidence: 0.9, alternatives: files.slice(1).map(f => ({ filePath: f, confidence: 0.8, reason: 'Filename match' })) };
      }
      // New file with explicit path
      const root = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      return { filePath: `${root}/${codeBlock.filename}`, matchMethod: 'new_file', confidence: 0.8, alternatives: [] };
    }

    // 2. Match against active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const activeFile = activeEditor.document.uri.fsPath;
      const activeLang = activeEditor.document.languageId;
      if (codeBlock.language && this.languageMatchesFile(codeBlock.language, activeLang)) {
        const score = await this.matchContent(codeBlock.code, activeEditor.document.getText());
        if (score > 0.3) {
          return { filePath: activeFile, matchMethod: 'content_match', confidence: Math.min(score + 0.3, 0.95), alternatives: [] };
        }
      }
    }

    // 3. Search open editors
    const openDocs = vscode.workspace.textDocuments.filter(d => d.uri.scheme === 'file');
    let bestMatch: { filePath: string; score: number } | null = null;
    for (const doc of openDocs.slice(0, 10)) {
      const score = await this.matchContent(codeBlock.code, doc.getText());
      if (score > (bestMatch?.score || 0.3)) {
        bestMatch = { filePath: doc.uri.fsPath, score };
      }
    }
    if (bestMatch) {
      return { filePath: bestMatch.filePath, matchMethod: 'content_match', confidence: bestMatch.score, alternatives: [] };
    }

    // 4. Active editor as fallback
    if (activeEditor) {
      return { filePath: activeEditor.document.uri.fsPath, matchMethod: 'language_match', confidence: 0.4, alternatives: [] };
    }

    // 5. New file
    return { filePath: null, matchMethod: 'new_file', confidence: 0.5, alternatives: [] };
  }

  parseCodeBlockHeader(raw: string): { language: string | null; filePath: string | null } {
    let language: string | null = null;
    let filePath: string | null = null;
    const headerMatch = raw.match(/^```(\w+)?(?:\s+\/\/\s*(.+?))?$/m);
    if (headerMatch) {
      language = headerMatch[1] || null;
      filePath = headerMatch[2]?.trim() || null;
    }
    if (!filePath) {
      const firstLine = raw.split('\n')[0] || '';
      const fileComment = firstLine.match(/(?:\/\/|#|\/\*)\s*(?:File:\s*)?([^\s*]+\.\w+)/);
      if (fileComment) filePath = fileComment[1];
    }
    return { language, filePath };
  }

  private async findFileByName(name: string): Promise<string[]> {
    try {
      const basename = name.split('/').pop() || name;
      const files = await vscode.workspace.findFiles(`**/${basename}`, '**/node_modules/**', 10);
      const results = files.map(f => f.fsPath);
      // Prefer exact path match
      const exactMatch = results.find(f => f.endsWith(name));
      if (exactMatch) return [exactMatch, ...results.filter(f => f !== exactMatch)];
      return results;
    } catch { return []; }
  }

  private async matchContent(codeBlock: string, fileContent: string): Promise<number> {
    const codeLines = codeBlock.split('\n').filter(l => l.trim().length > 5);
    if (codeLines.length === 0) return 0;
    let matchCount = 0;
    const symbols = this.extractSymbolNames(codeBlock);
    for (const sym of symbols) {
      if (fileContent.includes(sym)) matchCount++;
    }
    const symbolScore = symbols.length > 0 ? matchCount / symbols.length : 0;
    // Also check line overlap
    let lineMatches = 0;
    for (const line of codeLines.slice(0, 20)) {
      if (fileContent.includes(line.trim())) lineMatches++;
    }
    const lineScore = lineMatches / Math.min(codeLines.length, 20);
    return Math.max(symbolScore * 0.6, lineScore * 0.8);
  }

  private extractSymbolNames(code: string): string[] {
    const symbols: string[] = [];
    const patterns = [
      /(?:function|class|interface|type|enum|const|let|var)\s+(\w+)/g,
      /(?:export\s+(?:default\s+)?(?:function|class|const|let))\s+(\w+)/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) { symbols.push(match[1]); }
    }
    return [...new Set(symbols)];
  }

  private languageMatchesFile(blockLang: string, fileLang: string): boolean {
    const map: Record<string, string[]> = {
      ts: ['typescript', 'typescriptreact'], tsx: ['typescriptreact'], js: ['javascript', 'javascriptreact'],
      jsx: ['javascriptreact'], py: ['python'], python: ['python'], rust: ['rust'], rs: ['rust'],
      go: ['go'], java: ['java'], cpp: ['cpp'], c: ['c'], css: ['css'], html: ['html'],
      typescript: ['typescript', 'typescriptreact'], javascript: ['javascript', 'javascriptreact'],
    };
    return (map[blockLang] || [blockLang]).includes(fileLang);
  }
}
