import React from 'react';
import { postMessage } from '../../utils/vscode';

interface Props {
  activeCount: number;
  queuedCount: number;
  isThrottled?: boolean;
}

export const RequestIndicator: React.FC<Props> = ({ activeCount, queuedCount, isThrottled }) => {
  if (activeCount === 0 && queuedCount === 0 && !isThrottled) return null;

  const handleClick = () => postMessage({ type: 'requestStatsRequest' } as any);

  return (
    <div onClick={handleClick} className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[10px]" title="Click for request stats">
      {activeCount > 0 && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-green)] animate-pulse" />
          <span>{activeCount} active</span>
        </>
      )}
      {isThrottled && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-yellow)]" />
          <span className="text-[var(--vscode-charts-yellow)]">throttled</span>
        </>
      )}
      {queuedCount > 0 && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-descriptionForeground)]" />
          <span>{queuedCount} queued</span>
        </>
      )}
    </div>
  );
};
