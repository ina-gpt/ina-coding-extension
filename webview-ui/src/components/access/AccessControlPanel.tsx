/**
 * Phase 12.2 — Access Control Panel
 * Main panel: API keys, team, permissions, rate limits, audit log, security
 */
import React, { useState, useEffect } from 'react';
import { Key, Users, Shield, Activity, FileText, Lock, ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import { ApiKeyCard } from './ApiKeyCard';
import { NewKeyDialog } from './NewKeyDialog';
import { AuditLogViewer } from './AuditLogViewer';
import { RateLimitMeter } from './RateLimitMeter';
import clsx from 'clsx';

type Tab = 'keys' | 'team' | 'permissions' | 'ratelimit' | 'audit' | 'security';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'keys', label: 'API Keys', icon: <Key size={12} /> },
  { id: 'team', label: 'Team', icon: <Users size={12} /> },
  { id: 'permissions', label: 'Permissions', icon: <Shield size={12} /> },
  { id: 'ratelimit', label: 'Rate Limits', icon: <Activity size={12} /> },
  { id: 'audit', label: 'Audit Log', icon: <FileText size={12} /> },
  { id: 'security', label: 'Security', icon: <Lock size={12} /> },
];

export const AccessControlPanel: React.FC = () => {
  const {
    apiKeys, currentTeam, teamMembers, auditLogs, auditTotal,
    permissions, rateLimitStatus, showAccessPanel, currentRole,
    setShowAccessPanel,
  } = useChatStore();

  const [activeTab, setActiveTab] = useState<Tab>('keys');
  const [showNewKey, setShowNewKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [integrityResult, setIntegrityResult] = useState<any>(null);
  const [auditOffset, setAuditOffset] = useState(0);

  useEffect(() => {
    if (showAccessPanel) {
      postMessage({ type: 'requestApiKeys' });
      postMessage({ type: 'requestPermissions' });
      postMessage({ type: 'requestRateLimitStatus' });
    }
  }, [showAccessPanel]);

  useEffect(() => {
    if (activeTab === 'audit') {
      postMessage({ type: 'requestAuditLogs', filters: {}, offset: 0 });
    } else if (activeTab === 'team') {
      postMessage({ type: 'requestTeam' });
    }
  }, [activeTab]);

  if (!showAccessPanel) return null;

  const handleCreateKey = (data: any) => {
    postMessage({ type: 'createApiKey', ...data });
  };

  const handleRotateKey = (keyId: string) => {
    postMessage({ type: 'rotateApiKey', keyId });
  };

  const handleRevokeKey = (keyId: string) => {
    postMessage({ type: 'revokeApiKey', keyId, reason: 'Revoked by user' });
  };

  const handleAuditFilter = (filters: Record<string, string>) => {
    setAuditOffset(0);
    postMessage({ type: 'requestAuditLogs', filters, offset: 0 });
  };

  const handleAuditLoadMore = () => {
    const newOffset = auditOffset + 50;
    setAuditOffset(newOffset);
    postMessage({ type: 'requestAuditLogs', filters: {}, offset: newOffset });
  };

  const handleExport = (format: string) => {
    postMessage({ type: 'exportAuditLog', format });
  };

  const handleVerifyIntegrity = () => {
    postMessage({ type: 'verifyAuditIntegrity' });
  };

  // Permission categories
  const permCategories: Record<string, typeof permissions> = {};
  (permissions || []).forEach(p => {
    if (!permCategories[p.category]) permCategories[p.category] = [];
    permCategories[p.category].push(p);
  });

  // Rate limit usage windows
  const rateLimitWindows = rateLimitStatus?.remaining
    ? [
        { window: 'Per Second', current: 0, limit: rateLimitStatus.remaining.perSecond, resetAt: Date.now() + 1000 },
        { window: 'Per Minute', current: 0, limit: rateLimitStatus.remaining.perMinute, resetAt: Date.now() + 60000 },
        { window: 'Per Hour', current: 0, limit: rateLimitStatus.remaining.perHour, resetAt: Date.now() + 3600000 },
        { window: 'Per Day', current: 0, limit: rateLimitStatus.remaining.perDay, resetAt: Date.now() + 86400000 },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-[var(--vscode-editor-background)] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[var(--ina-accent-primary,#4f46e5)]" />
          <span className="font-semibold text-sm">Access Control</span>
          {currentRole && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 capitalize">
              {currentRole}
            </span>
          )}
        </div>
        <button onClick={() => setShowAccessPanel(false)} className="p-1 hover:bg-[var(--vscode-list-hoverBackground)] rounded">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-2 py-1 border-b border-[var(--vscode-panel-border)] overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 text-xs rounded whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'hover:bg-[var(--vscode-list-hoverBackground)]'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* API Keys Tab */}
        {activeTab === 'keys' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">API Keys</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => postMessage({ type: 'requestApiKeys' })}
                  className="p-1 rounded hover:bg-[var(--vscode-list-hoverBackground)]"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  onClick={() => setShowNewKey(true)}
                  className="text-xs px-3 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
                >
                  + New Key
                </button>
              </div>
            </div>

            {showNewKey && (
              <NewKeyDialog
                permissions={permissions || []}
                onSubmit={handleCreateKey}
                onCancel={() => { setShowNewKey(false); setGeneratedKey(null); }}
                generatedKey={generatedKey}
                onKeySaved={() => { setShowNewKey(false); setGeneratedKey(null); }}
              />
            )}

            {(apiKeys || []).length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--vscode-descriptionForeground)]">
                No API keys yet. Create one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {(apiKeys || []).map(key => (
                  <ApiKeyCard
                    key={key.id}
                    apiKey={key}
                    onRotate={handleRotateKey}
                    onRevoke={handleRevokeKey}
                    isActive={key.isActive}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Team</h3>
            {currentTeam ? (
              <div className="space-y-3">
                <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                  <div className="font-medium text-sm">{currentTeam.name}</div>
                  <div className="text-xs text-[var(--vscode-descriptionForeground)]">{currentTeam.description}</div>
                  <div className="text-xs mt-1">{(teamMembers || []).length} / {currentTeam.maxMembers} members</div>
                </div>
                <div className="space-y-1">
                  {(teamMembers || []).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded border border-[var(--vscode-panel-border)]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center text-xs font-bold text-[var(--vscode-button-foreground)]">
                          {(m.userId || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-xs">{m.userId}</span>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 capitalize">{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-[var(--vscode-descriptionForeground)]">
                No team configured. Team features are available for enterprise users.
              </div>
            )}
          </div>
        )}

        {/* Permissions Tab */}
        {activeTab === 'permissions' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Permissions</h3>
            {Object.entries(permCategories).map(([cat, perms]) => (
              <div key={cat}>
                <div className="text-xs uppercase tracking-wider text-[var(--vscode-descriptionForeground)] mb-1 font-semibold">{cat}</div>
                <div className="space-y-0.5">
                  {perms.map(p => (
                    <div key={p.name} className="flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--vscode-list-hoverBackground)]">
                      <div>
                        <span className="text-xs font-mono">{p.name}</span>
                        {p.description && (
                          <span className="text-[10px] text-[var(--vscode-descriptionForeground)] ml-2">{p.description}</span>
                        )}
                      </div>
                      <span className={clsx('text-xs', p.isDefault ? 'text-green-400' : 'text-[var(--vscode-descriptionForeground)]')}>
                        {p.isDefault ? 'Default' : p.requiresRole || ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rate Limits Tab */}
        {activeTab === 'ratelimit' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Rate Limits</h3>
              {rateLimitStatus?.tier && (
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 capitalize">
                  {rateLimitStatus.tier}
                </span>
              )}
            </div>

            {rateLimitWindows.length > 0 ? (
              <RateLimitMeter usage={rateLimitWindows} />
            ) : (
              <div className="text-center py-8 text-sm text-[var(--vscode-descriptionForeground)]">
                Rate limit data not available.
              </div>
            )}

            {rateLimitStatus?.usage && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold mb-2">Usage by Endpoint (24h)</h4>
                <div className="space-y-1">
                  {Object.entries(rateLimitStatus.usage.byEndpoint || {}).map(([ep, count]) => (
                    <div key={ep} className="flex items-center justify-between text-xs">
                      <span>{ep}</span>
                      <span className="font-mono">{(count as number).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Audit Log</h3>
            <AuditLogViewer
              logs={auditLogs || []}
              total={auditTotal || 0}
              onLoadMore={handleAuditLoadMore}
              onFilter={handleAuditFilter}
              onExport={handleExport}
              onVerifyIntegrity={handleVerifyIntegrity}
              integrityResult={integrityResult}
            />
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Security Overview</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                <div className="text-xs text-[var(--vscode-descriptionForeground)]">Active Keys</div>
                <div className="text-lg font-bold">{(apiKeys || []).filter(k => k.isActive).length}</div>
              </div>
              <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                <div className="text-xs text-[var(--vscode-descriptionForeground)]">Total Keys</div>
                <div className="text-lg font-bold">{(apiKeys || []).length}</div>
              </div>
              <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                <div className="text-xs text-[var(--vscode-descriptionForeground)]">Current Role</div>
                <div className="text-lg font-bold capitalize">{currentRole || 'N/A'}</div>
              </div>
              <div className="p-3 rounded border border-[var(--vscode-panel-border)]">
                <div className="text-xs text-[var(--vscode-descriptionForeground)]">Audit Entries</div>
                <div className="text-lg font-bold">{(auditTotal || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
