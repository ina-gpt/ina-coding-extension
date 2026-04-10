/**
 * Edit Generation Controller
 *
 * Orchestrates the edit generation flow: streaming, callbacks, error handling.
 * Bridges InlineEditService, EditGenerationClient, and UI components.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { EditGenerationClient, EditResponse, StreamCallbacks } from '../services/EditGenerationClient';
import { EditResponseProcessor, ProcessedEditResult } from '../services/EditResponseProcessor';
import { PartialResponseHandler } from '../services/PartialResponseHandler';
import { InlineEditService, InlineEditSession } from '../services/InlineEditService';
import { InlineEditOverlay } from '../widgets/InlineEditOverlay';
import { InlineEditStatusBar } from '../widgets/InlineEditStatusBar';
import { InlineEditDecorationProvider } from '../providers/InlineEditDecorationProvider';
import { ConfigManager } from '../utils/ConfigManager';

// ============ Types ============

export interface GenerationResult {
  success: boolean;
  result?: ProcessedEditResult;
  error?: string;
  wasPartial: boolean;
}

export interface EditGenerationRequest {
  sessionId: string;
  selection: {
    content: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  };
  context: {
    filePath: string;
    language: string;
    surroundingBefore: string;
    surroundingAfter: string;
    imports: string[];
    symbols: string[];
    indentation: string;
  };
  prompt: string;
  options: {
    streamResponse: boolean;
  };
}

// ============ Edit Generation Controller ============

export class EditGenerationController implements vscode.Disposable {
  private client: EditGenerationClient;
  private processor: EditResponseProcessor;
  private partialHandler: PartialResponseHandler;
  private editService: InlineEditService;
  private overlay: InlineEditOverlay;
  private statusBar: InlineEditStatusBar;
  private decorations: InlineEditDecorationProvider;

  // Events
  private onGenerationCompleteEmitter = new vscode.EventEmitter<{ session: InlineEditSession; result: ProcessedEditResult }>();
  private onGenerationErrorEmitter = new vscode.EventEmitter<{ session: InlineEditSession; error: string }>();

  readonly onGenerationComplete = this.onGenerationCompleteEmitter.event;
  readonly onGenerationError = this.onGenerationErrorEmitter.event;

  constructor(editService: InlineEditService) {
    this.client = new EditGenerationClient();
    this.processor = new EditResponseProcessor();
    this.partialHandler = new PartialResponseHandler();
    this.editService = editService;
    this.overlay = InlineEditOverlay.getInstance();
    this.statusBar = InlineEditStatusBar.getInstance();
    this.decorations = InlineEditDecorationProvider.getInstance();
  }

  // ============ Generate ============

  async generateEdit(session: InlineEditSession): Promise<GenerationResult> {
    const useStreaming = vscode.workspace.getConfiguration('inaCoding.inlineEdit')
      .get<boolean>('streamResponse', true);

    const request = this.buildRequest(session);

    // Show generating state
    this.updateGeneratingUI(session);

    try {
      let response: EditResponse;

      if (useStreaming) {
        response = await this.generateStreaming(session, request);
      } else {
        response = await this.client.generateEdit(request);
      }

      // Process the response
      const result = this.processor.processResponse(response, session);

      // Update session
      this.editService.updateSession(session.id, {
        status: 'preview',
        generatedContent: result.code,
      });

      // Show preview state
      this.updatePreviewUI(session, result);

      // Emit event
      this.onGenerationCompleteEmitter.fire({ session, result });

      Logger.info(`Generation complete for ${session.id}: ${result.diff.summary}`);

      return { success: true, result, wasPartial: false };

    } catch (error) {
      return this.handleGenerationError(session, error as Error);
    }
  }

  // ============ Streaming ============

  private async generateStreaming(session: InlineEditSession, request: EditGenerationRequest): Promise<EditResponse> {
    let partialCode = '';

    const callbacks: StreamCallbacks = {
      onStart: () => {
        Logger.debug(`Stream started for ${session.id}`);
      },
      onCodeContent: (content: string) => {
        partialCode += content;

        // Update overlay with progress
        this.overlay.updateProgress(
          session.editor,
          new vscode.Range(session.context.selection.start, session.context.selection.end),
          partialCode
        );
      },
      onProgress: (tokenCount: number) => {
        // Update status bar with token count
        this.statusBar.showTokenCount(tokenCount);
      },
      onError: (error: Error) => {
        Logger.error(`Stream error for ${session.id}:`, error);
      },
    };

    return this.client.generateEditStream(request, callbacks);
  }

  // ============ Error Handling ============

  private handleGenerationError(session: InlineEditSession, error: Error): GenerationResult {
    const errorMessage = error.message || 'Generation failed';
    Logger.error(`Generation error for ${session.id}:`, error);

    // Check if we have partial code
    const partialCode = this.getPartialCode(session);

    if (partialCode && partialCode.trim().length > 0) {
      // Try to recover from partial response
      const recovery = this.partialHandler.handlePartialResponse(
        partialCode,
        session.context.language
      );

      if (recovery.isUsable) {
        Logger.info(`Recovered partial response for ${session.id} (${(recovery.completeness * 100).toFixed(0)}% complete)`);

        const result = this.processor.processResponse({
          sessionId: session.id,
          originalContent: session.originalContent,
          generatedContent: recovery.recoveredCode,
          explanation: null,
          confidence: recovery.completeness,
          tokens: { prompt: 0, completion: 0 },
          timing: { total: 0, firstToken: 0, generation: 0 },
        }, session);

        result.warnings.push('Response was partially recovered');

        this.editService.updateSession(session.id, {
          status: 'preview',
          generatedContent: result.code,
        });

        this.updatePreviewUI(session, result);
        this.onGenerationCompleteEmitter.fire({ session, result });

        return { success: true, result, wasPartial: true };
      }
    }

    // Show error UI
    this.overlay.showError(session.editor,
      new vscode.Range(session.context.selection.start, session.context.selection.end),
      errorMessage
    );
    this.statusBar.showError(errorMessage);

    this.editService.updateSession(session.id, { status: 'idle' });
    this.onGenerationErrorEmitter.fire({ session, error: errorMessage });

    return { success: false, error: errorMessage, wasPartial: false };
  }

  // ============ Cancel & Retry ============

  async cancelGeneration(sessionId: string): Promise<void> {
    await this.client.cancelGeneration(sessionId);
    const session = this.editService.getSession(sessionId);
    if (session) {
      this.editService.updateSession(sessionId, { status: 'idle' });
      this.overlay.hide();
      this.statusBar.hide();
    }
    Logger.info(`Generation cancelled: ${sessionId}`);
  }

  async retryGeneration(session: InlineEditSession): Promise<GenerationResult> {
    this.overlay.showRetrying(
      session.editor,
      new vscode.Range(session.context.selection.start, session.context.selection.end)
    );

    this.editService.updateSession(session.id, {
      status: 'generating',
      generatedContent: null,
    });

    return this.generateEdit(session);
  }

  isGenerating(sessionId: string): boolean {
    return this.client.isGenerating(sessionId);
  }

  // ============ Request Building ============

  private buildRequest(session: InlineEditSession): EditGenerationRequest {
    return {
      sessionId: session.id,
      selection: {
        content: session.originalContent,
        startLine: session.context.lineRange[0],
        endLine: session.context.lineRange[1],
        startColumn: session.context.selection.start.character,
        endColumn: session.context.selection.end.character,
      },
      context: {
        filePath: session.context.filePath,
        language: session.context.language,
        surroundingBefore: session.context.surroundingCode.before,
        surroundingAfter: session.context.surroundingCode.after,
        imports: this.extractImports(session),
        symbols: session.context.symbols,
        indentation: session.context.indentation,
      },
      prompt: session.prompt,
      options: {
        streamResponse: vscode.workspace.getConfiguration('inaCoding.inlineEdit')
          .get<boolean>('streamResponse', true),
      },
    };
  }

  private extractImports(session: InlineEditSession): string[] {
    const before = session.context.surroundingCode.before;
    const importLines = before.split('\n').filter(line =>
      line.trim().startsWith('import ') || line.trim().startsWith('from ') ||
      line.trim().startsWith('require(') || line.trim().startsWith('#include') ||
      line.trim().startsWith('using ')
    );
    return importLines.slice(0, 20);
  }

  // ============ UI Updates ============

  private updateGeneratingUI(session: InlineEditSession): void {
    const range = new vscode.Range(
      session.context.selection.start,
      session.context.selection.end
    );

    this.overlay.showGeneratingIndicator(session.editor, range);
    this.statusBar.show('generating');
    this.decorations.showEditingIndicator(session.editor, range);

    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditGenerating', true);
  }

  private updatePreviewUI(session: InlineEditSession, result: ProcessedEditResult): void {
    this.overlay.hide();
    this.statusBar.show('preview');
    this.decorations.clearAllDecorations(session.editor);

    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditGenerating', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditPreview', true);

    // Show warnings if any
    if (result.warnings.length > 0) {
      const message = result.warnings.join('; ');
      vscode.window.showWarningMessage(`INA Coding: ${message}`);
    }
  }

  // ============ Helpers ============

  private getPartialCode(session: InlineEditSession): string | null {
    return session.generatedContent;
  }

  // ============ Dispose ============

  dispose(): void {
    this.onGenerationCompleteEmitter.dispose();
    this.onGenerationErrorEmitter.dispose();
  }
}
