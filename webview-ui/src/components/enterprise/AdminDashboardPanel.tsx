/**
 * Phase 13.4 — Admin Dashboard Panel
 * Enterprise administration interface with 7 tabs.
 */
import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';

const TABS = ['Overview', 'Users', 'Models', 'SSO', 'Analytics', 'Settings', 'License'] as const;
type TabName = typeof TABS[number];

export const AdminDashboardPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>('Overview');
  const { adminDashboard, adminUsers, registeredModels, ssoProviders, usageDashboard, adminSettings, license } = useChatStore();

  useEffect(() => {
    vscodeApi.postMessage({ type: 'requestAdminDashboard' });
  }, []);

  const loadTab = (tab: TabName) => {
    setActiveTab(tab);
    switch (tab) {
      case 'Users': vscodeApi.postMessage({ type: 'requestUsers' }); break;
      case 'Models': vscodeApi.postMessage({ type: 'requestModels' }); break;
      case 'SSO': vscodeApi.postMessage({ type: 'requestSSOProviders' }); break;
      case 'Analytics': vscodeApi.postMessage({ type: 'requestUsageDashboard' }); break;
      case 'Settings': vscodeApi.postMessage({ type: 'requestAdminSettings' }); break;
      case 'License': vscodeApi.postMessage({ type: 'requestLicense' }); break;
    }
  };

  return (
    <div className="admin-dashboard" style={{ padding: '12px', height: '100%', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Admin Dashboard</h2>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => loadTab(tab)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px',
              background: activeTab === tab ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)',
              color: activeTab === tab ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            }}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' && <OverviewTab data={adminDashboard} />}
      {activeTab === 'Users' && <UsersTab data={adminUsers} />}
      {activeTab === 'Models' && <ModelsTab models={registeredModels || []} />}
      {activeTab === 'SSO' && <SSOTab providers={ssoProviders || []} />}
      {activeTab === 'Analytics' && <AnalyticsTab data={usageDashboard} />}
      {activeTab === 'Settings' && <SettingsTab settings={adminSettings || []} />}
      {activeTab === 'License' && <LicenseTab license={license} />}
    </div>
  );
};

const Card: React.FC<{ title: string; value: string | number; subtitle?: string }> = ({ title, value, subtitle }) => (
  <div style={{ background: 'var(--vscode-input-background)', borderRadius: '8px', padding: '12px', flex: '1', minWidth: '120px' }}>
    <div style={{ fontSize: '11px', opacity: 0.7 }}>{title}</div>
    <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>{value}</div>
    {subtitle && <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '2px' }}>{subtitle}</div>}
  </div>
);

const OverviewTab: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <div style={{ opacity: 0.5 }}>Loading...</div>;
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Card title="Active Users" value={data.userStats?.active || 0} subtitle={`${data.userStats?.total || 0} total`} />
        <Card title="Requests (30d)" value={data.usageStats?.totalRequests?.toLocaleString() || 0} />
        <Card title="Tokens Used" value={formatTokens(data.usageStats?.totalTokens || 0)} />
        <Card title="Avg Latency" value={`${data.usageStats?.avgLatencyMs || 0}ms`} />
      </div>
      <div style={{ background: 'var(--vscode-input-background)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>System Health</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px' }}>
          <span>Status: <strong style={{ color: data.systemHealth?.status === 'healthy' ? '#22c55e' : '#ef4444' }}>{data.systemHealth?.status}</strong></span>
          <span>Version: {data.systemHealth?.version}</span>
          <span>Node: {data.systemHealth?.nodeVersion}</span>
          <span>DB Size: {data.systemHealth?.dbSize}</span>
        </div>
      </div>
      <div style={{ background: 'var(--vscode-input-background)', borderRadius: '8px', padding: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Security</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px' }}>
          <span>Audit Entries: {data.securityStats?.auditEntries?.toLocaleString()}</span>
          <span>Active Sessions: {data.securityStats?.activeSessions}</span>
        </div>
      </div>
    </div>
  );
};

const UsersTab: React.FC<{ data: any }> = ({ data }) => {
  const [search, setSearch] = useState('');
  if (!data) return <div style={{ opacity: 0.5 }}>Loading users...</div>;
  return (
    <div>
      <input type="text" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && vscodeApi.postMessage({ type: 'requestUsers', filters: { search } })}
        style={{ width: '100%', padding: '8px', marginBottom: '12px', background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-input-border)', borderRadius: '6px', color: 'var(--vscode-input-foreground)' }} />
      <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '8px' }}>Total: {data.total} users</div>
      {data.users?.map((user: any) => (
        <div key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'var(--vscode-input-background)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{user.name || user.key_prefix}</div>
            <div style={{ opacity: 0.6, fontSize: '11px' }}>{user.role} | {user.tier}</div>
          </div>
          <span style={{ color: user.is_active ? '#22c55e' : '#ef4444', fontSize: '11px' }}>{user.is_active ? 'Active' : 'Inactive'}</span>
        </div>
      ))}
    </div>
  );
};

const ModelsTab: React.FC<{ models: any[] }> = ({ models }) => (
  <div>
    <button onClick={() => vscodeApi.postMessage({ type: 'showModelRegistration' })}
      style={{ padding: '8px 16px', marginBottom: '12px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
      + Register Model
    </button>
    {models.map((model: any) => (
      <div key={model.id} style={{ padding: '10px', background: 'var(--vscode-input-background)', borderRadius: '8px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>{model.displayName}</span>
            {model.isDefault && <span style={{ marginLeft: '6px', padding: '2px 6px', background: '#3b82f6', borderRadius: '4px', fontSize: '10px', color: 'white' }}>Default</span>}
          </div>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
            background: model.healthStatus === 'healthy' ? '#22c55e20' : model.healthStatus === 'unhealthy' ? '#ef444420' : '#94a3b820',
            color: model.healthStatus === 'healthy' ? '#22c55e' : model.healthStatus === 'unhealthy' ? '#ef4444' : '#94a3b8',
          }}>{model.healthStatus}</span>
        </div>
        <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>
          {model.provider} | {model.modelId} | {model.contextWindow?.toLocaleString()} ctx
          {model.avgLatencyMs && ` | ${model.avgLatencyMs}ms`}
        </div>
        <div style={{ marginTop: '4px', display: 'flex', gap: '4px' }}>
          {model.capabilities?.map((c: string) => (
            <span key={c} style={{ padding: '1px 6px', background: 'var(--vscode-badge-background)', borderRadius: '4px', fontSize: '10px' }}>{c}</span>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const SSOTab: React.FC<{ providers: any[] }> = ({ providers }) => (
  <div>
    <button onClick={() => vscodeApi.postMessage({ type: 'showSSOWizard' })}
      style={{ padding: '8px 16px', marginBottom: '12px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
      + Add SSO Provider
    </button>
    {providers.length === 0 && <div style={{ opacity: 0.5, fontSize: '12px' }}>No SSO providers configured.</div>}
    {providers.map((p: any) => (
      <div key={p.id} style={{ padding: '10px', background: 'var(--vscode-input-background)', borderRadius: '8px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600 }}>{p.displayName || p.name}</span>
            <span style={{ marginLeft: '8px', padding: '2px 6px', background: '#3b82f620', borderRadius: '4px', fontSize: '10px', color: '#3b82f6' }}>{p.type?.toUpperCase()}</span>
          </div>
          <span style={{ color: p.isActive ? '#22c55e' : '#ef4444', fontSize: '11px' }}>{p.isActive ? 'Active' : 'Inactive'}</span>
        </div>
        {p.allowedDomains?.length > 0 && <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>Domains: {p.allowedDomains.join(', ')}</div>}
      </div>
    ))}
  </div>
);

const AnalyticsTab: React.FC<{ data: any }> = ({ data }) => {
  const [days, setDays] = useState(30);
  if (!data) return <div style={{ opacity: 0.5 }}>Loading analytics...</div>;
  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => { setDays(d); vscodeApi.postMessage({ type: 'requestUsageDashboard', days: d }); }}
            style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px',
              background: days === d ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)',
              color: days === d ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            }}>{d}d</button>
        ))}
        <button onClick={() => vscodeApi.postMessage({ type: 'generateUsageReport', format: 'csv', days })}
          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--vscode-input-border)', background: 'transparent', color: 'var(--vscode-foreground)', cursor: 'pointer', fontSize: '11px' }}>
          Export CSV
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Card title="Requests" value={data.overview?.totalRequests?.toLocaleString() || 0} />
        <Card title="Tokens" value={formatTokens(data.overview?.totalTokens || 0)} />
        <Card title="Users" value={data.overview?.uniqueUsers || 0} />
        <Card title="Error Rate" value={`${((data.overview?.errorRate || 0) * 100).toFixed(1)}%`} />
      </div>
      {data.alerts?.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          {data.alerts.map((a: any, i: number) => (
            <div key={i} style={{ padding: '8px', background: a.severity === 'critical' ? '#ef444420' : '#eab30820', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
              {a.message}
            </div>
          ))}
        </div>
      )}
      {data.modelUsage?.length > 0 && (
        <div style={{ background: 'var(--vscode-input-background)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Model Usage</div>
          {data.modelUsage.map((m: any) => (
            <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
              <span style={{ width: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model}</span>
              <div style={{ flex: 1, height: '6px', background: 'var(--vscode-scrollbarSlider-background)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${m.percentage}%`, height: '100%', background: '#3b82f6', borderRadius: '3px' }} />
              </div>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>{m.percentage}%</span>
            </div>
          ))}
        </div>
      )}
      {data.userActivity?.length > 0 && (
        <div style={{ background: 'var(--vscode-input-background)', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Top Users</div>
          {data.userActivity.slice(0, 10).map((u: any) => (
            <div key={u.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <span>{u.name || u.userId.substring(0, 8)}</span>
              <span style={{ opacity: 0.6 }}>{u.requests} reqs | {formatTokens(u.tokens)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SettingsTab: React.FC<{ settings: any[] }> = ({ settings }) => {
  const categories = [...new Set(settings.map(s => s.category))];
  return (
    <div>
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', textTransform: 'capitalize' }}>{cat}</div>
          {settings.filter(s => s.category === cat).map(setting => (
            <div key={setting.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--vscode-input-background)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
              <div>
                <div>{setting.key.split('.').pop()}</div>
                {setting.description && <div style={{ fontSize: '10px', opacity: 0.5 }}>{setting.description}</div>}
              </div>
              <span style={{ fontFamily: 'monospace', opacity: 0.8, fontSize: '11px' }}>{JSON.stringify(setting.value)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const LicenseTab: React.FC<{ license: any }> = ({ license }) => {
  const [key, setKey] = useState('');
  return (
    <div>
      {license ? (
        <div style={{ background: 'var(--vscode-input-background)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>
              {license.plan?.charAt(0).toUpperCase() + license.plan?.slice(1)} Plan
            </span>
            <span style={{ padding: '2px 8px', background: license.isActive ? '#22c55e20' : '#ef444420', color: license.isActive ? '#22c55e' : '#ef4444', borderRadius: '10px', fontSize: '11px' }}>
              {license.isActive ? 'Active' : 'Expired'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            <span>Max Users: {license.maxUsers === -1 ? 'Unlimited' : license.maxUsers}</span>
            <span>Max Models: {license.maxModels === -1 ? 'Unlimited' : license.maxModels}</span>
            <span>Valid From: {new Date(license.validFrom).toLocaleDateString()}</span>
            <span>Valid Until: {license.validUntil ? new Date(license.validUntil).toLocaleDateString() : 'Never'}</span>
          </div>
        </div>
      ) : (
        <div style={{ opacity: 0.5, fontSize: '12px', marginBottom: '12px' }}>No active license.</div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <input type="text" placeholder="Enter license key..." value={key} onChange={e => setKey(e.target.value)}
          style={{ flex: 1, padding: '8px', background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-input-border)', borderRadius: '6px', color: 'var(--vscode-input-foreground)', fontSize: '12px' }} />
        <button onClick={() => { if (key) vscodeApi.postMessage({ type: 'activateLicense', licenseKey: key }); }}
          style={{ padding: '8px 16px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
          Activate
        </button>
      </div>
    </div>
  );
};

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

declare const vscodeApi: { postMessage(msg: any): void };

export default AdminDashboardPanel;
