import React from 'react';

interface CacheBar {
  name: string;
  hitRate: number;
  size: number;
  maxSize: number;
}

interface Props {
  caches: CacheBar[];
}

const hitRateColor = (rate: number) => {
  if (rate >= 0.8) return '#22c55e';
  if (rate >= 0.5) return '#eab308';
  return '#ef4444';
};

const capacityColor = (ratio: number) => {
  if (ratio >= 0.9) return '#ef4444';
  if (ratio >= 0.7) return '#eab308';
  return '#3b82f6';
};

export const CacheHitRateChart: React.FC<Props> = ({ caches }) => (
  <div className="flex flex-col gap-1.5">
    {caches.map(c => {
      const capRatio = c.maxSize > 0 ? c.size / c.maxSize : 0;
      return (
        <div key={c.name} className="flex items-center gap-2">
          <span className="text-[10px] w-24 truncate text-right text-[var(--vscode-descriptionForeground)]">{c.name}</span>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="h-2 rounded-full bg-[var(--vscode-editor-background)] overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(c.hitRate * 100)}%`, backgroundColor: hitRateColor(c.hitRate) }} />
            </div>
            <div className="h-1 rounded-full bg-[var(--vscode-editor-background)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round(capRatio * 100)}%`, backgroundColor: capacityColor(capRatio) }} />
            </div>
          </div>
          <span className="text-[10px] w-10 text-right" style={{ color: hitRateColor(c.hitRate) }}>{Math.round(c.hitRate * 100)}%</span>
        </div>
      );
    })}
  </div>
);
