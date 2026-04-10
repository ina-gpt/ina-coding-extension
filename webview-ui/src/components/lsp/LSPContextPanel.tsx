import React, { useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { SymbolOutline } from './SymbolOutline';
import { DiagnosticsList } from './DiagnosticsList';
import { TypeInfoCard } from './TypeInfoCard';
import { postMessage } from '../../utils/vscode';

export const LSPContextPanel: React.FC = () => {
  const { lspContext, fileSymbols, fileDiagnostics, currentTypeInfo, callHierarchy } = useChatStore();

  useEffect(() => {
    postMessage({ type: 'requestLSPContext' } as any);
  }, []);

  const handleNavigate = (filePath: string, line: number) => {
    postMessage({ type: 'navigateToSymbol', filePath, line } as any);
  };

  const handleFixWithAI = (diagnostic: any) => {
    postMessage({ type: 'fixDiagnosticWithAI', diagnostic } as any);
  };

  const handleExplainSymbol = (symbolName: string) => {
    postMessage({ type: 'explainSymbol', symbolName } as any);
  };

  const handleExplainDiagnostic = (diagnostic: any) => {
    postMessage({ type: 'explainDiagnostic', diagnostic } as any);
  };

  return (
    <div className="lsp-panel">
      {/* Current Symbol */}
      {lspContext?.currentSymbol && (
        <div className="lsp-section">
          <div className="lsp-section-title">CURRENT SYMBOL</div>
          <div className="lsp-current-symbol">
            <span className="lsp-symbol-kind">{lspContext.currentSymbol.kindLabel}</span>
            <span className="lsp-symbol-name">{lspContext.currentSymbol.name}</span>
            {lspContext.currentSymbol.detail && <span className="lsp-symbol-detail">{lspContext.currentSymbol.detail}</span>}
          </div>
          {currentTypeInfo && <TypeInfoCard typeInfo={currentTypeInfo} onGoToDefinition={() => handleNavigate(currentTypeInfo.filePath, currentTypeInfo.line)} />}
        </div>
      )}

      {/* File Outline */}
      {fileSymbols.length > 0 && (
        <div className="lsp-section">
          <div className="lsp-section-title">FILE OUTLINE ({fileSymbols.length})</div>
          <SymbolOutline symbols={fileSymbols} onNavigate={handleNavigate} onExplain={handleExplainSymbol} />
        </div>
      )}

      {/* Diagnostics */}
      {fileDiagnostics.length > 0 && (
        <div className="lsp-section">
          <div className="lsp-section-title">DIAGNOSTICS</div>
          <DiagnosticsList diagnostics={fileDiagnostics} onNavigate={handleNavigate} onFixWithAI={handleFixWithAI} onExplain={handleExplainDiagnostic} />
        </div>
      )}

      {/* Call Hierarchy */}
      {callHierarchy && (
        <div className="lsp-section">
          <div className="lsp-section-title">CALL HIERARCHY</div>
          <div className="lsp-hierarchy">
            {callHierarchy.callers && callHierarchy.callers.length > 0 && (
              <div className="lsp-hierarchy-group">
                <div className="lsp-hierarchy-label">Called by:</div>
                {callHierarchy.callers.map((c: any, i: number) => (
                  <div key={i} className="lsp-hierarchy-item" onClick={() => handleNavigate(c.filePath, c.range.startLine)}>
                    ← {c.name} ({c.kind})
                  </div>
                ))}
              </div>
            )}
            <div className="lsp-hierarchy-current">{callHierarchy.name}</div>
            {callHierarchy.callees && callHierarchy.callees.length > 0 && (
              <div className="lsp-hierarchy-group">
                <div className="lsp-hierarchy-label">Calls:</div>
                {callHierarchy.callees.map((c: any, i: number) => (
                  <div key={i} className="lsp-hierarchy-item" onClick={() => handleNavigate(c.filePath, c.range.startLine)}>
                    → {c.name} ({c.kind})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
