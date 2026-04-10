import React, { useState } from 'react';
import { Shield, X, ToggleLeft, ToggleRight, Trash2, Download, Search, AlertTriangle } from 'lucide-react';
import { PrivacyModeSelector } from './PrivacyModeSelector';
import { DataInventoryTable } from './DataInventoryTable';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface PrivacyDashboardProps {
  config: any;
  mode: string;
  dataInventory: any[];
  auditLog: any[];
  isEncrypted: boolean;
  keyFingerprint: string;
  onClose: () => void;
}

export function PrivacyDashboard({ config, mode, dataInventory, auditLog, isEncrypted, keyFingerprint, onClose }: PrivacyDashboardProps) {
  const [tab, setTab] = useState<'mode' | 'telemetry' | 'encryption' | 'retention' | 'data' | 'audit'>('mode');
  const telemetry = config?.telemetry || {};
  const retention = config?.dataRetention || {};
  const encryption = config?.encryption || {};

  const handleSetMode = (m: string) => postMessage({ type: 'setPrivacyMode', mode: m } as any);
  const handleToggle = (path: string, value: boolean) => postMessage({ type: 'updatePrivacyConfig', path, value } as any);
  const handleDeleteAll = () => {
    if (confirm('Are you sure? This will PERMANENTLY delete ALL your data.')) {
      const typed = prompt('Type DELETE ALL DATA to confirm:');
      if (typed === 'DELETE ALL DATA') {
        postMessage({ type: 'deleteAllData' } as any);
      }
    }
  };

  const tabs = [
    { id: 'mode', label: 'Mode' },
    { id: 'telemetry', label: 'Telemetry' },
    { id: 'encryption', label: 'Encryption' },
    { id: 'retention', label: 'Retention' },
    { id: 'data', label: 'Data' },
    { id: 'audit', label: 'Audit' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 max-h-[90vh] rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[var(--ina-status-success,#22c55e)]" />
            <h3 className="font-semibold text-sm">Privacy & Data</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--vscode-panel-border)] px-4 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('px-3 py-2 text-xs border-b-2 transition-colors whitespace-nowrap',
                tab === t.id ? 'border-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary,#3b82f6)]' : 'border-transparent text-[var(--vscode-descriptionForeground)] hover:text-inherit')}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* MODE */}
          {tab === 'mode' && (
            <>
              <PrivacyModeSelector currentMode={mode} onSelect={handleSetMode} />
              {(mode === 'local_only' || mode === 'air_gapped') && (
                <div className="flex items-start gap-2 text-xs p-2 rounded bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))] text-[var(--ina-status-warning,#eab308)]">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Some features are disabled in {mode.replace('_', ' ')} mode. Server AI, memory extraction, and code indexing are unavailable.</span>
                </div>
              )}
            </>
          )}

          {/* TELEMETRY */}
          {tab === 'telemetry' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[var(--ina-status-success,#22c55e)]/5 border border-[var(--ina-status-success,#22c55e)]/20 text-xs">
                🛡️ INA Coding sends <strong>ZERO telemetry</strong> by default. Your code never leaves your server.
              </div>
              {[
                { key: 'enabled', label: 'Send telemetry data', value: telemetry.enabled },
                { key: 'anonymousUsageStats', label: 'Anonymous usage stats', value: telemetry.anonymousUsageStats },
                { key: 'errorReporting', label: 'Error reporting', value: telemetry.errorReporting },
                { key: 'performanceMetrics', label: 'Performance metrics', value: telemetry.performanceMetrics },
                { key: 'crashReports', label: 'Crash reports', value: telemetry.crashReports },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between text-xs py-1">
                  <span>{item.label}</span>
                  <button onClick={() => handleToggle(`telemetry.${item.key}`, !item.value)} className="p-0.5">
                    {item.value ? <ToggleRight size={20} className="text-[var(--ina-accent-primary,#3b82f6)]" /> : <ToggleLeft size={20} className="text-[var(--vscode-descriptionForeground)]" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ENCRYPTION */}
          {tab === 'encryption' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className={isEncrypted ? 'text-[var(--ina-status-success,#22c55e)]' : 'text-[var(--ina-status-warning,#eab308)]'}>
                  {isEncrypted ? '🔒 Data at rest: Encrypted' : '🔓 Data at rest: Not encrypted'}
                </span>
                {keyFingerprint && <span className="text-[var(--vscode-descriptionForeground)] font-mono">Key: {keyFingerprint}</span>}
              </div>
              {[
                { key: 'encryptChatHistory', label: 'Encrypt chat history', value: encryption.encryptChatHistory },
                { key: 'encryptMemories', label: 'Encrypt memories', value: encryption.encryptMemories },
                { key: 'encryptOfflineQueue', label: 'Encrypt offline queue', value: encryption.encryptOfflineQueue },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between text-xs py-1">
                  <span>{item.label}</span>
                  <button onClick={() => handleToggle(`encryption.${item.key}`, !item.value)} className="p-0.5">
                    {item.value ? <ToggleRight size={20} className="text-[var(--ina-accent-primary,#3b82f6)]" /> : <ToggleLeft size={20} className="text-[var(--vscode-descriptionForeground)]" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* RETENTION */}
          {tab === 'retention' && (
            <div className="space-y-3">
              {[
                { key: 'chatHistoryDays', label: 'Chat history', value: retention.chatHistoryDays, unit: 'days' },
                { key: 'memoryRetentionDays', label: 'Memories', value: retention.memoryRetentionDays, unit: 'days' },
                { key: 'cacheRetentionDays', label: 'Cache', value: retention.cacheRetentionDays, unit: 'days' },
                { key: 'errorLogRetentionDays', label: 'Error logs', value: retention.errorLogRetentionDays, unit: 'days' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between text-xs py-1">
                  <span>{item.label}</span>
                  <span className="font-mono text-[var(--vscode-descriptionForeground)]">{item.value} {item.unit}</span>
                </div>
              ))}
              <button onClick={() => postMessage({ type: 'runCleanup' } as any)}
                className="px-3 py-1.5 rounded text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">
                Run Cleanup Now
              </button>
            </div>
          )}

          {/* DATA */}
          {tab === 'data' && (
            <div className="space-y-4">
              <DataInventoryTable
                inventory={dataInventory}
                onDelete={(cat) => postMessage({ type: 'deleteDataCategory', category: cat } as any)}
                onExport={(cat) => postMessage({ type: 'exportDataCategory', category: cat } as any)}
              />
              <div className="flex gap-2 pt-2 border-t border-[var(--vscode-panel-border)]">
                <button onClick={() => postMessage({ type: 'exportAllData' } as any)}
                  className="px-3 py-1.5 rounded text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] flex items-center gap-1">
                  <Download size={12} /> Export All Data
                </button>
                <button onClick={handleDeleteAll}
                  className="px-3 py-1.5 rounded text-xs bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] text-[var(--ina-status-error,#ef4444)] flex items-center gap-1">
                  <Trash2 size={12} /> Delete All Data
                </button>
                <button onClick={() => postMessage({ type: 'runPrivacyAudit' } as any)}
                  className="px-3 py-1.5 rounded text-xs hover:bg-[var(--vscode-list-hoverBackground)] flex items-center gap-1">
                  <Search size={12} /> Privacy Audit
                </button>
              </div>
            </div>
          )}

          {/* AUDIT */}
          {tab === 'audit' && (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {auditLog.length === 0 && <div className="text-xs text-[var(--vscode-descriptionForeground)] text-center py-4">No audit entries yet</div>}
              {auditLog.slice(-50).reverse().map((entry: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-[var(--vscode-list-hoverBackground)]">
                  <span className="text-[var(--vscode-descriptionForeground)] w-16 flex-shrink-0">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span className="px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">{entry.action}</span>
                  <span className="truncate">{entry.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
