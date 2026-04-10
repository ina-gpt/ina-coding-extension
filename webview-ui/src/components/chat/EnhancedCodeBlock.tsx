import React, { useState, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { Copy, Check, ChevronDown, ChevronUp, FileDown, FilePlus, ClipboardPaste } from 'lucide-react';
import { postMessage } from '@/utils/vscode';

interface EnhancedCodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  tsx: '#3178c6',
  python: '#3776ab',
  rust: '#ce412b',
  go: '#00add8',
  javascript: '#f7df1e',
  jsx: '#f7df1e',
  java: '#b07219',
  ruby: '#cc342d',
  cpp: '#f34b7d',
  'c++': '#f34b7d',
  c: '#555555',
  csharp: '#178600',
  'c#': '#178600',
  php: '#4f5d95',
  swift: '#f05138',
  kotlin: '#a97bff',
  scala: '#c22d40',
  html: '#e34c26',
  css: '#1572b6',
  scss: '#c6538c',
  json: '#292929',
  yaml: '#cb171e',
  yml: '#cb171e',
  markdown: '#083fa1',
  sql: '#e38c00',
  shell: '#89e051',
  bash: '#89e051',
  sh: '#89e051',
  zsh: '#89e051',
  lua: '#000080',
  dart: '#00b4ab',
  zig: '#ec915c',
  elixir: '#6e4a7e',
  haskell: '#5e5086',
};

const COLLAPSE_THRESHOLD = 30;
const PREVIEW_LINES = 15;

const EnhancedCodeBlock: React.FC<EnhancedCodeBlockProps> = ({ code, language, filename }) => {
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines = code.split('\n');
  const isCollapsible = lines.length > COLLAPSE_THRESHOLD;
  const shouldCollapse = isCollapsible && !isExpanded;

  const displayedCode = shouldCollapse
    ? lines.slice(0, PREVIEW_LINES).join('\n')
    : code;
  const displayedLines = displayedCode.split('\n');
  const hiddenCount = lines.length - PREVIEW_LINES;

  const langKey = language.toLowerCase();
  const badgeColor = LANGUAGE_COLORS[langKey] || '#6b7280';
  const badgeTextColor =
    langKey === 'javascript' || langKey === 'jsx' || langKey === 'json'
      ? '#000'
      : '#fff';

  const handleCopy = useCallback(() => {
    postMessage({ type: 'copyToClipboard', text: code });
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleInsert = useCallback(() => {
    postMessage({ type: 'insertCode', code });
  }, [code]);

  const handleApply = useCallback(() => {
    postMessage({ type: 'applyCode', code, language, filename: filename ?? undefined });
  }, [code, language, filename]);

  const handleCreateFile = useCallback(() => {
    postMessage({ type: 'createFile', code, language, filename: filename ?? undefined });
  }, [code, language, filename]);

  return (
    <div
      className={clsx(
        'rounded-md overflow-hidden my-2',
        'border border-[var(--vscode-widget-border,transparent)]',
        'bg-[var(--vscode-editor-background)]'
      )}
    >
      {/* Header bar */}
      <div
        className={clsx(
          'flex items-center justify-between px-3 py-1.5',
          'bg-[var(--vscode-editorGroupHeader-tabsBackground)]',
          'border-b border-[var(--vscode-widget-border,transparent)]',
          'text-xs'
        )}
      >
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-[var(--vscode-foreground)] font-medium truncate max-w-[200px]">
              {filename}
            </span>
          )}
          {language && (
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none"
              style={{ backgroundColor: badgeColor, color: badgeTextColor }}
            >
              {language}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowLineNumbers((v) => !v)}
            title="Toggle line numbers"
            className={clsx(
              'px-1.5 py-0.5 rounded text-[10px]',
              'text-[var(--vscode-descriptionForeground)]',
              'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
              'transition-colors cursor-pointer',
              showLineNumbers && 'bg-[var(--vscode-toolbar-hoverBackground)]'
            )}
          >
            #
          </button>
          <ActionBtn
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            label={copied ? 'Copied!' : 'Copy'}
            onClick={handleCopy}
            active={copied}
          />
          <ActionBtn
            icon={<ClipboardPaste size={13} />}
            label="Insert"
            onClick={handleInsert}
          />
          <ActionBtn
            icon={<FileDown size={13} />}
            label="Apply"
            onClick={handleApply}
          />
          <ActionBtn
            icon={<FilePlus size={13} />}
            label="Create File"
            onClick={handleCreateFile}
          />
        </div>
      </div>

      {/* Code area */}
      <div className="overflow-x-auto">
        <pre className="m-0 p-3 text-xs leading-5">
          <code>
            {displayedLines.map((line, idx) => (
              <div key={idx} className="flex">
                {showLineNumbers && (
                  <span
                    className={clsx(
                      'select-none pr-4 text-right inline-block',
                      'text-[var(--vscode-editorLineNumber-foreground)]',
                      'min-w-[2.5em]'
                    )}
                  >
                    {idx + 1}
                  </span>
                )}
                <span className="flex-1 text-[var(--vscode-editor-foreground)]">
                  {line || '\u00a0'}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>

      {/* Collapse toggle */}
      {isCollapsible && (
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className={clsx(
            'w-full flex items-center justify-center gap-1',
            'py-1.5 text-xs',
            'text-[var(--vscode-textLink-foreground)]',
            'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
            'border-t border-[var(--vscode-widget-border,transparent)]',
            'transition-colors cursor-pointer'
          )}
        >
          {shouldCollapse ? (
            <>
              <ChevronDown size={14} />
              Show more ({hiddenCount} lines)
            </>
          ) : (
            <>
              <ChevronUp size={14} />
              Show less
            </>
          )}
        </button>
      )}
    </div>
  );
};

/* Small helper button used in the header bar */
interface ActionBtnProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}

const ActionBtn: React.FC<ActionBtnProps> = ({ icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={clsx(
      'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
      'text-[var(--vscode-descriptionForeground)]',
      'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
      'transition-colors cursor-pointer',
      active && 'text-[var(--vscode-textLink-foreground)]'
    )}
  >
    {icon}
    <span className="hidden md:inline">{label}</span>
  </button>
);

export default EnhancedCodeBlock;
