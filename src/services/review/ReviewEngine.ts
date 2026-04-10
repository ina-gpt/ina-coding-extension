/**
 * ReviewEngine.ts — Phase 19 Step 19.3
 * AI-powered code review engine using INA-7 Pro
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReviewScope, ReviewReport, ReviewComment, ReviewConfig, FileDiff, DEFAULT_REVIEW_CONFIG, ApprovalStatus } from './ReviewAgentTypes';
import { DiffAnalyzer } from './DiffAnalyzer';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

const REVIEW_SYSTEM_PROMPT = `You are INA Code Reviewer, an expert code review AI created by INA GPT GmbH, Berlin.
Review the code diff below and provide structured feedback.

ALWAYS respond in JSON format:
{
  "comments": [
    {
      "file": "path/to/file",
      "line": 42,
      "severity": "critical|warning|suggestion|nitpick",
      "category": "bug|security|performance|style|naming|complexity|documentation|testing|error-handling",
      "message": "what is wrong and why",
      "suggestedFix": "optional corrected code"
    }
  ],
  "summary": "brief overall assessment",
  "score": 0-100
}

Focus on: bugs, security vulnerabilities, performance issues, missing error handling.
Do NOT comment on trivial style issues unless they affect readability.`;

export class ReviewEngine {
  private workspaceRoot: string;
  private config: ReviewConfig;
  private diffAnalyzer: DiffAnalyzer;
  private apiEndpoint: string;

  constructor(workspaceRoot: string, config?: Partial<ReviewConfig>) {
    this.workspaceRoot = workspaceRoot;
    this.config = { ...DEFAULT_REVIEW_CONFIG, ...config };
    this.diffAnalyzer = new DiffAnalyzer(workspaceRoot, this.config);
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
  }

  async review(scope: ReviewScope, authHeaders: Record<string, string>): Promise<ReviewReport> {
    const startTime = Date.now();
    const diffs = await this.diffAnalyzer.getDiff(scope);

    if (diffs.length === 0) {
      return this.emptyReport();
    }

    const allComments: ReviewComment[] = [];
    let totalLines = 0;

    for (const diff of diffs) {
      totalLines += diff.additions + diff.deletions;
      const context = await this.buildFileContext(diff);
      const prompt = this.buildReviewPrompt(diff, context);

      try {
        const resp = await fetch(`${this.apiEndpoint}/api/review/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ prompt, file: diff.file, language: diff.language }),
        });

        if (!resp.ok) continue;
        const data = await resp.json();
        const comments = this.parseReviewResponse(data.review || data, diff.file);
        allComments.push(...comments);
      } catch (e: any) {
        Logger.warn(`[ReviewEngine] Review failed for ${diff.file}: ${e.message}`);
      }
    }

    // Deduplicate
    const deduped = this.deduplicateComments(allComments);
    // Sort: critical > warning > suggestion > nitpick
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, suggestion: 2, nitpick: 3 };
    deduped.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const score = this.computeScore(deduped);
    const categoryCounts = this.countCategories(deduped);

    return {
      summary: this.generateSummary(deduped, diffs.length, totalLines),
      overallScore: score,
      comments: deduped,
      approvalStatus: this.determineApproval(deduped, score),
      timeSpent: Date.now() - startTime,
      linesReviewed: totalLines,
      filesReviewed: diffs.length,
      categoryCounts,
    };
  }

  private async buildFileContext(diff: FileDiff): Promise<string> {
    try {
      const filePath = path.join(this.workspaceRoot, diff.file);
      if (!fs.existsSync(filePath)) return '';
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      // Get imports and exports for understanding file purpose
      const imports = lines.filter(l => /^import\s|^from\s|^require/.test(l.trim())).join('\n');
      const exports = lines.filter(l => /^export\s/.test(l.trim())).join('\n');
      return `File imports:\n${imports}\n\nFile exports:\n${exports}`;
    } catch {
      return '';
    }
  }

  private buildReviewPrompt(diff: FileDiff, context: string): string {
    const sections: string[] = [];
    sections.push(`## File: ${diff.file} (${diff.language})\nStatus: ${diff.status} | +${diff.additions} -${diff.deletions}`);
    if (context) sections.push(`## File Context\n${context.slice(0, 1000)}`);

    for (const hunk of diff.hunks) {
      sections.push(`## Diff (lines ${hunk.newStart}-${hunk.newStart + hunk.newLines})\n\`\`\`diff\n${hunk.content.slice(0, 2000)}\n\`\`\``);
    }

    if (this.config.customRules.length > 0) {
      sections.push(`## Custom Rules\n${this.config.customRules.map(r => `- ${r}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  private parseReviewResponse(data: any, file: string): ReviewComment[] {
    if (data.comments && Array.isArray(data.comments)) {
      return data.comments.map((c: any) => ({
        file: c.file || file,
        line: c.line || 1,
        endLine: c.endLine,
        severity: ['critical', 'warning', 'suggestion', 'nitpick'].includes(c.severity) ? c.severity : 'suggestion',
        category: c.category || 'style',
        message: c.message || '',
        suggestedFix: c.suggestedFix,
        codeSnippet: c.codeSnippet,
      }));
    }

    // Try JSON extraction from text
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const jsonMatch = text.match(/\{[\s\S]*"comments"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.parseReviewResponse(parsed, file);
      } catch { /* */ }
    }

    return [];
  }

  private deduplicateComments(comments: ReviewComment[]): ReviewComment[] {
    const seen = new Set<string>();
    return comments.filter(c => {
      const key = `${c.file}:${c.line}:${c.category}:${c.message.slice(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private computeScore(comments: ReviewComment[]): number {
    let score = 100;
    for (const c of comments) {
      switch (c.severity) {
        case 'critical': score -= 15; break;
        case 'warning': score -= 5; break;
        case 'suggestion': score -= 2; break;
        case 'nitpick': score -= 1; break;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  private countCategories(comments: ReviewComment[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of comments) {
      counts[c.category] = (counts[c.category] || 0) + 1;
    }
    return counts;
  }

  private determineApproval(comments: ReviewComment[], score: number): ApprovalStatus {
    if (comments.some(c => c.severity === 'critical')) return 'request-changes';
    if (score >= 80) return 'approve';
    if (score >= 50) return 'comment';
    return 'request-changes';
  }

  private generateSummary(comments: ReviewComment[], fileCount: number, lineCount: number): string {
    const criticals = comments.filter(c => c.severity === 'critical').length;
    const warnings = comments.filter(c => c.severity === 'warning').length;
    if (criticals > 0) return `Found ${criticals} critical issue(s) and ${warnings} warning(s) across ${fileCount} file(s). Please address before merging.`;
    if (warnings > 0) return `Found ${warnings} warning(s) and ${comments.length - warnings} suggestions across ${fileCount} file(s). Consider addressing warnings.`;
    if (comments.length > 0) return `${comments.length} suggestion(s) across ${fileCount} file(s). Code looks good overall.`;
    return `Reviewed ${fileCount} file(s), ${lineCount} lines. No issues found. Looks good!`;
  }

  private emptyReport(): ReviewReport {
    return { summary: 'No changes to review', overallScore: 100, comments: [], approvalStatus: 'approve', timeSpent: 0, linesReviewed: 0, filesReviewed: 0, categoryCounts: {} };
  }
}
