/**
 * Language Definitions for AST Chunking
 */

import { ASTNode, LanguageDefinition, ImportInfo } from './types';

// ============ Helpers ============

function findChild(node: ASTNode, type: string): ASTNode | undefined {
  return node.children.find(c => c.type === type);
}

function getChildText(node: ASTNode, type: string): string | undefined {
  return findChild(node, type)?.text;
}

function getFieldText(node: ASTNode, fieldName: string): string | undefined {
  return node.namedChildren.find(c => c.fieldName === fieldName)?.text;
}

// ============ TypeScript/JavaScript ============

const typescriptDefinition: LanguageDefinition = {
  id: 'typescript',
  name: 'TypeScript',
  extensions: ['.ts', '.tsx', '.mts', '.cts'],
  parserName: 'tree-sitter-typescript',
  nodeTypes: {
    function: ['function_declaration', 'function_expression', 'generator_function_declaration'],
    method: ['method_definition', 'method_signature'],
    arrow_function: ['arrow_function'],
    class: ['class_declaration', 'class_expression'],
    interface: ['interface_declaration'],
    type_alias: ['type_alias_declaration'],
    enum: ['enum_declaration'],
    module: ['module'],
    namespace: ['namespace_declaration', 'internal_module'],
    import: ['import_statement', 'import_declaration'],
    export: ['export_statement', 'export_declaration'],
    variable: ['variable_declaration', 'lexical_declaration'],
    constant: ['const_declaration'],
    comment: ['comment'],
    documentation: ['comment'],
    block: ['statement_block'],
  },
  patterns: {
    functionName: (node) => getFieldText(node, 'name') || getChildText(node, 'identifier') || getChildText(node, 'property_identifier'),
    className: (node) => getFieldText(node, 'name') || getChildText(node, 'type_identifier'),
    functionSignature: (node) => {
      const name = getFieldText(node, 'name') || '';
      const params = findChild(node, 'formal_parameters');
      const ret = findChild(node, 'type_annotation');
      let sig = name;
      if (params) { sig += params.text; }
      if (ret) { sig += ': ' + ret.text; }
      return sig || undefined;
    },
    documentation: (node, content) => {
      const lines = content.substring(0, node.startPosition.row).split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('/**')) {
          const docLines: string[] = [];
          for (let j = i; j < lines.length; j++) {
            docLines.push(lines[j]);
            if (lines[j].includes('*/')) { break; }
          }
          return docLines.join('\n');
        }
        if (line && !line.startsWith('*') && !line.startsWith('//')) { break; }
      }
      return undefined;
    },
    importInfo: (node) => {
      const source = getChildText(node, 'string')?.replace(/['"]/g, '');
      if (!source) { return undefined; }
      const specifiers: string[] = [];
      let isDefault = false;
      let isNamespace = false;
      const importClause = findChild(node, 'import_clause');
      if (importClause) {
        const def = findChild(importClause, 'identifier');
        if (def) { specifiers.push(def.text); isDefault = true; }
        const named = findChild(importClause, 'named_imports');
        if (named) { named.namedChildren.forEach(s => { const n = getChildText(s, 'identifier'); if (n) { specifiers.push(n); } }); }
        if (findChild(importClause, 'namespace_import')) { isNamespace = true; }
      }
      return { source, specifiers, isDefault, isNamespace };
    },
  },
};

const javascriptDefinition: LanguageDefinition = {
  ...typescriptDefinition,
  id: 'javascript', name: 'JavaScript',
  extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  parserName: 'tree-sitter-javascript',
};

// ============ Python ============

const pythonDefinition: LanguageDefinition = {
  id: 'python', name: 'Python',
  extensions: ['.py', '.pyi', '.pyw'],
  parserName: 'tree-sitter-python',
  nodeTypes: {
    function: ['function_definition'],
    method: ['function_definition'],
    lambda: ['lambda'],
    class: ['class_definition'],
    import: ['import_statement', 'import_from_statement'],
    variable: ['assignment', 'augmented_assignment'],
    comment: ['comment'],
    documentation: ['expression_statement'],
    block: ['block'],
  },
  patterns: {
    functionName: (node) => getFieldText(node, 'name') || getChildText(node, 'identifier'),
    className: (node) => getFieldText(node, 'name') || getChildText(node, 'identifier'),
    functionSignature: (node) => {
      const name = getFieldText(node, 'name') || '';
      const params = findChild(node, 'parameters');
      const ret = findChild(node, 'type');
      let sig = `def ${name}`;
      if (params) { sig += params.text; }
      if (ret) { sig += ' -> ' + ret.text; }
      return sig;
    },
    documentation: (node) => {
      const body = findChild(node, 'block');
      if (body && body.children.length > 0) {
        const first = body.children[0];
        if (first.type === 'expression_statement') {
          const str = findChild(first, 'string');
          if (str) { return str.text.replace(/^['"]{3}|['"]{3}$/g, '').trim(); }
        }
      }
      return undefined;
    },
    importInfo: (node) => {
      const specifiers: string[] = [];
      let source = '';
      if (node.type === 'import_from_statement') {
        const mod = findChild(node, 'dotted_name');
        source = mod?.text || '';
        node.namedChildren.filter(c => c.type === 'dotted_name' || c.type === 'aliased_import').forEach(i => specifiers.push(i.text));
      }
      return { source, specifiers, isDefault: false, isNamespace: false };
    },
  },
};

// ============ Rust ============

const rustDefinition: LanguageDefinition = {
  id: 'rust', name: 'Rust',
  extensions: ['.rs'],
  parserName: 'tree-sitter-rust',
  nodeTypes: {
    function: ['function_item'],
    method: ['function_item'],
    class: ['struct_item', 'impl_item'],
    interface: ['trait_item'],
    enum: ['enum_item'],
    type_alias: ['type_item'],
    module: ['mod_item'],
    import: ['use_declaration'],
    constant: ['const_item', 'static_item'],
    variable: ['let_declaration'],
    comment: ['line_comment', 'block_comment'],
    documentation: ['line_comment'],
    block: ['block'],
  },
  patterns: {
    functionName: (node) => getFieldText(node, 'name') || getChildText(node, 'identifier'),
    className: (node) => getFieldText(node, 'name') || getChildText(node, 'type_identifier'),
    functionSignature: (node) => {
      const vis = getChildText(node, 'visibility_modifier') || '';
      const name = getFieldText(node, 'name') || '';
      const params = findChild(node, 'parameters');
      const ret = findChild(node, 'return_type');
      let sig = vis ? `${vis} fn ${name}` : `fn ${name}`;
      if (params) { sig += params.text; }
      if (ret) { sig += ' ' + ret.text; }
      return sig;
    },
    documentation: (node, content) => {
      const lines = content.substring(0, node.startPosition.row).split('\n');
      const docLines: string[] = [];
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('///') || line.startsWith('//!')) { docLines.unshift(line.replace(/^\/\/[\/!]\s?/, '')); }
        else if (line === '' && docLines.length > 0) { continue; }
        else if (docLines.length > 0) { break; }
      }
      return docLines.length > 0 ? docLines.join('\n') : undefined;
    },
    importInfo: (node) => {
      const path = (findChild(node, 'use_clause') || findChild(node, 'scoped_identifier'))?.text || '';
      return { source: path, specifiers: [path.split('::').pop() || ''], isDefault: false, isNamespace: path.includes('*') };
    },
  },
};

// ============ Go ============

const goDefinition: LanguageDefinition = {
  id: 'go', name: 'Go',
  extensions: ['.go'],
  parserName: 'tree-sitter-go',
  nodeTypes: {
    function: ['function_declaration'],
    method: ['method_declaration'],
    class: ['type_declaration'],
    interface: ['type_declaration'],
    import: ['import_declaration', 'import_spec'],
    variable: ['var_declaration', 'short_var_declaration'],
    constant: ['const_declaration'],
    comment: ['comment'],
    block: ['block'],
  },
  patterns: {
    functionName: (node) => getFieldText(node, 'name') || getChildText(node, 'identifier'),
    className: (node) => { const spec = findChild(node, 'type_spec'); return spec ? getChildText(spec, 'type_identifier') : undefined; },
    functionSignature: (node) => {
      const name = getFieldText(node, 'name') || '';
      const params = findChild(node, 'parameter_list');
      const result = findChild(node, 'result');
      let sig = `func ${name}`;
      if (params) { sig += params.text; }
      if (result) { sig += ' ' + result.text; }
      return sig;
    },
    importInfo: (node) => {
      if (node.type === 'import_spec') {
        const p = getChildText(node, 'interpreted_string_literal')?.replace(/"/g, '');
        return { source: p || '', specifiers: [p?.split('/').pop() || ''], isDefault: false, isNamespace: false };
      }
      return undefined;
    },
  },
};

// ============ Java ============

const javaDefinition: LanguageDefinition = {
  id: 'java', name: 'Java',
  extensions: ['.java'],
  parserName: 'tree-sitter-java',
  nodeTypes: {
    function: ['method_declaration', 'constructor_declaration'],
    method: ['method_declaration'],
    class: ['class_declaration'],
    interface: ['interface_declaration'],
    enum: ['enum_declaration'],
    import: ['import_declaration'],
    variable: ['field_declaration', 'local_variable_declaration'],
    comment: ['line_comment', 'block_comment'],
    documentation: ['block_comment'],
    block: ['block'],
  },
  patterns: {
    functionName: (node) => getFieldText(node, 'name') || getChildText(node, 'identifier'),
    className: (node) => getFieldText(node, 'name') || getChildText(node, 'identifier'),
    functionSignature: (node) => {
      const mods = findChild(node, 'modifiers')?.text || '';
      const ret = findChild(node, 'type_identifier')?.text || findChild(node, 'void_type')?.text || '';
      const name = getFieldText(node, 'name') || '';
      const params = findChild(node, 'formal_parameters');
      return `${mods} ${ret} ${name}${params?.text || '()'}`.trim();
    },
    importInfo: (node) => {
      const path = (findChild(node, 'scoped_identifier') || findChild(node, 'identifier'))?.text || '';
      return { source: path.split('.').slice(0, -1).join('.'), specifiers: [path.split('.').pop() || ''], isDefault: false, isNamespace: path.endsWith('*') };
    },
  },
};

// ============ C/C++ ============

const cDefinition: LanguageDefinition = {
  id: 'c', name: 'C',
  extensions: ['.c', '.h'],
  parserName: 'tree-sitter-c',
  nodeTypes: {
    function: ['function_definition'],
    class: ['struct_specifier'],
    enum: ['enum_specifier'],
    type_alias: ['type_definition'],
    import: ['preproc_include'],
    variable: ['declaration'],
    comment: ['comment'],
    block: ['compound_statement'],
  },
  patterns: {
    functionName: (node) => { const d = findChild(node, 'function_declarator'); return d ? getChildText(d, 'identifier') : undefined; },
    className: (node) => getFieldText(node, 'name') || getChildText(node, 'type_identifier'),
    functionSignature: (node) => {
      const ret = findChild(node, 'type_identifier')?.text || findChild(node, 'primitive_type')?.text || '';
      const decl = findChild(node, 'function_declarator');
      return decl ? `${ret} ${decl.text}` : undefined;
    },
    importInfo: (node) => {
      const p = findChild(node, 'string_literal')?.text || findChild(node, 'system_lib_string')?.text;
      if (!p) { return undefined; }
      return { source: p.replace(/[<>"]/g, ''), specifiers: [], isDefault: false, isNamespace: false };
    },
  },
};

const cppDefinition: LanguageDefinition = {
  ...cDefinition, id: 'cpp', name: 'C++',
  extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h'],
  parserName: 'tree-sitter-cpp',
  nodeTypes: { ...cDefinition.nodeTypes, class: ['class_specifier', 'struct_specifier'], namespace: ['namespace_definition'], method: ['function_definition'] },
};

// ============ Registry ============

export const LANGUAGE_DEFINITIONS: Record<string, LanguageDefinition> = {
  typescript: typescriptDefinition,
  typescriptreact: { ...typescriptDefinition, id: 'typescriptreact' },
  javascript: javascriptDefinition,
  javascriptreact: { ...javascriptDefinition, id: 'javascriptreact' },
  python: pythonDefinition,
  rust: rustDefinition,
  go: goDefinition,
  java: javaDefinition,
  c: cDefinition,
  cpp: cppDefinition,
};

export function getLanguageDefinition(languageId: string): LanguageDefinition | undefined {
  if (LANGUAGE_DEFINITIONS[languageId]) { return LANGUAGE_DEFINITIONS[languageId]; }
  const ext = languageId.startsWith('.') ? languageId : `.${languageId}`;
  for (const def of Object.values(LANGUAGE_DEFINITIONS)) {
    if (def.extensions.includes(ext)) { return def; }
  }
  return undefined;
}

export function isLanguageSupported(languageId: string): boolean {
  return getLanguageDefinition(languageId) !== undefined;
}
