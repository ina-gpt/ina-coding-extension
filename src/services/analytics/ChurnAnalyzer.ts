/**
 * ChurnAnalyzer.ts — Phase 20 Step 20.3
 * Analyze file churn from git history
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ChurnMetric } from './AnalyticsTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export class ChurnAnalyzer {
  private root: string;

  constructor(workspaceRoot: string) { this.root = workspaceRoot; }

  async analyze(windowDays: number = 90): Promise<ChurnMetric[]> {
    const metrics = new Map<string, ChurnMetric>();

    // Commit counts per file
    try {
      const { stdout } = await execAsync(
        `git log --since="${windowDays} days ago" --name-only --pretty=format:"" 2>/dev/null | sort | uniq -c | sort -rn | head -100`,
        { cwd: this.root, timeout: 15000 }
      );
      for (const line of stdout.trim().split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (m && m[2] && !m[2].includes('node_modules')) {
          metrics.set(m[2], {
            filePath: m[2], commitCount: parseInt(m[1], 10),
            uniqueAuthors: 0, linesChanged: 0, isChurning: false,
            correlatedBugs: 0, churnScore: 0,
          });
        }
      }
    } catch { /* */ }

    // Unique authors per file
    try {
      const { stdout } = await execAsync(
        `git log --since="${windowDays} days ago" --format="%an" --name-only 2>/dev/null`,
        { cwd: this.root, timeout: 15000 }
      );
      const fileAuthors = new Map<string, Set<string>>();
      let currentAuthor = '';
      for (const line of stdout.split('\n')) {
        if (line.trim() === '') continue;
        if (!line.includes('/') && !line.includes('.')) { currentAuthor = line.trim(); continue; }
        if (currentAuthor && line.trim()) {
          if (!fileAuthors.has(line.trim())) fileAuthors.set(line.trim(), new Set());
          fileAuthors.get(line.trim())!.add(currentAuthor);
        }
      }
      for (const [file, authors] of fileAuthors) {
        const metric = metrics.get(file);
        if (metric) metric.uniqueAuthors = authors.size;
      }
    } catch { /* */ }

    // Lines changed per file
    try {
      const { stdout } = await execAsync(
        `git log --since="${windowDays} days ago" --numstat --pretty=format:"" 2>/dev/null`,
        { cwd: this.root, timeout: 15000 }
      );
      for (const line of stdout.trim().split('\n')) {
        const m = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (m && metrics.has(m[3])) {
          metrics.get(m[3])!.linesChanged += parseInt(m[1], 10) + parseInt(m[2], 10);
        }
      }
    } catch { /* */ }

    // Bug-fix correlation
    try {
      const { stdout } = await execAsync(
        `git log --since="${windowDays} days ago" --grep="fix\\|bug\\|patch\\|hotfix" -i --name-only --pretty=format:"" 2>/dev/null | sort | uniq -c | sort -rn | head -50`,
        { cwd: this.root, timeout: 10000 }
      );
      for (const line of stdout.trim().split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (m && metrics.has(m[2])) {
          metrics.get(m[2])!.correlatedBugs = parseInt(m[1], 10);
        }
      }
    } catch { /* */ }

    // Compute scores and flags
    const result = Array.from(metrics.values());
    for (const metric of result) {
      metric.isChurning = metric.commitCount > 10;
      metric.churnScore = Math.min(100, metric.commitCount * 3 + metric.correlatedBugs * 10 + (metric.uniqueAuthors === 1 ? 15 : 0));
    }

    return result.sort((a, b) => b.churnScore - a.churnScore);
  }
}
