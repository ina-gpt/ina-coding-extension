import * as vscode from 'vscode';
import { LSPCapabilities } from './LSPTypes';

const WELL_SUPPORTED_LANGUAGES = new Set([
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
  'python', 'java', 'go', 'rust', 'c', 'cpp', 'csharp',
  'php', 'ruby', 'swift', 'kotlin',
]);

export class LSPCapabilityDetector {
  private static instance: LSPCapabilityDetector;
  private capCache: Map<string, { caps: LSPCapabilities; timestamp: number }> = new Map();
  private CACHE_TTL = 60000;

  static getInstance(): LSPCapabilityDetector {
    if (!LSPCapabilityDetector.instance) {
      LSPCapabilityDetector.instance = new LSPCapabilityDetector();
    }
    return LSPCapabilityDetector.instance;
  }

  detectCapabilities(document: vscode.TextDocument): LSPCapabilities {
    const key = this.getCacheKey(document);
    const cached = this.capCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) return cached.caps;

    const langId = document.languageId;
    const isSupported = WELL_SUPPORTED_LANGUAGES.has(langId);
    const isTS = langId === 'typescript' || langId === 'typescriptreact' || langId === 'javascript' || langId === 'javascriptreact';

    const caps: LSPCapabilities = {
      hasDefinitionProvider: isSupported,
      hasReferenceProvider: isSupported,
      hasTypeDefinition: isTS || langId === 'go' || langId === 'rust' || langId === 'java' || langId === 'csharp',
      hasImplementation: isTS || langId === 'java' || langId === 'csharp' || langId === 'go',
      hasCallHierarchy: isTS || langId === 'java' || langId === 'csharp' || langId === 'python',
      hasTypeHierarchy: isTS || langId === 'java' || langId === 'csharp',
      hasHover: isSupported,
      hasSignatureHelp: isSupported,
      hasDocumentSymbol: isSupported,
      hasWorkspaceSymbol: isSupported,
      hasDiagnostics: true,
      hasCodeAction: isSupported,
      hasRename: isSupported,
      hasInlayHints: isTS || langId === 'rust' || langId === 'go',
    };

    this.capCache.set(key, { caps, timestamp: Date.now() });
    return caps;
  }

  getActiveLanguageServers(): string[] {
    const servers: string[] = [];
    const knownExtensions: Record<string, string> = {
      'vscode.typescript-language-features': 'TypeScript',
      'ms-python.python': 'Python (Pylance)',
      'golang.go': 'Go (gopls)',
      'rust-lang.rust-analyzer': 'Rust Analyzer',
      'redhat.java': 'Java (Eclipse)',
      'ms-dotnettools.csharp': 'C# (OmniSharp)',
    };

    for (const [id, name] of Object.entries(knownExtensions)) {
      const ext = vscode.extensions.getExtension(id);
      if (ext && ext.isActive) servers.push(name);
    }
    return servers;
  }

  isLanguageSupported(languageId: string): boolean {
    return WELL_SUPPORTED_LANGUAGES.has(languageId);
  }

  private getCacheKey(document: vscode.TextDocument): string {
    return `${document.languageId}:${document.uri.scheme}`;
  }
}
