import React, { useState, useEffect, useCallback, memo } from 'react';
import { Copy, Check, Play, FileEdit, FilePlus, FileCode, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { highlighterService } from '@/services/highlighter';
import { copyToClipboard, postMessage } from '@/utils/vscode';
import clsx from 'clsx';

// SECURITY: Sanitize Shiki output — allow only safe tags/attrs for code highlighting
const PURIFY_ALLOWED_TAGS = ['span', 'code', 'pre', 'div', 'br'];
const PURIFY_FORBIDDEN_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'img', 'svg', 'math', 'link', 'style'];
const PURIFY_FORBIDDEN_ATTR = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur'];

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  maxHeight?: number;
}

const ActionBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }> = memo(
  ({ icon, label, onClick, active }) => (
    <button onClick={onClick} title={label} className={clsx('p-1.5 rounded transition-colors', active ? 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))] text-[var(--ina-status-success,#4ade80)]' : 'hover:bg-[var(--vscode-toolbar-hoverBackground)]')}>
      {icon}
    </button>
  )
);
ActionBtn.displayName = 'ActionBtn';

const LineNumbers: React.FC<{ count: number }> = memo(({ count }) => (
  <div className="select-none pr-4 text-right text-[var(--vscode-editorLineNumber-foreground)] text-xs leading-relaxed opacity-60">
    {Array.from({ length: count }, (_, i) => <div key={i} className="h-[1.5em]">{i + 1}</div>)}
  </div>
));
LineNumbers.displayName = 'LineNumbers';

export const CodeBlock: React.FC<CodeBlockProps> = memo(({ code, language = 'plaintext', filename, showLineNumbers = true, maxHeight = 400 }) => {
  const [html, setHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justApplied, setJustApplied] = useState(false);

  const lines = code.split('\n');
  const lineCount = lines.length;

  useEffect(() => { if (lineCount > 50) { setCollapsed(true); } }, [lineCount]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    highlighterService.highlight(code, language).then(r => {
      if (mounted) {
        // SECURITY: Sanitize Shiki HTML output before rendering
        const sanitized = DOMPurify.sanitize(r.html, {
          ALLOWED_TAGS: PURIFY_ALLOWED_TAGS,
          ALLOWED_ATTR: ['class', 'style'],
          ALLOW_DATA_ATTR: false,
          FORBID_TAGS: PURIFY_FORBIDDEN_TAGS,
          FORBID_ATTR: PURIFY_FORBIDDEN_ATTR,
        });
        setHtml(sanitized);
        setLoading(false);
      }
    }).catch(() => { if (mounted) { setLoading(false); } });
    return () => { mounted = false; };
  }, [code, language]);

  const handleCopy = useCallback(() => { copyToClipboard(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [code]);
  const handleInsert = useCallback(() => { postMessage({ type: 'insertCode', code }); }, [code]);
  const handleApply = useCallback(() => {
    postMessage({ type: 'applyCode' as never, code, language, filename });
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 2000);
  }, [code, language, filename]);
  const handleCreate = useCallback(() => { postMessage({ type: 'createFileWithCode' as never, code, language, suggestedFilename: filename }); }, [code, language, filename]);
  const handleRun = useCallback(() => { postMessage({ type: 'executeInREPL' as never, code, language }); }, [code, language]);
  const isRunnable = ['javascript', 'typescript', 'python', 'ruby', 'go', 'rust', 'php'].includes((language || '').toLowerCase());

  const displayCode = collapsed ? lines.slice(0, 10).join('\n') + '\n...' : code;
  const displayLines = collapsed ? Math.min(lineCount, 11) : lineCount;

  return (
    <div className={clsx(
      'my-3 rounded-lg border overflow-hidden relative group',
      expanded && 'fixed inset-4 z-50 my-0',
      justApplied ? 'border-[var(--vscode-terminal-ansiGreen,#10b981)] bg-[rgba(16,185,129,0.06)]' : 'border-[var(--vscode-panel-border)]',
    )} style={justApplied ? { animation: 'ina-apply-flash 2s ease-out' } : undefined}>
      {expanded && <div className="fixed inset-0 bg-black/50 -z-10" onClick={() => setExpanded(false)} />}

      {/* Phase 28 — Quick accept button (visible on hover) */}
      <button
        onClick={handleApply}
        title="Code direkt anwenden"
        className="absolute top-2 right-2 z-10 px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--vscode-terminal-ansiGreen,#10b981)] text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none"
      >
        {justApplied ? '\u2713 Angewandt' : '\u2713 Anwenden'}
      </button>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <FileCode size={14} className="text-[var(--vscode-descriptionForeground)]" />
          <span className="text-xs font-medium text-[var(--vscode-descriptionForeground)] uppercase tracking-wide">{language || 'code'}</span>
          {filename && <span className="text-xs text-[var(--vscode-textLink-foreground)]">{filename}</span>}
          <span className="text-xs text-[var(--vscode-descriptionForeground)] opacity-60">{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-0.5">
          {lineCount > 10 && <ActionBtn icon={collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />} label={collapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed(!collapsed)} />}
          <ActionBtn icon={expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />} label={expanded ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => setExpanded(!expanded)} />
          <div className="w-px h-4 bg-[var(--vscode-panel-border)] mx-1" />
          {isRunnable && <ActionBtn icon={<Play size={14} />} label="Run in REPL" onClick={handleRun} />}
          <ActionBtn icon={<FileEdit size={14} />} label="Insert at cursor" onClick={handleInsert} />
          <ActionBtn icon={<FileEdit size={14} />} label="Apply to file" onClick={handleApply} />
          <ActionBtn icon={<FilePlus size={14} />} label="Create new file" onClick={handleCreate} />
          <ActionBtn icon={copied ? <Check size={14} /> : <Copy size={14} />} label={copied ? 'Copied!' : 'Copy'} onClick={handleCopy} active={copied} />
        </div>
      </div>

      {/* Code */}
      <div className={clsx('overflow-auto bg-[var(--vscode-textCodeBlock-background)]', !expanded && `max-h-[${maxHeight}px]`)} style={!expanded ? { maxHeight } : undefined}>
        <div className="flex p-3 text-sm font-mono leading-relaxed">
          {showLineNumbers && <LineNumbers count={displayLines} />}
          <div className="flex-1 overflow-x-auto">
            {loading ? <pre className="whitespace-pre"><code>{displayCode}</code></pre>
              : <div className="shiki-wrapper [&_.shiki]:!bg-transparent [&_pre]:!bg-transparent [&_code]:!bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />}
          </div>
        </div>
      </div>

      {collapsed && lineCount > 10 && (
        <button onClick={() => setCollapsed(false)} className="w-full py-2 text-xs text-center text-[var(--vscode-textLink-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors border-t border-[var(--vscode-panel-border)]">
          Show {lineCount - 10} more lines
        </button>
      )}
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';

export const InlineCode: React.FC<{ children: React.ReactNode }> = memo(({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[0.9em] font-mono">{children}</code>
));
InlineCode.displayName = 'InlineCode';
