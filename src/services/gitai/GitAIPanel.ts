/**
 * Phase 15.6 — Git AI Panel
 *
 * Provides UI integration for AI commit message generation:
 * SCM input button, QuickPick selection, and auto-fill.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { CommitMessageGenerator } from './CommitMessageGenerator';
import { CommitMessageResult } from './GitAITypes';

export class GitAIPanel {
  private static instance: GitAIPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor() {}

  static getInstance(): GitAIPanel {
    if (!GitAIPanel.instance) {
      GitAIPanel.instance = new GitAIPanel();
    }
    return GitAIPanel.instance;
  }

  // ============ Public API ============

  /**
   * Register the SCM input button command that generates a commit message
   * and fills the SCM input box.
   */
  registerSCMInputButton(): vscode.Disposable {
    const command = vscode.commands.registerCommand(
      'inaCoding.generateCommitMessage',
      async () => {
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating commit message...',
              cancellable: false,
            },
            async () => {
              const generator = CommitMessageGenerator.getInstance();
              const result = await generator.generate({ staged: true });
              await this.showCommitMessageQuickPick(result);
            },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          Logger.error('Failed to generate commit message', err);
          vscode.window.showErrorMessage(`Commit message generation failed: ${message}`);
        }
      },
    );

    this.disposables.push(command);
    return command;
  }

  /**
   * Show a QuickPick allowing the user to choose between the main message
   * and any alternatives.
   */
  async showCommitMessageQuickPick(result: CommitMessageResult): Promise<void> {
    const items: vscode.QuickPickItem[] = [];

    // Main suggestion
    const mainLabel = result.summary;
    const mainDetail = result.body ? `${result.type}: ${result.body.split('\n')[0]}` : result.type;
    items.push({
      label: '$(star) ' + mainLabel,
      description: `(${result.type}${result.scope ? `/${result.scope}` : ''})`,
      detail: mainDetail,
    });

    // Alternatives
    for (const alt of result.alternatives) {
      items.push({
        label: alt.summary,
        description: `(${alt.style})`,
        detail: `Alternative — ${alt.style} style`,
      });
    }

    // Custom option
    items.push({
      label: '$(edit) Edit manually...',
      description: '',
      detail: 'Use the generated message as a starting point',
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a commit message',
      title: 'AI Commit Message',
    });

    if (!selected) {
      return;
    }

    if (selected.label === '$(edit) Edit manually...') {
      const edited = await vscode.window.showInputBox({
        prompt: 'Edit commit message',
        value: result.summary,
        validateInput: (val) =>
          val.length === 0 ? 'Commit message cannot be empty' : null,
      });
      if (edited) {
        await this.autoFillCommitInput(edited);
      }
    } else {
      // Strip the $(star) prefix if present
      const message = selected.label.replace(/^\$\(star\)\s*/, '');
      const fullMessage = result.body && selected.label.startsWith('$(star)')
        ? `${message}\n\n${result.body}`
        : message;
      await this.autoFillCommitInput(fullMessage);
    }
  }

  /**
   * Find the Git SCM provider and fill its input box with the given message.
   */
  async autoFillCommitInput(message: string): Promise<void> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        Logger.warn('Git extension not found, falling back to clipboard');
        await vscode.env.clipboard.writeText(message);
        vscode.window.showInformationMessage(
          'Commit message copied to clipboard (Git extension not available).',
        );
        return;
      }

      const git = gitExtension.isActive
        ? gitExtension.exports
        : await gitExtension.activate();
      const api = git.getAPI(1);

      if (!api || api.repositories.length === 0) {
        Logger.warn('No git repositories found');
        await vscode.env.clipboard.writeText(message);
        vscode.window.showInformationMessage(
          'Commit message copied to clipboard (no Git repository found).',
        );
        return;
      }

      // Use the first repository (or the one matching the workspace)
      const repo = api.repositories[0];
      repo.inputBox.value = message;

      Logger.info('Commit message filled in SCM input box');
    } catch (err) {
      Logger.error('Failed to auto-fill commit input', err);
      // Fallback: copy to clipboard
      await vscode.env.clipboard.writeText(message);
      vscode.window.showInformationMessage(
        'Commit message copied to clipboard.',
      );
    }
  }

  /**
   * Dispose all registered resources.
   */
  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
