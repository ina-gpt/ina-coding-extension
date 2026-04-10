import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KeyboardKey } from './KeyboardKey';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface KeyCaptureDialogProps {
  currentKeys: string;
  conflicts: { source: string; command: string; keys: string }[];
  onCapture: (keys: string) => void;
  onCancel: () => void;
}

const CODE_MAP: Record<string, string> = {
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', KeyM: 'M',
  KeyN: 'N', KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T', KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y', KeyZ: 'Z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Enter: 'Enter', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6', F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
};

export function KeyCaptureDialog({ currentKeys, conflicts, onCapture, onCancel }: KeyCaptureDialogProps) {
  const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && capturedKeys.length === 0) { onCancel(); return; }

    const parts: string[] = [];
    if (e.metaKey) parts.push('Cmd');
    if (e.ctrlKey && !e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    const baseKey = CODE_MAP[e.code];
    if (baseKey && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      parts.push(baseKey);
      setCapturedKeys(parts);
      setIsCapturing(false);
    }
  }, [capturedKeys, onCancel]);

  useEffect(() => {
    if (isCapturing) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isCapturing, handleKeyDown]);

  const keysString = capturedKeys.join('+');
  const hasConflict = conflicts.length > 0 && keysString;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={dialogRef} className="w-full max-w-sm mx-4 rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <h3 className="text-sm font-semibold">Customize Shortcut</h3>
          <button onClick={onCancel} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"><X size={14} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Current */}
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">
            Current: <span className="font-mono">{currentKeys}</span>
          </div>

          {/* Capture area */}
          <div className={clsx(
            'h-20 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors',
            isCapturing ? 'border-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/5' : 'border-[var(--vscode-panel-border)]'
          )}>
            {capturedKeys.length > 0 ? (
              <div className="flex items-center gap-1">
                {capturedKeys.map((k, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-xs text-[var(--vscode-descriptionForeground)]">+</span>}
                    <KeyboardKey keyLabel={k} size="lg" isActive />
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <span className="text-sm text-[var(--vscode-descriptionForeground)] animate-pulse">
                Press new shortcut keys...
              </span>
            )}
          </div>

          {/* Conflict check */}
          {keysString && !hasConflict && (
            <div className="text-xs text-[var(--ina-status-success,#22c55e)] flex items-center gap-1">
              ✓ No conflicts
            </div>
          )}
          {hasConflict && (
            <div className="text-xs text-[var(--ina-status-error,#ef4444)]">
              ⚠️ Conflicts with: {conflicts.map(c => `${c.source}: ${c.command}`).join(', ')}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={() => { setCapturedKeys([]); setIsCapturing(true); }}
              className="text-xs text-[var(--vscode-descriptionForeground)] hover:underline">Clear</button>
            <div className="flex gap-2">
              <button onClick={onCancel} className="px-3 py-1.5 rounded text-xs hover:bg-[var(--vscode-list-hoverBackground)]">Cancel</button>
              <button onClick={() => onCapture(keysString)} disabled={!keysString}
                className={clsx('px-3 py-1.5 rounded text-xs font-medium',
                  keysString ? 'bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] hover:opacity-90' : 'opacity-30 cursor-not-allowed')}>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
