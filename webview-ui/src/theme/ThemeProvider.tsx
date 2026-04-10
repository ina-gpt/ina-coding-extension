import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { postMessage } from '@/utils/vscode';

interface ThemeContextType {
  mode: string;
  themeId: string;
  isDark: boolean;
  isHighContrast: boolean;
  setTheme: (id: string) => void;
  setMode: (mode: string) => void;
  setAccentColor: (color: string) => void;
  setFontSize: (size: string) => void;
  setBorderRadius: (level: string) => void;
  setCompactMode: (compact: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark', themeId: 'ina-dark', isDark: true, isHighContrast: false,
  setTheme: () => {}, setMode: () => {}, setAccentColor: () => {},
  setFontSize: () => {}, setBorderRadius: () => {}, setCompactMode: () => {},
});

export function ThemeProvider({ children, initialCSS }: { children: React.ReactNode; initialCSS?: string }) {
  const [mode, setModeState] = useState('dark');
  const [themeId, setThemeId] = useState('ina-dark');

  useEffect(() => {
    if (initialCSS) injectCSS(initialCSS);
  }, [initialCSS]);

  const setTheme = useCallback((id: string) => { setThemeId(id); postMessage({ type: 'setTheme', themeId: id } as any); }, []);
  const setMode = useCallback((m: string) => { setModeState(m); postMessage({ type: 'setThemeMode', mode: m } as any); }, []);
  const setAccentColor = useCallback((color: string) => { postMessage({ type: 'setAccentColor', color } as any); }, []);
  const setFontSize = useCallback((size: string) => { postMessage({ type: 'setFontSize', size } as any); }, []);
  const setBorderRadius = useCallback((level: string) => { postMessage({ type: 'setBorderRadius', level } as any); }, []);
  const setCompactMode = useCallback((compact: boolean) => { postMessage({ type: 'setCompactMode', compact } as any); }, []);

  const isDark = mode === 'dark' || mode === 'high-contrast-dark';
  const isHighContrast = mode.includes('high-contrast');

  return (
    <ThemeContext.Provider value={{ mode, themeId, isDark, isHighContrast, setTheme, setMode, setAccentColor, setFontSize, setBorderRadius, setCompactMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }

function injectCSS(css: string) {
  let el = document.getElementById('ina-theme-vars');
  if (!el) { el = document.createElement('style'); el.id = 'ina-theme-vars'; document.head.appendChild(el); }
  el.textContent = css;
}
