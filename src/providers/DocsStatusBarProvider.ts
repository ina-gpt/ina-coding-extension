import * as vscode from 'vscode';
import { DocsClient } from '../services/docs/DocsClient';
import { DocsAutoSuggestService } from '../services/docs/DocsAutoSuggestService';
import { Logger } from '../utils/Logger';

export class DocsStatusBarProvider {
  private statusBarItem: vscode.StatusBarItem;
  private docsClient: DocsClient;
  private autoSuggest: DocsAutoSuggestService;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.docsClient = DocsClient.getInstance();
    this.autoSuggest = DocsAutoSuggestService.getInstance();

    this.statusBarItem.command = 'inaCoding.openDocsPanel';
    this.update();

    this.docsClient.on('source-added', () => this.update());
    this.docsClient.on('source-removed', () => this.update());
    this.docsClient.on('crawl-started', () => this.setCrawling());
    this.docsClient.on('crawl-complete', () => this.update());
    this.autoSuggest.on('suggestions-ready', (suggestions: any[]) => {
      if (suggestions.length > 0) {
        this.statusBarItem.text = `$(book) Docs (${suggestions.length} suggestions)`;
      }
    });

    this.statusBarItem.show();
  }

  async update(): Promise<void> {
    try {
      const sources = await this.docsClient.listSources();
      const readySources = sources.filter(s => s.status === 'ready');
      const totalPages = readySources.reduce((sum, s) => sum + s.doc_count, 0);
      this.statusBarItem.text = `$(book) Docs (${readySources.length})`;
      this.statusBarItem.tooltip = `${readySources.length} doc sources indexed, ${totalPages} pages\nClick to manage documentation`;
    } catch {
      this.statusBarItem.text = '$(book) Docs';
      this.statusBarItem.tooltip = 'Documentation - Click to manage';
    }
  }

  private setCrawling(): void {
    this.statusBarItem.text = '$(sync~spin) Docs';
    this.statusBarItem.tooltip = 'Crawling documentation...';
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
