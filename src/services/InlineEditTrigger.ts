/**
 * Inline Edit Trigger
 *
 * Handles all trigger mechanisms for inline edit.
 */

import * as vscode from 'vscode';
import { InlineEditService, TriggerMode } from './InlineEditService';
import { SelectionExpander } from './SelectionExpander';
import { GenerateService } from './generate/GenerateService';
import { ScopeAnalyzer } from './generate/ScopeAnalyzer';
import { GenerateMode, GenerateContext } from './generate/GenerateTypes';
import { Logger } from '../utils/Logger';

// ============ Constants ============

const SUPPORTED_LANGUAGES = [
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
  'python', 'rust', 'go', 'java', 'c', 'cpp', 'csharp',
  'php', 'ruby', 'swift', 'kotlin', 'scala',
  'html', 'css', 'json', 'yaml', 'markdown', 'sql',
];

// ============ Inline Edit Trigger ============

export class InlineEditTrigger {
  private editService: InlineEditService;
  private expander: SelectionExpander;
  private selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(editService: InlineEditService, expander: SelectionExpander) {
    this.editService = editService;
    this.expander = expander;
  }

  // ============ Registration ============

  registerKeyboardShortcut(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('inaCoding.inlineEdit', (args?: { source?: string }) => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.handleTrigger(editor, (args?.source as any) || 'keyboard');
      }
    });
  }

  registerContextMenu(context: vscode.ExtensionContext): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand('inaCoding.inlineEditSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) this.handleTrigger(editor, 'contextMenu');
      }),
      vscode.commands.registerCommand('inaCoding.inlineEditLine', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) this.handleTriggerWithMode(editor, TriggerMode.LINE, 'command');
      }),
      vscode.commands.registerCommand('inaCoding.inlineEditBlock', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) this.handleTriggerWithMode(editor, TriggerMode.BLOCK, 'command');
      }),
    ];
  }

  registerSelectionTrigger(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.onDidChangeTextEditorSelection((e) => {
      const enabled = vscode.workspace.getConfiguration('inaCoding.inlineEdit').get<boolean>('triggerOnSelection', false);
      if (!enabled) return;

      if (this.selectionDebounceTimer) clearTimeout(this.selectionDebounceTimer);

      this.selectionDebounceTimer = setTimeout(() => {
        if (this.shouldShowCodeLensHint(e.textEditor)) {
          // CodeLens provider handles the hint display
          vscode.commands.executeCommand('editor.action.codeLensRefresh');
        }
      }, 500);
    });
  }

  // ============ Trigger Handling ============

  async handleTrigger(
    editor: vscode.TextEditor,
    source: 'keyboard' | 'contextMenu' | 'codeLens' | 'command'
  ): Promise<void> {
    if (!this.isValidTriggerContext(editor)) {
      vscode.window.showWarningMessage('Inline edit is not available in this context');
      return;
    }

    const mode = this.editService.detectTriggerMode(editor);

    // If no selection → GENERATE MODE (Phase 15.1)
    if (editor.selection.isEmpty) {
      await this.handleGenerateMode(editor);
      return;
    }

    await this.handleTriggerWithMode(editor, mode, source);
  }

  async handleTriggerWithMode(
    editor: vscode.TextEditor,
    mode: TriggerMode,
    source: 'keyboard' | 'contextMenu' | 'codeLens' | 'command'
  ): Promise<void> {
    try {
      Logger.info(`Inline edit triggered: mode=${mode}, source=${source}`);
      const session = await this.editService.triggerInlineEdit(editor, mode);
      Logger.debug(`Session created: ${session.id}`);
    } catch (error) {
      Logger.error('Inline edit trigger failed:', error);
      vscode.window.showErrorMessage('Failed to start inline edit');
    }
  }

  // ============ Validation ============

  isValidTriggerContext(editor: vscode.TextEditor): boolean {
    // Check readonly
    if (editor.document.uri.scheme === 'output' || editor.document.uri.scheme === 'debug') {
      return false;
    }

    // Check if inline edit is enabled
    const enabled = vscode.workspace.getConfiguration('inaCoding.inlineEdit').get<boolean>('enabled', true);
    if (!enabled) return false;

    // Check supported language
    return SUPPORTED_LANGUAGES.includes(editor.document.languageId) ||
      editor.document.languageId === 'plaintext';
  }

  getSelectionOrExpandToLine(editor: vscode.TextEditor): vscode.Selection {
    if (!editor.selection.isEmpty) return editor.selection;
    return this.expander.expandToLine(editor.document, editor.selection.active);
  }

  async handleGenerateMode(editor: vscode.TextEditor): Promise<void> {
    const scopeAnalyzer = ScopeAnalyzer.getInstance();
    const position = editor.selection.active;
    const scope = await scopeAnalyzer.analyzeScope(editor.document, position);
    const hints = scopeAnalyzer.getContextHints(scope, editor.document.languageId);

    // Show input box with context hints
    const hintLabels = hints.slice(0, 4).map(h => h.label).join(' | ');
    const prompt = await vscode.window.showInputBox({
      prompt: `Generate code at cursor${hintLabels ? ` (${hintLabels})` : ''}`,
      placeHolder: 'Describe what to generate...',
      title: 'INA Coding — Generate Code',
    });

    if (!prompt) return;

    const generateService = GenerateService.getInstance();
    const nearbySymbols = await scopeAnalyzer.getNearbySymbols(editor.document, position);
    const imports = scopeAnalyzer.getExistingImports(editor.document);
    const prefix = editor.document.getText(new vscode.Range(Math.max(0, position.line - 200), 0, position.line, position.character));
    const suffix = editor.document.getText(new vscode.Range(position.line, position.character, Math.min(editor.document.lineCount - 1, position.line + 100), 0));

    const context: GenerateContext = {
      mode: await scopeAnalyzer.detectGenerateMode(editor.document, position),
      filePath: editor.document.uri.fsPath,
      language: editor.document.languageId,
      cursorLine: position.line,
      cursorColumn: position.character,
      prefix, suffix,
      currentScope: scope,
      nearbySymbols, imports,
      diagnostics: [],
    };

    try {
      const session = await generateService.generateWithPreview({ prompt, context, options: {} }, editor);
      const accept = await vscode.window.showInformationMessage(
        `Generated ${session.code.split('\n').length} lines. Accept?`,
        'Accept', 'Reject'
      );
      if (accept === 'Accept') {
        await session.accept();
      }
    } catch (e: any) {
      Logger.error('Generate mode failed:', e);
      vscode.window.showErrorMessage(`Generation failed: ${e.message}`);
    }
  }

  shouldShowCodeLensHint(editor: vscode.TextEditor): boolean {
    if (editor.selection.isEmpty) return false;
    const text = editor.document.getText(editor.selection);
    if (text.length < 5) return false;

    const lines = editor.selection.end.line - editor.selection.start.line;
    if (lines > 500) return false;

    return this.isValidTriggerContext(editor);
  }
}
