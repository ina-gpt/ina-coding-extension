import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';
import { CONFIG_PRESETS, getPreset } from '../utils/ConfigPresets';
import { ApiService } from '../services/ApiService';
import { AuthService } from '../services/AuthService';
import { IndexingService } from '../services/IndexingService';
import { CompletionService } from '../services/CompletionService';
import { ChatService } from '../services/ChatService';
import { HistoryManager } from '../services/HistoryManager';
import { ChatViewProvider } from '../providers/ChatViewProvider';
import { InlineEditProvider } from '../providers/InlineEditProvider';
import { ProjectTreeProvider } from '../providers/ProjectTreeProvider';
import { HistoryPanelProvider } from '../providers/HistoryPanelProvider';

interface Services {
  api: ApiService;
  auth: AuthService;
  indexing: IndexingService;
  completion: CompletionService;
  chat: ChatService;
  historyManager: HistoryManager;
}

interface Providers {
  chatViewProvider: ChatViewProvider;
  inlineEditProvider: InlineEditProvider;
  projectTreeProvider: ProjectTreeProvider;
  historyPanelProvider: HistoryPanelProvider;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  services: Services,
  providers: Providers
) {
  const commands: Array<{ id: string; handler: (...args: unknown[]) => unknown }> = [
    {
      id: 'inaCoding.openChat',
      handler: () => {
        vscode.commands.executeCommand('workbench.view.extension.ina-coding-sidebar');
        providers.chatViewProvider.focusInput();
      },
    },
    {
      id: 'inaCoding.inlineEdit',
      handler: () => providers.inlineEditProvider.showInlineEdit(),
    },
    {
      id: 'inaCoding.explainCode',
      handler: () => executeCodeAction('Explain this code in detail'),
    },
    {
      id: 'inaCoding.refactorCode',
      handler: () => executeCodeAction('Refactor this code to improve readability and maintainability'),
    },
    {
      id: 'inaCoding.fixCode',
      handler: () => executeCodeAction('Find and fix any bugs or issues in this code'),
    },
    {
      id: 'inaCoding.generateTests',
      handler: () => executeCodeAction('Generate comprehensive unit tests for this code'),
    },
    {
      id: 'inaCoding.addDocumentation',
      handler: () => executeCodeAction('Add detailed documentation comments to this code'),
    },
    {
      id: 'inaCoding.indexProject',
      handler: () => services.indexing.indexWorkspace(),
    },
    {
      id: 'inaCoding.searchCodebase',
      handler: async () => {
        const query = await vscode.window.showInputBox({
          prompt: 'Search codebase',
          placeHolder: 'Enter search query...',
        });
        if (query) {
          Logger.info('Search query:', query);
        }
      },
    },
    {
      id: 'inaCoding.toggleCompletion',
      handler: () => {
        const current = services.completion.enabled;
        services.completion.setEnabled(!current);
        vscode.window.showInformationMessage(
          `AI Completion ${!current ? 'enabled' : 'disabled'}`
        );
      },
    },
    {
      id: 'inaCoding.acceptCompletion',
      handler: () => {
        vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
        vscode.commands.executeCommand('setContext', 'inaCoding.completionVisible', false);
      },
    },
    {
      id: 'inaCoding.dismissCompletion',
      handler: () => {
        vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
        vscode.commands.executeCommand('setContext', 'inaCoding.completionVisible', false);
      },
    },
    {
      id: 'inaCoding.nextCompletion',
      handler: () => vscode.commands.executeCommand('editor.action.inlineSuggest.showNext'),
    },
    {
      id: 'inaCoding.prevCompletion',
      handler: () => vscode.commands.executeCommand('editor.action.inlineSuggest.showPrevious'),
    },
    {
      id: 'inaCoding.clearHistory',
      handler: async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Clear all chat history?',
          { modal: true },
          'Clear'
        );
        if (confirm === 'Clear') {
          services.historyManager.clearAll();
          providers.historyPanelProvider.refresh();
        }
      },
    },
    {
      id: 'inaCoding.showSettings',
      handler: () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'inaCoding');
      },
    },
    {
      id: 'inaCoding.signIn',
      handler: async () => {
        if (services.auth.isAuthenticated) {
          const confirm = await vscode.window.showInformationMessage(
            `Already signed in as ${services.auth.user?.email}. Sign out first?`,
            'Sign Out',
            'Cancel'
          );
          if (confirm === 'Sign Out') {
            await services.auth.signOut();
            await services.auth.signIn();
          }
        } else {
          await services.auth.signIn();
        }
      },
    },
    {
      id: 'inaCoding.signOut',
      handler: async () => {
        if (!services.auth.isAuthenticated) {
          vscode.window.showInformationMessage('Not signed in');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Sign out of ${services.auth.user?.email}?`,
          { modal: true },
          'Sign Out'
        );
        if (confirm === 'Sign Out') {
          await services.auth.signOut();
        }
      },
    },
    {
      id: 'inaCoding.showAccount',
      handler: async () => {
        if (!services.auth.isAuthenticated) {
          const action = await vscode.window.showInformationMessage(
            'Not signed in to INA Coding',
            'Sign In'
          );
          if (action === 'Sign In') {
            await services.auth.signIn();
          }
          return;
        }

        const user = services.auth.user;
        const action = await vscode.window.showInformationMessage(
          `Signed in as ${user?.email}\nPlan: ${user?.plan}`,
          'Sign Out',
          'Refresh'
        );

        if (action === 'Sign Out') {
          await services.auth.signOut();
        } else if (action === 'Refresh') {
          await services.auth.refreshTokens();
          vscode.window.showInformationMessage('Session refreshed');
        }
      },
    },
    // Settings commands
    {
      id: 'inaCoding.openSettingsUI',
      handler: () => {
        vscode.commands.executeCommand('workbench.view.extension.ina-coding-sidebar');
        vscode.commands.executeCommand('inaCoding.settingsView.focus');
      },
    },
    {
      id: 'inaCoding.applyPreset',
      handler: async () => {

        const items = CONFIG_PRESETS.map(p => ({
          label: p.name,
          description: p.description,
          id: p.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a configuration preset',
        });

        if (selected) {
          const preset = getPreset(selected.id);
          if (preset) {
            const confirm = await vscode.window.showWarningMessage(
              `Apply "${preset.name}" preset? This will change multiple settings.`,
              { modal: true },
              'Apply'
            );
            if (confirm === 'Apply') {
              await ConfigManager.importConfig(JSON.stringify(preset.config));
              vscode.window.showInformationMessage(`Preset "${preset.name}" applied`);
            }
          }
        }
      },
    },
    {
      id: 'inaCoding.exportSettings',
      handler: async () => {
        const json = await ConfigManager.exportConfig();
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file('ina-coding-settings.json'),
          filters: { 'JSON': ['json'] },
        });
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
          vscode.window.showInformationMessage('Settings exported');
        }
      },
    },
    {
      id: 'inaCoding.importSettings',
      handler: async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'JSON': ['json'] },
        });
        if (uris?.[0]) {
          const content = await vscode.workspace.fs.readFile(uris[0]);
          const result = await ConfigManager.importConfig(Buffer.from(content).toString('utf8'));
          if (result.success) {
            vscode.window.showInformationMessage('Settings imported');
          } else {
            vscode.window.showErrorMessage(`Import failed: ${result.errors.join(', ')}`);
          }
        }
      },
    },
    {
      id: 'inaCoding.resetSettings',
      handler: async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Reset all INA Coding settings to defaults?',
          { modal: true },
          'Reset All'
        );
        if (confirm === 'Reset All') {
          await ConfigManager.resetAll();
          vscode.window.showInformationMessage('All settings reset to defaults');
        }
      },
    },
  ];

  for (const cmd of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd.id, cmd.handler)
    );
  }

  Logger.info(`Registered ${commands.length} commands`);
}

async function executeCodeAction(instruction: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('Please select code first');
    return;
  }

  vscode.commands.executeCommand('inaCoding.openChat');
  // TODO: Send message to chat with selected code and instruction
}
