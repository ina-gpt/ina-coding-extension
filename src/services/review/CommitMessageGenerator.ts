/**
 * CommitMessageGenerator.ts — Phase 19 Step 19.3
 * Generate conventional commit messages from staged changes
 */

import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DiffAnalyzer } from './DiffAnalyzer';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

const execAsync = promisify(exec);

export class CommitMessageGenerator {
  private workspaceRoot: string;
  private diffAnalyzer: DiffAnalyzer;
  private apiEndpoint: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.diffAnalyzer = new DiffAnalyzer(workspaceRoot);
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
  }

  async generate(staged: boolean, authHeaders: Record<string, string>): Promise<string> {
    const scope = { files: [], staged };
    const diffs = await this.diffAnalyzer.getDiff(scope);

    if (diffs.length === 0) return '';

    const type = this.detectType(diffs);
    const scope_ = this.detectScope(diffs);
    const filesSummary = diffs.map(d => `${d.status}: ${d.file} (+${d.additions}/-${d.deletions})`).join('\n');
    const diffContent = diffs.map(d => d.hunks.map(h => h.content).join('\n')).join('\n---\n').slice(0, 3000);

    const prompt = `Generate a conventional commit message for these changes.

Type detected: ${type}
Scope detected: ${scope_}

## Changed Files
${filesSummary}

## Diff
\`\`\`
${diffContent}
\`\`\`

Rules:
- Format: type(scope): description
- Description: imperative mood, lowercase, no period
- Body: what and why (not how), wrapped at 72 chars
- Footer: Breaking changes if any
- Respond with ONLY the commit message, no JSON or explanation`;

    try {
      const resp = await fetch(`${this.apiEndpoint}/api/review/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ prompt, file: 'commit', language: 'git' }),
      });
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const data = await resp.json();
      const text = data.review?.message || data.review?.summary || data.analysis?.rootCause || '';
      // Clean up: extract just the commit message
      const cleaned = text.replace(/```/g, '').trim();
      return cleaned || this.fallbackMessage(type, scope_, diffs);
    } catch (e: any) {
      Logger.warn('[CommitMessageGenerator] Fallback:', e.message);
      return this.fallbackMessage(type, scope_, diffs);
    }
  }

  private detectType(diffs: any[]): string {
    const files = diffs.map((d: any) => d.file.toLowerCase());
    if (files.some(f => f.includes('test'))) return 'test';
    if (files.some(f => f.includes('.md') || f.includes('doc'))) return 'docs';
    if (files.every(f => f.includes('.css') || f.includes('.scss') || f.includes('style'))) return 'style';
    if (files.some(f => f.includes('ci') || f.includes('docker') || f.includes('.yml'))) return 'ci';
    if (diffs.every((d: any) => d.status === 'added')) return 'feat';
    if (diffs.every((d: any) => d.additions > d.deletions * 2)) return 'feat';
    return 'fix';
  }

  private detectScope(diffs: any[]): string {
    const dirs = diffs.map((d: any) => {
      const parts = d.file.split('/');
      return parts.length > 1 ? parts[parts.length - 2] : parts[0];
    });
    const counts: Record<string, number> = {};
    for (const d of dirs) counts[d] = (counts[d] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || '';
  }

  private fallbackMessage(type: string, scope: string, diffs: any[]): string {
    const description = diffs.length === 1 ? `update ${path.basename(diffs[0].file)}` : `update ${diffs.length} files`;
    return scope ? `${type}(${scope}): ${description}` : `${type}: ${description}`;
  }
}
