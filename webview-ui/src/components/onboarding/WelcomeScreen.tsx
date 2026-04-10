import React, { useState, useEffect } from 'react';
import { MessageSquare, Edit3, Zap, Bot, Search, BookOpen, Sparkles, ChevronRight, Sun, Moon, Monitor, Check } from 'lucide-react';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface WelcomeScreenProps {
  onStart: () => void;
  onSkip: () => void;
  onDismiss: () => void;
  userName: string | null;
}

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'fa', flag: '🇮🇷', label: 'فارسی' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
  { code: 'ko', flag: '🇰🇷', label: '한국어' },
  { code: 'ru', flag: '🇷🇺', label: 'Русский' },
  { code: 'pt', flag: '🇧🇷', label: 'Português' },
];

const EXPERIENCE_LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'Explain everything in detail', icon: '🌱' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Moderate explanations', icon: '🌿' },
  { id: 'advanced', label: 'Advanced', desc: 'Brief, code-focused', icon: '🌳' },
  { id: 'expert', label: 'Expert', desc: 'Minimal text, trade-offs', icon: '⚡' },
];

const ACCENT_COLORS = [
  { name: 'Blue', color: '#2563eb' },
  { name: 'Purple', color: '#7c3aed' },
  { name: 'Teal', color: '#0d9488' },
  { name: 'Green', color: '#16a34a' },
  { name: 'Orange', color: '#ea580c' },
  { name: 'INA Brand', color: '#3b82f6' },
];

export function WelcomeScreen({ onStart, onSkip, onDismiss, userName }: WelcomeScreenProps) {
  const [page, setPage] = useState(0);
  const [selectedLang, setSelectedLang] = useState('en');
  const [selectedExp, setSelectedExp] = useState('intermediate');
  const [selectedThemeMode, setSelectedThemeMode] = useState('auto');
  const [selectedAccent, setSelectedAccent] = useState('#3b82f6');
  const [showHints, setShowHints] = useState(true);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => { setTimeout(() => setFadeIn(true), 50); }, []);

  const handleComplete = () => {
    // Apply preferences
    postMessage({ type: 'completeOnboardingStep', step: 'welcome' } as any);
    postMessage({ type: 'setThemeMode', mode: selectedThemeMode } as any);
    postMessage({ type: 'setAccentColor', color: selectedAccent } as any);
    postMessage({ type: 'applyOnboardingPrefs', language: selectedLang, experience: selectedExp, showHints } as any);
    onStart();
  };

  const handleSkip = () => {
    postMessage({ type: 'skipOnboarding' } as any);
    onSkip();
  };

  return (
    <div className={clsx('fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-500', fadeIn ? 'opacity-100' : 'opacity-0')}>
      <div className="w-full max-w-lg mx-4 rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl overflow-hidden">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-4">
          {[0, 1, 2].map(i => (
            <div key={i} className={clsx('h-1.5 rounded-full transition-all duration-300', page === i ? 'w-6 bg-[var(--ina-accent-primary,#3b82f6)]' : 'w-1.5 bg-[var(--vscode-descriptionForeground)] opacity-30')} />
          ))}
        </div>

        <div className="p-6 overflow-y-auto max-h-[80vh]">
          {/* PAGE 0 — Welcome */}
          {page === 0 && (
            <div className={clsx('space-y-5 transition-all duration-300', fadeIn ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0')}>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--ina-accent-primary,#4f46e5)] to-[var(--ina-accent-secondary,#7c3aed)] flex items-center justify-center mb-4 shadow-lg">
                  <Sparkles size={32} className="text-[var(--ina-accent-primary-text,#fff)]" />
                </div>
                <h2 className="text-xl font-semibold">{userName ? `Welcome, ${userName}!` : 'Welcome to INA Coding'}</h2>
                <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">Your AI-powered coding assistant</p>
                <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 opacity-60">Privacy-first · Self-hosted · GDPR compliant</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <MessageSquare size={16} />, title: 'AI Chat', desc: 'Ask coding questions with full context' },
                  { icon: <Edit3 size={16} />, title: 'Inline Edit', desc: 'Edit code with Cmd+K' },
                  { icon: <Zap size={16} />, title: 'Tab Completion', desc: 'AI-powered autocomplete' },
                  { icon: <Bot size={16} />, title: 'Agent Mode', desc: 'Multi-file automated editing' },
                  { icon: <Search size={16} />, title: 'Codebase Search', desc: 'Semantic code search' },
                  { icon: <BookOpen size={16} />, title: 'Doc Search', desc: 'Index and search documentation' },
                ].map(f => (
                  <div key={f.title} className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]">
                    <span className="text-[var(--ina-accent-primary,#3b82f6)] mt-0.5">{f.icon}</span>
                    <div>
                      <div className="text-xs font-medium">{f.title}</div>
                      <div className="text-xs text-[var(--vscode-descriptionForeground)]">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPage(1)} className="flex-1 py-2.5 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  Get Started <ChevronRight size={16} />
                </button>
                <button onClick={handleSkip} className="px-4 py-2.5 rounded-lg text-sm text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* PAGE 1 — Quick Setup */}
          {page === 1 && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-semibold">Quick Setup</h2>
                <p className="text-xs text-[var(--vscode-descriptionForeground)]">Takes about 60 seconds</p>
              </div>

              {/* Language */}
              <div>
                <div className="text-xs font-medium mb-2">Response Language</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {LANGUAGES.map(l => (
                    <button key={l.code} onClick={() => setSelectedLang(l.code)}
                      className={clsx('p-1.5 rounded border text-xs flex items-center gap-1 transition-colors',
                        selectedLang === l.code ? 'border-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/10' : 'border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]')}>
                      <span>{l.flag}</span>
                      <span className="truncate">{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience */}
              <div>
                <div className="text-xs font-medium mb-2">Experience Level</div>
                <div className="grid grid-cols-2 gap-2">
                  {EXPERIENCE_LEVELS.map(e => (
                    <button key={e.id} onClick={() => setSelectedExp(e.id)}
                      className={clsx('p-2 rounded border text-left text-xs transition-colors',
                        selectedExp === e.id ? 'border-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/10' : 'border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]')}>
                      <div className="flex items-center gap-1.5"><span>{e.icon}</span><span className="font-medium">{e.label}</span>{selectedExp === e.id && <Check size={12} />}</div>
                      <div className="text-[var(--vscode-descriptionForeground)] mt-0.5">{e.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div>
                <div className="text-xs font-medium mb-2">Theme</div>
                <div className="flex gap-2 mb-2">
                  {[
                    { id: 'auto', label: 'Auto', icon: <Monitor size={14} /> },
                    { id: 'light', label: 'Light', icon: <Sun size={14} /> },
                    { id: 'dark', label: 'Dark', icon: <Moon size={14} /> },
                  ].map(t => (
                    <button key={t.id} onClick={() => setSelectedThemeMode(t.id)}
                      className={clsx('flex-1 p-2 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors',
                        selectedThemeMode === t.id ? 'border-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/10' : 'border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]')}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--vscode-descriptionForeground)]">Accent:</span>
                  {ACCENT_COLORS.map(c => (
                    <button key={c.color} onClick={() => setSelectedAccent(c.color)}
                      className={clsx('w-6 h-6 rounded-full border-2 transition-transform', selectedAccent === c.color ? 'border-[var(--vscode-foreground)] scale-110' : 'border-transparent')}
                      style={{ backgroundColor: c.color }} title={c.name} />
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPage(0)} className="px-4 py-2.5 rounded-lg text-sm text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
                  ← Back
                </button>
                <button onClick={() => setPage(2)} className="flex-1 py-2.5 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  Continue <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* PAGE 2 — Ready */}
          {page === 2 && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="text-3xl mb-2">🎉</div>
                <h2 className="text-lg font-semibold">You're all set!</h2>
                <p className="text-xs text-[var(--vscode-descriptionForeground)]">Choose how you'd like to get started</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: '🧭', title: 'Take the Tour', desc: 'Quick 3-min feature tour', action: () => { handleComplete(); postMessage({ type: 'startTour', tourId: 'essential-features' } as any); } },
                  { icon: '🎓', title: 'Try the Tutorial', desc: 'Interactive hands-on lessons', action: () => { handleComplete(); postMessage({ type: 'startTutorial' } as any); } },
                  { icon: '⌨️', title: 'View Shortcuts', desc: 'Keyboard shortcuts reference', action: () => { handleComplete(); postMessage({ type: 'requestShortcuts' } as any); } },
                  { icon: '💬', title: 'Start Chatting', desc: 'Jump right in', action: handleComplete },
                ].map(item => (
                  <button key={item.title} onClick={item.action}
                    className="p-3 rounded-lg border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--ina-accent-primary,#3b82f6)] text-left transition-colors">
                    <div className="text-lg mb-1">{item.icon}</div>
                    <div className="text-xs font-medium">{item.title}</div>
                    <div className="text-xs text-[var(--vscode-descriptionForeground)]">{item.desc}</div>
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--vscode-descriptionForeground)] cursor-pointer">
                <input type="checkbox" checked={showHints} onChange={e => setShowHints(e.target.checked)}
                  className="accent-[var(--ina-accent-primary,#3b82f6)]" />
                Show tips as I explore features
              </label>

              <div className="flex gap-3">
                <button onClick={() => setPage(1)} className="px-4 py-2.5 rounded-lg text-sm text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
                  ← Back
                </button>
                <button onClick={handleComplete} className="flex-1 py-2.5 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-sm font-medium hover:opacity-90 transition-opacity">
                  Let's Go!
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
