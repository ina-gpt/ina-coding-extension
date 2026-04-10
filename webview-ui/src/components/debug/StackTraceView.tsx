/**
 * StackTraceView.tsx — Phase 19 Step 19.1
 * Interactive stack trace: click frames to navigate
 */

import React from 'react';

interface StackFrame {
  file: string;
  line: number;
  column?: number;
  functionName: string;
  isUserCode: boolean;
}

interface ParsedError {
  type: string;
  message: string;
  stackFrames: StackFrame[];
  language: string;
}

interface StackTraceViewProps {
  error: ParsedError;
  onNavigateToFrame: (file: string, line: number) => void;
}

const StackTraceView: React.FC<StackTraceViewProps> = ({ error, onNavigateToFrame }) => {
  return (
    <div className="stack-trace-view" role="region" aria-label="Stack trace">
      <div className="stack-error-header">
        <span className="stack-error-type" style={{ color: 'var(--vscode-errorForeground)' }}>
          <span className="codicon codicon-error" aria-hidden="true" /> {error.type}
        </span>
        <span className="stack-error-message">{error.message}</span>
        <span className="stack-error-lang">{error.language}</span>
      </div>

      <ol className="stack-frames" role="list" aria-label="Stack frames">
        {error.stackFrames.map((frame, i) => (
          <li key={i}
            className={`stack-frame ${frame.isUserCode ? 'stack-frame-user' : 'stack-frame-external'}`}
            role="listitem">
            <button
              className="stack-frame-btn"
              onClick={() => onNavigateToFrame(frame.file, frame.line)}
              title={`${frame.file}:${frame.line}${frame.column ? ':' + frame.column : ''}`}
              aria-label={`${frame.functionName} at ${frame.file} line ${frame.line}`}
            >
              <span className="stack-frame-index">{i}</span>
              <span className="stack-frame-fn">
                {frame.isUserCode ? (
                  <span className="codicon codicon-symbol-method" aria-hidden="true" />
                ) : (
                  <span className="codicon codicon-library" aria-hidden="true" />
                )}
                {' '}{frame.functionName}
              </span>
              <span className="stack-frame-loc">
                {frame.file}:{frame.line}{frame.column ? ':' + frame.column : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {error.stackFrames.length === 0 && (
        <div className="stack-empty" role="status">
          <p>No stack frames found</p>
        </div>
      )}
    </div>
  );
};

export default StackTraceView;
