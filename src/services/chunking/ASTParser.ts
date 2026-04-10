/**
 * AST Parser Service
 * Provides AST parsing using tree-sitter with fallback to regex patterns.
 */

import { ASTNode, ParseResult, ParseError, LanguageDefinition } from './types';
import { getLanguageDefinition } from './languages';
import { Logger } from '../../utils/Logger';

// ============ AST Parser ============

export class ASTParser {
  private initialized = false;
  private treeSitterAvailable = false;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) { return; }
    if (this.initPromise) { await this.initPromise; return; }
    this.initPromise = this.doInit();
    await this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      // Try loading web-tree-sitter - optional dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('web-tree-sitter');
      this.treeSitterAvailable = true;
      Logger.info('ASTParser: tree-sitter available');
    } catch {
      Logger.info('ASTParser: tree-sitter not available, using regex fallback');
    }
    this.initialized = true;
  }

  // ============ Parse ============

  async parse(content: string, languageId: string): Promise<ParseResult> {
    const startTime = Date.now();
    await this.initialize();

    const definition = getLanguageDefinition(languageId);
    if (!definition) {
      return this.parseGeneric(content, languageId, startTime);
    }

    return this.parseWithFallback(content, languageId, definition, startTime);
  }

  // ============ Regex Fallback Parser ============

  private parseWithFallback(content: string, languageId: string, definition: LanguageDefinition, startTime: number): ParseResult {
    const lines = content.split('\n');
    const children: ASTNode[] = [];
    const errors: ParseError[] = [];
    const patterns = this.buildPatterns(definition);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const trimmed = lines[lineIndex].trim();

      for (const pattern of patterns) {
        const match = trimmed.match(pattern.regex);
        if (match) {
          const { endLine, content: blockContent } = this.findBlockEnd(lines, lineIndex, pattern.blockType);

          const node: ASTNode = {
            type: pattern.nodeType,
            text: blockContent,
            startPosition: { row: lineIndex, column: 0 },
            endPosition: { row: endLine, column: lines[endLine]?.length || 0 },
            children: [],
            namedChildren: [],
          };

          if (match.groups?.name) {
            const nameNode: ASTNode = {
              type: 'identifier',
              text: match.groups.name,
              startPosition: { row: lineIndex, column: lines[lineIndex].indexOf(match.groups.name) },
              endPosition: { row: lineIndex, column: lines[lineIndex].indexOf(match.groups.name) + match.groups.name.length },
              children: [],
              namedChildren: [],
              fieldName: 'name',
              parent: node,
            };
            node.namedChildren.push(nameNode);
          }

          children.push(node);
          break;
        }
      }
    }

    const rootNode: ASTNode = {
      type: 'program',
      text: content,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: lines.length - 1, column: lines[lines.length - 1]?.length || 0 },
      children,
      namedChildren: children,
    };

    for (const child of children) { child.parent = rootNode; }

    return { tree: rootNode, language: languageId, errors, duration: Date.now() - startTime };
  }

  private buildPatterns(definition: LanguageDefinition): Array<{ regex: RegExp; nodeType: string; blockType: 'brace' | 'indent' | 'none' }> {
    const patterns: Array<{ regex: RegExp; nodeType: string; blockType: 'brace' | 'indent' | 'none' }> = [];

    switch (definition.id) {
      case 'typescript': case 'javascript': case 'typescriptreact': case 'javascriptreact':
        patterns.push(
          { regex: /^(?:export\s+)?(?:async\s+)?function\s+(?<name>\w+)/, nodeType: 'function_declaration', blockType: 'brace' },
          { regex: /^(?:export\s+)?class\s+(?<name>\w+)/, nodeType: 'class_declaration', blockType: 'brace' },
          { regex: /^(?:export\s+)?interface\s+(?<name>\w+)/, nodeType: 'interface_declaration', blockType: 'brace' },
          { regex: /^(?:export\s+)?type\s+(?<name>\w+)/, nodeType: 'type_alias_declaration', blockType: 'none' },
          { regex: /^(?:export\s+)?enum\s+(?<name>\w+)/, nodeType: 'enum_declaration', blockType: 'brace' },
          { regex: /^import\s+/, nodeType: 'import_statement', blockType: 'none' },
          { regex: /^(?:export\s+)?(?:const|let|var)\s+(?<name>\w+)/, nodeType: 'variable_declaration', blockType: 'none' },
          { regex: /^\/\*\*/, nodeType: 'comment', blockType: 'none' },
          { regex: /^\/\//, nodeType: 'comment', blockType: 'none' },
        );
        break;
      case 'python':
        patterns.push(
          { regex: /^(?:async\s+)?def\s+(?<name>\w+)/, nodeType: 'function_definition', blockType: 'indent' },
          { regex: /^class\s+(?<name>\w+)/, nodeType: 'class_definition', blockType: 'indent' },
          { regex: /^(?:from\s+\S+\s+)?import\s+/, nodeType: 'import_statement', blockType: 'none' },
          { regex: /^(?<name>\w+)\s*=/, nodeType: 'assignment', blockType: 'none' },
          { regex: /^#/, nodeType: 'comment', blockType: 'none' },
        );
        break;
      case 'rust':
        patterns.push(
          { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(?<name>\w+)/, nodeType: 'function_item', blockType: 'brace' },
          { regex: /^(?:pub\s+)?struct\s+(?<name>\w+)/, nodeType: 'struct_item', blockType: 'brace' },
          { regex: /^(?:pub\s+)?enum\s+(?<name>\w+)/, nodeType: 'enum_item', blockType: 'brace' },
          { regex: /^(?:pub\s+)?trait\s+(?<name>\w+)/, nodeType: 'trait_item', blockType: 'brace' },
          { regex: /^impl\s+/, nodeType: 'impl_item', blockType: 'brace' },
          { regex: /^use\s+/, nodeType: 'use_declaration', blockType: 'none' },
          { regex: /^mod\s+(?<name>\w+)/, nodeType: 'mod_item', blockType: 'brace' },
          { regex: /^\/\//, nodeType: 'line_comment', blockType: 'none' },
        );
        break;
      case 'go':
        patterns.push(
          { regex: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(?<name>\w+)/, nodeType: 'function_declaration', blockType: 'brace' },
          { regex: /^type\s+(?<name>\w+)\s+struct/, nodeType: 'type_declaration', blockType: 'brace' },
          { regex: /^type\s+(?<name>\w+)\s+interface/, nodeType: 'type_declaration', blockType: 'brace' },
          { regex: /^import\s+/, nodeType: 'import_declaration', blockType: 'brace' },
          { regex: /^\/\//, nodeType: 'comment', blockType: 'none' },
        );
        break;
      case 'java':
        patterns.push(
          { regex: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:abstract\s+)?class\s+(?<name>\w+)/, nodeType: 'class_declaration', blockType: 'brace' },
          { regex: /^(?:public\s+|private\s+|protected\s+)?interface\s+(?<name>\w+)/, nodeType: 'interface_declaration', blockType: 'brace' },
          { regex: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:\w+\s+)+(?<name>\w+)\s*\(/, nodeType: 'method_declaration', blockType: 'brace' },
          { regex: /^import\s+/, nodeType: 'import_declaration', blockType: 'none' },
          { regex: /^\/\*\*/, nodeType: 'block_comment', blockType: 'none' },
          { regex: /^\/\//, nodeType: 'line_comment', blockType: 'none' },
        );
        break;
      default:
        patterns.push(
          { regex: /^function\s+(?<name>\w+)/, nodeType: 'function', blockType: 'brace' },
          { regex: /^class\s+(?<name>\w+)/, nodeType: 'class', blockType: 'brace' },
          { regex: /^import\s+/, nodeType: 'import', blockType: 'none' },
          { regex: /^#|^\/\/|^\/\*/, nodeType: 'comment', blockType: 'none' },
        );
    }

    return patterns;
  }

  private findBlockEnd(lines: string[], startLine: number, blockType: 'brace' | 'indent' | 'none'): { endLine: number; content: string } {
    if (blockType === 'none') {
      return { endLine: startLine, content: lines[startLine] };
    }

    if (blockType === 'brace') {
      let braceCount = 0;
      let started = false;

      for (let i = startLine; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') { braceCount++; started = true; }
          else if (char === '}') {
            braceCount--;
            if (started && braceCount === 0) {
              return { endLine: i, content: lines.slice(startLine, i + 1).join('\n') };
            }
          }
        }
      }
      return { endLine: lines.length - 1, content: lines.slice(startLine).join('\n') };
    }

    // indent
    const startIndent = lines[startLine].search(/\S/);
    let endLine = startLine;

    for (let i = startLine + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '') { continue; }
      if (lines[i].search(/\S/) <= startIndent) { break; }
      endLine = i;
    }

    return { endLine, content: lines.slice(startLine, endLine + 1).join('\n') };
  }

  private parseGeneric(content: string, languageId: string, startTime: number): ParseResult {
    const lines = content.split('\n');
    return {
      tree: {
        type: 'program', text: content,
        startPosition: { row: 0, column: 0 },
        endPosition: { row: lines.length - 1, column: lines[lines.length - 1]?.length || 0 },
        children: [], namedChildren: [],
      },
      language: languageId, errors: [], duration: Date.now() - startTime,
    };
  }

  isReady(): boolean { return this.initialized; }
}

export const astParser = new ASTParser();
