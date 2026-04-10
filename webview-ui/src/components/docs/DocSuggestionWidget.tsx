import React, { useEffect, useState } from 'react';

interface DocSuggestion {
  source: string;
  title: string;
  url: string | null;
  relevance: number;
  reason: string;
  snippet: string;
}

interface DocSuggestionWidgetProps {
  suggestions: DocSuggestion[];
  onDismiss: () => void;
  onInsert: (suggestion: DocSuggestion) => void;
  onViewMore: () => void;
}

export const DocSuggestionWidget: React.FC<DocSuggestionWidgetProps> = ({ suggestions, onDismiss, onInsert, onViewMore }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 30000);
    return () => clearTimeout(timer);
  }, [suggestions]);

  useEffect(() => {
    setVisible(true);
  }, [suggestions]);

  if (!visible || suggestions.length === 0) return null;

  const topSuggestions = suggestions.slice(0, 2);

  return (
    <div className="doc-suggestion-widget">
      <div className="doc-suggestion-header">
        <span className="doc-suggestion-icon">$(book)</span>
        <span className="doc-suggestion-label">Documentation suggestions</span>
        <button className="doc-suggestion-dismiss" onClick={() => { setVisible(false); onDismiss(); }} title="Dismiss">x</button>
      </div>

      <div className="doc-suggestion-list">
        {topSuggestions.map((suggestion, i) => (
          <div
            key={i}
            className="doc-suggestion-item"
            onClick={() => onInsert(suggestion)}
            title={suggestion.snippet}
          >
            <span className="doc-suggestion-source">{suggestion.source}:</span>
            <span className="doc-suggestion-title">{suggestion.title}</span>
          </div>
        ))}
      </div>

      {suggestions.length > 2 && (
        <button className="doc-suggestion-more" onClick={onViewMore}>
          View {suggestions.length - 2} more
        </button>
      )}
    </div>
  );
};
