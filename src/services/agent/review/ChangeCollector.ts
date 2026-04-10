import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { AgentSession } from '../AgentTypes';
import { RollbackManager } from '../execution/RollbackManager';
import { RollbackData, RollbackType } from '../execution/ExecutionTypes';
import { FileOperation } from '../fileops/FileOpsTypes';
import { DiffPatcher } from '../fileops/DiffPatcher';
import { ReviewableChange, ReviewDiff, ReviewHunk, ChangeStatus, ChangeGroup, REVIEW_CONSTANTS } from './ReviewTypes';
import { Logger } from '../../../utils/Logger';

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.css': 'css', '.scss': 'scss', '.html': 'html', '.json': 'json',
  '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml',
  '.sql': 'sql', '.sh': 'bash', '.vue': 'vue', '.svelte': 'svelte',
};

export class ChangeCollector {
  private static instance: ChangeCollector;
  private diffPatcher: DiffPatcher;

  private constructor() {
    this.diffPatcher = DiffPatcher.getInstance();
  }

  static getInstance(): ChangeCollector {
    if (!ChangeCollector.instance) {
      ChangeCollector.instance = new ChangeCollector();
    }
    return ChangeCollector.instance;
  }

  async collectChanges(session: AgentSession, rollbackManager: RollbackManager): Promise<ReviewableChange[]> {
    const changes: ReviewableChange[] = [];
    const rollbackStack = rollbackManager.getRollbackStack();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const processedPaths = new Set<string>();

    for (const rollback of rollbackStack) {
      // Created files
      for (const createdFile of rollback.createdFiles) {
        if (processedPaths.has(createdFile)) continue;
        processedPaths.add(createdFile);
        const content = await this.readCurrentContent(path.resolve(workspaceRoot, createdFile));
        changes.push(this.buildChange(rollback.stepId, createdFile, FileOperation.CREATE, null, content, rollback));
      }

      // Modified files (originalContent map)
      for (const [filePath, originalContent] of rollback.originalContent) {
        const relativePath = path.relative(workspaceRoot, filePath);
        if (processedPaths.has(relativePath)) {
          // Already tracked — update with earliest original
          const existing = changes.find(c => c.filePath === relativePath);
          if (existing && existing.originalContent === null) {
            existing.originalContent = originalContent;
          }
          continue;
        }
        processedPaths.add(relativePath);
        const currentContent = await this.readCurrentContent(filePath);
        changes.push(this.buildChange(rollback.stepId, relativePath, FileOperation.EDIT, originalContent, currentContent, rollback));
      }

      // Deleted files
      for (const [filePath, deletedContent] of rollback.deletedFiles) {
        const relativePath = path.relative(workspaceRoot, filePath);
        if (processedPaths.has(relativePath)) continue;
        processedPaths.add(relativePath);
        changes.push(this.buildChange(rollback.stepId, relativePath, FileOperation.DELETE, deletedContent, null, rollback));
      }

      // Renamed files
      for (const { from, to } of rollback.renamedFiles) {
        const relFrom = path.relative(workspaceRoot, from);
        if (processedPaths.has(relFrom)) continue;
        processedPaths.add(relFrom);
        changes.push(this.buildChange(rollback.stepId, relFrom, FileOperation.RENAME, null, null, rollback, to));
      }
    }

    return changes;
  }

  computeDiffs(changes: ReviewableChange[]): ReviewableChange[] {
    for (const change of changes) {
      if (change.operation === FileOperation.CREATE && change.newContent) {
        const lines = change.newContent.split('\n');
        change.diff = {
          unified: lines.map(l => `+${l}`).join('\n'),
          stats: { additions: lines.length, deletions: 0, modifications: 0 },
          hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(l => `+${l}`) }],
          fileType: 'created',
        };
      } else if (change.operation === FileOperation.DELETE && change.originalContent) {
        const lines = change.originalContent.split('\n');
        change.diff = {
          unified: lines.map(l => `-${l}`).join('\n'),
          stats: { additions: 0, deletions: lines.length, modifications: 0 },
          hunks: [{ oldStart: 1, oldLines: lines.length, newStart: 0, newLines: 0, lines: lines.map(l => `-${l}`) }],
          fileType: 'deleted',
        };
      } else if (change.originalContent && change.newContent) {
        const unified = this.diffPatcher.createUnifiedDiff(change.originalContent, change.newContent, change.filePath);
        const hunks = this.diffPatcher.parseDiffHunks(unified);
        const added = unified.split('\n').filter(l => l.startsWith('+')).length;
        const removed = unified.split('\n').filter(l => l.startsWith('-')).length;
        change.diff = {
          unified,
          stats: { additions: added, deletions: removed, modifications: Math.min(added, removed) },
          hunks,
          fileType: change.operation === FileOperation.RENAME ? 'renamed' : 'modified',
        };
      }
    }
    return changes;
  }

  splitIntoHunks(change: ReviewableChange): ReviewHunk[] {
    if (!change.diff || change.diff.hunks.length === 0) return [];
    const originalLines = (change.originalContent || '').split('\n');

    return change.diff.hunks.map((hunk, i) => {
      const beforeStart = Math.max(0, hunk.oldStart - 4);
      const afterEnd = Math.min(originalLines.length, hunk.oldStart + hunk.oldLines + 3);

      return {
        id: `${change.id}_hunk_${i}`,
        changeId: change.id,
        hunkIndex: i,
        startLineOld: hunk.oldStart,
        endLineOld: hunk.oldStart + hunk.oldLines,
        startLineNew: hunk.newStart,
        endLineNew: hunk.newStart + hunk.newLines,
        content: hunk.lines.join('\n'),
        accepted: null,
        context: {
          before: originalLines.slice(beforeStart, hunk.oldStart - 1),
          after: originalLines.slice(hunk.oldStart + hunk.oldLines - 1, afterEnd),
        },
      };
    });
  }

  groupByDirectory(changes: ReviewableChange[]): ChangeGroup[] {
    const groups = new Map<string, ReviewableChange[]>();
    for (const change of changes) {
      const dir = path.dirname(change.filePath) || '.';
      const arr = groups.get(dir) || [];
      arr.push(change);
      groups.set(dir, arr);
    }
    return [...groups.entries()].map(([directory, dirChanges]) => ({
      directory,
      changes: dirChanges,
      stats: {
        additions: dirChanges.reduce((sum, c) => sum + (c.diff?.stats.additions || 0), 0),
        deletions: dirChanges.reduce((sum, c) => sum + (c.diff?.stats.deletions || 0), 0),
      },
    }));
  }

  detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    return LANGUAGE_MAP[ext] || null;
  }

  computeStats(changes: ReviewableChange[]): { additions: number; deletions: number; modifications: number; files: number } {
    return {
      additions: changes.reduce((s, c) => s + (c.diff?.stats.additions || 0), 0),
      deletions: changes.reduce((s, c) => s + (c.diff?.stats.deletions || 0), 0),
      modifications: changes.reduce((s, c) => s + (c.diff?.stats.modifications || 0), 0),
      files: changes.length,
    };
  }

  private buildChange(
    stepId: string, filePath: string, operation: FileOperation,
    originalContent: string | null, newContent: string | null,
    rollback: RollbackData, targetPath?: string
  ): ReviewableChange {
    return {
      id: `change_${stepId}_${filePath.replace(/[/\\]/g, '_')}`,
      filePath,
      operation,
      status: ChangeStatus.PENDING,
      originalContent,
      newContent,
      diff: null,
      hunks: [],
      accepted: null,
      revertible: true,
      metadata: {
        stepId,
        stepDescription: '',
        createdAt: Date.now(),
        fileSize: (newContent || originalContent || '').length,
        language: this.detectLanguage(filePath),
      },
    };
  }

  private async readCurrentContent(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
