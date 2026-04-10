import * as vscode from 'vscode';
import { RULES_CONSTANTS, SECTION_HEADERS } from '../services/rules/RulesTypes';

export class RulesCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.isRulesFile(document)) return [];

    const lenses: vscode.CodeLens[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text.trim();

      if (text.startsWith('# ') && !text.startsWith('## ')) {
        const sectionName = text.replace(/^#\s+/, '').toLowerCase();
        const range = new vscode.Range(i, 0, i, text.length);

        const matchedType = SECTION_HEADERS.get(sectionName);

        if (matchedType) {
          lenses.push(new vscode.CodeLens(range, {
            title: `$(info) ${matchedType} section`,
            command: '',
            arguments: [],
          }));
        }

        // Count rules in this section
        let ruleCount = 0;
        for (let j = i + 1; j < document.lineCount; j++) {
          const nextLine = document.lineAt(j).text.trim();
          if (nextLine.startsWith('# ') && !nextLine.startsWith('## ')) break;
          if (nextLine.startsWith('- ') || nextLine.startsWith('* ')) ruleCount++;
        }

        if (ruleCount > 0) {
          lenses.push(new vscode.CodeLens(range, {
            title: `${ruleCount} rule${ruleCount !== 1 ? 's' : ''}`,
            command: '',
            arguments: [],
          }));
        }
      }
    }

    return lenses;
  }

  private isRulesFile(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.split('/').pop() || '';
    return fileName === RULES_CONSTANTS.FILE_NAME || (RULES_CONSTANTS.ALT_FILE_NAMES as readonly string[]).includes(fileName);
  }
}

export class RulesFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];
    let frontmatterStart = -1;
    let sectionStart = -1;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text.trim();

      // Frontmatter folding
      if (line === '---') {
        if (frontmatterStart === -1 && i < 3) {
          frontmatterStart = i;
        } else if (frontmatterStart !== -1) {
          ranges.push(new vscode.FoldingRange(frontmatterStart, i, vscode.FoldingRangeKind.Region));
          frontmatterStart = -1;
        }
      }

      // Section folding
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        if (sectionStart !== -1) {
          ranges.push(new vscode.FoldingRange(sectionStart, i - 1, vscode.FoldingRangeKind.Region));
        }
        sectionStart = i;
      }
    }

    if (sectionStart !== -1) {
      ranges.push(new vscode.FoldingRange(sectionStart, document.lineCount - 1, vscode.FoldingRangeKind.Region));
    }

    return ranges;
  }
}

export class RulesSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text.trim();

      if (text.startsWith('# ') && !text.startsWith('## ')) {
        const name = text.replace(/^#\s+/, '');
        let endLine = i;
        for (let j = i + 1; j < document.lineCount; j++) {
          if (document.lineAt(j).text.trim().startsWith('# ') && !document.lineAt(j).text.trim().startsWith('## ')) break;
          endLine = j;
        }

        const range = new vscode.Range(i, 0, endLine, document.lineAt(endLine).text.length);
        const symbol = new vscode.DocumentSymbol(
          name,
          '',
          vscode.SymbolKind.Namespace,
          range,
          new vscode.Range(i, 0, i, text.length)
        );

        // Add rule items as children
        for (let j = i + 1; j <= endLine; j++) {
          const ruleLine = document.lineAt(j).text.trim();
          if (ruleLine.startsWith('- ') || ruleLine.startsWith('* ')) {
            const ruleText = ruleLine.replace(/^[-*]\s+/, '').substring(0, 60);
            const ruleRange = new vscode.Range(j, 0, j, document.lineAt(j).text.length);
            symbol.children.push(new vscode.DocumentSymbol(
              ruleText,
              '',
              vscode.SymbolKind.Property,
              ruleRange,
              ruleRange
            ));
          }
        }

        symbols.push(symbol);
      }
    }

    return symbols;
  }
}

export class RulesCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const line = document.lineAt(position).text;
    const items: vscode.CompletionItem[] = [];

    // Section header completions
    if (line.trimStart().startsWith('#') && !line.includes(' ')) {
      const sectionNames = [
        'Tech Stack', 'Architecture', 'Coding Style', 'Naming',
        'Do', "Don't", 'Testing', 'Error Handling', 'Performance',
        'Security', 'Git', 'Dependencies', 'Documentation', 'Context', 'Custom'
      ];
      for (const name of sectionNames) {
        const item = new vscode.CompletionItem(`# ${name}`, vscode.CompletionItemKind.Snippet);
        item.insertText = new vscode.SnippetString(`# ${name}\n- \${1:rule}\n`);
        item.documentation = `Add a ${name} section`;
        items.push(item);
      }
    }

    // Frontmatter completions
    if (position.line > 0) {
      const firstLine = document.lineAt(0).text.trim();
      if (firstLine === '---') {
        let inFrontmatter = true;
        for (let i = 1; i < position.line; i++) {
          if (document.lineAt(i).text.trim() === '---') { inFrontmatter = false; break; }
        }
        if (inFrontmatter && line.trim() === '') {
          const fmKeys = ['project', 'language', 'framework', 'version', 'author'];
          for (const key of fmKeys) {
            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
            item.insertText = new vscode.SnippetString(`${key}: \${1}`);
            items.push(item);
          }
        }
      }
    }

    // Priority marker completion
    if (line.trimStart().startsWith('- ')) {
      const priorityItem = new vscode.CompletionItem('[!]', vscode.CompletionItemKind.Operator);
      priorityItem.insertText = '[!] ';
      priorityItem.documentation = 'Mark this rule as high priority';
      items.push(priorityItem);

      const disabledItem = new vscode.CompletionItem('[~]', vscode.CompletionItemKind.Operator);
      disabledItem.insertText = '[~] ';
      disabledItem.documentation = 'Mark this rule as disabled';
      items.push(disabledItem);
    }

    return items;
  }
}
