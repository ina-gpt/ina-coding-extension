import * as vscode from 'vscode';
import { TypeInfo, TypeKind, TypeParameter, FunctionSignature, HoverInfo, LSP_CONSTANTS } from './LSPTypes';

export class TypeInfoService {
  private static instance: TypeInfoService;
  private typeCache: Map<string, { type: TypeInfo; timestamp: number }> = new Map();

  static getInstance(): TypeInfoService {
    if (!TypeInfoService.instance) {
      TypeInfoService.instance = new TypeInfoService();
    }
    return TypeInfoService.instance;
  }

  async getTypeAtPosition(document: vscode.TextDocument, position: vscode.Position): Promise<TypeInfo | null> {
    const key = `${document.uri.toString()}:${position.line}:${position.character}`;
    const cached = this.typeCache.get(key);
    if (cached && Date.now() - cached.timestamp < LSP_CONSTANTS.CACHE_TTL_MS) return cached.type;

    const hover = await this.getHoverInfo(document, position);
    if (!hover) return null;

    const parsed = this.parseHoverContent(hover);
    if (!parsed.typeString) return null;

    const type: TypeInfo = {
      name: this.extractName(parsed.typeString),
      fullName: parsed.typeString,
      kind: this.detectTypeKind(parsed.typeString),
      members: null,
      parameters: null,
      returnType: this.extractReturnType(parsed.typeString),
      genericParams: this.extractGenerics(parsed.typeString),
      baseTypes: null,
      implementedInterfaces: null,
      documentation: parsed.documentation,
      filePath: vscode.workspace.asRelativePath(document.uri),
      line: position.line,
    };

    this.typeCache.set(key, { type, timestamp: Date.now() });
    return type;
  }

  async getHoverInfo(document: vscode.TextDocument, position: vscode.Position): Promise<HoverInfo | null> {
    try {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', document.uri, position);
      if (!hovers || hovers.length === 0) return null;

      const contents: string[] = [];
      let language: string | null = null;

      for (const hover of hovers) {
        for (const c of hover.contents) {
          if (typeof c === 'string') {
            contents.push(c);
          } else if (c instanceof vscode.MarkdownString) {
            contents.push(c.value);
          } else if ('language' in c) {
            language = c.language;
            contents.push(c.value);
          }
        }
      }

      const range = hovers[0].range;
      return {
        content: contents.join('\n\n'),
        range: range ? { startLine: range.start.line, startCol: range.start.character, endLine: range.end.line, endCol: range.end.character } : null,
        language,
      };
    } catch {
      return null;
    }
  }

  async getFunctionSignature(document: vscode.TextDocument, position: vscode.Position): Promise<FunctionSignature | null> {
    try {
      const sigHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>('vscode.executeSignatureHelpProvider', document.uri, position);
      if (!sigHelp || sigHelp.signatures.length === 0) return null;

      const sig = sigHelp.signatures[sigHelp.activeSignature || 0];
      const params: TypeParameter[] = sig.parameters.map(p => ({
        name: typeof p.label === 'string' ? p.label.split(':')[0].trim() : '',
        type: typeof p.label === 'string' ? p.label.split(':').slice(1).join(':').trim() : '',
        isOptional: typeof p.label === 'string' ? p.label.includes('?') : false,
        isRest: typeof p.label === 'string' ? p.label.startsWith('...') : false,
        defaultValue: null,
      }));

      const doc = typeof sig.documentation === 'string' ? sig.documentation : sig.documentation?.value || null;

      return {
        name: sig.label.split('(')[0].trim(),
        parameters: params,
        returnType: this.extractReturnType(sig.label) || 'void',
        genericParams: this.extractGenerics(sig.label),
        overloads: null,
        documentation: doc,
        isAsync: sig.label.includes('async '),
        isGenerator: sig.label.includes('function*'),
        decorators: null,
        filePath: vscode.workspace.asRelativePath(document.uri),
        line: position.line,
      };
    } catch {
      // Fallback: try hover
      const hover = await this.getHoverInfo(document, position);
      if (!hover) return null;
      return this.parseFunctionFromHover(hover.content, document, position);
    }
  }

  async getVariableType(document: vscode.TextDocument, position: vscode.Position): Promise<string | null> {
    const hover = await this.getHoverInfo(document, position);
    if (!hover) return null;
    const parsed = this.parseHoverContent(hover);
    return parsed.typeString;
  }

  async getImportedTypes(document: vscode.TextDocument): Promise<TypeInfo[]> {
    const types: TypeInfo[] = [];
    const text = document.getText();
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = importRegex.exec(text)) !== null && count < 20) {
      const names = match[1] ? match[1].split(',').map(n => n.trim().split(' as ')[0].trim()) : [match[2]];
      for (const name of names) {
        if (!name) continue;
        const pos = document.positionAt(match.index);
        const wordPos = text.indexOf(name, match.index);
        if (wordPos >= 0) {
          const typePos = document.positionAt(wordPos);
          const type = await this.getTypeAtPosition(document, typePos);
          if (type) { types.push(type); count++; }
        }
      }
    }
    return types;
  }

  private parseHoverContent(hover: HoverInfo): { typeString: string | null; documentation: string | null; language: string | null } {
    const content = hover.content;
    let typeString: string | null = null;
    let documentation: string | null = null;

    const codeBlockMatch = content.match(/```\w*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      typeString = codeBlockMatch[1].trim();
    }

    const tsPatterns = [
      /\((?:property|method|function|const|let|var|class|interface|type|enum|parameter|alias)\)\s+(.+)/,
      /^((?:const|let|var|function|class|interface|type|enum)\s+.+)/m,
    ];
    for (const p of tsPatterns) {
      const m = (typeString || content).match(p);
      if (m) { typeString = m[1].trim(); break; }
    }

    const docMatch = content.match(/---\n([\s\S]+?)(?:```|$)/);
    if (docMatch) documentation = docMatch[1].trim();
    if (!documentation) {
      const lines = content.split('\n').filter(l => !l.startsWith('```') && !l.startsWith('(') && l.trim());
      if (lines.length > 1) documentation = lines.slice(1).join('\n').trim();
    }

    return { typeString, documentation, language: hover.language };
  }

  private parseFunctionFromHover(content: string, document: vscode.TextDocument, position: vscode.Position): FunctionSignature | null {
    const funcMatch = content.match(/(?:function|method|const)\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*(.+))?/);
    if (!funcMatch) return null;

    const params = funcMatch[2].split(',').filter(p => p.trim()).map(p => {
      const parts = p.trim().split(':');
      return { name: parts[0].replace('?', '').trim(), type: parts.slice(1).join(':').trim() || 'any', isOptional: p.includes('?'), isRest: p.trim().startsWith('...'), defaultValue: null };
    });

    return {
      name: funcMatch[1],
      parameters: params,
      returnType: funcMatch[3]?.trim() || 'void',
      genericParams: null, overloads: null, documentation: null,
      isAsync: content.includes('async'), isGenerator: false, decorators: null,
      filePath: vscode.workspace.asRelativePath(document.uri),
      line: position.line,
    };
  }

  formatTypeForPrompt(type: TypeInfo): string {
    let result = `${type.kind} ${type.name}`;
    if (type.genericParams) result += `<${type.genericParams.join(', ')}>`;
    if (type.returnType) result += `: ${type.returnType}`;
    if (type.documentation) result += ` — ${type.documentation.slice(0, 100)}`;
    return result;
  }

  formatSignatureForPrompt(sig: FunctionSignature): string {
    const params = sig.parameters.map(p => `${p.isRest ? '...' : ''}${p.name}${p.isOptional ? '?' : ''}: ${p.type}`).join(', ');
    return `${sig.isAsync ? 'async ' : ''}function ${sig.name}(${params}): ${sig.returnType}`;
  }

  private extractName(typeString: string): string {
    const match = typeString.match(/(?:const|let|var|function|class|interface|type|enum|method|property)\s+(\w+)/);
    return match ? match[1] : typeString.split(/[\s:(]/)[0].trim();
  }

  private detectTypeKind(typeString: string): TypeKind {
    if (typeString.includes('class ')) return TypeKind.CLASS;
    if (typeString.includes('interface ')) return TypeKind.INTERFACE;
    if (typeString.includes('type ')) return TypeKind.TYPE_ALIAS;
    if (typeString.includes('enum ')) return TypeKind.ENUM;
    if (typeString.includes('function ') || typeString.includes('(') && typeString.includes(')')) return TypeKind.FUNCTION;
    if (typeString.includes('method ')) return TypeKind.METHOD;
    return TypeKind.VARIABLE;
  }

  private extractReturnType(sig: string): string | null {
    const match = sig.match(/\)\s*(?::\s*)?(.+?)$/);
    return match ? match[1].trim().replace(/^:\s*/, '') : null;
  }

  private extractGenerics(sig: string): string[] | null {
    const match = sig.match(/<([^>]+)>/);
    if (!match) return null;
    return match[1].split(',').map(g => g.trim());
  }

  invalidateCache(filePath: string): void {
    for (const [key] of this.typeCache) {
      if (key.includes(filePath)) this.typeCache.delete(key);
    }
  }
}
