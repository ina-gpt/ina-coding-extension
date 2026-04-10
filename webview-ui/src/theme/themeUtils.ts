/** Theme utility functions for webview */
export function getThemeColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--ina-${kebab(token)}`).trim();
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function kebab(str: string): string { return str.replace(/([A-Z])/g, '-$1').toLowerCase(); }
