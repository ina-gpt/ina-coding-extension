import { FullConfig } from './ConfigManager';

export interface ConfigPreset {
  id: string;
  name: string;
  description: string;
  config: Partial<FullConfig>;
}

export const CONFIG_PRESETS: ConfigPreset[] = [
  { id: 'default', name: 'Default', description: 'Balanced settings for general use', config: {} },
  {
    id: 'performance', name: 'Performance', description: 'Faster responses with smaller models',
    config: {
      models: { chat: 'INA-6.2 Pro', customChat: '', completion: 'INA-6.2', customCompletion: '', embedding: 'INA Embed Mini' },
      chat: { temperature: 0.5, maxTokens: 2048, contextLines: 50, includeImports: true, includeRecentFiles: 1, systemPrompt: '' },
      completion: { enabled: true, delay: 200, maxTokens: 128, temperature: 0.1, disabledLanguages: ['markdown', 'plaintext', 'json', 'yaml', 'xml'] },
      indexing: { enabled: true, autoIndex: false, watchFiles: false, excludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**'], includeExtensions: ['.js', '.ts', '.py'], maxFileSize: 200, chunkSize: 256 },
    },
  },
  {
    id: 'quality', name: 'Quality', description: 'Best quality with larger models',
    config: {
      models: { chat: 'INA-7 Pro', customChat: '', completion: 'INA-7 Pro', customCompletion: '', embedding: 'INA Embed' },
      chat: { temperature: 0.7, maxTokens: 8192, contextLines: 200, includeImports: true, includeRecentFiles: 5, systemPrompt: '' },
      completion: { enabled: true, delay: 500, maxTokens: 512, temperature: 0.3, disabledLanguages: ['plaintext'] },
      indexing: { enabled: true, autoIndex: true, watchFiles: true, excludePatterns: ['**/node_modules/**', '**/.git/**'], includeExtensions: ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.cpp', '.c'], maxFileSize: 1000, chunkSize: 1024 },
    },
  },
  {
    id: 'privacy', name: 'Privacy First', description: 'Maximum privacy with minimal data sharing',
    config: {
      privacy: { telemetry: 'off', sendCodeToServer: false, storeConversations: false, clearDataOnExit: true, excludeFromContext: ['**/.env*', '**/secrets/**', '**/*secret*', '**/*password*', '**/*credential*', '**/*.pem', '**/id_rsa*', '**/config/**'] },
      indexing: { enabled: false, autoIndex: false, watchFiles: false, excludePatterns: [], includeExtensions: [], maxFileSize: 0, chunkSize: 0 },
    },
  },
  {
    id: 'minimal', name: 'Minimal', description: 'Only essential features enabled',
    config: {
      completion: { enabled: false, delay: 300, maxTokens: 256, temperature: 0.2, disabledLanguages: [] },
      inlineEdit: { enabled: false, showDiff: true, autoApply: false, keepHistory: false, historySize: 10 },
      indexing: { enabled: false, autoIndex: false, watchFiles: false, excludePatterns: [], includeExtensions: [], maxFileSize: 0, chunkSize: 0 },
      ui: { theme: 'auto', fontSize: 14, fontFamily: '', showStatusBar: false, compactMode: true, showAvatars: false, codeBlockTheme: 'auto' },
    },
  },
];

export function getPreset(id: string): ConfigPreset | undefined {
  return CONFIG_PRESETS.find(p => p.id === id);
}
