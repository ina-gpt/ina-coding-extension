import React, { useState } from 'react';
import { Sun, Moon, Monitor, Eye, Check, Palette } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

const ACCENT_PRESETS = [
  { name: 'Blue', color: '#2563eb' }, { name: 'Purple', color: '#7c3aed' },
  { name: 'Teal', color: '#0d9488' }, { name: 'Green', color: '#16a34a' },
  { name: 'Orange', color: '#ea580c' }, { name: 'Pink', color: '#db2777' },
  { name: 'Red', color: '#dc2626' }, { name: 'Cyan', color: '#0891b2' },
  { name: 'INA Brand', color: '#3b82f6' },
];

export function ThemeSettingsPanel() {
  const { themeConfig, availableThemes } = useChatStore();
  const [customHex, setCustomHex] = useState('');
  const config = themeConfig || { mode: 'auto', customAccentColor: null, customThemeId: null, fontSize: 'medium' as const, fontFamily: null, codeFontFamily: null, borderRadius: 'medium' as const, compactMode: false, animateThemeChange: true, syncWithVSCode: true };

  const modes = [
    { id: 'auto', label: 'Auto', icon: <Monitor size={16} />, desc: 'Sync with VS Code' },
    { id: 'light', label: 'Light', icon: <Sun size={16} />, desc: 'Light theme' },
    { id: 'dark', label: 'Dark', icon: <Moon size={16} />, desc: 'Dark theme' },
    { id: 'high-contrast-dark', label: 'High Contrast', icon: <Eye size={16} />, desc: 'High contrast' },
  ];

  return (
    <div className="p-3 space-y-4 text-sm">
      <h3 className="font-medium flex items-center gap-2"><Palette size={16} /> Theme Settings</h3>

      {/* Mode */}
      <div>
        <div className="text-xs font-medium mb-2 text-[var(--vscode-descriptionForeground)]">Theme Mode</div>
        <div className="grid grid-cols-2 gap-2">
          {modes.map(m => (
            <button key={m.id} onClick={() => postMessage({ type: 'setThemeMode', mode: m.id } as any)}
              className={clsx('p-2 rounded border text-left text-xs', config.mode === m.id ? 'border-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/10' : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]')}>
              <div className="flex items-center gap-2">{m.icon}<span className="font-medium">{m.label}</span>{config.mode === m.id && <Check size={12} />}</div>
              <div className="text-[var(--vscode-descriptionForeground)] mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Theme Presets */}
      {availableThemes && availableThemes.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-2 text-[var(--vscode-descriptionForeground)]">Presets</div>
          <div className="grid grid-cols-3 gap-1.5">
            {availableThemes.map((t: any) => (
              <button key={t.id} onClick={() => postMessage({ type: 'setTheme', themeId: t.id } as any)}
                className={clsx('p-1.5 rounded border text-xs', config.customThemeId === t.id ? 'border-[var(--ina-accent-primary,#3b82f6)]' : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]')}>
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-full" style={{ background: t.colors?.accentPrimary || '#3b82f6' }} />
                  <span className="truncate">{t.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Accent Color */}
      <div>
        <div className="text-xs font-medium mb-2 text-[var(--vscode-descriptionForeground)]">Accent Color</div>
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_PRESETS.map(p => (
            <button key={p.name} onClick={() => postMessage({ type: 'setAccentColor', color: p.color } as any)}
              className={clsx('h-6 w-6 rounded-full border-2 transition-transform hover:scale-110', config.customAccentColor === p.color ? 'border-white scale-110' : 'border-transparent')}
              style={{ background: p.color }} title={p.name} />
          ))}
          <div className="flex items-center gap-1 ml-1">
            <input type="text" value={customHex} onChange={e => setCustomHex(e.target.value)}
              placeholder="#hex" className="w-16 px-1 py-0.5 text-xs rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)]"
              onKeyDown={e => { if (e.key === 'Enter' && /^#[0-9a-fA-F]{6}$/.test(customHex)) postMessage({ type: 'setAccentColor', color: customHex } as any); }} />
          </div>
        </div>
      </div>

      {/* Font Size */}
      <div>
        <div className="text-xs font-medium mb-2 text-[var(--vscode-descriptionForeground)]">Font Size</div>
        <div className="flex gap-1.5">
          {(['small', 'medium', 'large'] as const).map(s => (
            <button key={s} onClick={() => postMessage({ type: 'setFontSize', size: s } as any)}
              className={clsx('px-3 py-1 rounded text-xs border', config.fontSize === s ? 'border-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/10' : 'border-[var(--vscode-panel-border)]')}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Border Radius */}
      <div>
        <div className="text-xs font-medium mb-2 text-[var(--vscode-descriptionForeground)]">Border Radius</div>
        <div className="flex gap-1.5">
          {(['none', 'small', 'medium', 'large'] as const).map(r => (
            <button key={r} onClick={() => postMessage({ type: 'setBorderRadius', level: r } as any)}
              className={clsx('px-3 py-1 text-xs border', config.borderRadius === r ? 'border-[var(--ina-accent-primary,#3b82f6)]' : 'border-[var(--vscode-panel-border)]')}
              style={{ borderRadius: { none: '0', small: '2px', medium: '6px', large: '12px' }[r] }}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Mode */}
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={config.compactMode} onChange={e => postMessage({ type: 'setCompactMode', compact: e.target.checked } as any)} className="rounded" />
        Compact mode (reduced spacing)
      </label>

      {/* Reset */}
      <button onClick={() => postMessage({ type: 'resetTheme' } as any)} className="text-xs text-[var(--vscode-descriptionForeground)] hover:underline">
        Reset to defaults
      </button>
    </div>
  );
}
