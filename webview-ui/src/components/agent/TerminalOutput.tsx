import React, { useRef, useEffect, useState } from 'react';

interface TerminalOutputProps {
  lines: string[];
  isRunning: boolean;
  maxLines?: number;
}

const ANSI_MAP: Record<string, string> = {
  '31': 'var(--vscode-testing-iconFailed)',
  '32': 'var(--vscode-testing-iconPassed)',
  '33': 'var(--vscode-editorWarning-foreground)',
  '34': 'var(--vscode-textLink-foreground)',
  '36': 'var(--vscode-textLink-foreground)',
  '1': '',  // bold handled separately
};

function renderAnsiLine(line: string): React.ReactNode {
  // Simple ANSI color support
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  while (remaining.length > 0) {
    const match = remaining.match(/\x1b\[(\d+)m/);
    if (!match || match.index === undefined) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (match.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, match.index)}</span>);
    }
    const code = match[1];
    const color = ANSI_MAP[code];
    const endMatch = remaining.slice(match.index + match[0].length).match(/\x1b\[0?m/);
    if (endMatch && endMatch.index !== undefined) {
      const text = remaining.slice(match.index + match[0].length, match.index + match[0].length + endMatch.index);
      parts.push(<span key={key++} style={{ color: color || undefined, fontWeight: code === '1' ? 700 : undefined }}>{text}</span>);
      remaining = remaining.slice(match.index + match[0].length + endMatch.index + endMatch[0].length);
    } else {
      remaining = remaining.slice(match.index + match[0].length);
    }
  }

  return parts.length > 0 ? parts : line;
}

const TerminalOutput: React.FC<TerminalOutputProps> = ({ lines, isRunning, maxLines = 500 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const displayLines = lines.slice(-maxLines);
  const hasMore = lines.length > maxLines;

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines.length, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          backgroundColor: 'var(--vscode-terminal-background, #1e1e1e)',
          color: 'var(--vscode-terminal-foreground, #cccccc)',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: '11px',
          lineHeight: '1.5',
          padding: '8px',
          borderRadius: '4px',
          maxHeight: '300px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {hasMore && (
          <div style={{ color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic', marginBottom: '4px' }}>
            ... {lines.length - maxLines} earlier lines hidden
          </div>
        )}
        {displayLines.map((line, i) => (
          <div key={i} style={{
            backgroundColor: /error/i.test(line) && !/0 error/i.test(line) ? 'rgba(200,0,0,0.08)' : /warning/i.test(line) ? 'rgba(200,150,0,0.06)' : undefined,
            padding: '0 2px',
          }}>
            {renderAnsiLine(line)}
          </div>
        ))}
        {isRunning && (
          <span style={{ color: 'var(--vscode-terminal-ansiGreen, #4ec9b0)', animation: 'blink 1s step-end infinite' }}>▌</span>
        )}
      </div>
      {!autoScroll && isRunning && (
        <button
          onClick={() => { setAutoScroll(true); if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight; }}
          style={{ position: 'absolute', bottom: '8px', right: '8px', padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '3px', cursor: 'pointer', opacity: 0.8 }}
        >
          ↓ Auto-scroll
        </button>
      )}
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
};

export default TerminalOutput;
