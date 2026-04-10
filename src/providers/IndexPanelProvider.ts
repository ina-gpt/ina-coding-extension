/**
 * Index Panel Provider
 *
 * VS Code WebView provider for index management panel.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { indexManagerClient } from '../services/IndexManagerClient';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

export class IndexPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'inaCoding.indexPanel';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;

  constructor(private readonly context: vscode.ExtensionContext) {
    this._extensionUri = context.extensionUri;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist')],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      message => this._handleMessage(message),
      undefined,
      this.context.subscriptions
    );
  }

  private async _handleMessage(message: any): Promise<void> {
    try {
      switch (message.type) {
        case 'getIndexStats': {
          const stats = await indexManagerClient.getStats();
          this._send('indexStats', { stats });
          break;
        }
        case 'getExcludePatterns': {
          const patterns = await indexManagerClient.getExcludePatterns();
          this._send('excludePatterns', { patterns });
          break;
        }
        case 'reindex': {
          this._send('operationStarted', { message: 'Starting reindex...' });
          try {
            if (message.options?.clearFirst) await indexManagerClient.clearIndex();
            await indexManagerClient.reindex({ clearFirst: false });
            this._send('operationComplete', {});
          } catch (error) {
            this._send('operationError', { error: error instanceof Error ? error.message : 'Failed' });
          }
          break;
        }
        case 'clearIndex': {
          const confirm = await vscode.window.showWarningMessage(
            'Clear all indexed data? This cannot be undone.',
            { modal: true },
            'Clear Index'
          );
          if (confirm === 'Clear Index') {
            this._send('operationStarted', { message: 'Clearing index...' });
            await indexManagerClient.clearIndex();
            this._send('operationComplete', {});
            vscode.window.showInformationMessage('Index cleared');
          }
          break;
        }
        case 'optimizeIndex': {
          this._send('operationStarted', { message: 'Optimizing index...' });
          await indexManagerClient.optimizeIndex();
          this._send('operationComplete', {});
          vscode.window.showInformationMessage('Index optimized');
          break;
        }
        case 'addExcludePattern': {
          await indexManagerClient.addExcludePattern(message.pattern);
          const patterns = await indexManagerClient.getExcludePatterns();
          this._send('excludePatterns', { patterns });
          break;
        }
        case 'removeExcludePattern': {
          await indexManagerClient.removeExcludePattern(message.patternId);
          const patterns2 = await indexManagerClient.getExcludePatterns();
          this._send('excludePatterns', { patterns: patterns2 });
          break;
        }
        case 'toggleExcludePattern': {
          await indexManagerClient.toggleExcludePattern(message.patternId, message.active);
          const patterns3 = await indexManagerClient.getExcludePatterns();
          this._send('excludePatterns', { patterns: patterns3 });
          break;
        }
        case 'openInaIgnore':
          await indexManagerClient.openInaIgnore();
          break;
      }
    } catch (error) {
      Logger.error('Index panel error:', error);
      this._send('operationError', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private _send(type: string, data: any): void {
    this._view?.webview.postMessage({ type, ...data });
  }

  public refresh(): void {
    this._send('refresh', {});
  }

  private _getHtml(webview: vscode.Webview): string {
    const distPath = path.join(this._extensionUri.fsPath, 'webview-ui', 'dist');
    try {
      if (fs.existsSync(path.join(distPath, 'assets'))) {
        const files = fs.readdirSync(path.join(distPath, 'assets'));
        const jsFile = files.find((f: string) => f.endsWith('.js'));
        const cssFile = files.find((f: string) => f.endsWith('.css'));
        if (jsFile) {
          const wvUri = vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist');
          const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(wvUri, 'assets', jsFile));
          const styleUri = cssFile ? webview.asWebviewUri(vscode.Uri.joinPath(wvUri, 'assets', cssFile)) : null;
          const nonce = this._nonce();
          return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; connect-src ${ConfigManager.getApiEndpoint()};">${styleUri ? `<link href="${styleUri}" rel="stylesheet">` : ''}<title>INA Index</title></head><body><div id="root" data-panel="index"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
        }
      }
    } catch (e) { Logger.error('Failed to load index webview:', e); }

    const nonce = this._nonce();
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>INA Index</title></head><body><p>Loading index panel...</p></body></html>`;
  }

  private _nonce(): string {
    let t = ''; const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) { t += c.charAt(Math.floor(Math.random() * c.length)); } return t;
  }
}
