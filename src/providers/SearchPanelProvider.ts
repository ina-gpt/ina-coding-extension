/**
 * Search Panel Provider
 *
 * VS Code WebView provider for the search panel.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { searchClient, SearchResultItem } from '../services/SearchClient';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

export class SearchPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'inaCoding.searchPanel';

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
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist'),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      message => this._handleMessage(message),
      undefined,
      this.context.subscriptions
    );
  }

  // ============ Message Handling ============

  private async _handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'search':
        await this._handleSearch(message.query, message.filters);
        break;

      case 'openSearchResult':
        await searchClient.openResult(message.result);
        break;

      case 'copyToClipboard':
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage('Copied to clipboard');
        break;

      case 'insertCitation':
        await searchClient.insertCitation(message.citation);
        break;

      case 'getSearchHistory':
        this._view?.webview.postMessage({
          type: 'searchHistory',
          history: searchClient.getSearchHistory(),
        });
        break;
    }
  }

  private async _handleSearch(query: string, filters?: any): Promise<void> {
    try {
      const response = await searchClient.search({
        query,
        filters,
        limit: 30,
        rerank: true,
      });

      this._view?.webview.postMessage({
        type: 'searchResults',
        results: response.results,
        timing: response.timing,
        totalFound: response.totalFound,
      });

    } catch (error) {
      Logger.error('Search failed:', error);
      this._view?.webview.postMessage({
        type: 'searchError',
        error: error instanceof Error ? error.message : 'Search failed',
      });
    }
  }

  // ============ Public Methods ============

  public searchFromExternal(query: string): void {
    if (this._view) {
      this._view.show(true);
      this._view.webview.postMessage({
        type: 'setSearchQuery',
        query,
      });
    }
  }

  // ============ HTML Generation ============

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
          return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; connect-src ${ConfigManager.getApiEndpoint()};">${styleUri ? `<link href="${styleUri}" rel="stylesheet">` : ''}<title>INA Search</title></head><body><div id="root" data-panel="search"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
        }
      }
    } catch (e) { Logger.error('Failed to load search webview:', e); }

    const nonce = this._nonce();
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"><title>INA Search</title><style>body{font-family:var(--vscode-font-family);padding:20px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);text-align:center}p{color:var(--vscode-descriptionForeground);font-size:13px}</style></head><body><div><h3>Search</h3><p>Loading search panel...</p></div></body></html>`;
  }

  private _nonce(): string {
    let t = ''; const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) { t += c.charAt(Math.floor(Math.random() * c.length)); } return t;
  }
}
