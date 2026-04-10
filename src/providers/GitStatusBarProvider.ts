import * as vscode from 'vscode';
import { GitBranchService } from '../services/git/GitBranchService';
import { GitStatusService } from '../services/git/GitStatusService';
import { Logger } from '../utils/Logger';

export class GitStatusBarProvider {
  private branchItem: vscode.StatusBarItem;
  private changesItem: vscode.StatusBarItem;
  private branchService: GitBranchService;
  private statusService: GitStatusService;

  constructor() {
    this.branchService = GitBranchService.getInstance();
    this.statusService = GitStatusService.getInstance();

    this.branchItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
    this.branchItem.command = 'inaCoding.switchBranch';

    this.changesItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 199);
    this.changesItem.command = 'inaCoding.showGitDiff';

    this.update();
    this.branchItem.show();
    this.changesItem.show();
  }

  async update(): Promise<void> {
    try {
      const branch = await this.branchService.getCurrentBranch();
      let branchText = `$(git-branch) ${branch.name}`;
      if (branch.ahead > 0 || branch.behind > 0) {
        branchText += ` ↑${branch.ahead} ↓${branch.behind}`;
      }
      this.branchItem.text = branchText;
      this.branchItem.tooltip = `Branch: ${branch.name}\nAhead: ${branch.ahead}, Behind: ${branch.behind}${branch.upstream ? `\nUpstream: ${branch.upstream}` : ''}`;

      const status = await this.statusService.getStatus();
      const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length;
      if (totalChanges > 0) {
        this.changesItem.text = `$(diff-modified) ${totalChanges} changes`;
        this.changesItem.tooltip = `Staged: ${status.staged.length}\nUnstaged: ${status.unstaged.length}\nUntracked: ${status.untracked.length}`;
        this.changesItem.show();
      } else {
        this.changesItem.text = '$(check) clean';
        this.changesItem.tooltip = 'Working tree clean';
      }
    } catch {
      this.branchItem.text = '$(git-branch) ---';
      this.changesItem.hide();
    }
  }

  dispose(): void {
    this.branchItem.dispose();
    this.changesItem.dispose();
  }
}
