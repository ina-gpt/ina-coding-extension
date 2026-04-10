import * as vscode from 'vscode';
import { AgentMode } from './AgentTypes';
import { AgentDetector } from './AgentDetector';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';

export class AgentModeManager implements vscode.Disposable {
  private static instance: AgentModeManager;
  private currentMode: AgentMode = AgentMode.CHAT;
  private detector: AgentDetector;

  private readonly onModeChangeEmitter = new vscode.EventEmitter<AgentMode>();
  public readonly onModeChange = this.onModeChangeEmitter.event;

  constructor() {
    this.detector = AgentDetector.getInstance();

    // Load default mode from config
    try {
      const defaultMode = ConfigManager.get<string>('agent.defaultMode', 'chat');
      if (defaultMode === 'agent') this.currentMode = AgentMode.AGENT;
      else if (defaultMode === 'auto') this.currentMode = AgentMode.AUTO;
    } catch {
      // Config not yet initialized
    }
  }

  static getInstance(): AgentModeManager {
    if (!AgentModeManager.instance) {
      AgentModeManager.instance = new AgentModeManager();
    }
    return AgentModeManager.instance;
  }

  setMode(mode: AgentMode): void {
    if (this.currentMode === mode) return;

    const previousMode = this.currentMode;
    this.currentMode = mode;

    // Update VS Code context keys
    vscode.commands.executeCommand('setContext', 'inaCoding.agentMode', mode);
    vscode.commands.executeCommand('setContext', 'inaCoding.isAgentMode', mode === AgentMode.AGENT);

    this.onModeChangeEmitter.fire(mode);
    Logger.info(`Agent mode changed: ${previousMode} → ${mode}`);
  }

  getMode(): AgentMode {
    return this.currentMode;
  }

  toggleAgentMode(): void {
    switch (this.currentMode) {
      case AgentMode.CHAT:
        this.setMode(AgentMode.AGENT);
        break;
      case AgentMode.AGENT:
        this.setMode(AgentMode.AUTO);
        break;
      case AgentMode.AUTO:
        this.setMode(AgentMode.CHAT);
        break;
    }
  }

  isAgentMode(): boolean {
    return this.currentMode === AgentMode.AGENT;
  }

  isAutoMode(): boolean {
    return this.currentMode === AgentMode.AUTO;
  }

  shouldUseAgent(message: string, context?: { currentFile?: string; hasImports?: boolean }): boolean {
    switch (this.currentMode) {
      case AgentMode.AGENT:
        return true;
      case AgentMode.CHAT:
        return false;
      case AgentMode.AUTO: {
        const result = this.detector.detectAgentIntent(message, context);
        if (result.shouldUseAgent) {
          Logger.info(`Auto-detected agent intent (confidence: ${result.confidence})`, {
            reasons: result.reasons,
            operations: result.detectedOperations,
          });
        }
        return result.shouldUseAgent;
      }
    }
  }

  dispose(): void {
    this.onModeChangeEmitter.dispose();
  }
}
