import * as path from 'path';
import { AgentSession } from '../AgentTypes';
import { ReviewableChange, ReviewSummary, RiskAssessment, REVIEW_CONSTANTS } from './ReviewTypes';
import { FileOperation } from '../fileops/FileOpsTypes';
import { ApiService } from '../../ApiService';
import { ConfigManager } from '../../../utils/ConfigManager';
import { Logger } from '../../../utils/Logger';

export class ReviewSummaryGenerator {
  private static instance: ReviewSummaryGenerator;
  private apiService: ApiService | null = null;

  static getInstance(): ReviewSummaryGenerator {
    if (!ReviewSummaryGenerator.instance) {
      ReviewSummaryGenerator.instance = new ReviewSummaryGenerator();
    }
    return ReviewSummaryGenerator.instance;
  }

  setApiService(api: ApiService): void {
    this.apiService = api;
  }

  async generateSummary(changes: ReviewableChange[], session: AgentSession): Promise<ReviewSummary> {
    const newFiles = changes.filter(c => c.operation === 'create' as any).map(c => c.filePath);
    const deletedFiles = changes.filter(c => c.operation === 'delete' as any).map(c => c.filePath);
    const modifiedFiles = changes.filter(c => c.operation === 'edit' as any || c.operation === 'patch' as any).map(c => c.filePath);
    const renamedFiles = changes.filter(c => c.operation === 'rename' as any || c.operation === 'move' as any).map(c => ({ from: c.filePath, to: c.filePath }));

    const additions = changes.reduce((s, c) => s + (c.diff?.stats.additions || 0), 0);
    const deletions = changes.reduce((s, c) => s + (c.diff?.stats.deletions || 0), 0);
    const modifications = changes.reduce((s, c) => s + (c.diff?.stats.modifications || 0), 0);

    const dirs = new Set<string>();
    for (const c of changes) dirs.add(path.dirname(c.filePath));

    const riskAssessment = this.assessRisk(changes, session);
    const breakingChanges = this.detectBreakingChanges(changes);
    riskAssessment.breakingChanges = breakingChanges;

    let aiSummary: string | null = null;
    try {
      aiSummary = await this.generateAISummary(changes, session);
    } catch (e) {
      Logger.warn('AI summary generation failed:', e);
    }

    return {
      totalFiles: changes.length,
      totalChanges: changes.length,
      additions,
      deletions,
      modifications,
      newFiles,
      deletedFiles,
      modifiedFiles,
      renamedFiles,
      affectedDirectories: [...dirs],
      riskAssessment,
      aiSummary,
      terminalResults: null,
    };
  }

  assessRisk(changes: ReviewableChange[], session: AgentSession): RiskAssessment {
    let score = 0;
    const factors: string[] = [];

    const hasDeletes = changes.some(c => c.operation === 'delete' as any);
    const hasRenames = changes.some(c => c.operation === 'rename' as any || c.operation === 'move' as any);
    const configFiles = ['package.json', 'tsconfig.json', 'webpack.config', 'vite.config', '.eslintrc', 'next.config'];
    const hasConfigChanges = changes.some(c => configFiles.some(cf => c.filePath.endsWith(cf)));
    const totalLines = changes.reduce((s, c) => s + (c.diff?.stats.additions || 0) + (c.diff?.stats.deletions || 0), 0);
    const hasTestChanges = changes.some(c => c.filePath.includes('.test.') || c.filePath.includes('.spec.'));

    if (hasDeletes) { score += 2; factors.push('Includes file deletions'); }
    if (hasRenames) { score += 1; factors.push('Includes file renames (may break imports)'); }
    if (hasConfigChanges) { score += 2; factors.push('Modifies configuration files'); }
    if (changes.length > 10) { score += 1; factors.push(`Changes ${changes.length} files`); }
    if (totalLines > 500) { score += 1; factors.push(`${totalLines} lines changed`); }
    if (hasTestChanges) { score += 1; factors.push('Modifies test files'); }

    const level: 'low' | 'medium' | 'high' = score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
    return { level, factors, breakingChanges: [], importChanges: [] };
  }

  detectBreakingChanges(changes: ReviewableChange[]): string[] {
    const breaking: string[] = [];
    for (const change of changes) {
      if (!change.originalContent || !change.newContent) continue;
      const origExports: string[] = change.originalContent.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g) || [];
      const newExports: string[] = change.newContent.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g) || [];
      for (const exp of origExports) {
        if (!newExports.includes(exp)) {
          breaking.push(`Removed export in ${change.filePath}: ${exp.trim()}`);
        }
      }
    }
    return breaking;
  }

  detectImportChanges(changes: ReviewableChange[]): Array<{ file: string; added: string[]; removed: string[] }> {
    const results: Array<{ file: string; added: string[]; removed: string[] }> = [];
    for (const change of changes) {
      if (!change.originalContent || !change.newContent) continue;
      const origImports: string[] = change.originalContent.match(/^import\s+.+$/gm) || [];
      const newImports: string[] = change.newContent.match(/^import\s+.+$/gm) || [];
      const added = newImports.filter(i => !origImports.includes(i));
      const removed = origImports.filter(i => !newImports.includes(i));
      if (added.length > 0 || removed.length > 0) {
        results.push({ file: change.filePath, added, removed });
      }
    }
    return results;
  }

  async generateAISummary(changes: ReviewableChange[], session: AgentSession): Promise<string> {
    if (!this.apiService) return this.buildTemplateSummary(changes, session);

    const system = 'You are a senior code reviewer. Summarize the changes made in this coding session. Be concise (3-5 sentences). Focus on: what was accomplished, key files changed, potential risks, and whether tests passed.';
    const changeList = changes.map(c => `${c.operation}: ${c.filePath} (+${c.diff?.stats.additions || 0}/-${c.diff?.stats.deletions || 0})`).join('\n');
    const user = `Plan: ${session.prompt}\n\nChanges:\n${changeList}\n\nFiles affected: ${changes.length}`;

    try {
      let content = '';
      for await (const chunk of this.apiService.chatStream({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], options: { temperature: 0.3, maxTokens: 500 } })) {
        if (typeof chunk === 'string') content += chunk;
      }
      return content || this.buildTemplateSummary(changes, session);
    } catch {
      return this.buildTemplateSummary(changes, session);
    }
  }

  private buildTemplateSummary(changes: ReviewableChange[], session: AgentSession): string {
    const created = changes.filter(c => c.operation === 'create' as any).length;
    const modified = changes.filter(c => c.operation === 'edit' as any).length;
    const deleted = changes.filter(c => c.operation === 'delete' as any).length;
    const additions = changes.reduce((s, c) => s + (c.diff?.stats.additions || 0), 0);
    const deletions = changes.reduce((s, c) => s + (c.diff?.stats.deletions || 0), 0);

    const parts: string[] = [];
    if (created > 0) parts.push(`Created ${created} file(s)`);
    if (modified > 0) parts.push(`modified ${modified} file(s)`);
    if (deleted > 0) parts.push(`deleted ${deleted} file(s)`);
    return `${parts.join(', ')}. Added ${additions} lines, removed ${deletions} lines across ${changes.length} files.`;
  }
}
