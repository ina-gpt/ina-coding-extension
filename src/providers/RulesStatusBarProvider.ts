import * as vscode from 'vscode';
import { RulesInjector } from '../services/rules/RulesInjector';
import { RulesFileManager } from '../services/rules/RulesFileManager';

export class RulesStatusBarProvider {
  private static instance: RulesStatusBarProvider;
  private statusBarItem: vscode.StatusBarItem;
  private injector: RulesInjector;
  private fileManager: RulesFileManager;

  static getInstance(): RulesStatusBarProvider {
    if (!RulesStatusBarProvider.instance) {
      RulesStatusBarProvider.instance = new RulesStatusBarProvider();
    }
    return RulesStatusBarProvider.instance;
  }

  private constructor() {
    this.injector = RulesInjector.getInstance();
    this.fileManager = RulesFileManager.getInstance();
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 88);
    this.statusBarItem.command = 'inaCoding.rules.showPanel';

    this.injector.on('rules-injection-changed', () => this.update());
    this.fileManager.on('loaded', () => this.update());
    this.fileManager.on('changed', () => this.update());
    this.fileManager.on('deleted', () => this.update());
    this.fileManager.on('created', () => this.update());

    this.update();
  }

  update(): void {
    const rules = this.fileManager.getRules();
    if (!rules) {
      this.statusBarItem.text = '$(law) No Rules';
      this.statusBarItem.tooltip = 'No .ina-rules file found. Click to create one.';
      this.statusBarItem.command = 'inaCoding.rules.create';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.show();
      return;
    }

    const active = this.injector.isRulesActive();
    const ruleCount = rules.parsed.allRules.length;
    const sectionCount = rules.parsed.sections.length;

    if (!rules.isValid) {
      this.statusBarItem.text = `$(warning) Rules (errors)`;
      this.statusBarItem.tooltip = `Rules file has errors:\n${(rules.errors || []).join('\n')}`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (!active) {
      this.statusBarItem.text = `$(law) Rules (off)`;
      this.statusBarItem.tooltip = `Rules disabled. ${ruleCount} rules in ${sectionCount} sections.`;
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = `$(law) ${ruleCount} Rules`;
      this.statusBarItem.tooltip = `${ruleCount} rules active in ${sectionCount} sections.\nClick to manage rules.`;
      this.statusBarItem.backgroundColor = undefined;
    }

    this.statusBarItem.command = 'inaCoding.rules.showPanel';
    this.statusBarItem.show();
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
