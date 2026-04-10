/**
 * Phase 12.2 — New API Key Dialog
 */
import React, { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface PermissionItem {
  name: string;
  description: string | null;
  category: string;
  isDefault: boolean;
}

interface NewKeyDialogProps {
  permissions: PermissionItem[];
  onSubmit: (data: {
    name: string;
    role: string;
    rateLimitTier: string;
    scopes: string[];
    expiresInDays: number | null;
  }) => void;
  onCancel: () => void;
  generatedKey?: string | null;
  onKeySaved?: () => void;
}

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Full access to all features' },
  { value: 'developer', label: 'Developer', desc: 'Code, agent, index, docs access' },
  { value: 'user', label: 'User', desc: 'Chat, completion, search, memory' },
  { value: 'readonly', label: 'Read Only', desc: 'View-only access' },
  { value: 'service', label: 'Service', desc: 'Only explicit scopes' },
];

const TIERS = [
  { value: 'free', label: 'Free', desc: '10/min, 100/hr, 500/day' },
  { value: 'standard', label: 'Standard', desc: '30/min, 500/hr, 5K/day' },
  { value: 'pro', label: 'Pro', desc: '100/min, 2K/hr, 20K/day' },
  { value: 'unlimited', label: 'Unlimited', desc: '1K/min, 50K/hr, 500K/day' },
];

const EXPIRY = [
  { value: null, label: 'Never' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
];

export const NewKeyDialog: React.FC<NewKeyDialogProps> = ({
  permissions, onSubmit, onCancel, generatedKey, onKeySaved
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const [tier, setTier] = useState('standard');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const categories = [...new Set(permissions.map(p => p.category))];

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const handleCopy = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Show generated key
  if (generatedKey) {
    return (
      <div className="p-4 space-y-4 bg-[var(--vscode-editor-background)] rounded-lg border border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2 text-yellow-400">
          <AlertTriangle size={16} />
          <span className="font-semibold text-sm">Save this key now! It won't be shown again.</span>
        </div>

        <div className="relative">
          <div className="p-3 bg-[var(--vscode-input-background)] rounded font-mono text-xs break-all select-all border border-[var(--vscode-input-border)]">
            {generatedKey}
          </div>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>

        <button
          onClick={onKeySaved}
          className="w-full py-2 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm font-medium"
        >
          I've saved my key
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 bg-[var(--vscode-editor-background)] rounded-lg border border-[var(--vscode-panel-border)]">
      <h3 className="font-semibold text-sm">Create New API Key</h3>

      {/* Name */}
      <div>
        <label className="block text-xs mb-1 text-[var(--vscode-descriptionForeground)]">Name *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My API Key"
          className="w-full px-2 py-1.5 text-sm rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]"
        />
      </div>

      {/* Role */}
      <div>
        <label className="block text-xs mb-1 text-[var(--vscode-descriptionForeground)]">Role</label>
        <div className="grid grid-cols-2 gap-1">
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              className={clsx(
                'text-left p-2 rounded border text-xs',
                role === r.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
              )}
            >
              <div className="font-medium">{r.label}</div>
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Tier */}
      <div>
        <label className="block text-xs mb-1 text-[var(--vscode-descriptionForeground)]">Rate Limit Tier</label>
        <div className="grid grid-cols-2 gap-1">
          {TIERS.map(t => (
            <button
              key={t.value}
              onClick={() => setTier(t.value)}
              className={clsx(
                'text-left p-2 rounded border text-xs',
                tier === t.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
              )}
            >
              <div className="font-medium">{t.label}</div>
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Scopes */}
      <div>
        <label className="block text-xs mb-1 text-[var(--vscode-descriptionForeground)]">
          Scopes ({selectedScopes.length} selected)
        </label>
        <div className="max-h-40 overflow-y-auto space-y-2">
          {categories.map(cat => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)] mb-0.5">{cat}</div>
              <div className="flex flex-wrap gap-1">
                {permissions.filter(p => p.category === cat).map(p => (
                  <button
                    key={p.name}
                    onClick={() => toggleScope(p.name)}
                    className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded border',
                      selectedScopes.includes(p.name)
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-[var(--vscode-panel-border)] text-[var(--vscode-descriptionForeground)]'
                    )}
                    title={p.description || undefined}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expiration */}
      <div>
        <label className="block text-xs mb-1 text-[var(--vscode-descriptionForeground)]">Expiration</label>
        <div className="flex gap-1">
          {EXPIRY.map(e => (
            <button
              key={e.label}
              onClick={() => setExpiry(e.value)}
              className={clsx(
                'text-xs px-2 py-1 rounded border',
                expiry === e.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[var(--vscode-panel-border)]'
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-[var(--vscode-panel-border)]">
        <button
          onClick={() => onSubmit({ name, role, rateLimitTier: tier, scopes: selectedScopes, expiresInDays: expiry })}
          disabled={!name.trim()}
          className="flex-1 py-2 rounded bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-40"
        >
          Generate Key
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded bg-[var(--vscode-input-background)] text-sm hover:opacity-80"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
