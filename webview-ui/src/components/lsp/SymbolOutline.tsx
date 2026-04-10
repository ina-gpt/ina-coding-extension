import React, { useState } from 'react';

interface SymbolInfo {
  name: string;
  kindLabel: string;
  detail: string | null;
  filePath: string;
  range: { startLine: number };
  children: SymbolInfo[] | null;
}

interface SymbolOutlineProps {
  symbols: SymbolInfo[];
  onNavigate: (filePath: string, line: number) => void;
  onExplain: (symbolName: string) => void;
}

const SYMBOL_ICONS: Record<string, string> = {
  class: 'C', interface: 'I', function: 'F', method: 'M', property: 'P',
  variable: 'V', const: 'K', enum: 'E', module: 'N', constructor: 'T',
  field: 'F', 'enum-member': 'e', struct: 'S', 'type-param': 'T',
};

const SymbolNode: React.FC<{ symbol: SymbolInfo; depth: number; onNavigate: (filePath: string, line: number) => void; onExplain: (name: string) => void; filter: string }> = ({ symbol, depth, onNavigate, onExplain, filter }) => {
  const [expanded, setExpanded] = useState(depth < 2);

  if (filter && !symbol.name.toLowerCase().includes(filter.toLowerCase())) {
    const hasMatchingChild = symbol.children?.some(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    if (!hasMatchingChild) return null;
  }

  const icon = SYMBOL_ICONS[symbol.kindLabel] || '?';
  const hasChildren = symbol.children && symbol.children.length > 0;

  return (
    <div>
      <div className="lsp-symbol-node" style={{ paddingLeft: `${depth * 16 + 4}px` }} onClick={() => onNavigate(symbol.filePath, symbol.range.startLine)}>
        {hasChildren && (
          <span className="lsp-symbol-toggle" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? '▼' : '▶'}
          </span>
        )}
        <span className="lsp-symbol-icon" data-kind={symbol.kindLabel}>{icon}</span>
        <span className="lsp-symbol-name">{symbol.name}</span>
        {symbol.detail && <span className="lsp-symbol-type">{symbol.detail}</span>}
      </div>
      {expanded && hasChildren && symbol.children!.map((child, i) => (
        <SymbolNode key={i} symbol={child} depth={depth + 1} onNavigate={onNavigate} onExplain={onExplain} filter={filter} />
      ))}
    </div>
  );
};

export const SymbolOutline: React.FC<SymbolOutlineProps> = ({ symbols, onNavigate, onExplain }) => {
  const [filter, setFilter] = useState('');

  return (
    <div className="lsp-symbol-outline">
      <input type="text" className="lsp-filter-input" placeholder="Filter symbols..." value={filter} onChange={e => setFilter(e.target.value)} />
      <div className="lsp-symbol-tree">
        {symbols.map((sym, i) => (
          <SymbolNode key={i} symbol={sym} depth={0} onNavigate={onNavigate} onExplain={onExplain} filter={filter} />
        ))}
      </div>
    </div>
  );
};
