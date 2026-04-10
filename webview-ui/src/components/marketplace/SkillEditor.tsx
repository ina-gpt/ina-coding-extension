import React, { useState } from 'react';
import { Plus, Trash2, X, Save, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export type SkillStepType = 'prompt' | 'command' | 'file_operation' | 'condition' | 'loop';
export type SkillCategoryView =
  | 'code_generation'
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'devops'
  | 'security'
  | 'review'
  | 'data'
  | 'custom';

export interface EditableStep {
  order: number;
  name: string;
  type: SkillStepType;
  prompt?: string;
  command?: string;
  requiresApproval: boolean;
  timeout: number;
}

export interface EditableInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'folder' | 'selection';
  description: string;
  required: boolean;
}

export interface EditableSkill {
  name: string;
  slug: string;
  version: string;
  description: string;
  longDescription: string;
  category: SkillCategoryView;
  icon: string;
  tags: string[];
  steps: EditableStep[];
  inputs: EditableInput[];
}

interface SkillEditorProps {
  initial?: Partial<EditableSkill>;
  onSave: (skill: EditableSkill, publish: boolean) => void;
  onTestRun: (skill: EditableSkill) => void;
  onClose: () => void;
}

const CATEGORY_OPTIONS: SkillCategoryView[] = [
  'code_generation',
  'refactoring',
  'testing',
  'documentation',
  'devops',
  'security',
  'review',
  'data',
  'custom',
];

export const SkillEditor: React.FC<SkillEditorProps> = ({ initial, onSave, onTestRun, onClose }) => {
  const [skill, setSkill] = useState<EditableSkill>({
    name: initial?.name ?? 'New Skill',
    slug: initial?.slug ?? 'new-skill',
    version: initial?.version ?? '1.0.0',
    description: initial?.description ?? '',
    longDescription: initial?.longDescription ?? '',
    category: initial?.category ?? 'custom',
    icon: initial?.icon ?? '🛠',
    tags: initial?.tags ?? [],
    steps: initial?.steps ?? [
      { order: 1, name: 'First step', type: 'prompt', prompt: '', requiresApproval: false, timeout: 60 },
    ],
    inputs: initial?.inputs ?? [],
  });

  const updateField = <K extends keyof EditableSkill>(key: K, value: EditableSkill[K]) => {
    setSkill((s) => ({ ...s, [key]: value }));
  };

  const addStep = () => {
    setSkill((s) => ({
      ...s,
      steps: [
        ...s.steps,
        {
          order: s.steps.length + 1,
          name: `Step ${s.steps.length + 1}`,
          type: 'prompt',
          prompt: '',
          requiresApproval: false,
          timeout: 60,
        },
      ],
    }));
  };

  const updateStep = (index: number, patch: Partial<EditableStep>) => {
    setSkill((s) => {
      const next = [...s.steps];
      next[index] = { ...next[index], ...patch };
      return { ...s, steps: next };
    });
  };

  const removeStep = (index: number) => {
    setSkill((s) => {
      const next = s.steps.filter((_, i) => i !== index).map((step, i) => ({ ...step, order: i + 1 }));
      return { ...s, steps: next };
    });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    setSkill((s) => {
      const next = [...s.steps];
      const target = index + dir;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...s, steps: next.map((step, i) => ({ ...step, order: i + 1 })) };
    });
  };

  const addInput = () => {
    setSkill((s) => ({
      ...s,
      inputs: [
        ...s.inputs,
        { name: `input${s.inputs.length + 1}`, type: 'string', description: '', required: false },
      ],
    }));
  };

  const updateInput = (index: number, patch: Partial<EditableInput>) => {
    setSkill((s) => {
      const next = [...s.inputs];
      next[index] = { ...next[index], ...patch };
      return { ...s, inputs: next };
    });
  };

  const removeInput = (index: number) => {
    setSkill((s) => ({ ...s, inputs: s.inputs.filter((_, i) => i !== index) }));
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[820px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <span className="text-sm font-semibold">INA-7 Pro · Skill Editor</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Metadata */}
          <section className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-1">
                Name
              </label>
              <input
                type="text"
                value={skill.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-1">
                Slug
              </label>
              <input
                type="text"
                value={skill.slug}
                onChange={(e) => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-1">
                Version
              </label>
              <input
                type="text"
                value={skill.version}
                onChange={(e) => updateField('version', e.target.value)}
                className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-1">
                Category
              </label>
              <select
                value={skill.category}
                onChange={(e) => updateField('category', e.target.value as SkillCategoryView)}
                className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <div>
            <label className="block text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-1">
              Description
            </label>
            <input
              type="text"
              value={skill.description}
              onChange={(e) => updateField('description', e.target.value)}
              className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
            />
          </div>

          {/* Steps */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)]">
                Steps ({skill.steps.length})
              </h3>
              <button
                onClick={addStep}
                className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              >
                <Plus size={11} />
                Add step
              </button>
            </div>
            <div className="space-y-2">
              {skill.steps.map((step, i) => (
                <div
                  key={i}
                  className="rounded border border-[var(--vscode-panel-border)] p-2 space-y-1"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-[var(--vscode-descriptionForeground)] w-4 text-right">
                      {step.order}.
                    </span>
                    <input
                      type="text"
                      value={step.name}
                      onChange={(e) => updateStep(i, { name: e.target.value })}
                      className="flex-1 px-1 py-0.5 text-xs bg-transparent border-b border-transparent hover:border-[var(--vscode-panel-border)] focus:border-[var(--vscode-focusBorder)] outline-none"
                    />
                    <select
                      value={step.type}
                      onChange={(e) => updateStep(i, { type: e.target.value as SkillStepType })}
                      className="text-[10px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border,transparent)] rounded px-1 py-0.5"
                    >
                      <option value="prompt">prompt</option>
                      <option value="command">command</option>
                      <option value="file_operation">file_op</option>
                      <option value="condition">condition</option>
                      <option value="loop">loop</option>
                    </select>
                    <button
                      onClick={() => moveStep(i, -1)}
                      className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                      disabled={i === 0}
                    >
                      <ChevronUp size={10} />
                    </button>
                    <button
                      onClick={() => moveStep(i, 1)}
                      className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                      disabled={i === skill.steps.length - 1}
                    >
                      <ChevronDown size={10} />
                    </button>
                    <button
                      onClick={() => removeStep(i)}
                      className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  {step.type === 'prompt' && (
                    <textarea
                      value={step.prompt ?? ''}
                      onChange={(e) => updateStep(i, { prompt: e.target.value })}
                      placeholder="Prompt template — supports {{input.name}} and {{step.N.output}}"
                      rows={3}
                      className="w-full px-2 py-1 text-[11px] font-mono bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                    />
                  )}
                  {step.type === 'command' && (
                    <input
                      type="text"
                      value={step.command ?? ''}
                      onChange={(e) => updateStep(i, { command: e.target.value })}
                      placeholder="shell command"
                      className="w-full px-2 py-1 text-[11px] font-mono bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                    />
                  )}
                  <label className="flex items-center gap-1 text-[10px] text-[var(--vscode-descriptionForeground)]">
                    <input
                      type="checkbox"
                      checked={step.requiresApproval}
                      onChange={(e) => updateStep(i, { requiresApproval: e.target.checked })}
                    />
                    Requires approval
                  </label>
                </div>
              ))}
            </div>
          </section>

          {/* Inputs */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)]">
                Inputs ({skill.inputs.length})
              </h3>
              <button
                onClick={addInput}
                className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              >
                <Plus size={11} />
                Add input
              </button>
            </div>
            <div className="space-y-1">
              {skill.inputs.map((input, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={input.name}
                    onChange={(e) => updateInput(i, { name: e.target.value })}
                    placeholder="name"
                    className="w-24 px-2 py-1 text-[11px] font-mono bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                  />
                  <select
                    value={input.type}
                    onChange={(e) => updateInput(i, { type: e.target.value as any })}
                    className="text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border,transparent)] rounded px-1 py-1"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="file">file</option>
                    <option value="folder">folder</option>
                  </select>
                  <input
                    type="text"
                    value={input.description}
                    onChange={(e) => updateInput(i, { description: e.target.value })}
                    placeholder="description"
                    className="flex-1 px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                  />
                  <label className="flex items-center gap-0.5 text-[10px]">
                    <input
                      type="checkbox"
                      checked={input.required}
                      onChange={(e) => updateInput(i, { required: e.target.checked })}
                    />
                    req
                  </label>
                  <button
                    onClick={() => removeInput(i)}
                    className="p-1 rounded hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--vscode-panel-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            Cancel
          </button>
          <button
            onClick={() => onTestRun(skill)}
            className="px-3 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] flex items-center gap-1"
          >
            <Eye size={11} />
            Test run
          </button>
          <button
            onClick={() => onSave(skill, false)}
            className="px-3 py-1 text-[11px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1"
          >
            <Save size={11} />
            Save
          </button>
          <button
            onClick={() => onSave(skill, true)}
            className={clsx(
              'px-3 py-1 text-[11px] rounded font-medium flex items-center gap-1',
              'bg-green-500/20 hover:bg-green-500/30 text-green-400'
            )}
          >
            Publish
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillEditor;
