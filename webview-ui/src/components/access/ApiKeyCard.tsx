/**
 * Phase 12.2 — API Key Card
 */
import React, { useState } from 'react';
import { Key, RotateCw, Trash2, Clock, Activity } from 'lucide-react';
import clsx from 'clsx';

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  role: string;
  rateLimitTier: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

interface ApiKeyCardProps {
  apiKey: ApiKeyData;
  onRotate: (keyId: string) => void;
  onRevoke: (keyId: string) => void;
  onEdit?: (keyId: string) => void;
  isActive: boolean;
}

function timeAgo(date: string | null): string {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-400',
  developer: 'bg-blue-500/20 text-blue-400',
  user: 'bg-green-500/20 text-green-400',
  readonly: 'bg-gray-500/20 text-gray-400',
  service: 'bg-purple-500/20 text-purple-400',
};

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-500/20 text-gray-400',
  standard: 'bg-blue-500/20 text-blue-400',
  pro: 'bg-purple-500/20 text-purple-400',
  unlimited: 'bg-amber-500/20 text-amber-400',
  custom: 'bg-teal-500/20 text-teal-400',
};

export const ApiKeyCard: React.FC<ApiKeyCardProps> = ({ apiKey, onRotate, onRevoke, isActive }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const statusColor = apiKey.isActive
    ? 'text-green-400'
    : apiKey.revokedAt
    ? 'text-red-400'
    : 'text-yellow-400';

  const statusText = apiKey.isActive
    ? 'Active'
    : apiKey.revokedAt
    ? 'Revoked'
    : 'Expired';

  return (
    <div className={clsx(
      'p-3 rounded-lg border',
      apiKey.isActive
        ? 'border-[var(--vscode-panel-border)]'
        : 'border-red-500/30 opacity-60'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-[var(--vscode-descriptionForeground)]" />
          <span className="font-medium text-sm">{apiKey.name}</span>
        </div>
        <span className={clsx('text-xs font-medium', statusColor)}>{statusText}</span>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-[var(--vscode-input-background)]">
          {apiKey.keyPrefix}...
        </span>
        <span className={clsx('text-xs px-1.5 py-0.5 rounded capitalize', ROLE_COLORS[apiKey.role] || '')}>
          {apiKey.role}
        </span>
        <span className={clsx('text-xs px-1.5 py-0.5 rounded capitalize', TIER_COLORS[apiKey.rateLimitTier] || '')}>
          {apiKey.rateLimitTier}
        </span>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-[var(--vscode-descriptionForeground)] mb-2">
        <span className="flex items-center gap-1">
          <Clock size={10} /> {timeAgo(apiKey.lastUsedAt)}
        </span>
        <span className="flex items-center gap-1">
          <Activity size={10} /> {apiKey.usageCount.toLocaleString()} uses
        </span>
      </div>

      {/* Scopes */}
      {apiKey.scopes.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {apiKey.scopes.slice(0, 5).map(s => (
            <span key={s} className="text-[10px] px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
              {s}
            </span>
          ))}
          {apiKey.scopes.length > 5 && (
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              +{apiKey.scopes.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {apiKey.isActive && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-[var(--vscode-panel-border)]">
          <button
            onClick={() => onRotate(apiKey.id)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
          >
            <RotateCw size={10} /> Rotate
          </button>
          {showConfirm ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-400">Sure?</span>
              <button
                onClick={() => { onRevoke(apiKey.id); setShowConfirm(false); }}
                className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                Yes
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="text-xs px-2 py-1 rounded bg-[var(--vscode-input-background)] hover:opacity-80"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
            >
              <Trash2 size={10} /> Revoke
            </button>
          )}
        </div>
      )}
    </div>
  );
};
