import React from 'react';

export interface RadarDimension {
  label: string;
  /** Value 0..100 */
  value: number;
}

interface ScoreRadarProps {
  dimensions: RadarDimension[];
  size?: number;
  strokeColor?: string;
  fillColor?: string;
}

/**
 * Minimal SVG radar chart. Takes 0..100 values on each axis and draws
 * the polygon in a single color — fits inside ~120×120.
 */
export const ScoreRadar: React.FC<ScoreRadarProps> = ({
  dimensions,
  size = 120,
  strokeColor = 'var(--ina-accent-primary, #4f46e5)',
  fillColor = 'rgba(79, 70, 229, 0.2)',
}) => {
  const n = dimensions.length;
  if (n < 3) {
    return (
      <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
        (need ≥ 3 dimensions for radar)
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 14;

  /** Convert (index, value 0..100) → (x, y) on the SVG. */
  const toPoint = (i: number, value: number): [number, number] => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (value / 100) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  /** Full-extent axis endpoint */
  const axisEnd = (i: number): [number, number] => toPoint(i, 100);

  // Background rings at 25/50/75/100 %
  const ringValues = [25, 50, 75, 100];

  // Data polygon
  const dataPoints = dimensions.map((d, i) => toPoint(i, Math.max(0, Math.min(100, d.value))));
  const dataPath =
    'M ' + dataPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ' Z';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Rings */}
      {ringValues.map((v) => {
        const ringPoints = Array.from({ length: n }, (_, i) => toPoint(i, v));
        const d =
          'M ' + ringPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ' Z';
        return (
          <path
            key={v}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Axes */}
      {dimensions.map((d, i) => {
        const [ex, ey] = axisEnd(i);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={ex}
            y2={ey}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Data polygon */}
      <path d={dataPath} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <circle key={`pt-${i}`} cx={x} cy={y} r={2} fill={strokeColor} />
      ))}

      {/* Labels — small text just outside each axis tip */}
      {dimensions.map((d, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const lx = cx + (radius + 8) * Math.cos(angle);
        const ly = cy + (radius + 8) * Math.sin(angle);
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        return (
          <text
            key={`label-${i}`}
            x={lx}
            y={ly + 3}
            fontSize={8}
            fill="currentColor"
            fillOpacity={0.7}
            textAnchor={anchor}
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
};

export default ScoreRadar;
