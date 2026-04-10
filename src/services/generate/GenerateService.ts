/**
 * Phase 15.1 — Generate Service
 * Main code generation orchestrator.
 */
import * as vscode from 'vscode';
import { GenerateRequest, GenerateResult, GenerateContext, GenerateMode } from './GenerateTypes';
import { GeneratePromptBuilder } from './GeneratePromptBuilder';
import { ScopeAnalyzer } from './ScopeAnalyzer';
import { RulesInjector } from '../rules/RulesInjector';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';

export class GenerateService {
  private static instance: GenerateService;
  private promptBuilder: GeneratePromptBuilder;
  private apiService: any;

  private constructor() {
    this.promptBuilder = GeneratePromptBuilder.getInstance();
  }

  static getInstance(): GenerateService {
    if (!GenerateService.instance) GenerateService.instance = new GenerateService();
    return GenerateService.instance;
  }

  setApiService(apiService: any): void { this.apiService = apiService; }

  async *generate(request: GenerateRequest): AsyncGenerator<{ type: 'token' | 'imports' | 'done'; content: string }> {
    const rulesInjector = RulesInjector.getInstance();
    const rules = rulesInjector.isRulesActive() ? rulesInjector.getRulesSummary() : null;
    const systemPrompt = this.promptBuilder.buildSystemPrompt(request, rules);
    const userPrompt = this.promptBuilder.buildUserPrompt(request);

    let buffer = '';
    let importsDone = false;
    try {
      const stream = this.apiService.chatStream({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        options: { model: ConfigManager.getChatModel(), temperature: request.options.temperature || 0.3, maxTokens: request.options.maxTokens || 1024 },
      });
      for await (const token of stream) {
        buffer += token;
        if (!importsDone && buffer.includes('\n')) {
          const lines = buffer.split('\n');
          const importLines: string[] = [];
          let codeStart = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('// IMPORTS:')) { importLines.push(lines[i].replace('// IMPORTS:', '').trim()); codeStart = i + 1; }
            else break;
          }
          if (importLines.length > 0) {
            yield { type: 'imports', content: importLines.join('\n') };
            buffer = lines.slice(codeStart).join('\n');
          }
          importsDone = true;
        }
        yield { type: 'token', content: token };
      }
      yield { type: 'done', content: buffer };
    } catch (err: any) {
      Logger.error('[GenerateService] Generation failed:', err);
      yield { type: 'done', content: '' };
    }
  }

  async generateWithPreview(request: GenerateRequest, editor: vscode.TextEditor): Promise<{ code: string; imports: string[]; accept: () => Promise<void>; reject: () => void }> {
    let fullCode = '';
    const imports: string[] = [];
    for await (const chunk of this.generate(request)) {
      if (chunk.type === 'imports') imports.push(...chunk.content.split('\n'));
      else if (chunk.type === 'token') fullCode += chunk.content;
    }
    // Clean up code fences if LLM included them
    fullCode = fullCode.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();

    const position = editor.selection.active;
    const targetIndent = editor.document.lineAt(position.line).text.match(/^(\s*)/)?.[1] || '';
    fullCode = this.adjustIndentation(fullCode, targetIndent);

    return {
      code: fullCode,
      imports,
      accept: async () => { await this.insertGeneratedCode(editor, fullCode, position, imports); },
      reject: () => { /* ghost text cleanup handled by caller */ },
    };
  }

  async insertGeneratedCode(editor: vscode.TextEditor, code: string, position: vscode.Position, imports?: string[]): Promise<void> {
    await editor.edit(editBuilder => {
      editBuilder.insert(position, code);
    });
    if (imports?.length) {
      const doc = editor.document;
      const existing = new Set<string>();
      for (let i = 0; i < Math.min(doc.lineCount, 50); i++) {
        existing.add(doc.lineAt(i).text.trim());
      }
      const newImports = imports.filter(imp => !existing.has(imp.trim()));
      if (newImports.length > 0) {
        let insertLine = 0;
        for (let i = 0; i < Math.min(doc.lineCount, 50); i++) {
          if (/^\s*(import |from |const \w+ = require)/.test(doc.lineAt(i).text)) insertLine = i + 1;
        }
        await editor.edit(eb => { eb.insert(new vscode.Position(insertLine, 0), newImports.join('\n') + '\n'); });
      }
    }
  }

  private adjustIndentation(code: string, targetIndent: string): string {
    const lines = code.split('\n');
    if (lines.length === 0) return code;
    const firstIndent = lines[0].match(/^(\s*)/)?.[1] || '';
    return lines.map(line => {
      if (line.trim() === '') return '';
      const currentIndent = line.match(/^(\s*)/)?.[1] || '';
      const relative = currentIndent.length - firstIndent.length;
      return targetIndent + ' '.repeat(Math.max(0, relative)) + line.trim();
    }).join('\n');
  }
}
