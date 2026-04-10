import React, { useState } from 'react';
import FileOpItem from './FileOpItem';
import ImportUpdatesSummary from './ImportUpdatesSummary';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import type { FileOpEntryView, FileOpResultView } from './FileOpItem';

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--vscode-descriptionForeground)',
  executing: 'var(--vscode-progressBar-background)',
  completed: 'var(--vscode-testing-iconPassed)',
  partial: 'var(--vscode-editorWarning-foreground)',
  failed: 'var(--vscode-testing-iconFailed)',
  rolledBack: 'var(--vscode-editorWarning-foreground)',
};

const FileOpsPanel: React.FC = () => {
  const fileOpBatch = useChatStore(s => s.fileOpBatch);
  const fileConflicts = useChatStore(s => s.fileConflicts);
  const importUpdates = useChatStore(s => s.importUpdates);
  const postValidation = useChatStore(s => s.postValidation);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);

  if (!fileOpBatch) return null;

  const ops = fileOpBatch.operations || [];
  const results = fileOpBatch.results || [];
  const resultMap = new Map<string, FileOpResultView>();
  for (const r of results) { resultMap.set(r.id, r as unknown as FileOpResultView); }

  const completedCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  const statusColor = STATUS_COLORS[fileOpBatch.status] || STATUS_COLORS.pending;

  // Group by operation type
  const created = ops.filter(o => o.operation === 'create' || o.operation === 'create_folder');
  const modified = ops.filter(o => ['edit', 'patch', 'append', 'prepend', 'insert_at', 'replace_range'].includes(o.operation));
  const renamed = ops.filter(o => o.operation === 'rename' || o.operation === 'move' || o.operation === 'copy');
  const deleted = ops.filter(o => o.operation === 'delete');

  const handleOpen = (path: string) => postMessage({ type: 'openFile', path } as any);
  const handleDiff = (opId: string) => postMessage({ type: 'viewFileDiff', operationId: opId } as any);
  const handleRevert = (opId: string) => postMessage({ type: 'revertOperation', operationId: opId } as any);
  const handleRevertAll = () => { postMessage({ type: 'revertAllOps' } as any); setShowRevertConfirm(false); };

  const renderGroup = (title: string, icon: string, groupOps: typeof ops) => {
    if (groupOps.length === 0) return null;
    return (
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vscode-descriptionForeground)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>{icon}</span> {title} ({groupOps.length})
        </div>
        {groupOps.map(op => (
          <FileOpItem
            key={op.id}
            op={op as unknown as FileOpEntryView}
            result={resultMap.get(op.id) || null}
            onOpen={() => handleOpen(op.sourcePath)}
            onDiff={() => handleDiff(op.id)}
            onRevert={() => handleRevert(op.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', overflow: 'hidden', margin: '8px 0' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', backgroundColor: 'var(--vscode-sideBarSectionHeader-background)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>📂</span>
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--vscode-foreground)' }}>File Operations</span>
          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: statusColor, color: '#fff', opacity: 0.9 }}>{fileOpBatch.status}</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          {completedCount}/{ops.length} done{failedCount > 0 ? ` · ${failedCount} failed` : ''}
        </span>
      </div>

      <div style={{ padding: '8px 12px' }}>
        {/* Conflicts */}
        {fileConflicts.length > 0 && (
          <div style={{ marginBottom: '8px', padding: '6px 8px', backgroundColor: 'rgba(200,150,0,0.1)', borderRadius: '4px', borderLeft: '3px solid var(--vscode-editorWarning-foreground)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vscode-editorWarning-foreground)', marginBottom: '4px' }}>
              ⚠️ {fileConflicts.length} conflict{fileConflicts.length !== 1 ? 's' : ''} detected
            </div>
            {fileConflicts.map((c, i) => (
              <div key={i} style={{ fontSize: '11px', color: 'var(--vscode-foreground)', padding: '2px 0' }}>
                • {c.description}
              </div>
            ))}
          </div>
        )}

        {/* Operation groups */}
        {renderGroup('Created', '+', created)}
        {renderGroup('Modified', '~', modified)}
        {renderGroup('Renamed / Moved', '→', renamed)}
        {renderGroup('Deleted', '−', deleted)}

        {/* Import updates */}
        {importUpdates.length > 0 && <ImportUpdatesSummary updates={importUpdates} />}

        {/* Post-execution validation */}
        {postValidation && (
          <div style={{ marginTop: '8px', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: postValidation.brokenImports.length > 0 ? 'rgba(200,0,0,0.1)' : 'rgba(0,180,0,0.1)' }}>
            {postValidation.brokenImports.length === 0 ? (
              <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>✓ All imports valid</span>
            ) : (
              <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>✗ {postValidation.brokenImports.length} broken import(s)</span>
            )}
            {postValidation.warnings.map((w, i) => (
              <div key={i} style={{ color: 'var(--vscode-editorWarning-foreground)', marginTop: '2px' }}>⚠ {w}</div>
            ))}
          </div>
        )}

        {/* Revert all button */}
        {fileOpBatch.status === 'completed' || fileOpBatch.status === 'partial' ? (
          <div style={{ marginTop: '8px' }}>
            {!showRevertConfirm ? (
              <button onClick={() => setShowRevertConfirm(true)} style={{ width: '100%', padding: '6px', fontSize: '11px', backgroundColor: 'transparent', color: 'var(--vscode-testing-iconFailed)', border: '1px solid var(--vscode-testing-iconFailed)', borderRadius: '4px', cursor: 'pointer' }}>
                Revert All Changes
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleRevertAll} style={{ flex: 1, padding: '6px', fontSize: '11px', backgroundColor: 'var(--vscode-testing-iconFailed)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Confirm Revert</button>
                <button onClick={() => setShowRevertConfirm(false)} style={{ padding: '6px 12px', fontSize: '11px', backgroundColor: 'transparent', color: 'var(--vscode-descriptionForeground)', border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default FileOpsPanel;
