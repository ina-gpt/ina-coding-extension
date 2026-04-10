/**
 * TestGenPanel.tsx — Phase 19 Step 19.2
 * Generate Tests panel: file/function selection, options, results
 */

import React, { useState, useCallback } from 'react';

interface GeneratedTest {
  id: string;
  type: string;
  targetFunction: string;
  testFile: string;
  description: string;
  assertions: string[];
  edgeCases: string[];
}

interface TestGenPanelProps {
  currentFile: string;
  functions: string[];
  framework: string;
  tests: GeneratedTest[];
  isGenerating: boolean;
  progress: number;
  statusMessage: string;
  onGenerate: (file: string, functionName?: string, options?: any) => void;
  onRunTest: (testId: string) => void;
  onViewTest: (testId: string) => void;
}

const TestGenPanel: React.FC<TestGenPanelProps> = ({
  currentFile, functions, framework, tests,
  isGenerating, progress, statusMessage,
  onGenerate, onRunTest, onViewTest,
}) => {
  const [selectedFunction, setSelectedFunction] = useState<string>('');
  const [includeEdgeCases, setIncludeEdgeCases] = useState(true);
  const [includeNegativeTests, setIncludeNegativeTests] = useState(true);
  const [mockStrategy, setMockStrategy] = useState<'auto' | 'manual' | 'none'>('auto');

  const handleGenerate = useCallback(() => {
    onGenerate(currentFile, selectedFunction || undefined, {
      includeEdgeCases,
      includeNegativeTests,
      mockStrategy,
    });
  }, [currentFile, selectedFunction, includeEdgeCases, includeNegativeTests, mockStrategy, onGenerate]);

  return (
    <div className="testgen-panel" role="region" aria-label="Test generation">
      <div className="testgen-header">
        <h3><span className="codicon codicon-beaker" aria-hidden="true" /> INA-7 Pro Test Generator</h3>
        <span className="testgen-framework">{framework}</span>
      </div>

      <div className="testgen-form">
        <div className="testgen-field">
          <label htmlFor="testgen-file">File</label>
          <input id="testgen-file" type="text" value={currentFile} readOnly className="testgen-input" />
        </div>

        {functions.length > 0 && (
          <div className="testgen-field">
            <label htmlFor="testgen-function">Function (optional)</label>
            <select id="testgen-function" value={selectedFunction} onChange={e => setSelectedFunction(e.target.value)} className="testgen-select" aria-label="Select function">
              <option value="">All exported functions</option>
              {functions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}

        <div className="testgen-options" role="group" aria-label="Test options">
          <label className="testgen-checkbox">
            <input type="checkbox" checked={includeEdgeCases} onChange={e => setIncludeEdgeCases(e.target.checked)} />
            Edge cases (null, empty, boundary)
          </label>
          <label className="testgen-checkbox">
            <input type="checkbox" checked={includeNegativeTests} onChange={e => setIncludeNegativeTests(e.target.checked)} />
            Negative tests (invalid inputs)
          </label>
          <div className="testgen-field">
            <label htmlFor="testgen-mock">Mock strategy</label>
            <select id="testgen-mock" value={mockStrategy} onChange={e => setMockStrategy(e.target.value as any)} className="testgen-select">
              <option value="auto">Auto-detect</option>
              <option value="manual">Manual</option>
              <option value="none">No mocking</option>
            </select>
          </div>
        </div>

        <button className="testgen-btn testgen-btn-primary" onClick={handleGenerate} disabled={isGenerating || !currentFile} aria-label="Generate tests">
          {isGenerating ? (
            <><span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> Generating...</>
          ) : (
            <><span className="codicon codicon-beaker" aria-hidden="true" /> Generate Tests</>
          )}
        </button>
      </div>

      {isGenerating && (
        <div className="testgen-progress" role="progressbar" aria-valuenow={progress * 100} aria-valuemin={0} aria-valuemax={100}>
          <div className="testgen-progress-bar" style={{ width: `${progress * 100}%` }} />
          <span>{statusMessage}</span>
        </div>
      )}

      {tests.length > 0 && (
        <div className="testgen-results">
          <h4>Generated Tests ({tests.length})</h4>
          <ul className="testgen-list" role="list">
            {tests.map(test => (
              <li key={test.id} className="testgen-item" role="listitem">
                <div className="testgen-item-header">
                  <span className="codicon codicon-beaker" aria-hidden="true" />
                  <span className="testgen-item-name">{test.targetFunction}</span>
                  <span className="testgen-item-type">{test.type}</span>
                </div>
                <p className="testgen-item-desc">{test.description}</p>
                <div className="testgen-item-meta">
                  <span>{test.assertions.join(', ')}</span>
                  {test.edgeCases.length > 0 && <span>Edge: {test.edgeCases.length}</span>}
                </div>
                <div className="testgen-item-actions">
                  <button className="testgen-btn testgen-btn-sm" onClick={() => onViewTest(test.id)} aria-label={`View test for ${test.targetFunction}`}>
                    <span className="codicon codicon-eye" aria-hidden="true" /> View
                  </button>
                  <button className="testgen-btn testgen-btn-sm testgen-btn-primary" onClick={() => onRunTest(test.id)} aria-label={`Run test for ${test.targetFunction}`}>
                    <span className="codicon codicon-play" aria-hidden="true" /> Run
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TestGenPanel;
