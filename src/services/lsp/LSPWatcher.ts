import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { DiagnosticService } from './DiagnosticService';
import { SymbolService } from './SymbolService';
import { TypeInfoService } from './TypeInfoService';
import { LSPEvent } from './LSPTypes';
import { Logger } from '../../utils/Logger';

export class LSPWatcher extends EventEmitter {
  private static instance: LSPWatcher;
  private disposables: vscode.Disposable[] = [];
  private running = false;

  static getInstance(): LSPWatcher {
    if (!LSPWatcher.instance) {
      LSPWatcher.instance = new LSPWatcher();
    }
    return LSPWatcher.instance;
  }

  private constructor() {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const diagnosticService = DiagnosticService.getInstance();
    const symbolService = SymbolService.getInstance();
    const typeInfoService = TypeInfoService.getInstance();

    this.disposables.push(
      diagnosticService.watchDiagnostics((filePath, diagnostics) => {
        this.emit('lsp-event', 'diagnostics-changed' as LSPEvent, { filePath, diagnostics });
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          const filePath = vscode.workspace.asRelativePath(editor.document.uri);
          symbolService.invalidateCache(filePath);
          typeInfoService.invalidateCache(filePath);
          this.emit('lsp-event', 'symbols-changed' as LSPEvent, { filePath });
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        const filePath = vscode.workspace.asRelativePath(doc.uri);
        symbolService.invalidateCache(filePath);
        typeInfoService.invalidateCache(filePath);
      })
    );

    Logger.info('LSP watcher started');
  }

  stop(): void {
    this.running = false;
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  dispose(): void {
    this.stop();
  }
}
