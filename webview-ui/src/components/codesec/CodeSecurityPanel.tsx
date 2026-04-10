import React, { useState } from 'react';
import { Shield, AlertTriangle, Lock, Eye, Server, Activity, Bot, X, Plus, Trash2, Search, Download, RotateCcw, Zap } from 'lucide-react';
import { SecurityAlertCard } from './SecurityAlertCard';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface CodeSecurityPanelProps {
  alerts: any[];
  stats: any;
  scanResult: any | null;
  transmissionReport: string | null;
  onClose: () => void;
}

type Tab = 'status' | 'alerts' | 'sensitive' | 'secrets' | 'ephemeral' | 'transmission' | 'agent';

export function CodeSecurityPanel({ alerts, stats, scanResult, transmissionReport, onClose }: CodeSecurityPanelProps) {
  const [tab, setTab] = useState<Tab>('status');
  const [newPattern, setNewPattern] = useState('');
  const [testFile, setTestFile] = useState('');

  const activeAlerts = (alerts || []).filter((a: any) => !a.dismissed);
  const s = stats || { totalScans: 0, secretsDetected: 0, filesBlocked: 0, alertsActive: 0, fileOpsThisSession: 0, terminalCommandsThisSession: 0 };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'status', label: 'Status', icon: <Shield size={12} /> },
    { id: 'alerts', label: 'Alerts', icon: <AlertTriangle size={12} />, badge: activeAlerts.length },
    { id: 'sensitive', label: 'Files', icon: <Lock size={12} /> },
    { id: 'secrets', label: 'Secrets', icon: <Eye size={12} /> },
    { id: 'ephemeral', label: 'Ephemeral', icon: <Server size={12} /> },
    { id: 'transmission', label: 'Traffic', icon: <Activity size={12} /> },
    { id: 'agent', label: 'Agent', icon: <Bot size={12} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-[var(--ina-status-success,#22c55e)]" />
            <span className="font-semibold">Code Security</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--vscode-panel-border)] overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={clsx('flex items-center gap-1 px-2 py-1 text-xs rounded whitespace-nowrap', tab === t.id ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]')}>
              {t.icon} {t.label}
              {t.badge && t.badge > 0 ? <span className="ml-1 px-1 text-[10px] rounded-full bg-[var(--ina-status-error,#ef4444)] text-white">{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* STATUS */}
          {tab === 'status' && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--ina-status-success,#22c55e)]/10 border border-[var(--ina-status-success,#22c55e)]/20">
                <Shield size={24} className="text-[var(--ina-status-success,#22c55e)]" />
                <div>
                  <p className="text-sm font-semibold">Code Security: Active</p>
                  <p className="text-xs text-[var(--vscode-descriptionForeground)]">Ephemeral processing enabled — server processes code and deletes immediately</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Scans', value: s.totalScans },
                  { label: 'Secrets Stripped', value: s.secretsDetected },
                  { label: 'Files Blocked', value: s.filesBlocked },
                  { label: 'Active Alerts', value: activeAlerts.length },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 rounded-lg border border-[var(--vscode-panel-border)] text-center">
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-xs text-[var(--vscode-descriptionForeground)]">{label}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ALERTS */}
          {tab === 'alerts' && (
            <>
              {activeAlerts.length === 0 ? (
                <div className="text-center py-8 text-[var(--vscode-descriptionForeground)]">
                  <Shield size={32} className="mx-auto mb-2 text-[var(--ina-status-success,#22c55e)]" />
                  <p className="text-sm">No security alerts</p>
                </div>
              ) : (
                activeAlerts.map((a: any) => (
                  <SecurityAlertCard key={a.id} alert={a} onDismiss={(id) => postMessage({ type: 'dismissSecurityAlert', alertId: id } as any)} onWhitelist={(id) => postMessage({ type: 'whitelistPattern', alertId: id } as any)} />
                ))
              )}
            </>
          )}

          {/* SENSITIVE FILES */}
          {tab === 'sensitive' && (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => postMessage({ type: 'scanWorkspace' } as any)} className="px-3 py-1.5 text-xs rounded bg-[var(--ina-accent-primary,#4f46e5)] text-white flex items-center gap-1"><Search size={12} /> Scan Workspace</button>
              </div>
              {scanResult && (
                <div className="text-xs space-y-1 p-3 rounded border border-[var(--vscode-panel-border)]">
                  <p>Files scanned: {scanResult.totalFiles}</p>
                  <p>Sensitive files found: {scanResult.totalSensitive}</p>
                  {scanResult.sensitiveFiles?.slice(0, 20).map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[var(--vscode-descriptionForeground)]">
                      <Lock size={10} /> <span className="truncate">{f.path}</span>
                      <span className="text-[10px] px-1 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">{f.pattern}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-medium">Add Custom Pattern</p>
                <div className="flex gap-2">
                  <input value={newPattern} onChange={e => setNewPattern(e.target.value)} placeholder="e.g. *.vault" className="flex-1 px-2 py-1 text-xs rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]" />
                  <button onClick={() => { if (newPattern) { postMessage({ type: 'addSensitivePattern', pattern: newPattern } as any); setNewPattern(''); } }} className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"><Plus size={12} /></button>
                </div>
              </div>
            </>
          )}

          {/* SECRETS */}
          {tab === 'secrets' && (
            <div className="space-y-3">
              {[
                { label: 'Auto-strip secrets before sending', key: 'autoStripSecrets', default: true },
                { label: 'Scan pasted content', key: 'scanPastedCode', default: true },
                { label: 'Scan AI-generated code', key: 'scanGeneratedCode', default: true },
                { label: 'Block if secrets found', key: 'blockIfSecretsFound', default: false },
              ].map(({ label, key, default: def }) => (
                <label key={key} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <div className={clsx('w-8 h-4 rounded-full transition-colors cursor-pointer', def ? 'bg-[var(--ina-status-success,#22c55e)]' : 'bg-[var(--vscode-descriptionForeground)]/30')}>
                    <div className={clsx('w-3 h-3 rounded-full bg-white mt-0.5 transition-transform', def ? 'translate-x-4' : 'translate-x-0.5')} />
                  </div>
                </label>
              ))}
              <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                <p className="text-xs font-medium mb-1">Detection Stats</p>
                <p className="text-xs text-[var(--vscode-descriptionForeground)]">Total detections: {s.secretsDetected}</p>
              </div>
            </div>
          )}

          {/* EPHEMERAL */}
          {tab === 'ephemeral' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-[var(--ina-status-success,#22c55e)]/10 border border-[var(--ina-status-success,#22c55e)]/20">
                <p className="text-sm font-medium">Ephemeral Processing: Enabled</p>
                <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
                  The server processes your code and immediately deletes it. No code is stored beyond the active request.
                </p>
              </div>
              <button onClick={() => postMessage({ type: 'purgeServerData' } as any)} className="px-3 py-1.5 text-xs rounded bg-[var(--ina-status-error,#ef4444)] text-white flex items-center gap-1">
                <Trash2 size={12} /> Purge Server Data
              </button>
            </div>
          )}

          {/* TRANSMISSION */}
          {tab === 'transmission' && (
            <div className="space-y-3">
              {transmissionReport ? (
                <pre className="text-xs whitespace-pre-wrap font-mono p-3 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] max-h-60 overflow-y-auto">{transmissionReport}</pre>
              ) : (
                <p className="text-xs text-[var(--vscode-descriptionForeground)]">No transmission data yet</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => postMessage({ type: 'getTransmissionReport' } as any)} className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] flex items-center gap-1"><Download size={12} /> Generate Report</button>
                <button onClick={() => postMessage({ type: 'resetTransmissionStats' } as any)} className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-panel-border)] flex items-center gap-1"><RotateCcw size={12} /> Reset</button>
              </div>
            </div>
          )}

          {/* AGENT */}
          {tab === 'agent' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                  <p className="text-xs text-[var(--vscode-descriptionForeground)]">File Operations</p>
                  <p className="text-lg font-bold">{s.fileOpsThisSession} <span className="text-xs font-normal text-[var(--vscode-descriptionForeground)]">/ 50</span></p>
                </div>
                <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                  <p className="text-xs text-[var(--vscode-descriptionForeground)]">Terminal Commands</p>
                  <p className="text-lg font-bold">{s.terminalCommandsThisSession} <span className="text-xs font-normal text-[var(--vscode-descriptionForeground)]">/ 20</span></p>
                </div>
              </div>
              {[
                { label: 'Require approval for file creation', default: true },
                { label: 'Require approval for file deletion', default: true },
                { label: 'Block writes outside workspace', default: true },
                { label: 'Scan generated code before apply', default: true },
                { label: 'Block dangerous commands', default: true },
              ].map(({ label, default: def }) => (
                <label key={label} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <div className={clsx('w-8 h-4 rounded-full', def ? 'bg-[var(--ina-status-success,#22c55e)]' : 'bg-[var(--vscode-descriptionForeground)]/30')}>
                    <div className={clsx('w-3 h-3 rounded-full bg-white mt-0.5', def ? 'translate-x-4' : 'translate-x-0.5')} />
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CodeSecurityPanel;
