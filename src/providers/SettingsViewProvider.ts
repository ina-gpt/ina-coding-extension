import * as vscode from 'vscode';
import { ConfigManager, CONFIG_DEFAULTS } from '../utils/ConfigManager';
import { Logger } from '../utils/Logger';

export class SettingsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'inaCoding.settingsView';
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'getConfig':
          this.sendConfig();
          break;
        case 'updateConfig':
          try {
            await ConfigManager.set(message.key, message.value);
            Logger.debug(`Config updated: ${message.key}`);
          } catch (error) {
            Logger.error(`Failed to update config ${message.key}:`, error);
          }
          break;
        case 'resetAll':
          await ConfigManager.resetAll();
          this.sendConfig();
          break;
        case 'exportConfig': {
          const json = await ConfigManager.exportConfig();
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('ina-coding-settings.json'),
            filters: { 'JSON': ['json'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
            vscode.window.showInformationMessage('Settings exported');
          }
          break;
        }
        case 'importConfig': {
          const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JSON': ['json'] } });
          if (uris?.[0]) {
            const content = await vscode.workspace.fs.readFile(uris[0]);
            const result = await ConfigManager.importConfig(Buffer.from(content).toString('utf8'));
            if (result.success) {
              vscode.window.showInformationMessage('Settings imported');
              this.sendConfig();
            } else {
              vscode.window.showErrorMessage(`Import failed: ${result.errors.join(', ')}`);
            }
          }
          break;
        }
        case 'openVSCodeSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'inaCoding');
          break;
      }
    });

    ConfigManager.onAnyChange(() => this.sendConfig());
  }

  private sendConfig() {
    this._view?.webview.postMessage({
      type: 'config',
      data: ConfigManager.getAll(),
      defaults: CONFIG_DEFAULTS,
      validation: ConfigManager.validate(),
    });
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>INA Coding Settings</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size, 13px); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 16px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    .header h1 { font-size: 16px; font-weight: 600; }
    .header-actions { display: flex; gap: 6px; }
    .header-actions button { padding: 3px 8px; font-size: 11px; }
    .section { margin-bottom: 16px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; cursor: pointer; user-select: none; }
    .section-header h2 { font-size: 13px; font-weight: 600; }
    .section-content { display: grid; gap: 8px; }
    .section-content.collapsed { display: none; }
    .setting-item { padding: 10px; background: var(--vscode-editor-background); border-radius: 4px; border: 1px solid var(--vscode-panel-border); }
    .setting-label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .setting-label label { font-weight: 500; font-size: 12px; }
    .setting-label .modified { font-size: 9px; color: var(--vscode-textLink-foreground); padding: 1px 5px; background: var(--vscode-badge-background); border-radius: 3px; }
    .setting-desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
    input[type="text"], input[type="number"], select, textarea { width: 100%; padding: 6px 8px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 3px; color: var(--vscode-input-foreground); font-size: 12px; font-family: inherit; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--vscode-focusBorder); }
    textarea { min-height: 50px; resize: vertical; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; }
    .checkbox-row input[type="checkbox"] { width: 14px; height: 14px; cursor: pointer; }
    button { padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button.danger { background: #dc2626; color: white; }
    .errors { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); border-radius: 4px; padding: 8px; margin-bottom: 12px; font-size: 12px; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .tag { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; font-size: 11px; }
    .tag button { padding: 0; background: none; color: inherit; font-size: 12px; line-height: 1; }
    .loading { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div id="app"><div class="loading">Loading settings...</div></div>
  <script>
    const vscode = acquireVsCodeApi();
    let config = null, defaults = null;
    vscode.postMessage({ type: 'getConfig' });

    window.addEventListener('message', (e) => {
      if (e.data.type === 'config') { config = e.data.data; defaults = e.data.defaults; render(e.data.validation); }
    });

    const sectionNames = {
      general: 'General', api: 'API Connection', models: 'AI Models', chat: 'Chat',
      completion: 'Code Completion', inlineEdit: 'Inline Edit', indexing: 'Codebase Indexing',
      privacy: 'Privacy', ui: 'Appearance', advanced: 'Advanced'
    };

    function render(validation) {
      let h = '<div class="header"><h1>INA Coding Settings</h1><div class="header-actions">';
      h += '<button class="secondary" onclick="msg(\\'openVSCodeSettings\\')">VS Code Settings</button>';
      h += '<button class="secondary" onclick="msg(\\'exportConfig\\')">Export</button>';
      h += '<button class="secondary" onclick="msg(\\'importConfig\\')">Import</button></div></div>';
      if (!validation.valid) { h += '<div class="errors">' + validation.errors.map(e => '• ' + e).join('<br>') + '</div>'; }
      for (const [sec, vals] of Object.entries(config)) {
        h += '<div class="section"><div class="section-header" onclick="toggle(\\'' + sec + '\\')">';
        h += '<h2>' + (sectionNames[sec] || sec) + '</h2><span id="icon-' + sec + '">▼</span></div>';
        h += '<div class="section-content" id="sec-' + sec + '">';
        for (const [key, val] of Object.entries(vals)) {
          const fk = sec + '.' + key;
          const def = defaults[sec] ? defaults[sec][key] : val;
          const mod = JSON.stringify(val) !== JSON.stringify(def);
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          h += '<div class="setting-item"><div class="setting-label"><label>' + label + '</label>';
          if (mod) h += '<span class="modified">Modified</span>';
          h += '</div>';
          if (typeof val === 'boolean') {
            h += '<div class="checkbox-row"><input type="checkbox" ' + (val ? 'checked' : '') + ' onchange="upd(\\'' + fk + '\\',this.checked)"><span>' + (val ? 'Enabled' : 'Disabled') + '</span></div>';
          } else if (typeof val === 'number') {
            h += '<input type="number" value="' + val + '" onchange="upd(\\'' + fk + '\\',parseFloat(this.value))">';
          } else if (Array.isArray(val)) {
            h += '<div class="tags">' + val.map(v => '<span class="tag">' + v + '<button onclick="rmTag(\\'' + fk + '\\',\\'' + v + '\\')">×</button></span>').join('') + '</div>';
            h += '<input type="text" placeholder="Add item (Enter)" style="margin-top:4px" onkeydown="addTag(event,\\'' + fk + '\\')">';
          } else {
            h += '<input type="text" value="' + (val || '') + '" onchange="upd(\\'' + fk + '\\',this.value)">';
          }
          h += '</div>';
        }
        h += '</div></div>';
      }
      h += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--vscode-panel-border)"><button class="danger" onclick="if(confirm(\\'Reset all?\\'))msg(\\'resetAll\\')">Reset All to Defaults</button></div>';
      document.getElementById('app').innerHTML = h;
    }

    function toggle(s) { const el = document.getElementById('sec-'+s); el.classList.toggle('collapsed'); document.getElementById('icon-'+s).textContent = el.classList.contains('collapsed') ? '▶' : '▼'; }
    function msg(t) { vscode.postMessage({type:t}); }
    function upd(k,v) { vscode.postMessage({type:'updateConfig',key:k,value:v}); }
    function rmTag(k,v) { const cur = k.split('.').reduce((o,p)=>o[p],config)||[]; upd(k,cur.filter(x=>x!==v)); }
    function addTag(e,k) { if(e.key==='Enter'&&e.target.value.trim()){ const cur = k.split('.').reduce((o,p)=>o[p],config)||[]; upd(k,[...cur,e.target.value.trim()]); e.target.value=''; } }
  </script>
</body>
</html>`;
  }
}
