import React, { useState, useMemo, memo } from 'react';
import {
  FileCode,
  FileText,
  Code2,
  ChevronDown,
  ChevronRight,
  Copy,
  X,
  AlertCircle,
  AlertTriangle,
  Info,
  Braces,
  AtSign,
  Hash,
  Eye,
  EyeOff,
  Link2,
} from 'lucide-react';
import { copyToClipboard } from '@/utils/vscode';
import clsx from 'clsx';

// ============ Types ============

export interface ActiveContextInfo {
  path: string;
  relativePath: string;
  fileName: string;
  language: { id: string; name: string };
  cursorLine: number;
  cursorColumn: number;
  selectionRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  selectedContent?: string;
  surroundingContent?: string;
  isDirty: boolean;
  lineCount: number;
  currentSymbol?: string;
  symbolPath?: string[];
}

export interface DiagnosticsInfo {
  errors: number;
  warnings: number;
  hints: number;
  topIssues: {
    severity: 'error' | 'warning' | 'hint';
    message: string;
    line: number;
  }[];
}

export interface ActiveContext {
  activeFile: ActiveContextInfo | null;
  diagnostics: DiagnosticsInfo | null;
  workspace?: {
    name: string;
    openFiles: string[];
  };
}

interface ContextDisplayProps {
  context: ActiveContext | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onRemoveContext?: () => void;
  className?: string;
}

// ============ Language Icons ============

const getLanguageIcon = (languageId: string): React.ReactNode => {
  const icons: Record<string, React.ReactNode> = {
    typescript: <Braces size={14} className="text-[var(--ina-status-info,#60a5fa)]" />,
    javascript: <Braces size={14} className="text-[var(--ina-status-warning,#facc15)]" />,
    typescriptreact: <Braces size={14} className="text-[var(--ina-status-info,#60a5fa)]" />,
    javascriptreact: <Braces size={14} className="text-[var(--ina-status-warning,#facc15)]" />,
    python: <Hash size={14} className="text-[var(--ina-status-success,#4ade80)]" />,
    rust: <Code2 size={14} className="text-orange-400" />,
    go: <Code2 size={14} className="text-cyan-400" />,
    java: <Code2 size={14} className="text-[var(--ina-status-error,#f87171)]" />,
    html: <FileCode size={14} className="text-orange-400" />,
    css: <FileCode size={14} className="text-[var(--ina-status-info,#60a5fa)]" />,
    json: <Braces size={14} className="text-[var(--ina-status-warning,#facc15)]" />,
    markdown: <FileText size={14} className="text-gray-400" />,
  };
  return icons[languageId] || <FileCode size={14} />;
};

// ============ Diagnostic Badge ============

const DiagnosticBadge: React.FC<{ diagnostics: DiagnosticsInfo }> = memo(({ diagnostics }) => {
  if (diagnostics.errors === 0 && diagnostics.warnings === 0) { return null; }

  return (
    <div className="flex items-center gap-1.5">
      {diagnostics.errors > 0 && (
        <span className="flex items-center gap-0.5 text-xs text-[var(--ina-status-error,#f87171)]">
          <AlertCircle size={12} />
          {diagnostics.errors}
        </span>
      )}
      {diagnostics.warnings > 0 && (
        <span className="flex items-center gap-0.5 text-xs text-[var(--ina-status-warning,#facc15)]">
          <AlertTriangle size={12} />
          {diagnostics.warnings}
        </span>
      )}
    </div>
  );
});

DiagnosticBadge.displayName = 'DiagnosticBadge';

// ============ Symbol Path ============

const SymbolPath: React.FC<{ symbolPath: string[] }> = memo(({ symbolPath }) => {
  return (
    <div className="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)] truncate">
      <AtSign size={12} />
      {symbolPath.map((symbol, i) => (
        <React.Fragment key={i}>
          <span className="truncate max-w-[100px]">{symbol}</span>
          {i < symbolPath.length - 1 && <span className="opacity-50">&rsaquo;</span>}
        </React.Fragment>
      ))}
    </div>
  );
});

SymbolPath.displayName = 'SymbolPath';

// ============ Selection Preview ============

const SelectionPreview: React.FC<{
  content: string;
  startLine: number;
  endLine: number;
  onCopy: () => void;
}> = memo(({ content, startLine, endLine, onCopy }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const lineCount = endLine - startLine + 1;
  const previewLines = 3;

  const displayContent = useMemo(() => {
    if (isExpanded || lineCount <= previewLines) {
      return content;
    }
    const lines = content.split('\n');
    return lines.slice(0, previewLines).join('\n') + '\n...';
  }, [content, lineCount, isExpanded, previewLines]);

  return (
    <div className="mt-2 rounded border border-[var(--vscode-panel-border)] overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-panel-border)]">
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          Lines {startLine}-{endLine} ({lineCount} lines)
        </span>
        <div className="flex items-center gap-1">
          {lineCount > previewLines && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
          <button
            onClick={onCopy}
            className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            title="Copy selection"
          >
            <Copy size={12} />
          </button>
        </div>
      </div>
      <div className="p-2 bg-[var(--vscode-textCodeBlock-background)] overflow-x-auto">
        <pre className="text-xs font-mono whitespace-pre-wrap break-words">
          {displayContent}
        </pre>
      </div>
    </div>
  );
});

SelectionPreview.displayName = 'SelectionPreview';

// ============ Main Context Display ============

export const ContextDisplay: React.FC<ContextDisplayProps> = memo(({
  context,
  isExpanded = false,
  onToggleExpand,
  onRemoveContext,
  className,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!context?.activeFile) {
    return null;
  }

  const file = context.activeFile;
  const hasSelection = Boolean(file.selectionRange && file.selectedContent);
  const hasDiagnostics = context.diagnostics &&
    (context.diagnostics.errors > 0 || context.diagnostics.warnings > 0);

  // Compact view
  if (!isExpanded) {
    return (
      <div className={clsx(
        'flex items-center gap-2 px-3 py-1.5 bg-[var(--vscode-editor-background)]/50 rounded-lg border border-[var(--vscode-panel-border)]',
        className
      )}>
        <div className="flex items-center gap-1.5 min-w-0">
          {getLanguageIcon(file.language.id)}
          <span className="text-sm truncate max-w-[150px]" title={file.relativePath}>
            {file.fileName}
          </span>
          {file.isDirty && (
            <span className="w-2 h-2 rounded-full bg-[var(--vscode-editorWarning-foreground)]" title="Unsaved changes" />
          )}
        </div>

        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          {hasSelection
            ? `L${file.selectionRange!.startLine}-${file.selectionRange!.endLine}`
            : `L${file.cursorLine}:${file.cursorColumn}`}
        </span>

        {file.currentSymbol && (
          <span className="text-xs text-[var(--vscode-textLink-foreground)] truncate max-w-[100px]">
            @{file.currentSymbol}
          </span>
        )}

        {context.diagnostics && <DiagnosticBadge diagnostics={context.diagnostics} />}

        <div className="flex items-center gap-0.5 ml-auto">
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
              title="Expand context"
            >
              <ChevronDown size={14} />
            </button>
          )}
          {onRemoveContext && (
            <button
              onClick={onRemoveContext}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded text-[var(--vscode-descriptionForeground)]"
              title="Remove context"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded view
  return (
    <div className={clsx(
      'bg-[var(--vscode-editor-background)]/50 rounded-lg border border-[var(--vscode-panel-border)] overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2 min-w-0">
          {getLanguageIcon(file.language.id)}
          <span className="font-medium text-sm truncate" title={file.relativePath}>
            {file.relativePath}
          </span>
          {file.isDirty && (
            <span className="text-xs text-[var(--vscode-editorWarning-foreground)]">&#9679;</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {context.diagnostics && <DiagnosticBadge diagnostics={context.diagnostics} />}

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
          >
            {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
              title="Collapse"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[var(--vscode-descriptionForeground)]">
            {hasSelection
              ? `Selection: Lines ${file.selectionRange!.startLine}-${file.selectionRange!.endLine}`
              : `Cursor: Line ${file.cursorLine}, Column ${file.cursorColumn}`}
          </span>

          {file.symbolPath && file.symbolPath.length > 0 && (
            <SymbolPath symbolPath={file.symbolPath} />
          )}
        </div>

        {hasSelection && file.selectedContent && (
          <SelectionPreview
            content={file.selectedContent}
            startLine={file.selectionRange!.startLine}
            endLine={file.selectionRange!.endLine}
            onCopy={() => copyToClipboard(file.selectedContent!)}
          />
        )}

        {showDetails && hasDiagnostics && (
          <div className="mt-2 space-y-1">
            <div className="text-xs font-medium text-[var(--vscode-descriptionForeground)]">
              Issues
            </div>
            {context.diagnostics!.topIssues.slice(0, 3).map((issue, i) => (
              <div
                key={i}
                className={clsx(
                  'flex items-start gap-2 px-2 py-1 rounded text-xs',
                  issue.severity === 'error' && 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.1))] text-[var(--ina-status-error,#f87171)]',
                  issue.severity === 'warning' && 'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))] text-[var(--ina-status-warning,#facc15)]',
                  issue.severity === 'hint' && 'bg-[var(--ina-status-info-bg,rgba(59,130,246,0.1))] text-[var(--ina-status-info,#60a5fa)]'
                )}
              >
                {issue.severity === 'error' && <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
                {issue.severity === 'warning' && <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />}
                {issue.severity === 'hint' && <Info size={12} className="mt-0.5 flex-shrink-0" />}
                <span className="flex-1">{issue.message}</span>
                <span className="text-[var(--vscode-descriptionForeground)]">L{issue.line}</span>
              </div>
            ))}
          </div>
        )}

        {showDetails && (
          <div className="flex items-center gap-4 text-xs text-[var(--vscode-descriptionForeground)] pt-1">
            <span>{file.language.name}</span>
            <span>{file.lineCount} lines</span>
            {context.workspace && <span>{context.workspace.name}</span>}
          </div>
        )}
      </div>
    </div>
  );
});

ContextDisplay.displayName = 'ContextDisplay';

// ============ Context Badge (Mini version for messages) ============

export const ContextBadge: React.FC<{
  context: {
    file?: string;
    language?: string;
    selection?: { startLine: number; endLine: number };
  };
  onClick?: () => void;
}> = memo(({ context, onClick }) => {
  if (!context.file) { return null; }

  const fileName = context.file.split('/').pop() || context.file;

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded text-xs hover:opacity-80 transition-opacity"
    >
      <Link2 size={10} />
      <span className="truncate max-w-[100px]">{fileName}</span>
      {context.selection && (
        <span className="opacity-70">
          :{context.selection.startLine}-{context.selection.endLine}
        </span>
      )}
    </button>
  );
});

ContextBadge.displayName = 'ContextBadge';

export default ContextDisplay;
