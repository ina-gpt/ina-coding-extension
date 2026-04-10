/**
 * Phase 17.1 — Shadow Integration
 *
 * Wires the shadow workspace into the agent execution engine
 * and the diff/apply system. When shadow mode is enabled,
 * file writes are redirected to the shadow workspace for review
 * instead of being written directly to disk.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ShadowWorkspaceManager } from './ShadowWorkspaceManager';

/**
 * Represents an execution engine that builds execution contexts.
 * Mirrors the shape of the actual ExecutionEngine without importing it
 * to avoid circular dependencies.
 */
// Use `any` for these shapes to avoid coupling with private members
type ExecutionEngineShape = any;
type ApplyServiceShape = any;

export class ShadowIntegration {
  private static instance: ShadowIntegration | null = null;

  private readonly logger = Logger;

  private originalBuildContext: ((session: any, config: any) => any) | null = null;
  private originalApplyDiff: ((filePath: string, diff: string, options?: any) => Promise<void>) | null = null;
  private originalApplyWriteFile: ((filePath: string, content: string) => Promise<void>) | null = null;

  private integratedEngine: ExecutionEngineShape | null = null;
  private integratedApplyService: ApplyServiceShape | null = null;

  private readonly disposables: vscode.Disposable[] = [];

  private constructor() {}

  /**
   * Returns the singleton instance of ShadowIntegration.
   */
  public static getInstance(): ShadowIntegration {
    if (!ShadowIntegration.instance) {
      ShadowIntegration.instance = new ShadowIntegration();
    }
    return ShadowIntegration.instance;
  }

  // ────────────────────────────────────────────
  // Agent Integration
  // ────────────────────────────────────────────

  /**
   * Integrate with the agent execution engine.
   *
   * Wraps the buildExecutionContext method so that when shadow mode
   * is enabled for agent operations, the context's writeFile function
   * redirects writes to the shadow workspace instead of the real filesystem.
   *
   * After the agent execution completes, the shadow panel is shown
   * for the user to review and accept/reject changes.
   */
  public integrateWithAgent(
    executionEngine: ExecutionEngineShape,
    shadowManager: ShadowWorkspaceManager
  ): void {
    if (this.integratedEngine) {
      this.logger.warn('[ShadowIntegration] Agent integration already active, detaching previous');
      this.detachAgent();
    }

    this.integratedEngine = executionEngine;
    this.originalBuildContext = executionEngine.buildExecutionContext.bind(executionEngine);

    const self = this;

    executionEngine.buildExecutionContext = (session: any, config: any) => {
      const ctx = self.originalBuildContext!(session, config);

      if (!self.shouldUseShadow('agent')) {
        return ctx;
      }

      // Extract a readable name from the session prompt
      const promptPreview = session.prompt
        ? session.prompt.slice(0, 50).replace(/\n/g, ' ')
        : 'Agent execution';
      const shadowSession = shadowManager.createSession(
        `Agent: ${promptPreview}`,
        'agent'
      );

      const originalWriteFile = ctx.writeFile;

      ctx.writeFile = async (filePath: string, content: string) => {
        try {
          await shadowManager.writeFile(shadowSession.id, filePath, content, {
            sourceOperation: 'agent',
          });
          self.logger.debug(
            `[ShadowIntegration] Redirected agent write to shadow: ${filePath}`
          );
        } catch (err) {
          self.logger.error(
            `[ShadowIntegration] Failed to write to shadow, falling back to direct write: ${err}`
          );
          // Fall back to original write if shadow fails
          if (originalWriteFile) {
            await originalWriteFile(filePath, content);
          }
        }
      };

      // Wrap the completion handler to show shadow panel when done
      const originalOnComplete = ctx.onComplete;
      ctx.onComplete = async (result: any) => {
        if (originalOnComplete) {
          await originalOnComplete(result);
        }

        const fileCount = shadowSession.files.size;
        if (fileCount > 0) {
          const action = await vscode.window.showInformationMessage(
            `Agent completed with ${fileCount} file change${fileCount !== 1 ? 's' : ''} staged in shadow workspace.`,
            'Review Changes',
            'Accept All',
            'Reject All'
          );

          if (action === 'Review Changes') {
            await shadowManager.previewAll(shadowSession.id);
          } else if (action === 'Accept All') {
            await shadowManager.acceptAll(shadowSession.id);
          } else if (action === 'Reject All') {
            await shadowManager.rejectAll(shadowSession.id);
          }
        }
      };

      return ctx;
    };

    this.logger.info('[ShadowIntegration] Integrated with agent execution engine');
  }

  /**
   * Detach the agent integration and restore original behavior.
   */
  private detachAgent(): void {
    if (this.integratedEngine && this.originalBuildContext) {
      this.integratedEngine.buildExecutionContext = this.originalBuildContext;
      this.integratedEngine = null;
      this.originalBuildContext = null;
    }
  }

  // ────────────────────────────────────────────
  // Apply/Diff Integration
  // ────────────────────────────────────────────

  /**
   * Integrate with the apply/diff service.
   *
   * Wraps the applyDiff and writeFile methods so that when shadow mode
   * is enabled for apply operations, changes are redirected to the shadow
   * workspace for review.
   */
  public integrateWithApply(
    applyService: ApplyServiceShape,
    shadowManager: ShadowWorkspaceManager
  ): void {
    if (this.integratedApplyService) {
      this.logger.warn('[ShadowIntegration] Apply integration already active, detaching previous');
      this.detachApply();
    }

    this.integratedApplyService = applyService;
    this.originalApplyDiff = applyService.applyDiff?.bind(applyService) || null;
    this.originalApplyWriteFile = applyService.writeFile?.bind(applyService) || null;

    const self = this;

    if (applyService.applyDiff) {
      applyService.applyDiff = async (
        filePath: string,
        diff: string,
        options?: any
      ) => {
        if (!self.shouldUseShadow('apply')) {
          return self.originalApplyDiff!(filePath, diff, options);
        }

        // Apply the diff to get the resulting content, then write to shadow
        // First, apply using the original to compute result content
        // We need to read the current file and apply the diff ourselves
        try {
          const realUri = vscode.Uri.file(filePath);
          let currentContent = '';
          try {
            const bytes = await vscode.workspace.fs.readFile(realUri);
            currentContent = Buffer.from(bytes).toString('utf-8');
          } catch {
            // New file
          }

          // Use original applyDiff in a temporary way to compute result
          // For now, store the diff info and let the user apply manually
          let activeSession = shadowManager.getActiveSession();
          if (!activeSession) {
            activeSession = shadowManager.createSession('Apply Operation', 'apply');
          }

          // Write a marker with the diff content for manual resolution
          // In a full implementation, we'd parse and apply the diff in-memory
          await shadowManager.writeFile(activeSession.id, filePath, currentContent, {
            sourceOperation: 'apply',
            metadata: { diff, originalOptions: options },
          });

          self.logger.debug(
            `[ShadowIntegration] Redirected apply diff to shadow: ${filePath}`
          );
        } catch (err) {
          self.logger.error(
            `[ShadowIntegration] Failed to redirect diff to shadow: ${err}`
          );
          return self.originalApplyDiff!(filePath, diff, options);
        }
      };
    }

    if (applyService.writeFile) {
      applyService.writeFile = async (filePath: string, content: string) => {
        if (!self.shouldUseShadow('apply')) {
          return self.originalApplyWriteFile!(filePath, content);
        }

        try {
          let activeSession = shadowManager.getActiveSession();
          if (!activeSession) {
            activeSession = shadowManager.createSession('Apply Operation', 'apply');
          }

          await shadowManager.writeFile(activeSession.id, filePath, content, {
            sourceOperation: 'apply',
          });

          self.logger.debug(
            `[ShadowIntegration] Redirected apply writeFile to shadow: ${filePath}`
          );
        } catch (err) {
          self.logger.error(
            `[ShadowIntegration] Failed to redirect writeFile to shadow: ${err}`
          );
          return self.originalApplyWriteFile!(filePath, content);
        }
      };
    }

    this.logger.info('[ShadowIntegration] Integrated with apply service');
  }

  /**
   * Detach the apply integration and restore original behavior.
   */
  private detachApply(): void {
    if (this.integratedApplyService) {
      if (this.originalApplyDiff) {
        this.integratedApplyService.applyDiff = this.originalApplyDiff;
      }
      if (this.originalApplyWriteFile) {
        this.integratedApplyService.writeFile = this.originalApplyWriteFile;
      }
      this.integratedApplyService = null;
      this.originalApplyDiff = null;
      this.originalApplyWriteFile = null;
    }
  }

  // ────────────────────────────────────────────
  // Configuration
  // ────────────────────────────────────────────

  /**
   * Check whether shadow mode should be used for a given operation type.
   *
   * Reads from VS Code configuration:
   * - inaCoding.shadow.enabled — global toggle
   * - inaCoding.shadow.forAgent — enable for agent operations
   * - inaCoding.shadow.forApply — enable for apply/diff operations
   * - inaCoding.shadow.forInlineEdit — enable for inline edit operations
   */
  public shouldUseShadow(
    operation: 'agent' | 'apply' | 'inlineEdit'
  ): boolean {
    const config = vscode.workspace.getConfiguration('inaCoding.shadow');

    const enabled = config.get<boolean>('enabled', true);
    if (!enabled) {
      return false;
    }

    switch (operation) {
      case 'agent':
        return config.get<boolean>('forAgent', true);
      case 'apply':
        return config.get<boolean>('forApply', false);
      case 'inlineEdit':
        return config.get<boolean>('forInlineEdit', false);
      default:
        return false;
    }
  }

  // ────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────

  /**
   * Dispose of all integrations and restore original behavior.
   */
  public dispose(): void {
    this.detachAgent();
    this.detachApply();

    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;

    ShadowIntegration.instance = null;
    this.logger.info('[ShadowIntegration] Disposed');
  }
}
