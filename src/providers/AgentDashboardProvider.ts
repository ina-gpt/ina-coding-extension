/**
 * Phase 29 — Agent Dashboard
 *
 * Full-screen webview panel showing all running/completed agents
 * with stats cards, agent list, and quick actions.
 */

import * as vscode from 'vscode';

export class AgentDashboardProvider {
  private panel: vscode.WebviewPanel | null = null;

  constructor(private context: vscode.ExtensionContext) {}

  async show(): Promise<void> {
    if (this.panel) { this.panel.reveal(vscode.ViewColumn.One); return; }

    this.panel = vscode.window.createWebviewPanel(
      'inaCodingAgentDashboard',
      'INA-7 Pro · Agent-Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.html = this.buildHTML();
    this.panel.onDidDispose(() => { this.panel = null; });

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'newAgent': vscode.commands.executeCommand('inaCoding.agent.start'); break;
        case 'cancelAgent': vscode.commands.executeCommand('inaCoding.cloudAgent.cancel'); break;
        case 'viewAgent': vscode.commands.executeCommand('inaCoding.cloudAgent.status'); break;
        case 'openChat': vscode.commands.executeCommand('inaCoding.openChat'); break;
      }
    });
  }

  updateAgents(agents: any[]): void {
    this.panel?.webview.postMessage({ type: 'agentsUpdate', agents });
  }

  private buildHTML(): string {
    return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--vscode-font-family,-apple-system,sans-serif);background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-editor-foreground,#d4d4d4);padding:20px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--vscode-widget-border,#3c3c3c)}
.header h1{font-size:18px;font-weight:600;display:flex;align-items:center;gap:8px}
.header h1 span{font-size:14px;opacity:.6}
.btn{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500}
.btn:hover{opacity:.9}
.btn-sec{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#d4d4d4)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.sc{background:var(--vscode-input-background,#3c3c3c);border:1px solid var(--vscode-widget-border,#3c3c3c);border-radius:8px;padding:16px;text-align:center}
.sn{font-size:28px;font-weight:700}
.sl{font-size:11px;opacity:.6;margin-top:4px}
.sc.r .sn{color:#00d2ff}.sc.c .sn{color:#10b981}.sc.f .sn{color:#ef4444}.sc.q .sn{color:#f59e0b}
.al{display:flex;flex-direction:column;gap:8px}
.ac{display:flex;align-items:center;gap:12px;background:var(--vscode-input-background,#3c3c3c);border:1px solid var(--vscode-widget-border,#3c3c3c);border-radius:8px;padding:14px;cursor:pointer;transition:border-color .2s}
.ac:hover{border-color:#00d2ff}
.ai{font-size:24px}.af{flex:1}.an{font-weight:600;font-size:13px}.ad{font-size:11px;opacity:.6;margin-top:2px}
.as{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:500}
.s-r{background:rgba(0,210,255,.15);color:#00d2ff}.s-c{background:rgba(16,185,129,.15);color:#10b981}
.s-f{background:rgba(239,68,68,.15);color:#ef4444}.s-q{background:rgba(245,158,11,.15);color:#f59e0b}
.at{font-size:11px;opacity:.5}
.empty{text-align:center;padding:60px 20px;opacity:.5}
.ei{font-size:48px;margin-bottom:12px}
</style></head><body>
<div class="header">
<h1>Agent-Dashboard <span>INA-7 Pro</span></h1>
<div style="display:flex;gap:8px">
<button class="btn" onclick="vscode.postMessage({type:'newAgent'})">+ Neuer Agent</button>
<button class="btn btn-sec" onclick="vscode.postMessage({type:'openChat'})">Chat</button>
</div>
</div>
<div class="stats">
<div class="sc r"><div class="sn" id="rc">0</div><div class="sl">Aktiv</div></div>
<div class="sc c"><div class="sn" id="cc">0</div><div class="sl">Abgeschlossen</div></div>
<div class="sc f"><div class="sn" id="fc">0</div><div class="sl">Fehlgeschlagen</div></div>
<div class="sc q"><div class="sn" id="qc">0</div><div class="sl">Warteschlange</div></div>
</div>
<h2 style="font-size:14px;margin-bottom:12px;opacity:.8">Letzte Agenten</h2>
<div class="al" id="al">
<div class="empty"><div class="ei">&#x1F916;</div><p>Keine Agenten aktiv</p><p style="margin-top:8px;font-size:12px">Starten Sie einen neuen Agenten mit dem Button oben</p></div>
</div>
<script>
const vscode=acquireVsCodeApi();
window.addEventListener('message',e=>{if(e.data.type==='agentsUpdate')upd(e.data.agents||[])});
function upd(a){
  document.getElementById('rc').textContent=a.filter(x=>x.status==='running').length;
  document.getElementById('cc').textContent=a.filter(x=>x.status==='completed').length;
  document.getElementById('fc').textContent=a.filter(x=>x.status==='failed').length;
  document.getElementById('qc').textContent=a.filter(x=>x.status==='queued').length;
  const l=document.getElementById('al');
  if(!a.length){l.innerHTML='<div class="empty"><div class="ei">&#x1F916;</div><p>Keine Agenten aktiv</p></div>';return}
  l.innerHTML=a.map(x=>\`<div class="ac" onclick="vscode.postMessage({type:'viewAgent',id:'\${x.id}'})">
<div class="ai">\${x.status==='running'?'\\u26A1':x.status==='completed'?'\\u2705':x.status==='failed'?'\\u274C':'\\u23F3'}</div>
<div class="af"><div class="an">\${x.name||(x.task||'Agent').substring(0,60)}</div><div class="ad">\${x.filesChanged||0} Dateien \\u00B7 \${x.tokensUsed||0} Tokens</div></div>
<span class="as s-\${x.status[0]}">\${x.status}</span>
<span class="at">\${x.duration||''}</span></div>\`).join('');
}
vscode.postMessage({type:'getAgents'});
</script></body></html>`;
  }

  dispose(): void { this.panel?.dispose(); }
}
