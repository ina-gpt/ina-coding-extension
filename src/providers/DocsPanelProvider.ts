import * as vscode from 'vscode';
import { DocsClient } from '../services/docs/DocsClient';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

export class DocsPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'inaCoding.docsPanel';
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private docsClient: DocsClient;

  constructor(private context: vscode.ExtensionContext) {
    this._extensionUri = context.extensionUri;
    this.docsClient = DocsClient.getInstance();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'getDocSources':
          const sources = await this.docsClient.listSources();
          this._post({ type: 'docsSourcesUpdated', sources });
          break;
        case 'getBuiltins':
          const builtins = await this.docsClient.getBuiltins();
          this._post({ type: 'builtinDocs', builtins });
          break;
        case 'addDocSource':
          const added = await this.docsClient.addSource(message.source);
          if (added) {
            const updatedSources = await this.docsClient.listSources();
            this._post({ type: 'docsSourcesUpdated', sources: updatedSources });
          }
          break;
        case 'removeDocSource':
          await this.docsClient.removeSource(message.sourceId);
          const afterRemove = await this.docsClient.listSources();
          this._post({ type: 'docsSourcesUpdated', sources: afterRemove });
          break;
        case 'startDocCrawl':
          try {
            for await (const progress of this.docsClient.startCrawl(message.sourceId, message.config)) {
              this._post({ type: 'docsCrawlProgress', progress });
            }
            const afterCrawl = await this.docsClient.listSources();
            this._post({ type: 'docsSourcesUpdated', sources: afterCrawl });
          } catch (error: any) {
            this._post({ type: 'docsCrawlError', error: error.message });
          }
          break;
        case 'searchDocs':
          const results = await this.docsClient.search(message.query, message.sourceIds, message.limit);
          this._post({ type: 'docsSearchResults', results, query: message.query });
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.docsClient.listSources().then(sources => {
          this._post({ type: 'docsSourcesUpdated', sources });
        });
      }
    });
  }

  private _post(message: any): void {
    this._view?.webview.postMessage(message);
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src ${ConfigManager.getApiEndpoint()} http://localhost:3200;">
  <title>Documentation</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 12px; font-size: 13px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 8px; letter-spacing: 0.5px; }
    .source-card { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; padding: 10px; margin-bottom: 8px; }
    .source-header { display: flex; justify-content: space-between; align-items: center; }
    .source-name { font-weight: 600; }
    .source-stats { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }
    .badge-ready { background: var(--vscode-testing-iconPassed); color: #fff; }
    .badge-crawling { background: var(--vscode-progressBar-background); color: #fff; }
    .badge-failed { background: var(--vscode-testing-iconFailed); color: #fff; }
    .badge-pending { background: var(--vscode-descriptionForeground); color: #fff; }
    .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 4px; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn-danger { background: var(--vscode-inputValidation-errorBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    input, select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; border-radius: 3px; width: 100%; box-sizing: border-box; font-size: 12px; margin-bottom: 8px; }
    .tabs { display: flex; gap: 0; margin-bottom: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    .tab { padding: 6px 12px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; }
    .tab.active { border-bottom-color: var(--vscode-focusBorder); color: var(--vscode-foreground); }
    .tab:not(.active) { color: var(--vscode-descriptionForeground); }
    .builtin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .builtin-item { background: var(--vscode-editor-inactiveSelectionBackground); padding: 8px; border-radius: 4px; cursor: pointer; text-align: center; font-size: 11px; }
    .builtin-item:hover { background: var(--vscode-list-hoverBackground); }
    .builtin-icon { font-size: 18px; display: block; margin-bottom: 2px; }
    .progress-bar { height: 4px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 2px; overflow: hidden; margin-top: 6px; }
    .progress-fill { height: 100%; background: var(--vscode-progressBar-background); transition: width 0.3s; }
    .search-result { padding: 8px; border-left: 3px solid var(--vscode-focusBorder); margin-bottom: 6px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 0 4px 4px 0; }
    .result-score { font-size: 10px; color: var(--vscode-descriptionForeground); }
    .empty { text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-title">Indexed Sources</div>
    <div id="sources-list"><div class="empty">Loading...</div></div>
  </div>

  <div class="section">
    <div class="section-title">Add Source</div>
    <div class="tabs">
      <div class="tab active" data-tab="builtin">Builtin</div>
      <div class="tab" data-tab="url">URL</div>
      <div class="tab" data-tab="local">Local</div>
    </div>
    <div id="tab-builtin"><div id="builtins-grid" class="builtin-grid"><div class="empty">Loading...</div></div></div>
    <div id="tab-url" class="hidden">
      <input type="text" id="url-name" placeholder="Documentation name">
      <input type="text" id="url-input" placeholder="https://docs.example.com">
      <button class="btn" id="add-url-btn">Add & Index</button>
    </div>
    <div id="tab-local" class="hidden">
      <input type="text" id="local-path" placeholder="/path/to/docs">
      <input type="text" id="local-name" placeholder="Documentation name">
      <button class="btn" id="add-local-btn">Add & Index</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Search Documentation</div>
    <input type="text" id="search-input" placeholder="Search indexed documentation...">
    <div id="search-results"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let sources = [];
    let builtins = [];
    let crawlProgress = {};

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-builtin').classList.toggle('hidden', tab.dataset.tab !== 'builtin');
        document.getElementById('tab-url').classList.toggle('hidden', tab.dataset.tab !== 'url');
        document.getElementById('tab-local').classList.toggle('hidden', tab.dataset.tab !== 'local');
      });
    });

    function renderSources() {
      const el = document.getElementById('sources-list');
      if (sources.length === 0) { el.innerHTML = '<div class="empty">No documentation sources indexed yet.</div>'; return; }
      el.innerHTML = sources.map(s => {
        const badgeClass = s.status === 'ready' ? 'badge-ready' : s.status === 'crawling' || s.status === 'indexing' ? 'badge-crawling' : s.status === 'failed' ? 'badge-failed' : 'badge-pending';
        const progress = crawlProgress[s.id];
        const progressBar = progress && (s.status === 'crawling' || s.status === 'indexing') ? '<div class="progress-bar"><div class="progress-fill" style="width: ' + Math.round((progress.pagesCrawled / Math.max(progress.pagesFound, 1)) * 100) + '%"></div></div>' : '';
        return '<div class="source-card"><div class="source-header"><span class="source-name">' + s.name + '</span><span class="badge ' + badgeClass + '">' + s.status + '</span></div><div class="source-stats">' + s.doc_count + ' pages, ' + s.chunk_count + ' chunks' + (s.last_indexed_at ? ' | Last indexed: ' + new Date(s.last_indexed_at).toLocaleDateString() : '') + '</div>' + progressBar + '<div style="margin-top:6px"><button class="btn btn-secondary" onclick="recrawl(\\'' + s.id + '\\')">Re-crawl</button><button class="btn btn-danger" onclick="removeSource(\\'' + s.id + '\\')">Remove</button></div></div>';
      }).join('');
    }

    function renderBuiltins() {
      const el = document.getElementById('builtins-grid');
      if (builtins.length === 0) { el.innerHTML = '<div class="empty">Loading...</div>'; return; }
      const addedNames = new Set(sources.map(s => s.package_name || s.name.toLowerCase()));
      el.innerHTML = builtins.map(b => {
        const added = addedNames.has(b.packageName);
        return '<div class="builtin-item" onclick="' + (added ? '' : 'addBuiltin(\\'' + b.packageName + '\\',\\'' + b.name + '\\',\\'' + b.docsUrl + '\\')') + '" style="' + (added ? 'opacity:0.5' : '') + '"><span class="builtin-icon">' + b.icon + '</span>' + b.name + (added ? ' (added)' : '') + '</div>';
      }).join('');
    }

    function addBuiltin(pkg, name, url) {
      vscode.postMessage({ type: 'addDocSource', source: { name, type: 'builtin', url, packageName: pkg } });
    }

    function recrawl(id) { vscode.postMessage({ type: 'startDocCrawl', sourceId: id }); }
    function removeSource(id) { if (confirm('Remove this documentation source?')) vscode.postMessage({ type: 'removeDocSource', sourceId: id }); }

    document.getElementById('add-url-btn').addEventListener('click', () => {
      const name = document.getElementById('url-name').value;
      const url = document.getElementById('url-input').value;
      if (name && url) { vscode.postMessage({ type: 'addDocSource', source: { name, type: 'url', url } }); }
    });

    document.getElementById('add-local-btn').addEventListener('click', () => {
      const name = document.getElementById('local-name').value;
      const path = document.getElementById('local-path').value;
      if (name && path) { vscode.postMessage({ type: 'addDocSource', source: { name, type: 'local', localPath: path } }); }
    });

    let searchTimer;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = e.target.value.trim();
        if (q.length >= 2) vscode.postMessage({ type: 'searchDocs', query: q });
      }, 500);
    });

    window.addEventListener('message', (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'docsSourcesUpdated': sources = msg.sources || []; renderSources(); renderBuiltins(); break;
        case 'builtinDocs': builtins = msg.builtins || []; renderBuiltins(); break;
        case 'docsCrawlProgress': crawlProgress[msg.progress.sourceId] = msg.progress; renderSources(); break;
        case 'docsSearchResults':
          const el = document.getElementById('search-results');
          const results = msg.results || [];
          if (results.length === 0) { el.innerHTML = '<div class="empty">No results found.</div>'; break; }
          el.innerHTML = results.map(r => '<div class="search-result"><strong>' + (r.source?.name || '') + '</strong> — ' + (r.chunk?.section_title || r.page?.title || 'Doc') + '<div class="result-score">' + Math.round((r.score || 0) * 100) + '% match</div><div style="margin-top:4px;font-size:12px">' + (r.chunk?.content || '').slice(0, 200) + '...</div></div>').join('');
          break;
        case 'docsCrawlError': break;
      }
    });

    vscode.postMessage({ type: 'getDocSources' });
    vscode.postMessage({ type: 'getBuiltins' });
  </script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }
}
