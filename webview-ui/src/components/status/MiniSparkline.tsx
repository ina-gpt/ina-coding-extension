import React from 'react';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDot?: boolean;
}

export function MiniSparkline({ data, width = 60, height = 16, color = 'var(--ina-accent-primary, #3b82f6)', showDot = true }: MiniSparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  const lastX = width;
  const lastY = height - ((data[data.length - 1] - min) / range) * (height - 2) - 1;

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {showDot && <circle cx={lastX} cy={lastY} r="2" fill={color} />}
    </svg>
  );
}
