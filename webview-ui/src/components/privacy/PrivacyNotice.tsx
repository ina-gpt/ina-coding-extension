import React from 'react';
import { Shield } from 'lucide-react';

interface PrivacyNoticeProps {
  onAccept: () => void;
  onCustomize: () => void;
}

export function PrivacyNotice({ onAccept, onCustomize }: PrivacyNoticeProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl p-6 space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-[var(--ina-status-success,#22c55e)]/10 flex items-center justify-center mb-3">
            <Shield size={24} className="text-[var(--ina-status-success,#22c55e)]" />
          </div>
          <h2 className="text-lg font-semibold">Privacy First</h2>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">INA Coding is designed with your privacy at its core</p>
        </div>

        <div className="space-y-2 text-xs">
          {[
            { icon: '✓', text: 'Zero telemetry by default — no data collected' },
            { icon: '✓', text: 'All data stays on your self-hosted server' },
            { icon: '✓', text: 'Code processed in Germany (GDPR compliant)' },
            { icon: '✓', text: 'No data shared with third parties' },
            { icon: '✓', text: 'Delete all your data at any time' },
            { icon: '✓', text: 'Data encrypted at rest' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[var(--ina-status-success,#22c55e)]">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onAccept} className="flex-1 py-2.5 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-sm font-medium hover:opacity-90 transition-opacity">
            Accept & Continue
          </button>
          <button onClick={onCustomize} className="px-4 py-2.5 rounded-lg text-sm text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
            Customize
          </button>
        </div>
      </div>
    </div>
  );
}
