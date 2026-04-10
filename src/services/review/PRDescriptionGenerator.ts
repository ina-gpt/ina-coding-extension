/**
 * PRDescriptionGenerator.ts — Phase 19 Step 19.3
 * Generate PR descriptions using INA-7 Pro
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ReviewScope, PRDescription, PRType } from './ReviewAgentTypes';
import { DiffAnalyzer } from './DiffAnalyzer';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

const execAsync = promisify(exec);

export class PRDescriptionGenerator {
  private workspaceRoot: string;
  private diffAnalyzer: DiffAnalyzer;
  private apiEndpoint: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.diffAnalyzer = new DiffAnalyzer(workspaceRoot);
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
  }

  async generate(scope: ReviewScope, authHeaders: Record<string, string>): Promise<PRDescription> {
    const [commits, diffSummary, diffs, blameSuggestions] = await Promise.all([
      this.getCommitLog(scope),
      this.diffAnalyzer.getDiffSummary(scope),
      this.diffAnalyzer.getDiff(scope),
      this.suggestReviewers(scope),
    ]);

    const prType = this.detectPRType(commits, diffs);
    const prompt = this.buildPrompt(commits, diffSummary, diffs, prType);

    try {
      const resp = await fetch(`${this.apiEndpoint}/api/review/pr-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ prompt, type: prType }),
      });

      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const data = await resp.json();
      const result = this.parseResponse(data.description || data);
      result.type = prType;
      result.reviewerSuggestions = blameSuggestions;
      return result;
    } catch (e: any) {
      Logger.warn('[PRDescriptionGenerator] Falling back to basic description:', e.message);
      return this.fallbackDescription(commits, diffSummary, prType, blameSuggestions);
    }
  }

  private async getCommitLog(scope: ReviewScope): Promise<string> {
    try {
      const range = scope.baseBranch && scope.headBranch
        ? `${scope.baseBranch}..${scope.headBranch}`
        : scope.commitRange || 'HEAD~10..HEAD';
      const { stdout } = await execAsync(`git log --oneline --no-merges ${range} 2>/dev/null | head -30`, { cwd: this.workspaceRoot, timeout: 5000 });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  private async suggestReviewers(scope: ReviewScope): Promise<string[]> {
    try {
      const diffs = await this.diffAnalyzer.getDiff(scope);
      const files = diffs.map(d => `"${d.file}"`).join(' ');
      if (!files) return [];
      const { stdout } = await execAsync(`git log --format='%an' -- ${files} 2>/dev/null | sort | uniq -c | sort -rn | head -5`, { cwd: this.workspaceRoot, timeout: 5000 });
      return stdout.trim().split('\n').map(l => l.trim().replace(/^\d+\s+/, '')).filter(Boolean);
    } catch {
      return [];
    }
  }

  private detectPRType(commits: string, diffs: any[]): PRType {
    const combined = commits.toLowerCase();
    if (combined.includes('fix') || combined.includes('bug')) return 'bugfix';
    if (combined.includes('refactor')) return 'refactor';
    if (combined.includes('docs') || combined.includes('readme')) return 'docs';
    if (combined.includes('test')) return 'test';
    if (combined.includes('ci') || combined.includes('deploy') || combined.includes('docker')) return 'ci';
    if (combined.includes('chore') || combined.includes('bump') || combined.includes('update dep')) return 'chore';
    return 'feature';
  }

  private buildPrompt(commits: string, summary: any, diffs: any[], prType: string): string {
    const fileList = diffs.map((d: any) => `- ${d.status}: ${d.file} (+${d.additions}/-${d.deletions})`).join('\n');
    return `Generate a PR description for the following changes.

## Commits
${commits || '(no commits)'}

## Summary
${summary.filesChanged} files changed, ${summary.additions} additions, ${summary.deletions} deletions
Type: ${prType}

## Changed Files
${fileList}

## Task
Generate a PR title (conventional commit format) and body (what/why/how sections).
Detect any breaking changes.
Respond in JSON: { "title": "...", "body": "markdown...", "breakingChanges": ["..."], "testingNotes": "..." }`;
  }

  private parseResponse(data: any): PRDescription {
    if (data.title && data.body) {
      return { title: data.title, body: data.body, type: 'feature', breakingChanges: data.breakingChanges || [], testingNotes: data.testingNotes || '', reviewerSuggestions: [] };
    }
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const jsonMatch = text.match(/\{[\s\S]*"title"[\s\S]*\}/);
    if (jsonMatch) {
      try { return this.parseResponse(JSON.parse(jsonMatch[0])); } catch { /* */ }
    }
    return { title: text.slice(0, 80), body: text, type: 'feature', breakingChanges: [], testingNotes: '', reviewerSuggestions: [] };
  }

  private fallbackDescription(commits: string, summary: any, type: PRType, reviewers: string[]): PRDescription {
    return {
      title: `${type}: update ${summary.filesChanged} file(s)`,
      body: `## Summary\n${summary.filesChanged} files changed, ${summary.additions} additions, ${summary.deletions} deletions\n\n## Commits\n${commits || 'N/A'}`,
      type,
      breakingChanges: [],
      testingNotes: '',
      reviewerSuggestions: reviewers,
    };
  }
}
