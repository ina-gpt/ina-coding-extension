/**
 * Phase 15.6 — AI Commit Message Generator
 *
 * Generates commit messages using AI based on staged/unstaged diffs,
 * recent commit history, and project rules.
 */

import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { RulesInjector } from '../rules/RulesInjector';
import { CodeSecurityGate } from '../codesec/CodeSecurityGate';
import {
  CommitMessageResult,
  CommitMessageAlternative,
  CommitMessageConfig,
  CommitGenerateOptions,
  ParsedCommitStyle,
  CommitType,
  AgentPlan,
  DEFAULT_COMMIT_CONFIG,
} from './GitAITypes';

export class CommitMessageGenerator {
  private static instance: CommitMessageGenerator;
  private config: CommitMessageConfig;

  private constructor() {
    this.config = { ...DEFAULT_COMMIT_CONFIG };
  }

  static getInstance(): CommitMessageGenerator {
    if (!CommitMessageGenerator.instance) {
      CommitMessageGenerator.instance = new CommitMessageGenerator();
    }
    return CommitMessageGenerator.instance;
  }

  // ============ Public API ============

  /**
   * Generate a commit message from the current git diff.
   */
  async generate(options?: CommitGenerateOptions): Promise<CommitMessageResult> {
    const workspaceRoot = this.getWorkspaceRoot();
    const staged = options?.staged !== false;

    // 1. Get diff
    const diff = this.getGitDiff(workspaceRoot, staged);
    if (!diff.trim()) {
      throw new Error(staged
        ? 'No staged changes found. Stage files with git add first.'
        : 'No changes found in the working tree.');
    }

    // 2. Get recent commits for style learning
    const recentCommits = this.getRecentCommits(workspaceRoot);

    // 3. Get project rules if available
    let projectRules: string | null = null;
    try {
      const injector = RulesInjector.getInstance();
      projectRules = injector.getRulesSummary();
    } catch {
      Logger.debug('RulesInjector not available, skipping project rules');
    }

    // 4. Sanitize diff via CodeSecurityGate
    const sanitizedDiff = this.sanitizeDiff(diff);

    // 5. Detect type and scope from diff
    const detectedType = this.detectType(diff);
    const detectedScope = this.detectScope(diff);

    // 6. Parse commit style from history
    const parsedStyle = this.config.learnFromHistory
      ? this.parseCommitStyle(recentCommits)
      : null;
    const effectiveStyle = options?.style ?? parsedStyle?.dominant ?? this.config.style;

    // 7. Build prompt and call AI
    const prompt = this.buildPrompt(sanitizedDiff, recentCommits, projectRules, {
      style: effectiveStyle,
      type: detectedType,
      scope: detectedScope,
      maxLength: options?.maxLength ?? this.config.maxSummaryLength,
      hint: options?.hint,
    });

    const aiResponse = await this.callAI(prompt.system, prompt.user);
    const result = this.parseAIResponse(aiResponse, detectedType, detectedScope);

    // 8. Generate alternatives
    const altStyles = (['conventional', 'descriptive', 'imperative'] as const)
      .filter((s) => s !== effectiveStyle)
      .slice(0, 2);
    result.alternatives = await this.generateAlternatives(sanitizedDiff, altStyles);

    Logger.info(`Commit message generated: ${result.summary}`);
    return result;
  }

  /**
   * Generate a commit message from an agent execution plan.
   */
  async generateFromPlan(plan: AgentPlan, filesChanged: string[]): Promise<CommitMessageResult> {
    const workspaceRoot = this.getWorkspaceRoot();
    const recentCommits = this.getRecentCommits(workspaceRoot);

    const systemPrompt = [
      'You are a commit message generator.',
      'Generate a commit message based on the agent plan and files changed.',
      'Respond with JSON: { "summary": "...", "body": "...", "type": "...", "scope": "...", "breaking": false }',
    ].join('\n');

    const userPrompt = [
      `## Agent Plan`,
      `Goal: ${plan.goal}`,
      `Description: ${plan.description}`,
      `Steps:\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      '',
      `## Files Changed`,
      filesChanged.map((f) => `- ${f}`).join('\n'),
      '',
      `## Recent Commits`,
      recentCommits.slice(0, 10).join('\n'),
      '',
      `Style: ${this.config.style}, max summary length: ${this.config.maxSummaryLength}`,
    ].join('\n');

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    const scope = this.detectScopeFromPaths(filesChanged);
    return this.parseAIResponse(aiResponse, 'feat', scope);
  }

  /**
   * Detect the scope from the diff (directory / module name).
   */
  detectScope(diff: string): string | null {
    if (!this.config.includeScope) {
      return null;
    }
    const filePathRegex = /^(?:diff --git a\/|[+-]{3} [ab]\/)(.+)/gm;
    const paths: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = filePathRegex.exec(diff)) !== null) {
      paths.push(match[1]);
    }
    return this.detectScopeFromPaths(paths);
  }

  /**
   * Detect commit type from the diff content.
   */
  detectType(diff: string): CommitType {
    const lower = diff.toLowerCase();

    if (/\+.*\b(test|spec|describe|it\(|expect)\b/m.test(diff)) {
      return 'test';
    }
    if (/^[+-]{3}.*\.(md|txt|rst|adoc)/m.test(diff)) {
      return 'docs';
    }
    if (/^[+-]{3}.*\.(css|scss|less|styled)/m.test(diff)) {
      return 'style';
    }
    if (/^[+-]{3}.*(ci|\.github\/workflows|\.gitlab-ci|Jenkinsfile)/m.test(diff)) {
      return 'ci';
    }
    if (/^[+-]{3}.*(package\.json|tsconfig|webpack|vite|rollup|Makefile|Dockerfile)/m.test(diff)) {
      return 'build';
    }
    if (lower.includes('fix') || lower.includes('bug') || lower.includes('patch') || lower.includes('resolve')) {
      return 'fix';
    }
    if (/^[+-]{3}.*\.(lock|sum|mod)$/m.test(diff)) {
      return 'chore';
    }
    if (/performance|optimize|cache|memoize|lazy/i.test(diff)) {
      return 'perf';
    }

    // Count additions vs deletions to guess refactor vs feat
    const additions = (diff.match(/^\+[^+]/gm) || []).length;
    const deletions = (diff.match(/^-[^-]/gm) || []).length;
    if (deletions > additions * 0.8 && additions > 0) {
      return 'refactor';
    }

    return 'feat';
  }

  // ============ Private Methods ============

  private getWorkspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder open.');
    }
    return folders[0].uri.fsPath;
  }

  private getGitDiff(cwd: string, staged: boolean): string {
    try {
      const cmd = staged ? 'git diff --cached' : 'git diff';
      const result = execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 5 });

      // If staged diff is empty, fall back to unstaged
      if (staged && !result.trim()) {
        return execSync('git diff', { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 5 });
      }
      return result;
    } catch (err) {
      Logger.error('Failed to get git diff', err);
      throw new Error('Failed to get git diff. Is this a git repository?');
    }
  }

  private getRecentCommits(cwd: string): string[] {
    try {
      const result = execSync('git log --oneline -20', { cwd, encoding: 'utf-8' });
      return result.trim().split('\n').filter(Boolean);
    } catch {
      Logger.debug('Failed to get recent commits, repository may be empty');
      return [];
    }
  }

  private sanitizeDiff(diff: string): string {
    try {
      const gate = CodeSecurityGate.getInstance();
      const result = gate.scanOutgoingCode(diff, null, 'commit-message-generation');
      if (result.warnings && result.warnings.length > 0) {
        Logger.warn(`Security scan warnings: ${result.warnings.join(', ')}`);
      }
      return result.sanitizedCode ?? diff;
    } catch {
      Logger.debug('CodeSecurityGate not available, using raw diff');
      return diff;
    }
  }

  private detectScopeFromPaths(paths: string[]): string | null {
    if (paths.length === 0) {
      return null;
    }

    // Extract first meaningful directory segment
    const dirs = paths
      .map((p) => {
        const parts = p.replace(/^[ab]\//, '').split('/');
        return parts.length > 1 ? parts[parts.length - 2] : null;
      })
      .filter(Boolean) as string[];

    if (dirs.length === 0) {
      return null;
    }

    // Find most common directory
    const counts = new Map<string, number>();
    for (const d of dirs) {
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  private parseCommitStyle(recentCommits: string[]): ParsedCommitStyle {
    const conventionalRegex = /^[a-f0-9]+ (feat|fix|docs|style|refactor|test|chore|perf|ci|build)(\(.+?\))?[!]?:/;
    let conventionalCount = 0;
    const types: string[] = [];
    const scopes: string[] = [];

    for (const commit of recentCommits) {
      const match = conventionalRegex.exec(commit);
      if (match) {
        conventionalCount++;
        types.push(match[1]);
        if (match[2]) {
          scopes.push(match[2].slice(1, -1));
        }
      }
    }

    const total = recentCommits.length || 1;
    let dominant: ParsedCommitStyle['dominant'] = 'descriptive';
    if (conventionalCount / total > 0.5) {
      dominant = 'conventional';
    } else {
      // Check if most start with imperative verb
      const imperativeVerbs = /^[a-f0-9]+ (add|fix|update|remove|refactor|change|create|delete|move|rename|implement|improve)/i;
      const imperativeCount = recentCommits.filter((c) => imperativeVerbs.test(c)).length;
      if (imperativeCount / total > 0.5) {
        dominant = 'imperative';
      }
    }

    return {
      dominant,
      conventionalCount,
      totalCount: total,
      commonTypes: [...new Set(types)],
      commonScopes: [...new Set(scopes)],
    };
  }

  private buildPrompt(
    diff: string,
    recentCommits: string[],
    projectRules: string | null,
    opts: { style: string; type: CommitType; scope: string | null; maxLength: number; hint?: string },
  ): { system: string; user: string } {
    const styleInstructions: Record<string, string> = {
      conventional: `Use Conventional Commits format: <type>(<scope>): <description>. Type: ${opts.type}${opts.scope ? `, Scope: ${opts.scope}` : ''}.`,
      descriptive: 'Write a clear, descriptive commit message that explains what changed and why.',
      imperative: 'Write in imperative mood (e.g., "Add feature" not "Added feature").',
    };

    const system = [
      'You are a commit message generator for a software project.',
      'Analyze the diff and generate a precise, informative commit message.',
      styleInstructions[opts.style] || styleInstructions.conventional,
      `Maximum summary length: ${opts.maxLength} characters.`,
      'Respond ONLY with valid JSON:',
      '{ "summary": "...", "body": "..." | null, "type": "...", "scope": "..." | null, "breaking": false }',
      projectRules ? `\nProject rules:\n${projectRules}` : '',
    ].filter(Boolean).join('\n');

    const truncatedDiff = diff.length > 8000 ? diff.substring(0, 8000) + '\n...[diff truncated]' : diff;

    const user = [
      '## Diff',
      '```',
      truncatedDiff,
      '```',
      '',
      recentCommits.length > 0 ? `## Recent Commits\n${recentCommits.slice(0, 10).join('\n')}` : '',
      opts.hint ? `## Hint\n${opts.hint}` : '',
    ].filter(Boolean).join('\n');

    return { system, user };
  }

  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const endpoint = ConfigManager.getApiEndpoint();
    const url = `${endpoint}/api/chat`;
    const model = ConfigManager.get<string>('models.chat', 'INA-7 Pro');

    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { temperature: 0.3 },
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      const data = await response.json() as { message?: { content?: string } };
      return data?.message?.content ?? '';
    } catch (err) {
      Logger.error('AI commit message API call failed', err);
      throw new Error('Failed to generate commit message. Check your API connection.');
    }
  }

  private parseAIResponse(raw: string, fallbackType: CommitType, fallbackScope: string | null): CommitMessageResult {
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: String(parsed.summary || '').slice(0, this.config.maxSummaryLength),
        body: parsed.body ?? null,
        type: parsed.type || fallbackType,
        scope: parsed.scope ?? fallbackScope,
        breaking: Boolean(parsed.breaking),
        alternatives: [],
      };
    } catch {
      Logger.warn('Failed to parse AI response as JSON, using raw text');
      const summary = raw.trim().split('\n')[0].slice(0, this.config.maxSummaryLength);
      return {
        summary,
        body: null,
        type: fallbackType,
        scope: fallbackScope,
        breaking: false,
        alternatives: [],
      };
    }
  }

  private async generateAlternatives(
    diff: string,
    styles: readonly ('conventional' | 'descriptive' | 'imperative')[],
  ): Promise<CommitMessageAlternative[]> {
    const alternatives: CommitMessageAlternative[] = [];

    for (const style of styles) {
      try {
        const styleDesc: Record<string, string> = {
          conventional: 'Conventional Commits (<type>(<scope>): <desc>)',
          descriptive: 'Descriptive (clear sentence explaining the change)',
          imperative: 'Imperative mood (e.g., "Add feature X")',
        };

        const system = [
          'Generate a single-line commit message for the following diff.',
          `Style: ${styleDesc[style]}`,
          `Max length: ${this.config.maxSummaryLength} characters.`,
          'Respond with ONLY the commit message text, no JSON.',
        ].join('\n');

        const truncatedDiff = diff.length > 4000 ? diff.substring(0, 4000) + '\n...[truncated]' : diff;
        const response = await this.callAI(system, truncatedDiff);
        const summary = response.trim().split('\n')[0].slice(0, this.config.maxSummaryLength);

        if (summary) {
          alternatives.push({ summary, style });
        }
      } catch {
        Logger.debug(`Failed to generate ${style} alternative`);
      }
    }

    return alternatives;
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(partial: Partial<CommitMessageConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Get current configuration.
   */
  getConfig(): CommitMessageConfig {
    return { ...this.config };
  }
}
