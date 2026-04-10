import * as vscode from 'vscode';
import * as path from 'path';

// ============ Types ============

export interface LanguageInfo {
  id: string;
  name: string;
  aliases: string[];
  extensions: string[];
  confidence: number;
  isSupported: boolean;
}

export interface LanguageFeatures {
  supportsCompletion: boolean;
  supportsInlineEdit: boolean;
  supportsSymbols: boolean;
  supportsFormatting: boolean;
  commentStyle: CommentStyle;
}

export interface CommentStyle {
  line?: string;
  blockStart?: string;
  blockEnd?: string;
}

// ============ Language Database ============

const LANGUAGE_DATABASE: Record<string, Omit<LanguageInfo, 'confidence' | 'isSupported'> & { features: LanguageFeatures }> = {
  // Web Technologies
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    aliases: ['js', 'es6', 'es2015', 'ecmascript'],
    extensions: ['.js', '.mjs', '.cjs'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    aliases: ['ts'],
    extensions: ['.ts', '.mts', '.cts'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  javascriptreact: {
    id: 'javascriptreact',
    name: 'JavaScript React',
    aliases: ['jsx', 'react'],
    extensions: ['.jsx'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '{/*', blockEnd: '*/}' },
    },
  },
  typescriptreact: {
    id: 'typescriptreact',
    name: 'TypeScript React',
    aliases: ['tsx'],
    extensions: ['.tsx'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '{/*', blockEnd: '*/}' },
    },
  },
  html: {
    id: 'html',
    name: 'HTML',
    aliases: ['htm'],
    extensions: ['.html', '.htm', '.xhtml'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: true,
      commentStyle: { blockStart: '<!--', blockEnd: '-->' },
    },
  },
  css: {
    id: 'css',
    name: 'CSS',
    aliases: ['stylesheet'],
    extensions: ['.css'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { blockStart: '/*', blockEnd: '*/' },
    },
  },
  scss: {
    id: 'scss',
    name: 'SCSS',
    aliases: ['sass'],
    extensions: ['.scss'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  less: {
    id: 'less',
    name: 'Less',
    aliases: [],
    extensions: ['.less'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  vue: {
    id: 'vue',
    name: 'Vue',
    aliases: ['vuejs'],
    extensions: ['.vue'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { blockStart: '<!--', blockEnd: '-->' },
    },
  },
  svelte: {
    id: 'svelte',
    name: 'Svelte',
    aliases: [],
    extensions: ['.svelte'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { blockStart: '<!--', blockEnd: '-->' },
    },
  },

  // Systems Programming
  python: {
    id: 'python',
    name: 'Python',
    aliases: ['py', 'python3'],
    extensions: ['.py', '.pyw', '.pyi'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '#', blockStart: '"""', blockEnd: '"""' },
    },
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    aliases: ['rs'],
    extensions: ['.rs'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  go: {
    id: 'go',
    name: 'Go',
    aliases: ['golang'],
    extensions: ['.go'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  c: {
    id: 'c',
    name: 'C',
    aliases: [],
    extensions: ['.c', '.h'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    aliases: ['c++', 'cxx'],
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h++'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  java: {
    id: 'java',
    name: 'Java',
    aliases: [],
    extensions: ['.java'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    aliases: ['kt'],
    extensions: ['.kt', '.kts'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  swift: {
    id: 'swift',
    name: 'Swift',
    aliases: [],
    extensions: ['.swift'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  csharp: {
    id: 'csharp',
    name: 'C#',
    aliases: ['cs', 'c#'],
    extensions: ['.cs'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },

  // Scripting Languages
  ruby: {
    id: 'ruby',
    name: 'Ruby',
    aliases: ['rb'],
    extensions: ['.rb', '.rake', '.gemspec'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '#', blockStart: '=begin', blockEnd: '=end' },
    },
  },
  php: {
    id: 'php',
    name: 'PHP',
    aliases: [],
    extensions: ['.php', '.phtml'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  perl: {
    id: 'perl',
    name: 'Perl',
    aliases: ['pl'],
    extensions: ['.pl', '.pm'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: { line: '#' },
    },
  },
  lua: {
    id: 'lua',
    name: 'Lua',
    aliases: [],
    extensions: ['.lua'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: { line: '--', blockStart: '--[[', blockEnd: ']]' },
    },
  },

  // Shell & DevOps
  shellscript: {
    id: 'shellscript',
    name: 'Shell Script',
    aliases: ['bash', 'sh', 'zsh'],
    extensions: ['.sh', '.bash', '.zsh'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: { line: '#' },
    },
  },
  powershell: {
    id: 'powershell',
    name: 'PowerShell',
    aliases: ['ps1', 'pwsh'],
    extensions: ['.ps1', '.psm1', '.psd1'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: false,
      commentStyle: { line: '#', blockStart: '<#', blockEnd: '#>' },
    },
  },
  dockerfile: {
    id: 'dockerfile',
    name: 'Dockerfile',
    aliases: ['docker'],
    extensions: ['.dockerfile'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: { line: '#' },
    },
  },

  // Data & Config
  json: {
    id: 'json',
    name: 'JSON',
    aliases: [],
    extensions: ['.json'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: {},
    },
  },
  jsonc: {
    id: 'jsonc',
    name: 'JSON with Comments',
    aliases: [],
    extensions: ['.jsonc'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  yaml: {
    id: 'yaml',
    name: 'YAML',
    aliases: ['yml'],
    extensions: ['.yaml', '.yml'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '#' },
    },
  },
  toml: {
    id: 'toml',
    name: 'TOML',
    aliases: [],
    extensions: ['.toml'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: { line: '#' },
    },
  },
  xml: {
    id: 'xml',
    name: 'XML',
    aliases: [],
    extensions: ['.xml', '.xsd', '.xsl'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { blockStart: '<!--', blockEnd: '-->' },
    },
  },
  ini: {
    id: 'ini',
    name: 'INI',
    aliases: ['properties'],
    extensions: ['.ini', '.properties', '.cfg'],
    features: {
      supportsCompletion: false, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: { line: ';' },
    },
  },

  // Documentation
  markdown: {
    id: 'markdown',
    name: 'Markdown',
    aliases: ['md'],
    extensions: ['.md', '.markdown', '.mdown'],
    features: {
      supportsCompletion: false, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { blockStart: '<!--', blockEnd: '-->' },
    },
  },
  plaintext: {
    id: 'plaintext',
    name: 'Plain Text',
    aliases: ['text', 'txt'],
    extensions: ['.txt', '.text'],
    features: {
      supportsCompletion: false, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: {},
    },
  },

  // Database
  sql: {
    id: 'sql',
    name: 'SQL',
    aliases: ['mysql', 'postgres', 'postgresql', 'sqlite'],
    extensions: ['.sql'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: true,
      commentStyle: { line: '--', blockStart: '/*', blockEnd: '*/' },
    },
  },
  graphql: {
    id: 'graphql',
    name: 'GraphQL',
    aliases: ['gql'],
    extensions: ['.graphql', '.gql'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '#' },
    },
  },
  prisma: {
    id: 'prisma',
    name: 'Prisma',
    aliases: [],
    extensions: ['.prisma'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//' },
    },
  },

  // Additional languages
  dart: {
    id: 'dart',
    name: 'Dart',
    aliases: ['flutter'],
    extensions: ['.dart'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  scala: {
    id: 'scala',
    name: 'Scala',
    aliases: [],
    extensions: ['.scala', '.sc'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  elixir: {
    id: 'elixir',
    name: 'Elixir',
    aliases: ['ex'],
    extensions: ['.ex', '.exs'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '#' },
    },
  },
  haskell: {
    id: 'haskell',
    name: 'Haskell',
    aliases: ['hs'],
    extensions: ['.hs', '.lhs'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: false,
      commentStyle: { line: '--', blockStart: '{-', blockEnd: '-}' },
    },
  },
  r: {
    id: 'r',
    name: 'R',
    aliases: ['rlang'],
    extensions: ['.r', '.R', '.rmd'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: false,
      commentStyle: { line: '#' },
    },
  },
  clojure: {
    id: 'clojure',
    name: 'Clojure',
    aliases: ['clj'],
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: false,
      commentStyle: { line: ';;' },
    },
  },
  erlang: {
    id: 'erlang',
    name: 'Erlang',
    aliases: ['erl'],
    extensions: ['.erl', '.hrl'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: false, supportsFormatting: false,
      commentStyle: { line: '%' },
    },
  },
  objectivec: {
    id: 'objective-c',
    name: 'Objective-C',
    aliases: ['objc', 'objective-c'],
    extensions: ['.m', '.mm'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  groovy: {
    id: 'groovy',
    name: 'Groovy',
    aliases: [],
    extensions: ['.groovy', '.gvy', '.gy'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: false,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
  terraform: {
    id: 'terraform',
    name: 'Terraform',
    aliases: ['tf', 'hcl'],
    extensions: ['.tf', '.tfvars', '.hcl'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: true,
      commentStyle: { line: '#', blockStart: '/*', blockEnd: '*/' },
    },
  },
  proto: {
    id: 'proto3',
    name: 'Protocol Buffers',
    aliases: ['protobuf', 'proto'],
    extensions: ['.proto'],
    features: {
      supportsCompletion: true, supportsInlineEdit: true, supportsSymbols: true, supportsFormatting: false,
      commentStyle: { line: '//', blockStart: '/*', blockEnd: '*/' },
    },
  },
};

// ============ Language Detector Class ============

export class LanguageDetector {
  private extensionToLanguage: Map<string, string> = new Map();
  private aliasToLanguage: Map<string, string> = new Map();

  constructor() {
    this.buildIndexes();
  }

  private buildIndexes(): void {
    for (const [id, lang] of Object.entries(LANGUAGE_DATABASE)) {
      for (const ext of lang.extensions) {
        this.extensionToLanguage.set(ext.toLowerCase(), id);
      }
      for (const alias of lang.aliases) {
        this.aliasToLanguage.set(alias.toLowerCase(), id);
      }
      this.aliasToLanguage.set(id.toLowerCase(), id);
    }
  }

  // ============ Detection Methods ============

  detectFromDocument(document: vscode.TextDocument): LanguageInfo {
    const languageId = document.languageId;
    const fileName = path.basename(document.fileName);
    const extension = path.extname(document.fileName).toLowerCase();

    if (LANGUAGE_DATABASE[languageId]) {
      return this.createLanguageInfo(languageId, 1.0);
    }

    const extLanguage = this.extensionToLanguage.get(extension);
    if (extLanguage) {
      return this.createLanguageInfo(extLanguage, 0.9);
    }

    const filenameLanguage = this.detectFromFilename(fileName);
    if (filenameLanguage) {
      return this.createLanguageInfo(filenameLanguage, 0.8);
    }

    return this.createLanguageInfo(languageId || 'plaintext', 0.5);
  }

  detectFromFilename(filename: string): string | null {
    const lower = filename.toLowerCase();

    const filenameMap: Record<string, string> = {
      'dockerfile': 'dockerfile',
      'makefile': 'shellscript',
      'gemfile': 'ruby',
      'rakefile': 'ruby',
      '.gitignore': 'plaintext',
      '.env': 'ini',
      '.env.local': 'ini',
      '.env.development': 'ini',
      '.env.production': 'ini',
      'package.json': 'json',
      'tsconfig.json': 'jsonc',
      'jsconfig.json': 'jsonc',
      '.eslintrc': 'jsonc',
      '.prettierrc': 'jsonc',
      'composer.json': 'json',
      'cargo.toml': 'toml',
      'go.mod': 'go',
      'go.sum': 'go',
    };

    if (filenameMap[lower]) {
      return filenameMap[lower];
    }

    return null;
  }

  detectFromExtension(extension: string): LanguageInfo | null {
    const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
    const languageId = this.extensionToLanguage.get(ext);
    if (languageId) {
      return this.createLanguageInfo(languageId, 0.9);
    }
    return null;
  }

  detectFromAlias(alias: string): LanguageInfo | null {
    const languageId = this.aliasToLanguage.get(alias.toLowerCase());
    if (languageId) {
      return this.createLanguageInfo(languageId, 1.0);
    }
    return null;
  }

  // ============ Language Info ============

  private createLanguageInfo(id: string, confidence: number): LanguageInfo {
    const lang = LANGUAGE_DATABASE[id];
    if (lang) {
      return {
        id: lang.id,
        name: lang.name,
        aliases: lang.aliases,
        extensions: lang.extensions,
        confidence,
        isSupported: true,
      };
    }
    return {
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      aliases: [],
      extensions: [],
      confidence,
      isSupported: false,
    };
  }

  getLanguageInfo(languageId: string): LanguageInfo | null {
    if (LANGUAGE_DATABASE[languageId]) {
      return this.createLanguageInfo(languageId, 1.0);
    }
    return null;
  }

  getFeatures(languageId: string): LanguageFeatures {
    const lang = LANGUAGE_DATABASE[languageId];
    if (lang) {
      return lang.features;
    }
    return {
      supportsCompletion: true,
      supportsInlineEdit: true,
      supportsSymbols: false,
      supportsFormatting: false,
      commentStyle: { line: '#' },
    };
  }

  getAllLanguages(): LanguageInfo[] {
    return Object.keys(LANGUAGE_DATABASE).map(id => this.createLanguageInfo(id, 1.0));
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.extensionToLanguage.keys());
  }

  isSupported(languageId: string): boolean {
    return languageId in LANGUAGE_DATABASE;
  }
}

// ============ Singleton Export ============

export const languageDetector = new LanguageDetector();
