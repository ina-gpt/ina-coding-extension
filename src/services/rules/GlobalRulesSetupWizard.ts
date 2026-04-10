import * as vscode from 'vscode';
import { UserPreferences, ExperienceLevel, CodingDefaults, DEFAULT_USER_PREFERENCES, DEFAULT_CODING_DEFAULTS, LANGUAGE_NAMES, GlobalRules } from './GlobalRulesTypes';
import { GlobalRulesFileManager } from './GlobalRulesFileManager';
import { Logger } from '../../utils/Logger';

export class GlobalRulesSetupWizard {
  private static instance: GlobalRulesSetupWizard;

  static getInstance(): GlobalRulesSetupWizard {
    if (!GlobalRulesSetupWizard.instance) {
      GlobalRulesSetupWizard.instance = new GlobalRulesSetupWizard();
    }
    return GlobalRulesSetupWizard.instance;
  }

  async runWizard(): Promise<GlobalRules | null> {
    try {
      // Step 1: Name
      const name = await vscode.window.showInputBox({
        prompt: "What's your name? (optional — how the AI should address you)",
        placeHolder: 'e.g., Hassan, Alex, etc.',
      });
      if (name === undefined) return null; // cancelled

      // Step 2: Response language
      const languageItems = Object.entries(LANGUAGE_NAMES).map(([key, label]) => ({
        label, description: key, value: key,
      }));
      languageItems.push({ label: 'Other (type your own)', description: 'other', value: 'other' });

      const langPick = await vscode.window.showQuickPick(languageItems, {
        placeHolder: 'What language should I respond in?',
      });
      if (!langPick) return null;

      let language = langPick.value;
      if (language === 'other') {
        const custom = await vscode.window.showInputBox({ prompt: 'Type the language name' });
        if (!custom) return null;
        language = custom.toLowerCase();
      }

      // Step 3: Primary programming language
      const codeLangs = [
        'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java', 'C#', 'C++',
        'Ruby', 'PHP', 'Swift', 'Kotlin', 'Other',
      ];
      const codeLangPick = await vscode.window.showQuickPick(
        codeLangs.map(l => ({ label: l, value: l.toLowerCase() })),
        { placeHolder: "What's your primary programming language?" }
      );
      if (!codeLangPick) return null;

      let codeLanguage = codeLangPick.value;
      if (codeLanguage === 'other') {
        const custom = await vscode.window.showInputBox({ prompt: 'Type the language name' });
        if (!custom) return null;
        codeLanguage = custom.toLowerCase();
      }

      // Step 4: Experience level
      const expItems = [
        { label: 'Beginner', description: 'Explain everything in detail with examples', value: ExperienceLevel.BEGINNER },
        { label: 'Intermediate', description: 'Moderate explanations, some examples', value: ExperienceLevel.INTERMEDIATE },
        { label: 'Advanced', description: 'Brief explanations, focus on code', value: ExperienceLevel.ADVANCED },
        { label: 'Expert', description: 'Minimal text, advanced patterns, trade-offs', value: ExperienceLevel.EXPERT },
      ];
      const expPick = await vscode.window.showQuickPick(expItems, {
        placeHolder: "What's your experience level?",
      });
      if (!expPick) return null;

      // Step 5: Code style preset
      const stylePresets = [
        { label: '2 spaces, single quotes, semicolons', description: 'Standard JS/TS', value: { indentation: 'spaces' as const, indentSize: 2, quotes: 'single' as const, semicolons: true } },
        { label: '2 spaces, double quotes, no semicolons', description: 'React / Prettier default', value: { indentation: 'spaces' as const, indentSize: 2, quotes: 'double' as const, semicolons: false } },
        { label: '4 spaces, double quotes, semicolons', description: 'Java-style', value: { indentation: 'spaces' as const, indentSize: 4, quotes: 'double' as const, semicolons: true } },
        { label: 'Tabs, single quotes, no semicolons', description: 'Go/Rust-like', value: { indentation: 'tabs' as const, indentSize: 4, quotes: 'single' as const, semicolons: false } },
      ];
      const stylePick = await vscode.window.showQuickPick(stylePresets, {
        placeHolder: 'Preferred code style:',
      });
      if (!stylePick) return null;

      // Step 6: Verbosity
      const verbosityItems = [
        { label: 'Concise', description: 'Short and direct responses', value: 'concise' as const },
        { label: 'Balanced', description: 'Moderate detail', value: 'balanced' as const },
        { label: 'Detailed', description: 'Thorough explanations', value: 'detailed' as const },
      ];
      const verbPick = await vscode.window.showQuickPick(verbosityItems, {
        placeHolder: 'How should I respond?',
      });
      if (!verbPick) return null;

      // Step 7: Custom instructions (loop)
      const instructions: string[] = [];
      let addMore = true;
      while (addMore) {
        const addChoice = await vscode.window.showQuickPick(
          [
            { label: 'Add an instruction', value: 'add' },
            { label: instructions.length > 0 ? `Done (${instructions.length} added)` : 'Skip', value: 'done' },
          ],
          { placeHolder: 'Any custom instructions? (personal preferences)' }
        );
        if (!addChoice || addChoice.value === 'done') {
          addMore = false;
        } else {
          const instr = await vscode.window.showInputBox({
            prompt: 'Type your instruction',
            placeHolder: 'e.g., Always use async/await instead of .then()',
          });
          if (instr) instructions.push(instr);
        }
      }

      // Build preferences
      const preferences: Partial<UserPreferences> = {
        displayName: name || null,
        preferredLanguage: language,
        preferredCodeLanguage: codeLanguage,
        experienceLevel: expPick.value,
      };

      // Generate content
      const content = this.formatSelections(preferences, stylePick.value, verbPick.value, instructions);

      // Create file
      const fileManager = GlobalRulesFileManager.getInstance();
      await fileManager.saveGlobalRules(content);

      const doc = await vscode.workspace.openTextDocument(fileManager.getGlobalRulesPath());
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage('Global rules created! These apply to all your projects.');

      return fileManager.getGlobalRules();
    } catch (error) {
      Logger.error('Setup wizard error:', error);
      return null;
    }
  }

  async runQuickSetup(presets: Partial<UserPreferences>): Promise<GlobalRules | null> {
    const fileManager = GlobalRulesFileManager.getInstance();
    await fileManager.createGlobalRulesFile(presets);
    return fileManager.getGlobalRules();
  }

  async showSetupPrompt(): Promise<boolean> {
    const fileManager = GlobalRulesFileManager.getInstance();
    if (fileManager.hasGlobalRules()) return false;

    const dontAsk = vscode.workspace.getConfiguration('inaCoding.globalRules').get<boolean>('dontAskSetup', false);
    if (dontAsk) return false;

    const result = await vscode.window.showInformationMessage(
      'Would you like to set up your personal coding preferences? They\'ll be used across all projects.',
      'Set Up Now',
      'Later',
      "Don't Ask Again"
    );

    if (result === "Don't Ask Again") {
      await vscode.workspace.getConfiguration('inaCoding.globalRules').update('dontAskSetup', true, vscode.ConfigurationTarget.Global);
      return false;
    }

    return result === 'Set Up Now';
  }

  private formatSelections(
    prefs: Partial<UserPreferences>,
    codeStyle: { indentation: string; indentSize: number; quotes: string; semicolons: boolean },
    verbosity: string,
    instructions: string[]
  ): string {
    const parts: string[] = [];

    // Frontmatter
    parts.push('---');
    if (prefs.displayName) parts.push(`name: ${prefs.displayName}`);
    parts.push(`language: ${prefs.preferredLanguage || 'english'}`);
    if (prefs.preferredCodeLanguage) parts.push(`code_language: ${prefs.preferredCodeLanguage}`);
    parts.push(`experience: ${prefs.experienceLevel || 'intermediate'}`);
    parts.push('---\n');

    // Preferences
    parts.push('# Preferences');
    parts.push(`- Response language: ${prefs.preferredLanguage || 'english'}`);
    parts.push(`- Experience level: ${prefs.experienceLevel || 'intermediate'}`);
    if (prefs.preferredCodeLanguage) parts.push(`- Code language: ${prefs.preferredCodeLanguage}`);
    parts.push('');

    // Coding defaults
    parts.push('# Coding Defaults');
    parts.push(`- Indentation: ${codeStyle.indentation} (${codeStyle.indentSize})`);
    parts.push(`- Quotes: ${codeStyle.quotes}`);
    parts.push(`- Semicolons: ${codeStyle.semicolons ? 'yes' : 'no'}`);
    parts.push('- Trailing commas: all');
    parts.push('- Line width: 100');
    parts.push('- Brace style: 1tbs');
    parts.push('');

    // Response style
    parts.push('# Response Style');
    parts.push(`- Verbosity: ${verbosity}`);
    parts.push('- Tone: professional');
    parts.push('- Code comments: moderate');
    parts.push('- Include explanations: yes');
    parts.push('- Show alternatives: no');
    parts.push('- Prefer examples: yes');
    parts.push('');

    // Custom instructions
    parts.push('# Custom Instructions');
    if (instructions.length > 0) {
      for (const instr of instructions) {
        parts.push(`- ${instr}`);
      }
    } else {
      parts.push('- [Add your personal coding preferences here]');
    }
    parts.push('');

    return parts.join('\n');
  }
}
