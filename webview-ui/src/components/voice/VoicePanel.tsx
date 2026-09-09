/**
 * VoicePanel.tsx — Phase 20 Step 20.2
 * Voice command history and status
 */

import React from 'react';

interface VoiceCommand { transcript: string; confidence: number; language: string; timestamp: number; }
interface VoiceResult { intent: string; success: boolean; message: string; }

interface VoicePanelProps {
  status: 'ready' | 'recording' | 'processing' | 'done' | 'error';
  commands: Array<VoiceCommand & { result?: VoiceResult }>;
  isAvailable: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggleContinuous: () => void;
  continuousMode: boolean;
}

const statusIcons: Record<string, string> = { ready: '🎤', recording: '🔴', processing: '⏳', done: '✅', error: '❌' };
const statusLabels: Record<string, string> = { ready: 'Ready — press to talk', recording: 'Listening...', processing: 'Processing...', done: 'Done', error: 'Error' };

const VoicePanel: React.FC<VoicePanelProps> = ({ status, commands, isAvailable, onStartListening, onStopListening, onToggleContinuous, continuousMode }) => {
  if (!isAvailable) {
    return (
      <div className="voice-panel" role="region" aria-label="Voice control">
        <div className="voice-unavailable">
          <span className="codicon codicon-warning" /> INA Speech-to-Text not available at configured endpoint.
          <p>Check voice.sttEndpoint in settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-panel" role="region" aria-label="Voice control">
      <div className="voice-header">
        <h3><span className="codicon codicon-mic" /> INA-7 Pro Voice</h3>
        <label className="voice-toggle">
          <input type="checkbox" checked={continuousMode} onChange={onToggleContinuous} />
          Continuous
        </label>
      </div>

      <div className="voice-status" role="status" aria-live="polite">
        <button className={`voice-btn voice-btn-${status}`}
          onClick={status === 'recording' ? onStopListening : onStartListening}
          disabled={status === 'processing'}
          aria-label={status === 'recording' ? 'Stop listening' : 'Start listening'}>
          <span className="voice-icon">{statusIcons[status]}</span>
          <span>{statusLabels[status]}</span>
        </button>
      </div>

      <div className="voice-history">
        <h4>Recent Commands ({commands.length})</h4>
        <ul className="voice-list" role="list">
          {commands.slice().reverse().slice(0, 20).map((cmd, i) => (
            <li key={i} className={`voice-item ${cmd.result?.success ? 'success' : cmd.result ? 'failed' : ''}`} role="listitem">
              <div className="voice-transcript">"{cmd.transcript}"</div>
              <div className="voice-meta">
                <span>{cmd.language}</span>
                <span>{Math.round(cmd.confidence * 100)}%</span>
                <span>{new Date(cmd.timestamp).toLocaleTimeString()}</span>
              </div>
              {cmd.result && (
                <div className={`voice-result ${cmd.result.success ? 'success' : 'error'}`}>
                  {cmd.result.success ? '✓' : '✗'} {cmd.result.intent}: {cmd.result.message}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {commands.length === 0 && (
        <div className="voice-empty">
          <p>No voice commands yet.</p>
          <p>Say "write a function that..." or "go to file..."</p>
        </div>
      )}
    </div>
  );
};

export default VoicePanel;
