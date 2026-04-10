import React, { useState } from 'react';
import { postMessage } from '../../utils/vscode';
import { useChatStore } from '../../store/chatStore';

interface ImageAttachment {
  id: string; data: string; mimeType: string; fileName: string | null;
}

interface DesignToCodePanelProps {
  image: ImageAttachment;
  onComplete?: (result: any) => void;
  onCancel: () => void;
}

export const DesignToCodePanel: React.FC<DesignToCodePanelProps> = ({ image, onComplete, onCancel }) => {
  const { isDesignToCode, designToCodeResult } = useChatStore();
  const [framework, setFramework] = useState('react');
  const [cssFramework, setCssFramework] = useState('tailwind');
  const [language, setLanguage] = useState('typescript');
  const [responsive, setResponsive] = useState(true);
  const [interactive, setInteractive] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [phase, setPhase] = useState<'config' | 'generating' | 'complete'>('config');

  const handleGenerate = () => {
    setPhase('generating');
    setGeneratedCode('');
    postMessage({
      type: 'designToCode',
      image,
      config: { framework, cssFramework, responsive, includeInteractivity: interactive, targetLanguage: language },
      additionalInstructions: instructions || null,
    } as any);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(generatedCode || designToCodeResult?.code || '');
  };

  const handleInsert = () => {
    postMessage({ type: 'insertGeneratedCode', code: generatedCode || designToCodeResult?.code || '' } as any);
  };

  const handleCreateFiles = () => {
    if (designToCodeResult?.components) {
      postMessage({ type: 'createComponentFiles', components: designToCodeResult.components } as any);
    }
  };

  return (
    <div className="design-to-code-panel">
      <div className="dtc-header">
        <h3>Design to Code</h3>
        <button className="dtc-close" onClick={onCancel}>×</button>
      </div>

      <div className="dtc-body">
        <div className="dtc-left">
          <img src={`data:${image.mimeType};base64,${image.data}`} alt="Design" className="dtc-design-img" />
        </div>

        <div className="dtc-right">
          {phase === 'config' && (
            <div className="dtc-config">
              <div className="dtc-field">
                <label>Framework</label>
                <select value={framework} onChange={e => setFramework(e.target.value)}>
                  <option value="react">React</option><option value="vue">Vue</option>
                  <option value="html">HTML</option><option value="svelte">Svelte</option>
                  <option value="angular">Angular</option>
                </select>
              </div>
              <div className="dtc-field">
                <label>CSS Framework</label>
                <select value={cssFramework} onChange={e => setCssFramework(e.target.value)}>
                  <option value="tailwind">Tailwind CSS</option><option value="css">Plain CSS</option>
                  <option value="scss">SCSS</option><option value="styled-components">Styled Components</option>
                </select>
              </div>
              <div className="dtc-field">
                <label>Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="typescript">TypeScript</option><option value="javascript">JavaScript</option>
                </select>
              </div>
              <div className="dtc-toggles">
                <label><input type="checkbox" checked={responsive} onChange={e => setResponsive(e.target.checked)} /> Responsive</label>
                <label><input type="checkbox" checked={interactive} onChange={e => setInteractive(e.target.checked)} /> Interactive</label>
              </div>
              <textarea className="dtc-instructions" placeholder="Additional instructions..." value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} />
              <button className="dtc-btn dtc-btn-primary" onClick={handleGenerate}>Generate Code</button>
            </div>
          )}

          {(phase === 'generating' || phase === 'complete') && (
            <div className="dtc-output">
              <pre className="dtc-code"><code>{generatedCode || designToCodeResult?.code || 'Generating...'}</code></pre>
              {phase === 'complete' && (
                <div className="dtc-actions">
                  <button className="dtc-btn" onClick={handleCopy}>Copy</button>
                  <button className="dtc-btn" onClick={handleInsert}>Insert to Editor</button>
                  {designToCodeResult?.components && designToCodeResult.components.length > 0 && (
                    <button className="dtc-btn dtc-btn-primary" onClick={handleCreateFiles}>Create Files ({designToCodeResult.components.length})</button>
                  )}
                  <button className="dtc-btn" onClick={() => setPhase('config')}>Regenerate</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="dtc-footer">Powered by INA Vision</div>
    </div>
  );
};
