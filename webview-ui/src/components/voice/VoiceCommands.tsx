/**
 * VoiceCommands.tsx — Phase 20 Step 20.2
 * Quick reference for available voice commands
 */

import React from 'react';

const COMMAND_CATEGORIES = [
  { name: 'Code', commands: [
    { voice: '"Write a function that validates emails"', action: 'Generate code via INA-7 Pro' },
    { voice: '"Add a comment: handles edge cases"', action: 'Insert comment above current line' },
  ]},
  { name: 'Navigation', commands: [
    { voice: '"Go to file auth service"', action: 'Open matching file' },
    { voice: '"Go to function validateToken"', action: 'Jump to function definition' },
  ]},
  { name: 'Editing', commands: [
    { voice: '"On line 42, change foo to bar"', action: 'Replace text on line' },
    { voice: '"Delete lines 10 to 15"', action: 'Delete line range (with confirmation)' },
    { voice: '"Rename userId to accountId"', action: 'Trigger rename refactoring' },
    { voice: '"Undo" / "Redo"', action: 'Undo/redo last action' },
  ]},
  { name: 'Actions', commands: [
    { voice: '"Run tests" / "Run build"', action: 'Execute terminal command' },
    { voice: '"Fix this error"', action: 'Analyze last terminal error' },
    { voice: '"Generate tests"', action: 'Generate tests for current file' },
    { voice: '"Explain this"', action: 'Explain selected code' },
  ]},
  { name: 'Deutsch', commands: [
    { voice: '"Erstelle eine Funktion..."', action: 'Code generieren' },
    { voice: '"Öffne Datei..."', action: 'Datei öffnen' },
    { voice: '"Behebe den Fehler"', action: 'Fehler analysieren' },
  ]},
];

const VoiceCommands: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="voice-commands" role="region" aria-label="Voice command reference">
    <div className="voice-commands-header">
      <h3><span className="codicon codicon-mic" /> Voice Commands</h3>
      <button className="pair-btn pair-btn-ghost" onClick={onClose}><span className="codicon codicon-close" /></button>
    </div>
    {COMMAND_CATEGORIES.map(cat => (
      <div key={cat.name} className="voice-cat">
        <h4>{cat.name}</h4>
        <ul>
          {cat.commands.map((c, i) => (
            <li key={i}><code>{c.voice}</code> → {c.action}</li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

export default VoiceCommands;
