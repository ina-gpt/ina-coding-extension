import React, { useState, useMemo } from 'react';
import {
  Bug, Search, Play, FileCode, AlertTriangle, CheckCircle2,
  X, ChevronDown, ChevronUp, Zap, Eye,
} from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface BugIssue {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  filePath: string;
  line: number;
  description: string;
  suggestion: string;
  codeSnippet?: string;
}

interface BugScanResult {
  issues: BugIssue[];
}

interface BugScanProgress {
  percent: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-400 text-white',
};

type SortKey = 'severity' | 'file' | 'category';
type FilterKey = 'all' | Severity;

function countBySeverity(issues: BugIssue[], sev: Severity): number {
  return issues.filter((i) => i.severity === sev).length;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase leading-none', SEVERITY_COLORS[severity])}>
      {severity}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
      {category}
    </span>
  );
}

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2 py-0.5 rounded-full text-xs border transition-colors',
        active
          ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
          : 'bg-transparent text-[var(--vscode-foreground)] border-[var(--vscode-widget-border)] hover:bg-[var(--vscode-list-hoverBackground)]',
      )}
    >
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BugCard
// ---------------------------------------------------------------------------

function BugCard({ bug }: { bug: BugIssue }) {
  const [expanded, setExpanded] = useState(false);

  const handleFix = () => postMessage({ type: 'fixBug', bug } as any);
  const handleDismiss = () => postMessage({ type: 'dismissBug', bugId: bug.id } as any);
  const handleOpen = () => postMessage({ type: 'openBugLocation', filePath: bug.filePath, line: bug.line } as any);

  return (
    <div className="rounded border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 p-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SeverityBadge severity={bug.severity} />
            <CategoryBadge category={bug.category} />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-left text-sm font-medium text-[var(--vscode-textLink-foreground)] hover:underline truncate"
            title={bug.title}
          >
            {bug.title}
          </button>
          <button
            onClick={handleOpen}
            className="text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-textLink-foreground)] truncate text-left flex items-center gap-1"
          >
            <FileCode size={12} />
            {bug.filePath}:{bug.line}
          </button>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 rounded hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-descriptionForeground)]"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t border-[var(--vscode-widget-border)] p-2 space-y-2">
          <div className="text-xs text-[var(--vscode-foreground)]">
            <div className="font-medium mb-0.5 flex items-center gap-1"><Eye size={12} /> Description</div>
            <p className="text-[var(--vscode-descriptionForeground)]">{bug.description}</p>
          </div>

          <div className="text-xs text-[var(--vscode-foreground)]">
            <div className="font-medium mb-0.5 flex items-center gap-1"><Zap size={12} /> Suggestion</div>
            <p className="text-[var(--vscode-descriptionForeground)]">{bug.suggestion}</p>
          </div>

          {bug.codeSnippet && (
            <pre className="text-[11px] p-2 rounded bg-[var(--vscode-textCodeBlock-background)] text-[var(--vscode-editor-foreground)] overflow-x-auto whitespace-pre-wrap font-mono">
              {bug.codeSnippet}
            </pre>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={handleFix}
              className="px-2 py-1 rounded text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1"
            >
              <Zap size={12} /> Fix
            </button>
            <button
              onClick={handleOpen}
              className="px-2 py-1 rounded text-xs bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] flex items-center gap-1"
            >
              <Eye size={12} /> Open
            </button>
            <button
              onClick={handleDismiss}
              className="px-2 py-1 rounded text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] flex items-center gap-1 ml-auto"
            >
              <X size={12} /> Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BugFinderPanel
// ---------------------------------------------------------------------------

export function BugFinderPanel() {
  const {
    bugScanResult,
    bugScanProgress,
    showBugFinderPanel,
  } = useChatStore() as any;

  const scanResult = bugScanResult as BugScanResult | null;
  const scanProgress = bugScanProgress as BugScanProgress | null;
  const isScanning = scanProgress !== null && scanProgress !== undefined && scanProgress.percent < 100;

  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('severity');

  // Actions
  const handleScanCurrent = () => postMessage({ type: 'scanCurrentFile' } as any);
  const handleScanChanged = () => postMessage({ type: 'scanChangedFiles' } as any);
  const handleScanProject = () => postMessage({ type: 'scanProject' } as any);

  // Derived data
  const issues = scanResult?.issues ?? [];

  const filtered = useMemo(() => {
    let list = filter === 'all' ? issues : issues.filter((i) => i.severity === filter);

    list = [...list].sort((a, b) => {
      if (sort === 'severity') return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sort === 'file') return a.filePath.localeCompare(b.filePath);
      return a.category.localeCompare(b.category);
    });

    return list;
  }, [issues, filter, sort]);

  if (!showBugFinderPanel) return null;

  return (
    <div className="p-3 space-y-3 text-sm">
      {/* ---- SCAN CONTROLS ---- */}
      <div>
        <div className="text-xs font-medium mb-1.5 text-[var(--vscode-descriptionForeground)] uppercase tracking-wide">
          Scan Controls
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleScanCurrent}
            disabled={isScanning}
            className={clsx(
              'px-2 py-1 rounded text-xs flex items-center gap-1',
              'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]',
              'hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50',
            )}
          >
            <FileCode size={12} /> Scan Current File
          </button>
          <button
            onClick={handleScanChanged}
            disabled={isScanning}
            className={clsx(
              'px-2 py-1 rounded text-xs flex items-center gap-1',
              'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]',
              'hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-50',
            )}
          >
            <Search size={12} /> Scan Changed Files
          </button>
          <button
            onClick={handleScanProject}
            disabled={isScanning}
            className={clsx(
              'px-2 py-1 rounded text-xs flex items-center gap-1',
              'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]',
              'hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-50',
            )}
          >
            <Play size={12} /> Scan Project
          </button>
        </div>

        {/* Progress bar */}
        {isScanning && scanProgress && (
          <div className="mt-2 space-y-1">
            <div className="w-full bg-[var(--vscode-editor-background)] rounded-full h-1.5 border border-[var(--vscode-widget-border)]">
              <div
                className="h-full rounded-full bg-[var(--vscode-progressBar-background)] transition-all"
                style={{ width: `${scanProgress.percent}%` }}
              />
            </div>
            {scanProgress.label && (
              <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">{scanProgress.label}</div>
            )}
          </div>
        )}
      </div>

      {/* ---- RESULTS SECTION ---- */}
      {issues.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTriangle size={14} className="text-[var(--vscode-editorWarning-foreground)]" />
            <span className="text-xs font-medium">
              Found {issues.length} issue{issues.length !== 1 ? 's' : ''}:
              {' '}{countBySeverity(issues, 'critical')} critical,
              {' '}{countBySeverity(issues, 'high')} high,
              {' '}{countBySeverity(issues, 'medium')} medium,
              {' '}{countBySeverity(issues, 'low')} low
            </span>
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip label="All" count={issues.length} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterChip label="Critical" count={countBySeverity(issues, 'critical')} active={filter === 'critical'} onClick={() => setFilter('critical')} />
            <FilterChip label="High" count={countBySeverity(issues, 'high')} active={filter === 'high'} onClick={() => setFilter('high')} />
            <FilterChip label="Medium" count={countBySeverity(issues, 'medium')} active={filter === 'medium'} onClick={() => setFilter('medium')} />
            <FilterChip label="Low" count={countBySeverity(issues, 'low')} active={filter === 'low'} onClick={() => setFilter('low')} />
          </div>

          {/* Sort options */}
          <div className="flex items-center gap-2 text-[11px] text-[var(--vscode-descriptionForeground)]">
            <span>Sort:</span>
            {(['severity', 'file', 'category'] as SortKey[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={clsx(
                  'capitalize hover:text-[var(--vscode-foreground)]',
                  sort === s && 'text-[var(--vscode-foreground)] font-medium underline',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---- BUG LIST ---- */}
      {filtered.length > 0 && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
          {filtered.map((bug) => (
            <BugCard key={bug.id} bug={bug} />
          ))}
        </div>
      )}

      {/* ---- EMPTY STATE ---- */}
      {!isScanning && scanResult && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--vscode-descriptionForeground)]">
          <CheckCircle2 size={32} className="text-green-500 mb-2" />
          <span className="text-sm font-medium">No issues found!</span>
          <span className="text-xs mt-1">Your code looks clean.</span>
        </div>
      )}

      {/* Initial state - no scan run yet */}
      {!isScanning && !scanResult && (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--vscode-descriptionForeground)]">
          <Bug size={32} className="mb-2 opacity-40" />
          <span className="text-xs">Run a scan to find potential issues.</span>
        </div>
      )}
    </div>
  );
}
