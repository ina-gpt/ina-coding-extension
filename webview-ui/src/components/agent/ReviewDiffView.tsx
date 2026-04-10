import React, { useState, useCallback } from 'react';
import { postMessage } from '@/utils/vscode';

interface DiffHunk {
  id: string;
  content: string;
  accepted: boolean | null;
  startLineOld: number;
  startLineNew: number;
}

interface DiffData {
  unified: string;
  stats: { additions: number; deletions: number };
  hunks: DiffHunk[];
  fileType: string | null;
}

interface ReviewDiffViewProps {
  diff: DiffData;
  hunks: DiffHunk[];
  language: string | null;
  onAcceptHunk: (id: string) => void;
  onRejectHunk: (id: string) => void;
  maxLines?: number;
}

const ReviewDiffView: React.FC<ReviewDiffViewProps> = ({
  diff,
  hunks,
  language,
  onAcceptHunk,
  onRejectHunk,
  maxLines = 200,
}) => {
  const [showAll, setShowAll] = useState(false);

  const lines = diff.unified.split('\n');
  const displayLines = showAll ? lines : lines.slice(0, maxLines);
  const isTruncated = !showAll && lines.length > maxLines;

  const handleCopy = useCallback(() => {
    postMessage({ type: 'copyToClipboard', text: diff.unified });
  }, [diff.unified]);

  const getHunkStatus = (hunk: DiffHunk) => {
    if (hunk.accepted === true) return { label: 'Accepted', bg: 'var(--vscode-testing-iconPassed)', color: '#fff' };
    if (hunk.accepted === false) return { label: 'Rejected', bg: 'var(--vscode-testing-iconFailed)', color: '#fff' };
    return { label: 'Pending', bg: 'var(--vscode-descriptionForeground)', color: '#fff' };
  };

  const renderLine = (line: string, index: number) => {
    let bg = 'transparent';
    let color = 'var(--vscode-foreground)';
    let prefix = ' ';
    let oldNum: string | number = '';
    let newNum: string | number = '';

    if (line.startsWith('+') && !line.startsWith('+++')) {
      bg = 'rgba(35, 134, 54, 0.15)';
      color = 'var(--vscode-gitDecoration-addedResourceForeground)';
      prefix = '+';
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      bg = 'rgba(218, 54, 51, 0.15)';
      color = 'var(--vscode-gitDecoration-deletedResourceForeground)';
      prefix = '-';
    } else if (line.startsWith('@@')) {
      bg = 'rgba(0, 122, 204, 0.08)';
      color = 'var(--vscode-textLink-foreground)';
    }

    // Simple line numbering
    const globalIdx = index + 1;
    if (prefix === '+') {
      newNum = globalIdx;
    } else if (prefix === '-') {
      oldNum = globalIdx;
    } else if (!line.startsWith('@@') && !line.startsWith('---') && !line.startsWith('+++')) {
      oldNum = globalIdx;
      newNum = globalIdx;
    }

    return (
      <div
        key={index}
        style={{
          display: 'flex',
          backgroundColor: bg,
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: '12px',
          lineHeight: '20px',
          minHeight: '20px',
        }}
      >
        <span style={{
          width: '40px', textAlign: 'right', paddingRight: '4px',
          color: 'var(--vscode-editorLineNumber-foreground)', userSelect: 'none',
          borderRight: '1px solid var(--vscode-panel-border)', flexShrink: 0,
        }}>
          {oldNum}
        </span>
        <span style={{
          width: '40px', textAlign: 'right', paddingRight: '4px',
          color: 'var(--vscode-editorLineNumber-foreground)', userSelect: 'none',
          borderRight: '1px solid var(--vscode-panel-border)', flexShrink: 0,
        }}>
          {newNum}
        </span>
        <span style={{ paddingLeft: '8px', color, whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1 }}>
          {line}
        </span>
      </div>
    );
  };

  const renderHunkSeparator = (hunk: DiffHunk) => {
    const status = getHunkStatus(hunk);
    return (
      <div
        key={`hunk-sep-${hunk.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '4px 8px',
          backgroundColor: 'var(--vscode-textBlockQuote-background)',
          borderTop: '1px solid var(--vscode-panel-border)',
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        <span style={{
          fontFamily: 'monospace', fontSize: '11px',
          color: 'var(--vscode-textLink-foreground)', flex: 1,
        }}>
          @@ -{hunk.startLineOld} +{hunk.startLineNew} @@
        </span>
        <span style={{
          fontSize: '10px', padding: '1px 6px', borderRadius: '8px',
          backgroundColor: status.bg, color: status.color, fontWeight: 600,
        }}>
          {status.label}
        </span>
        <button
          onClick={() => onAcceptHunk(hunk.id)}
          style={{
            padding: '2px 8px', fontSize: '10px', border: 'none', borderRadius: '3px',
            backgroundColor: 'var(--vscode-testing-iconPassed)', color: '#fff',
            cursor: 'pointer', fontWeight: 600,
          }}
        >Accept</button>
        <button
          onClick={() => onRejectHunk(hunk.id)}
          style={{
            padding: '2px 8px', fontSize: '10px', borderRadius: '3px',
            backgroundColor: 'transparent', color: 'var(--vscode-testing-iconFailed)',
            border: '1px solid var(--vscode-testing-iconFailed)',
            cursor: 'pointer', fontWeight: 600,
          }}
        >Reject</button>
      </div>
    );
  };

  return (
    <div style={{
      border: '1px solid var(--vscode-panel-border)',
      borderRadius: '4px', overflow: 'hidden',
      backgroundColor: 'var(--vscode-editor-background)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '4px 8px',
        backgroundColor: 'var(--vscode-textBlockQuote-background)',
        borderBottom: '1px solid var(--vscode-panel-border)',
      }}>
        <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>
          <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>+{diff.stats.additions}</span>
          {' / '}
          <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>-{diff.stats.deletions}</span>
        </span>
        {language && (
          <span style={{
            fontSize: '10px', padding: '1px 6px', borderRadius: '8px',
            backgroundColor: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
          }}>{language}</span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={handleCopy}
          style={{
            padding: '2px 8px', fontSize: '10px', border: '1px solid var(--vscode-panel-border)',
            borderRadius: '3px', backgroundColor: 'transparent',
            color: 'var(--vscode-descriptionForeground)', cursor: 'pointer',
          }}
        >Copy</button>
      </div>

      {/* Hunk separators + diff lines */}
      <div style={{ overflow: 'auto', maxHeight: '600px' }}>
        {hunks.map((hunk) => renderHunkSeparator(hunk))}
        {displayLines.map((line, i) => renderLine(line, i))}
      </div>

      {isTruncated && (
        <div style={{
          padding: '6px', textAlign: 'center',
          borderTop: '1px solid var(--vscode-panel-border)',
          backgroundColor: 'var(--vscode-textBlockQuote-background)',
        }}>
          <button
            onClick={() => setShowAll(true)}
            style={{
              padding: '4px 12px', fontSize: '11px',
              backgroundColor: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              border: 'none', borderRadius: '3px', cursor: 'pointer',
            }}
          >
            Show all {lines.length} lines ({lines.length - maxLines} hidden)
          </button>
        </div>
      )}
    </div>
  );
};

export default ReviewDiffView;
