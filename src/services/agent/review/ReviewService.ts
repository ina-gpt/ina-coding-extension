import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { AgentSession } from '../AgentTypes';
import { RollbackManager } from '../execution/RollbackManager';
import { ReviewSession, ReviewStatus, ReviewableChange, ReviewDecision, ReviewFilter, ReviewSummary, UndoResult, UndoScope, ChangeStatus, ApplyResult } from './ReviewTypes';
import { ChangeCollector } from './ChangeCollector';
import { ReviewSummaryGenerator } from './ReviewSummaryGenerator';
import { SelectiveAcceptManager } from './SelectiveAcceptManager';
import { UndoManager } from './UndoManager';
import { ReviewDiffProvider } from './ReviewDiffProvider';
import { Logger } from '../../../utils/Logger';

export class ReviewService extends EventEmitter {
  private static instance: ReviewService;
  private changeCollector: ChangeCollector;
  private summaryGenerator: ReviewSummaryGenerator;
  private selectiveAcceptManager: SelectiveAcceptManager;
  private undoManager: UndoManager;
  private diffProvider: ReviewDiffProvider;
  private activeReview: ReviewSession | null = null;

  private constructor() {
    super();
    this.changeCollector = ChangeCollector.getInstance();
    this.summaryGenerator = ReviewSummaryGenerator.getInstance();
    this.selectiveAcceptManager = SelectiveAcceptManager.getInstance();
    this.undoManager = UndoManager.getInstance();
    this.diffProvider = ReviewDiffProvider.getInstance();
  }

  static getInstance(): ReviewService {
    if (!ReviewService.instance) {
      ReviewService.instance = new ReviewService();
    }
    return ReviewService.instance;
  }

  setApiService(api: import('../../ApiService').ApiService): void {
    this.summaryGenerator.setApiService(api);
  }

  async startReview(agentSession: AgentSession, rollbackManager: RollbackManager): Promise<ReviewSession> {
    // 1. Collect changes
    let changes = await this.changeCollector.collectChanges(agentSession, rollbackManager);

    // 2. Compute diffs
    changes = this.changeCollector.computeDiffs(changes);

    // 3. Split into hunks
    for (const change of changes) {
      change.hunks = this.changeCollector.splitIntoHunks(change);
    }

    // 4. Create review session
    const session: ReviewSession = {
      id: `review_${Date.now()}`,
      agentSessionId: agentSession.id,
      status: ReviewStatus.PENDING,
      createdAt: Date.now(),
      resolvedAt: null,
      changes,
      summary: null,
      decision: null,
      reviewNotes: null,
    };

    this.activeReview = session;
    this.selectiveAcceptManager.startReview(session);

    // 5. Notify
    this.emit('review-started', session);
    Logger.info('Review started', { sessionId: session.id, changes: changes.length });

    // 6. Generate summary async (don't block)
    this.summaryGenerator.generateSummary(changes, agentSession).then((summary) => {
      if (this.activeReview && this.activeReview.id === session.id) {
        this.activeReview.summary = summary;
        this.emit('review-summary-ready', summary);
      }
    }).catch((e) => Logger.warn('Summary generation failed:', e));

    return session;
  }

  getActiveReview(): ReviewSession | null { return this.activeReview; }

  async acceptAll(): Promise<void> {
    if (!this.activeReview) return;
    const decision = this.selectiveAcceptManager.acceptAll();
    this.activeReview.decision = decision;
    this.activeReview.status = ReviewStatus.APPROVED;
    this.activeReview.resolvedAt = Date.now();
    this.emit('review-completed', { decision, status: ReviewStatus.APPROVED });
    Logger.info('All changes accepted');
  }

  async rejectAll(): Promise<void> {
    if (!this.activeReview) return;
    const decision = this.selectiveAcceptManager.rejectAll();
    await this.selectiveAcceptManager.applyDecision(decision);
    this.activeReview.decision = decision;
    this.activeReview.status = ReviewStatus.REJECTED;
    this.activeReview.resolvedAt = Date.now();
    this.emit('review-completed', { decision, status: ReviewStatus.REJECTED });
    Logger.info('All changes rejected and reverted');
  }

  acceptChange(changeId: string): void {
    this.selectiveAcceptManager.acceptChange(changeId);
    this.emitUpdate();
  }

  rejectChange(changeId: string): void {
    this.selectiveAcceptManager.rejectChange(changeId);
    this.emitUpdate();
  }

  acceptHunk(hunkId: string): void {
    this.selectiveAcceptManager.acceptHunk(hunkId);
    this.emitUpdate();
  }

  rejectHunk(hunkId: string): void {
    this.selectiveAcceptManager.rejectHunk(hunkId);
    this.emitUpdate();
  }

  toggleChange(changeId: string): void {
    this.selectiveAcceptManager.toggleChange(changeId);
    this.emitUpdate();
  }

  toggleHunk(hunkId: string): void {
    this.selectiveAcceptManager.toggleHunk(hunkId);
    this.emitUpdate();
  }

  async finalizeReview(notes?: string): Promise<ReviewDecision> {
    if (!this.activeReview) throw new Error('No active review');

    const decision = this.selectiveAcceptManager.getDecision();
    if (notes) decision.notes = notes;

    // Apply decision
    await this.selectiveAcceptManager.applyDecision(decision);

    // Close diffs
    this.diffProvider.closeAllDiffs();

    // Update session
    this.activeReview.decision = decision;
    this.activeReview.reviewNotes = notes || null;
    this.activeReview.resolvedAt = Date.now();
    this.activeReview.status = decision.type === 'accept-all' ? ReviewStatus.APPROVED
      : decision.type === 'reject-all' ? ReviewStatus.REJECTED
      : ReviewStatus.PARTIALLY_APPROVED;

    this.emit('review-completed', { decision, status: this.activeReview.status, summary: this.activeReview.summary });
    Logger.info('Review finalized', { type: decision.type, accepted: decision.acceptedChanges.length, rejected: decision.rejectedChanges.length });

    return decision;
  }

  async showFileDiff(changeId: string): Promise<void> {
    const change = this.activeReview?.changes.find(c => c.id === changeId);
    if (change) await this.diffProvider.showDiff(change);
  }

  async showHunkDiff(changeId: string, hunkId: string): Promise<void> {
    const change = this.activeReview?.changes.find(c => c.id === changeId);
    if (change) await this.diffProvider.showHunkDiff(change, hunkId);
  }

  async showAllDiffs(): Promise<void> {
    if (this.activeReview) await this.diffProvider.showMultiFileDiff(this.activeReview.changes);
  }

  async undoAll(): Promise<UndoResult> {
    if (!this.activeReview) return { success: false, filesReverted: [], filesPartiallyReverted: [], errors: ['No active review'], newState: [] };
    const result = await this.undoManager.undoAll(this.activeReview);
    this.activeReview.status = ReviewStatus.UNDONE;
    this.emit('undo-performed', result);
    return result;
  }

  async undoFile(changeId: string): Promise<UndoResult> {
    if (!this.activeReview) return { success: false, filesReverted: [], filesPartiallyReverted: [], errors: ['No active review'], newState: [] };
    const result = await this.undoManager.undoFile(changeId, this.activeReview);
    this.emit('undo-performed', result);
    return result;
  }

  async undoHunk(hunkId: string, changeId: string): Promise<UndoResult> {
    if (!this.activeReview) return { success: false, filesReverted: [], filesPartiallyReverted: [], errors: ['No active review'], newState: [] };
    const result = await this.undoManager.undoHunk(hunkId, changeId, this.activeReview);
    this.emit('undo-performed', result);
    return result;
  }

  filterChanges(filter: ReviewFilter): ReviewableChange[] {
    if (!this.activeReview) return [];
    return this.activeReview.changes.filter(c => {
      if (filter.status !== 'all' && c.status !== filter.status) return false;
      if (filter.operation !== 'all' && c.operation !== filter.operation) return false;
      if (filter.directory && !c.filePath.startsWith(filter.directory)) return false;
      if (filter.searchQuery && !c.filePath.toLowerCase().includes(filter.searchQuery.toLowerCase())) return false;
      return true;
    });
  }

  getProgress(): { total: number; decided: number; accepted: number; rejected: number; pending: number } {
    return this.selectiveAcceptManager.getReviewProgress();
  }

  private emitUpdate(): void {
    if (!this.activeReview) return;
    const progress = this.getProgress();
    this.emit('review-updated', { changes: this.activeReview.changes, progress });
  }

  dispose(): void {
    this.diffProvider.dispose();
    this.selectiveAcceptManager.dispose();
    this.undoManager.dispose();
    this.activeReview = null;
    this.removeAllListeners();
  }
}
