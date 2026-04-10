import * as vscode from 'vscode';
import { AgentMode, AgentStatus } from '../services/agent/AgentTypes';
import { AgentModeManager } from '../services/agent/AgentModeManager';
import { AgentSessionManager } from '../services/agent/AgentSessionManager';

const MODE_DISPLAY: Record<AgentMode, { icon: string; label: string; color: string | undefined }> = {
  [AgentMode.CHAT]: { icon: '$(comment-discussion)', label: 'Chat', color: undefined },
  [AgentMode.AGENT]: { icon: '$(robot)', label: 'Agent', color: 'statusBarItem.warningBackground' },
  [AgentMode.AUTO]: { icon: '$(sparkle)', label: 'Auto', color: undefined },
};

const STATUS_DISPLAY: Record<string, string> = {
  [AgentStatus.PLANNING]: '$(loading~spin) Planning...',
  [AgentStatus.EXECUTING]: '$(loading~spin) Executing...',
  [AgentStatus.PAUSED]: '$(debug-pause) Paused',
  [AgentStatus.REVIEWING]: '$(eye) Reviewing...',
};

export class AgentStatusBarProvider implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private modeManager: AgentModeManager;
  private sessionManager: AgentSessionManager;
  private disposables: vscode.Disposable[] = [];

  constructor(
    modeManager: AgentModeManager,
    sessionManager: AgentSessionManager
  ) {
    this.modeManager = modeManager;
    this.sessionManager = sessionManager;

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.statusBarItem.command = 'inaCoding.toggleAgentMode';

    this.update();

    this.disposables.push(
      modeManager.onModeChange(() => this.update()),
      sessionManager.onStatusChange(() => this.update()),
      sessionManager.onSessionStart(() => this.update()),
      sessionManager.onSessionEnd(() => this.update())
    );

    this.statusBarItem.show();
  }

  private update(): void {
    const mode = this.modeManager.getMode();
    const display = MODE_DISPLAY[mode];
    const session = this.sessionManager.getActiveSession();

    let text = `${display.icon} ${display.label}`;
    let tooltip = `INA Coding: ${display.label} Mode\nClick to toggle mode`;

    if (session) {
      const statusText = STATUS_DISPLAY[session.status];
      if (statusText) {
        text = `${display.icon} ${statusText}`;
        tooltip += `\n\nSession: ${session.prompt.slice(0, 60)}`;
        tooltip += `\nStatus: ${session.status}`;

        if (session.plan) {
          const completed = session.plan.steps.filter((s) => s.status === 'completed').length;
          tooltip += `\nProgress: ${completed}/${session.plan.steps.length} steps`;
        }
      }
    }

    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip;
    this.statusBarItem.backgroundColor = display.color
      ? new vscode.ThemeColor(display.color)
      : undefined;
  }

  dispose(): void {
    this.statusBarItem.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
