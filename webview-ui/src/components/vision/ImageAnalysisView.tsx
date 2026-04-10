import React, { useState } from 'react';

interface VisionAnalysis {
  description: string;
  elements: { type: string; label: string | null }[];
  colors: string[];
  layout: string;
  textContent: string[];
  codeSnippets: string[];
  suggestions: string[];
}

interface ImageAnalysisViewProps {
  analysis: VisionAnalysis;
  onConvertToCode?: () => void;
}

export const ImageAnalysisView: React.FC<ImageAnalysisViewProps> = ({ analysis, onConvertToCode }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ description: true });

  const toggle = (section: string) => setExpanded(prev => ({ ...prev, [section]: !prev[section] }));

  return (
    <div className="vision-analysis">
      <div className="va-section">
        <div className="va-section-header" onClick={() => toggle('description')}>
          <span>{expanded.description ? '▼' : '▶'} Description</span>
        </div>
        {expanded.description && <div className="va-section-body">{analysis.description}</div>}
      </div>

      {analysis.elements.length > 0 && (
        <div className="va-section">
          <div className="va-section-header" onClick={() => toggle('elements')}>
            <span>{expanded.elements ? '▼' : '▶'} Elements ({analysis.elements.length})</span>
          </div>
          {expanded.elements && (
            <div className="va-section-body">
              {analysis.elements.map((el, i) => (
                <span key={i} className="va-element-badge">{el.type}{el.label ? `: ${el.label}` : ''}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {analysis.colors.length > 0 && (
        <div className="va-section">
          <div className="va-section-header" onClick={() => toggle('colors')}>
            <span>{expanded.colors ? '▼' : '▶'} Colors</span>
          </div>
          {expanded.colors && (
            <div className="va-color-swatches">
              {analysis.colors.map((c, i) => (
                <span key={i} className="va-color-swatch" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {analysis.textContent.length > 0 && (
        <div className="va-section">
          <div className="va-section-header" onClick={() => toggle('text')}>
            <span>{expanded.text ? '▼' : '▶'} Text Content</span>
          </div>
          {expanded.text && <div className="va-section-body">{analysis.textContent.join(', ')}</div>}
        </div>
      )}

      {analysis.suggestions.length > 0 && (
        <div className="va-section">
          <div className="va-section-header" onClick={() => toggle('suggestions')}>
            <span>{expanded.suggestions ? '▼' : '▶'} Suggestions</span>
          </div>
          {expanded.suggestions && <ul className="va-suggestions">{analysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>}
        </div>
      )}

      {onConvertToCode && <button className="va-convert-btn" onClick={onConvertToCode}>Convert to Code</button>}
    </div>
  );
};
