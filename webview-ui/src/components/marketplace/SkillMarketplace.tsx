import React, { useEffect, useMemo, useState } from 'react';
import { Search, Star, Download, Sparkles, Grid3x3, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';

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

export interface SkillView {
  id: string;
  name: string;
  slug: string;
  version: string;
  author: string;
  description: string;
  category: SkillCategoryView;
  icon: string;
  tags: string[];
  installCount: number;
  rating: number;
  ratingCount: number;
  builtin: boolean;
}

interface SkillMarketplaceProps {
  skills: SkillView[];
  installedIds: Set<string>;
  loading: boolean;
  onSearch: (query: string, category?: SkillCategoryView) => void;
  onInstall: (slug: string) => void;
  onRun: (slug: string) => void;
  onView: (slug: string) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<SkillCategoryView, string> = {
  code_generation: 'Code Generation',
  refactoring: 'Refactoring',
  testing: 'Testing',
  documentation: 'Documentation',
  devops: 'DevOps',
  security: 'Security',
  review: 'Review',
  data: 'Data',
  custom: 'Custom',
};

const CATEGORIES: SkillCategoryView[] = [
  'code_generation',
  'refactoring',
  'testing',
  'documentation',
  'devops',
  'security',
  'review',
  'data',
];

export const SkillMarketplace: React.FC<SkillMarketplaceProps> = ({
  skills,
  installedIds,
  loading,
  onSearch,
  onInstall,
  onRun,
  onView,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SkillCategoryView | 'all'>('all');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query, category === 'all' ? undefined : category);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, category]);

  const filtered = useMemo(() => {
    if (category === 'all') return skills;
    return skills.filter((s) => s.category === category);
  }, [skills, category]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[820px] max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <Grid3x3 size={14} className="text-[var(--ina-accent-primary,#4f46e5)]" />
            <span className="text-sm font-semibold">INA-7 Pro · Skills Marketplace</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{filtered.length} skills</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[var(--vscode-panel-border)] space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border,transparent)] rounded">
            <Search size={12} className="text-[var(--vscode-descriptionForeground)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills…"
              className="flex-1 bg-transparent outline-none text-xs text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-descriptionForeground)]"
            />
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setCategory('all')}
              className={clsx(
                'px-2 py-0.5 text-[10px] rounded',
                category === 'all'
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]'
              )}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={clsx(
                  'px-2 py-0.5 text-[10px] rounded',
                  category === cat
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                    : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]'
                )}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {loading && (
            <div className="col-span-full flex items-center justify-center py-8 text-[var(--vscode-descriptionForeground)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full text-center text-xs text-[var(--vscode-descriptionForeground)] py-8">
              No skills found
            </div>
          )}
          {filtered.map((s) => {
            const isInstalled = installedIds.has(s.id);
            return (
              <div
                key={s.id}
                className="rounded border border-[var(--vscode-panel-border)] p-3 hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                onClick={() => onView(s.slug)}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="text-2xl">{s.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {s.name}
                      {s.builtin && (
                        <Sparkles size={10} className="inline ml-1 text-[var(--ina-accent-primary,#4f46e5)]" />
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                      v{s.version} · by {s.author}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-[var(--vscode-foreground)] line-clamp-2 mb-2">
                  {s.description}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
                  <span className="flex items-center gap-0.5">
                    <Star size={9} className="text-amber-400" />
                    {s.rating > 0 ? s.rating.toFixed(1) : '–'}{' '}
                    <span className="opacity-60">({s.ratingCount})</span>
                  </span>
                  <span>· {s.installCount.toLocaleString()} installs</span>
                </div>
                <div
                  className="flex items-center justify-end gap-1 mt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isInstalled ? (
                    <button
                      onClick={() => onRun(s.slug)}
                      className="px-2 py-0.5 text-[10px] rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 flex items-center gap-1"
                    >
                      Run
                    </button>
                  ) : (
                    <button
                      onClick={() => onInstall(s.slug)}
                      className="px-2 py-0.5 text-[10px] rounded bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] flex items-center gap-1"
                    >
                      <Download size={10} />
                      Install
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SkillMarketplace;
