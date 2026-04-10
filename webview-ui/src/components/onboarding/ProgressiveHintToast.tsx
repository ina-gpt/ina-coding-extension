import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface ProgressiveHintToastProps {
  hint: { id: string; message: string; actionLabel: string | null; actionCommand: string | null };
  onDismiss: () => void;
  onAction: () => void;
}

export function ProgressiveHintToast({ hint, onDismiss, onAction }: ProgressiveHintToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100);
    const t2 = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hint.id, onDismiss]);

  const handleAction = () => {
    if (hint.actionCommand) {
      const [cmd, arg] = hint.actionCommand.split(':');
      postMessage({ type: cmd.replace('inaCoding.', ''), ...(arg ? { tourId: arg } : {}) } as any);
    }
    onAction();
  };

  const handleDontShow = () => {
    postMessage({ type: 'dismissHint', hintId: hint.id } as any);
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div className={clsx(
      'fixed bottom-4 left-4 right-4 z-40 transition-all duration-300',
      visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
    )}>
      <div className="rounded-lg bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-lg p-3">
        <div className="flex items-start gap-2">
          <span className="text-sm flex-shrink-0">💡</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs leading-relaxed">{hint.message.replace('💡 ', '')}</p>
            <div className="flex items-center gap-3 mt-2">
              {hint.actionLabel && (
                <button onClick={handleAction}
                  className="text-xs font-medium text-[var(--ina-accent-primary,#3b82f6)] hover:underline">
                  {hint.actionLabel}
                </button>
              )}
              <button onClick={handleDontShow} className="text-[10px] text-[var(--vscode-descriptionForeground)] hover:underline">
                Don't show again
              </button>
            </div>
          </div>
          <button onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
            className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] flex-shrink-0">
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
