import React, { useEffect, useState, useCallback } from 'react';
import { useChatStore } from '../../store/chatStore';
import { postMessage } from '../../utils/vscode';

interface GlobalPrefsView {
  displayName: string | null;
  preferredLanguage: string | null;
  preferredCodeLanguage: string | null;
  experienceLevel: string;
  timezone: string | null;
}

interface CodingDefaultsView {
  indentation: 'spaces' | 'tabs';
  indentSize: number;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingComma: 'none' | 'es5' | 'all';
  lineWidth: number;
  braceStyle: string;
  arrowParens: 'always' | 'avoid';
}

interface ResponseStyleView {
  verbosity: 'concise' | 'balanced' | 'detailed';
  tone: 'professional' | 'casual' | 'friendly' | 'technical';
  codeComments: 'none' | 'minimal' | 'moderate' | 'extensive';
  includeExplanations: boolean;
  showAlternatives: boolean;
  preferExamples: boolean;
  maxResponseLength: 'short' | 'medium' | 'long' | 'unlimited';
}

const LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'persian', label: 'Persian (فارسی)' },
  { value: 'german', label: 'German (Deutsch)' },
  { value: 'arabic', label: 'Arabic (العربية)' },
  { value: 'turkish', label: 'Turkish (Türkçe)' },
  { value: 'french', label: 'French (Français)' },
  { value: 'spanish', label: 'Spanish (Español)' },
  { value: 'chinese', label: 'Chinese (中文)' },
  { value: 'japanese', label: 'Japanese (日本語)' },
  { value: 'korean', label: 'Korean (한국어)' },
  { value: 'portuguese', label: 'Portuguese (Português)' },
  { value: 'russian', label: 'Russian (Русский)' },
  { value: 'italian', label: 'Italian (Italiano)' },
  { value: 'dutch', label: 'Dutch (Nederlands)' },
  { value: 'hindi', label: 'Hindi (हिन्दी)' },
];

const CODE_LANGUAGES = [
  'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'csharp', 'cpp',
  'ruby', 'php', 'swift', 'kotlin', 'dart', 'scala',
];

const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner', desc: 'Explain concepts in detail with examples' },
  { value: 'intermediate', label: 'Intermediate', desc: 'Moderate explanations, some examples' },
  { value: 'advanced', label: 'Advanced', desc: 'Brief explanations, focus on code' },
  { value: 'expert', label: 'Expert', desc: 'Minimal text, advanced patterns, trade-offs' },
];

type Tab = 'preferences' | 'coding' | 'response' | 'instructions';

export const GlobalRulesPanel: React.FC = () => {
  const { globalRulesActive, globalPrefs, globalCodingDefaults, globalResponseStyle, globalCustomInstructions } = useChatStore();

  const [tab, setTab] = useState<Tab>('preferences');
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    postMessage({ type: 'getGlobalRulesStatus' } as any);
  }, []);

  const debounceUpdate = useCallback((type: string, key: string, value: string) => {
    if (saveTimer) clearTimeout(saveTimer);
    const timer = setTimeout(() => {
      postMessage({ type, key, value } as any);
    }, 500);
    setSaveTimer(timer);
  }, [saveTimer]);

  const handleSetup = () => postMessage({ type: 'runGlobalRulesWizard' } as any);
  const handleOpen = () => postMessage({ type: 'openGlobalRulesFile' } as any);
  const handleDelete = () => postMessage({ type: 'deleteGlobalRules' } as any);

  if (!globalRulesActive) {
    return (
      <div className="p-4 text-center">
        <div className="text-3xl mb-3">👤</div>
        <h3 className="text-base font-semibold mb-2">No Global Rules</h3>
        <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-4">
          Set up your personal coding preferences. They apply across all projects.
        </p>
        <button
          onClick={handleSetup}
          className="px-4 py-2 rounded text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
        >
          Set Up Preferences
        </button>
      </div>
    );
  }

  const codePreview = globalCodingDefaults ? generateCodePreview(globalCodingDefaults) : '';

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">👤</span>
          <span className="font-semibold text-sm">Global Rules</span>
        </div>
        <div className="flex gap-1">
          <button onClick={handleOpen} className="text-xs px-2 py-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Edit file">Edit</button>
          <button onClick={handleDelete} className="text-xs px-2 py-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-errorForeground)]" title="Delete">Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--vscode-panel-border)]">
        {(['preferences', 'coding', 'response', 'instructions'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs capitalize border-b-2 ${tab === t ? 'border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)]' : 'border-transparent text-[var(--vscode-descriptionForeground)]'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-2 py-1">
        {tab === 'preferences' && globalPrefs && (
          <div className="flex flex-col gap-3">
            <FieldRow label="Display Name">
              <input
                type="text"
                defaultValue={globalPrefs.displayName || ''}
                onChange={e => debounceUpdate('updateGlobalPreference', 'name', e.target.value)}
                className="w-full px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)]"
                placeholder="How should I address you?"
              />
            </FieldRow>

            <FieldRow label="Response Language">
              <select
                defaultValue={globalPrefs.preferredLanguage || 'english'}
                onChange={e => postMessage({ type: 'updateGlobalPreference', key: 'language', value: e.target.value } as any)}
                className="w-full px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)]"
              >
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </FieldRow>

            <FieldRow label="Programming Language">
              <select
                defaultValue={globalPrefs.preferredCodeLanguage || ''}
                onChange={e => postMessage({ type: 'updateGlobalPreference', key: 'code_language', value: e.target.value } as any)}
                className="w-full px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)]"
              >
                <option value="">Auto-detect</option>
                {CODE_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FieldRow>

            <FieldRow label="Experience Level">
              <div className="flex flex-col gap-1">
                {EXPERIENCE_LEVELS.map(level => (
                  <label key={level.value} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="experience"
                      value={level.value}
                      defaultChecked={globalPrefs.experienceLevel === level.value}
                      onChange={() => postMessage({ type: 'updateGlobalPreference', key: 'experience', value: level.value } as any)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-medium">{level.label}</span>
                      <span className="text-[var(--vscode-descriptionForeground)] ml-1">— {level.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </FieldRow>
          </div>
        )}

        {tab === 'coding' && globalCodingDefaults && (
          <div className="flex flex-col gap-3">
            <FieldRow label="Indentation">
              <div className="flex gap-2">
                <ToggleButton
                  options={[{ value: 'spaces', label: 'Spaces' }, { value: 'tabs', label: 'Tabs' }]}
                  value={globalCodingDefaults.indentation}
                  onChange={v => postMessage({ type: 'updateGlobalCodingDefault', key: 'indentation', value: v } as any)}
                />
                {globalCodingDefaults.indentation === 'spaces' && (
                  <select
                    value={globalCodingDefaults.indentSize}
                    onChange={e => postMessage({ type: 'updateGlobalCodingDefault', key: 'indent size', value: e.target.value } as any)}
                    className="px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]"
                  >
                    <option value="2">2</option>
                    <option value="4">4</option>
                    <option value="8">8</option>
                  </select>
                )}
              </div>
            </FieldRow>

            <FieldRow label="Quotes">
              <ToggleButton
                options={[{ value: 'single', label: 'Single' }, { value: 'double', label: 'Double' }]}
                value={globalCodingDefaults.quotes}
                onChange={v => postMessage({ type: 'updateGlobalCodingDefault', key: 'quotes', value: v } as any)}
              />
            </FieldRow>

            <FieldRow label="Semicolons">
              <ToggleButton
                options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                value={globalCodingDefaults.semicolons ? 'yes' : 'no'}
                onChange={v => postMessage({ type: 'updateGlobalCodingDefault', key: 'semicolons', value: v } as any)}
              />
            </FieldRow>

            <FieldRow label="Trailing Commas">
              <select
                value={globalCodingDefaults.trailingComma}
                onChange={e => postMessage({ type: 'updateGlobalCodingDefault', key: 'trailing commas', value: e.target.value } as any)}
                className="px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]"
              >
                <option value="none">None</option>
                <option value="es5">ES5</option>
                <option value="all">All</option>
              </select>
            </FieldRow>

            <FieldRow label="Line Width">
              <input
                type="number"
                defaultValue={globalCodingDefaults.lineWidth}
                onChange={e => debounceUpdate('updateGlobalCodingDefault', 'line width', e.target.value)}
                className="w-20 px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]"
                min={40} max={200}
              />
            </FieldRow>

            <FieldRow label="Brace Style">
              <select
                value={globalCodingDefaults.braceStyle}
                onChange={e => postMessage({ type: 'updateGlobalCodingDefault', key: 'brace style', value: e.target.value } as any)}
                className="px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]"
              >
                <option value="1tbs">1TBS</option>
                <option value="allman">Allman</option>
                <option value="stroustrup">Stroustrup</option>
              </select>
            </FieldRow>

            {/* Code preview */}
            {codePreview && (
              <div className="mt-2">
                <span className="text-xs text-[var(--vscode-descriptionForeground)]">Preview:</span>
                <pre className="mt-1 p-2 text-xs rounded bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] overflow-x-auto whitespace-pre">
                  {codePreview}
                </pre>
              </div>
            )}
          </div>
        )}

        {tab === 'response' && globalResponseStyle && (
          <div className="flex flex-col gap-3">
            <FieldRow label="Verbosity">
              <ToggleButton
                options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]}
                value={globalResponseStyle.verbosity}
                onChange={v => postMessage({ type: 'updateGlobalResponseStyle', key: 'verbosity', value: v } as any)}
              />
            </FieldRow>

            <FieldRow label="Tone">
              <select
                value={globalResponseStyle.tone}
                onChange={e => postMessage({ type: 'updateGlobalResponseStyle', key: 'tone', value: e.target.value } as any)}
                className="px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
                <option value="technical">Technical</option>
              </select>
            </FieldRow>

            <FieldRow label="Code Comments">
              <select
                value={globalResponseStyle.codeComments}
                onChange={e => postMessage({ type: 'updateGlobalResponseStyle', key: 'code comments', value: e.target.value } as any)}
                className="px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]"
              >
                <option value="none">None</option>
                <option value="minimal">Minimal</option>
                <option value="moderate">Moderate</option>
                <option value="extensive">Extensive</option>
              </select>
            </FieldRow>

            <FieldRow label="Explanations">
              <ToggleButton
                options={[{ value: 'yes', label: 'Include' }, { value: 'no', label: 'Code Only' }]}
                value={globalResponseStyle.includeExplanations ? 'yes' : 'no'}
                onChange={v => postMessage({ type: 'updateGlobalResponseStyle', key: 'include explanations', value: v } as any)}
              />
            </FieldRow>

            <FieldRow label="Show Alternatives">
              <ToggleButton
                options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                value={globalResponseStyle.showAlternatives ? 'yes' : 'no'}
                onChange={v => postMessage({ type: 'updateGlobalResponseStyle', key: 'show alternatives', value: v } as any)}
              />
            </FieldRow>

            <FieldRow label="Response Length">
              <select
                value={globalResponseStyle.maxResponseLength}
                onChange={e => postMessage({ type: 'updateGlobalResponseStyle', key: 'max response length', value: e.target.value } as any)}
                className="px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]"
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </FieldRow>
          </div>
        )}

        {tab === 'instructions' && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[var(--vscode-descriptionForeground)]">
              Personal instructions that apply to all projects. Edit the file directly for full control.
            </p>
            {globalCustomInstructions && globalCustomInstructions.length > 0 ? (
              <div className="flex flex-col gap-1">
                {globalCustomInstructions.map((instr, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-1.5 rounded bg-[var(--vscode-editor-background)]">
                    <span className="text-[var(--vscode-descriptionForeground)]">•</span>
                    <span>{instr}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-[var(--vscode-descriptionForeground)]">No custom instructions yet.</p>
            )}
            <button
              onClick={handleOpen}
              className="text-xs px-3 py-1.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] self-start"
            >
              Edit File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ Sub-components ============

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-[var(--vscode-foreground)]">{label}</label>
    {children}
  </div>
);

const ToggleButton: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex rounded overflow-hidden border border-[var(--vscode-input-border)]">
    {options.map(opt => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1 text-xs ${
          value === opt.value
            ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
            : 'bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

function generateCodePreview(defaults: CodingDefaultsView): string {
  const q = defaults.quotes === 'single' ? "'" : '"';
  const indent = defaults.indentation === 'tabs' ? '\t' : ' '.repeat(defaults.indentSize);
  const semi = defaults.semicolons ? ';' : '';
  const comma = defaults.trailingComma !== 'none' ? ',' : '';

  return `import { useState } from ${q}react${q}${semi}

function Counter() {
${indent}const [count${comma} setCount] = useState(0)${semi}

${indent}return (
${indent}${indent}<button onClick={() => setCount(count + 1)}>
${indent}${indent}${indent}{count}
${indent}${indent}</button>
${indent})${semi}
}`;
}
