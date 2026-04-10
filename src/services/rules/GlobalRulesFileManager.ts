import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { GlobalRules, GLOBAL_RULES_CONSTANTS, UserPreferences, DEFAULT_USER_PREFERENCES } from './GlobalRulesTypes';
import { GlobalRulesParser } from './GlobalRulesParser';
import { Logger } from '../../utils/Logger';

export class GlobalRulesFileManager extends EventEmitter {
  private static instance: GlobalRulesFileManager;
  private globalRules: GlobalRules | null = null;
  private globalRulesPath: string = '';
  private parser: GlobalRulesParser;
  private watcher: fs.FSWatcher | null = null;
  private extensionContext: vscode.ExtensionContext | null = null;

  static getInstance(): GlobalRulesFileManager {
    if (!GlobalRulesFileManager.instance) {
      GlobalRulesFileManager.instance = new GlobalRulesFileManager();
    }
    return GlobalRulesFileManager.instance;
  }

  private constructor() {
    super();
    this.parser = GlobalRulesParser.getInstance();
  }

  initialize(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
    this.globalRulesPath = this.resolveGlobalRulesPath(context);

    // Ensure directory exists
    const dir = path.dirname(this.globalRulesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load if file exists
    if (fs.existsSync(this.globalRulesPath)) {
      this.loadGlobalRules().catch(e => Logger.warn('Initial global rules load failed:', e));
    }

    this.startWatching();
    Logger.info(`Global rules path: ${this.globalRulesPath}`);
  }

  getGlobalRulesPath(): string {
    return this.globalRulesPath;
  }

  async loadGlobalRules(): Promise<GlobalRules | null> {
    if (!this.globalRulesPath || !fs.existsSync(this.globalRulesPath)) {
      this.globalRules = null;
      return null;
    }

    try {
      const content = fs.readFileSync(this.globalRulesPath, 'utf-8');
      const stat = fs.statSync(this.globalRulesPath);
      const parsed = this.parser.parse(content);
      const validation = this.parser.validate(content);

      this.globalRules = {
        raw: content,
        parsed,
        filePath: this.globalRulesPath,
        lastModified: stat.mtimeMs,
        hash: this.hashContent(content),
        isValid: validation.isValid,
        errors: validation.errors.map(e => e.message),
      };

      this.emit('loaded', this.globalRules);
      Logger.info(`Global rules loaded: ${parsed.allRules.length} rules, ${parsed.customInstructions.length} instructions`);
      return this.globalRules;
    } catch (error) {
      Logger.error('Failed to load global rules:', error);
      this.emit('error', error);
      return null;
    }
  }

  getGlobalRules(): GlobalRules | null {
    return this.globalRules;
  }

  async saveGlobalRules(content: string): Promise<void> {
    const dir = path.dirname(this.globalRulesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.globalRulesPath, content, 'utf-8');
    await this.loadGlobalRules();
    this.emit('changed', this.globalRules);
  }

  async createGlobalRulesFile(preferences?: Partial<UserPreferences>): Promise<string> {
    const prefs = { ...DEFAULT_USER_PREFERENCES, ...preferences };
    const content = this.generateDefaultContent(prefs);

    const dir = path.dirname(this.globalRulesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.globalRulesPath, content, 'utf-8');

    const doc = await vscode.workspace.openTextDocument(this.globalRulesPath);
    await vscode.window.showTextDocument(doc);

    await this.loadGlobalRules();
    return this.globalRulesPath;
  }

  async updatePreference(key: string, value: string): Promise<void> {
    if (!this.globalRules) return;

    let content = this.globalRules.raw;
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (fmMatch) {
      const fmLines = fmMatch[1].split('\n');
      const lineIdx = fmLines.findIndex(l => l.startsWith(`${key}:`));
      if (lineIdx >= 0) {
        fmLines[lineIdx] = `${key}: ${value}`;
      } else {
        fmLines.push(`${key}: ${value}`);
      }
      content = `---\n${fmLines.join('\n')}\n---${content.slice(fmMatch[0].length)}`;
    } else {
      content = `---\n${key}: ${value}\n---\n\n${content}`;
    }

    await this.saveGlobalRules(content);
  }

  async updateSectionValue(sectionName: string, key: string, value: string): Promise<void> {
    if (!this.globalRules) return;

    const lines = this.globalRules.raw.split('\n');
    let inSection = false;
    let updated = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (trimmed.match(/^#{1,3}\s+/) && inSection) break;

      if (trimmed.match(/^#{1,3}\s+/)) {
        const header = trimmed.replace(/^#{1,3}\s+/, '').toLowerCase();
        if (header.includes(sectionName.toLowerCase())) {
          inSection = true;
          continue;
        }
      }

      if (inSection) {
        const lineKey = trimmed.match(/^[-*]\s+(.+?):\s/)?.[1]?.toLowerCase().replace(/[\s_-]/g, '');
        const searchKey = key.toLowerCase().replace(/[\s_-]/g, '');
        if (lineKey === searchKey) {
          const prefix = lines[i].match(/^(\s*[-*]\s+.+?:\s*)/)?.[1] || `- ${key}: `;
          lines[i] = `${prefix}${value}`;
          updated = true;
          break;
        }
      }
    }

    if (!updated && inSection) {
      // Append to section
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().match(/^#{1,3}\s+/) && lines[i].trim().toLowerCase().includes(sectionName.toLowerCase())) {
          lines.splice(i + 1, 0, `- ${key}: ${value}`);
          break;
        }
      }
    }

    await this.saveGlobalRules(lines.join('\n'));
  }

  async deleteGlobalRulesFile(): Promise<void> {
    if (fs.existsSync(this.globalRulesPath)) {
      fs.unlinkSync(this.globalRulesPath);
    }
    this.globalRules = null;
    this.emit('deleted');
  }

  hasGlobalRules(): boolean {
    return this.globalRules !== null;
  }

  private resolveGlobalRulesPath(context: vscode.ExtensionContext): string {
    // Check extension global storage first
    const storagePath = context.globalStorageUri.fsPath;
    const storageFile = path.join(storagePath, GLOBAL_RULES_CONSTANTS.FILE_NAME);
    if (fs.existsSync(storageFile)) return storageFile;

    // Check home directory
    const homeDir = path.join(os.homedir(), GLOBAL_RULES_CONSTANTS.STORAGE_DIR);
    const homeFile = path.join(homeDir, GLOBAL_RULES_CONSTANTS.FILE_NAME);
    if (fs.existsSync(homeFile)) return homeFile;

    // Check stored path in globalState
    const storedPath = context.globalState.get<string>('globalRulesPath');
    if (storedPath && fs.existsSync(storedPath)) return storedPath;

    // Default to home directory
    return homeFile;
  }

  private generateDefaultContent(prefs: UserPreferences): string {
    const parts: string[] = [];

    parts.push('---');
    if (prefs.displayName) parts.push(`name: ${prefs.displayName}`);
    parts.push(`language: ${prefs.preferredLanguage || 'english'}`);
    if (prefs.preferredCodeLanguage) parts.push(`code_language: ${prefs.preferredCodeLanguage}`);
    parts.push(`experience: ${prefs.experienceLevel || 'intermediate'}`);
    if (prefs.timezone) parts.push(`timezone: ${prefs.timezone}`);
    parts.push('---\n');

    parts.push('# Preferences');
    parts.push(`- Response language: ${prefs.preferredLanguage || 'english'}`);
    parts.push(`- Experience level: ${prefs.experienceLevel || 'intermediate'}`);
    if (prefs.preferredCodeLanguage) parts.push(`- Code language: ${prefs.preferredCodeLanguage}`);
    parts.push('');

    parts.push('# Coding Defaults');
    parts.push('- Indentation: spaces (2)');
    parts.push('- Quotes: single');
    parts.push('- Semicolons: yes');
    parts.push('- Trailing commas: all');
    parts.push('- Line width: 100');
    parts.push('- Brace style: 1tbs');
    parts.push('- Arrow parens: always');
    parts.push('');

    parts.push('# Response Style');
    parts.push('- Verbosity: balanced');
    parts.push('- Tone: professional');
    parts.push('- Code comments: moderate');
    parts.push('- Include explanations: yes');
    parts.push('- Show alternatives: no');
    parts.push('- Prefer examples: yes');
    parts.push('- Max response length: medium');
    parts.push('');

    parts.push('# Custom Instructions');
    parts.push('- [Add your personal coding preferences here]');
    parts.push('');

    return parts.join('\n');
  }

  private startWatching(): void {
    if (!this.globalRulesPath) return;

    const dir = path.dirname(this.globalRulesPath);
    if (!fs.existsSync(dir)) return;

    try {
      this.watcher = fs.watch(dir, (eventType, filename) => {
        if (filename === path.basename(this.globalRulesPath)) {
          this.loadGlobalRules().then(() => {
            this.emit('changed', this.globalRules);
          }).catch(e => Logger.debug('Global rules watch reload failed:', e));
        }
      });
    } catch (e) {
      Logger.debug('Could not watch global rules directory:', e);
    }
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  dispose(): void {
    this.watcher?.close();
  }
}
