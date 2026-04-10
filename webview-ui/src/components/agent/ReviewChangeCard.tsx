import React from 'react';
import ReviewDiffView from './ReviewDiffView';

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

interface ChangeData {
  id: string;
  filePath: string;
  operation: 'create' | 'edit' | 'delete' | 'rename' | string;
  status: 'pending' | 'accepted' | 'rejected';
  accepted: boolean | null;
  diff: DiffData | null;
  hunks: DiffHunk[];
  metadata?: {
    language?: string;
    risk?: 'low' | 'medium' | 'high';
    riskReason?: string;
  };
}

interface ReviewChangeCardProps {
  change: ChangeData;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onToggle: (id: string) => void;
  onShowDiff: (id: string) => void;
  onUndo: (id: string) => void;
  onAcceptHunk: (id: string) => void;
  onRejectHunk: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}

const OP_ICONS: Record<string, { icon: string; color: string }> = {
  create: { icon: '+', color: 'var(--vscode-testing-iconPassed)' },
  edit: { icon: '~', color: 'var(--vscode-textLink-foreground)' },
  delete: { icon: '−', color: 'var(--vscode-testing-iconFailed)' },
  rename: { icon: '→', color: 'var(--vscode-editorWarning-foreground)' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--vscode-descriptionForeground)',
  accepted: 'var(--vscode-testing-iconPassed)',
  rejected: 'var(--vscode-testing-iconFailed)',
};

const RISK_COLORS: Record<string, string> = {
  low: 'var(--vscode-testing-iconPassed)',
  medium: 'var(--vscode-editorWarning-foreground)',
  high: 'var(--vscode-testing-iconFailed)',
};

const ReviewChangeCard: React.FC<ReviewChangeCardProps> = ({
  change,
  onAccept,
  onReject,
  onToggle,
  onShowDiff,
  onUndo,
  onAcceptHunk,
  onRejectHunk,
  isExpanded,
  onToggleExpand,
}) => {
  const opStyle = OP_ICONS[change.operation] || { icon: '?', color: 'var(--vscode-descriptionForeground)' };
  const borderColor = STATUS_COLORS[change.status] || 'var(--vscode-panel-border)';

  const dir = change.filePath.includes('/')
    ? change.filePath.substring(0, change.filePath.lastIndexOf('/') + 1)
    : '';
  const filename = change.filePath.includes('/')
    ? change.filePath.substring(change.filePath.lastIndexOf('/') + 1)
    : change.filePath;

  const renderCheckbox = () => {
    if (change.accepted === true) {
      return (
        <span style={{
          width: '18px', height: '18px', borderRadius: '50%', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
          backgroundColor: 'var(--vscode-testing-iconPassed)', color: '#fff', cursor: 'pointer',
          flexShrink: 0,
        }} onClick={() => onToggle(change.id)}>&#10003;</span>
      );
    }
    if (change.accepted === false) {
      return (
        <span style={{
          width: '18px', height: '18px', borderRadius: '50%', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
          backgroundColor: 'var(--vscode-testing-iconFailed)', color: '#fff', cursor: 'pointer',
          flexShrink: 0,
        }} onClick={() => onToggle(change.id)}>&#10005;</span>
      );
    }
    return (
      <span style={{
        width: '18px', height: '18px', borderRadius: '50%', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        border: '2px solid var(--vscode-descriptionForeground)', cursor: 'pointer',
        flexShrink: 0,
      }} onClick={() => onToggle(change.id)} />
    );
  };

  const language = change.metadata?.language || change.diff?.fileType || null;

  return (
    <div style={{
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: '4px', marginBottom: '4px', fontSize: '12px',
      backgroundColor: 'var(--vscode-editor-background)',
      border: `1px solid var(--vscode-panel-border)`,
      borderLeftWidth: '3px', borderLeftColor: borderColor,
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 8px', cursor: 'pointer',
        }}
        onClick={() => onToggleExpand(change.id)}
      >
        {renderCheckbox()}
        <span style={{
          color: opStyle.color, fontWeight: 700, fontFamily: 'monospace',
          width: '16px', textAlign: 'center', flexShrink: 0,
        }}>{opStyle.icon}</span>

        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--vscode-foreground)' }}>{filename}</span>
          <span style={{ color: 'var(--vscode-descriptionForeground)', marginLeft: '4px' }}>{dir}</span>
        </span>

        {change.operation === 'create' && (
          <span style={{
            fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
            backgroundColor: 'rgba(35, 134, 54, 0.2)', color: 'var(--vscode-testing-iconPassed)',
            fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
          }}>NEW FILE</span>
        )}
        {change.operation === 'delete' && (
          <span style={{
            fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
            backgroundColor: 'rgba(218, 54, 51, 0.2)', color: 'var(--vscode-testing-iconFailed)',
            fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
          }}>DELETED</span>
        )}

        {change.diff && (
          <span style={{ fontSize: '10px', fontFamily: 'monospace', flexShrink: 0 }}>
            <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>+{change.diff.stats.additions}</span>
            {'/'}
            <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>-{change.diff.stats.deletions}</span>
          </span>
        )}

        {language && (
          <span style={{
            fontSize: '9px', padding: '1px 5px', borderRadius: '8px',
            backgroundColor: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
            flexShrink: 0,
          }}>{language}</span>
        )}

        {change.metadata?.risk && (
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: RISK_COLORS[change.metadata.risk],
            flexShrink: 0,
          }} title={`Risk: ${change.metadata.risk}${change.metadata.riskReason ? ' - ' + change.metadata.riskReason : ''}`} />
        )}

        <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '10px', flexShrink: 0 }}>
          {isExpanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Action buttons row */}
      <div style={{
        display: 'flex', gap: '4px', padding: '2px 8px 6px 42px',
      }}>
        <button onClick={() => onShowDiff(change.id)} style={{
          padding: '2px 8px', fontSize: '10px',
          backgroundColor: 'var(--vscode-button-secondaryBackground)',
          color: 'var(--vscode-button-secondaryForeground)',
          border: 'none', borderRadius: '3px', cursor: 'pointer',
        }}>Diff</button>
        <button onClick={() => onAccept(change.id)} style={{
          padding: '2px 8px', fontSize: '10px',
          backgroundColor: 'var(--vscode-testing-iconPassed)', color: '#fff',
          border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 600,
        }}>Accept</button>
        <button onClick={() => onReject(change.id)} style={{
          padding: '2px 8px', fontSize: '10px',
          backgroundColor: 'transparent', color: 'var(--vscode-testing-iconFailed)',
          border: '1px solid var(--vscode-testing-iconFailed)',
          borderRadius: '3px', cursor: 'pointer', fontWeight: 600,
        }}>Reject</button>
        {change.status !== 'pending' && (
          <button onClick={() => onUndo(change.id)} style={{
            padding: '2px 8px', fontSize: '10px',
            backgroundColor: 'transparent', color: 'var(--vscode-editorWarning-foreground)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '3px', cursor: 'pointer',
          }}>Undo</button>
        )}
      </div>

      {/* Expanded diff */}
      {isExpanded && change.diff && (
        <div style={{ padding: '0 8px 8px 8px' }}>
          <ReviewDiffView
            diff={change.diff}
            hunks={change.hunks}
            language={language}
            onAcceptHunk={onAcceptHunk}
            onRejectHunk={onRejectHunk}
          />
        </div>
      )}
    </div>
  );
};

export default ReviewChangeCard;
