/**
 * Phase 29 — Browser Preview + Design Mode
 *
 * Embeds a live browser preview inside VS Code. Design Mode lets the
 * user click any element and ask the AI to change it.
 */

import * as vscode from 'vscode';
import * as http from 'http';
import { Logger } from '../../utils/Logger';

export class BrowserPreviewService {
  private panel: vscode.WebviewPanel | null = null;
  private currentUrl = '';

  constructor(private context: vscode.ExtensionContext) {}

  async openPreview(url?: string): Promise<void> {
    if (!url) url = (await this.detectDevServer()) || undefined;
    if (!url) {
      const input = await vscode.window.showInputBox({
        prompt: 'URL für Vorschau eingeben',
        value: vscode.workspace.getConfiguration('inaCoding.preview').get<string>('defaultUrl', 'http://localhost:3000'),
        placeHolder: 'http://localhost:3000',
      });
      if (!input) return;
      url = input;
    }

    this.currentUrl = url;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'inaCodingPreview',
        `INA Preview: ${new URL(url).host}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => { this.panel = null; });

      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'elementClicked') {
          const prompt =
            `Ändere dieses UI-Element:\n\n` +
            `Selector: \`${msg.selector}\`\nTag: \`${msg.tagName}\`\n` +
            `Text: "${(msg.textContent || '').substring(0, 100)}"\n` +
            `Klassen: \`${msg.className}\`\n` +
            `HTML:\n\`\`\`html\n${(msg.outerHTML || '').substring(0, 500)}\n\`\`\`\n\nWas soll ich ändern?`;
          vscode.commands.executeCommand('inaCoding.openChat');
          setTimeout(() => {
            vscode.commands.executeCommand('inaCoding.sendMessageDirect', prompt);
          }, 500);
        }
      });
    }

    this.panel.webview.html = this.buildHTML(url);
  }

  refresh(): void {
    if (this.panel && this.currentUrl) {
      this.panel.webview.html = this.buildHTML(this.currentUrl);
    }
  }

  private async detectDevServer(): Promise<string | null> {
    if (!vscode.workspace.getConfiguration('inaCoding.preview').get<boolean>('autoDetectPort', true)) return null;
    for (const port of [3000, 3001, 5173, 5174, 8080, 8000, 4200, 4321]) {
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`http://localhost:${port}`, (res) => {
            res.resume();
            if (res.statusCode && res.statusCode < 400) resolve(); else reject();
          });
          req.on('error', reject);
          req.setTimeout(400, () => { req.destroy(); reject(); });
        });
        return `http://localhost:${port}`;
      } catch { /* try next */ }
    }
    return null;
  }

  private buildHTML(url: string): string {
    // Escape for safe embedding
    const safeUrl = url.replace(/"/g, '&quot;');
    return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{height:100vh;display:flex;flex-direction:column;background:#1e1e1e}
.toolbar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:#252526;border-bottom:1px solid #3c3c3c;font-family:-apple-system,sans-serif;font-size:12px;color:#ccc}
.toolbar input{flex:1;background:#3c3c3c;border:1px solid #555;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;outline:none}
.toolbar button{background:#0e639c;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px}
.toolbar button:hover{opacity:.85}
.toolbar .design{background:#6d28d9}
.toolbar .design.on{background:#10b981}
iframe{flex:1;border:none;background:#fff}
</style></head><body>
<div class="toolbar">
<span>INA Preview</span>
<input id="url" value="${safeUrl}" onkeydown="if(event.key==='Enter'){document.getElementById('f').src=this.value}"/>
<button onclick="document.getElementById('f').src=document.getElementById('url').value">&#x21BB;</button>
<button id="dbtn" class="design" onclick="toggle()">Design-Modus</button>
</div>
<iframe id="f" src="${safeUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
<script>
const vscode=acquireVsCodeApi();let dm=false;
function toggle(){
  dm=!dm;
  const b=document.getElementById('dbtn');
  b.textContent=dm?'\\u2713 Design AN':'Design-Modus';
  b.classList.toggle('on',dm);
  try{
    const d=document.getElementById('f').contentDocument;
    if(dm){inject(d)}else{remove(d)}
  }catch(e){/* cross-origin */}
}
function inject(d){
  if(d.getElementById('ina-ds'))return;
  const s=d.createElement('style');s.id='ina-ds';
  s.textContent='.ina-hl{outline:2px solid #00d2ff!important;outline-offset:2px;cursor:crosshair!important}.ina-sel{outline:3px solid #10b981!important;outline-offset:2px}';
  d.head.appendChild(s);
  const sc=d.createElement('script');sc.id='ina-dsc';
  sc.textContent=\`let h=null;
document.addEventListener('mouseover',e=>{if(h)h.classList.remove('ina-hl');e.target.classList.add('ina-hl');h=e.target},true);
document.addEventListener('mouseout',e=>{e.target.classList.remove('ina-hl')},true);
document.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();
document.querySelectorAll('.ina-sel').forEach(x=>x.classList.remove('ina-sel'));
e.target.classList.add('ina-sel');
function sel(el){if(el.id)return'#'+el.id;let p=el.tagName.toLowerCase();if(el.className&&typeof el.className==='string')p+='.'+el.className.trim().split(/\\\\s+/).filter(c=>!c.startsWith('ina-')).join('.');return p}
window.parent.postMessage({type:'elementClicked',selector:sel(e.target),tagName:e.target.tagName,className:e.target.className||'',textContent:(e.target.textContent||'').substring(0,200),outerHTML:e.target.outerHTML.substring(0,500)},'*')},true);\`;
  d.body.appendChild(sc);
}
function remove(d){
  const s=d.getElementById('ina-ds');if(s)s.remove();
  const sc=d.getElementById('ina-dsc');if(sc)sc.remove();
  d.querySelectorAll('.ina-hl,.ina-sel').forEach(e=>{e.classList.remove('ina-hl','ina-sel')});
}
window.addEventListener('message',e=>{if(e.data&&e.data.type==='elementClicked')vscode.postMessage(e.data)});
</script></body></html>`;
  }

  dispose(): void { this.panel?.dispose(); }
}
