import React from 'react';
import { Star, Download, Play, X, Sparkles, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export interface SkillStepView {
  order: number;
  name: string;
  type: string;
  requiresApproval?: boolean;
  timeout?: number;
}

export interface SkillInputView {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface SkillDetailView {
  id: string;
  name: string;
  slug: string;
  version: string;
  author: string;
  description: string;
  longDescription: string;
  icon: string;
  category: string;
  tags: string[];
  steps: SkillStepView[];
  inputs: SkillInputView[];
  installCount: number;
  rating: number;
  ratingCount: number;
  builtin: boolean;
}

interface SkillDetailProps {
  skill: SkillDetailView;
  isInstalled: boolean;
  onInstall: () => void;
  onRun: () => void;
  onClose: () => void;
  onBack?: () => void;
}

export const SkillDetail: React.FC<SkillDetailProps> = ({
  skill,
  isInstalled,
  onInstall,
  onRun,
  onClose,
  onBack,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[640px] max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] text-xs"
              >
                ← Back
              </button>
            )}
            <span className="text-xl">{skill.icon}</span>
            <span className="text-sm font-semibold">INA-7 Pro</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Hero */}
        <div className="px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-start gap-3">
            <span className="text-3xl">{skill.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold flex items-center gap-1">
                {skill.name}
                {skill.builtin && (
                  <Sparkles size={12} className="text-[var(--ina-accent-primary,#4f46e5)]" />
                )}
              </div>
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                v{skill.version} · by {skill.author} · {skill.category}
              </div>
              <div className="text-[11px] text-[var(--vscode-foreground)] mt-1">{skill.description}</div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--vscode-descriptionForeground)] mt-2">
                <Star size={10} className="text-amber-400" />
                <span>
                  {skill.rating > 0 ? skill.rating.toFixed(1) : '–'} ({skill.ratingCount} ratings)
                </span>
                <span>· {skill.installCount.toLocaleString()} installs</span>
              </div>
              {skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {skill.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {skill.longDescription && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-2">
                Description
              </h3>
              <pre className="text-[11px] whitespace-pre-wrap font-sans text-[var(--vscode-foreground)]">
                {skill.longDescription}
              </pre>
            </section>
          )}

          <section>
            <h3 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-2">
              Steps ({skill.steps.length})
            </h3>
            <ol className="space-y-1">
              {skill.steps.map((step) => (
                <li
                  key={step.order}
                  className="flex items-center gap-2 text-[11px] px-2 py-1 rounded hover:bg-[var(--vscode-list-hoverBackground)]"
                >
                  <span className="text-[10px] font-mono text-[var(--vscode-descriptionForeground)] w-4 text-right">
                    {step.order}.
                  </span>
                  <ChevronRight size={10} className="text-[var(--vscode-descriptionForeground)]" />
                  <span className="flex-1">{step.name}</span>
                  <span className="text-[9px] px-1 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                    {step.type}
                  </span>
                  {step.requiresApproval && (
                    <span className="text-[9px] text-amber-400">approval</span>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {skill.inputs.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-2">
                Inputs ({skill.inputs.length})
              </h3>
              <ul className="space-y-1">
                {skill.inputs.map((input) => (
                  <li key={input.name} className="text-[11px] px-2 py-1">
                    <span className="font-mono text-[var(--vscode-foreground)]">{input.name}</span>
                    <span className="text-[10px] text-[var(--vscode-descriptionForeground)]"> · {input.type}</span>
                    {input.required && <span className="text-[9px] text-amber-400 ml-1">required</span>}
                    <div className="text-[10px] text-[var(--vscode-descriptionForeground)] pl-1">
                      {input.description}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--vscode-panel-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            Close
          </button>
          {isInstalled ? (
            <button
              onClick={onRun}
              className={clsx(
                'px-3 py-1 text-[11px] rounded font-medium flex items-center gap-1',
                'bg-green-500/20 hover:bg-green-500/30 text-green-400'
              )}
            >
              <Play size={11} />
              Run
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="px-3 py-1 text-[11px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1 font-medium"
            >
              <Download size={11} />
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillDetail;
