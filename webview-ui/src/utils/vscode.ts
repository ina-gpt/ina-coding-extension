import type { VSCodeAPI, WebviewMessage } from '@/types';

declare function acquireVsCodeApi(): VSCodeAPI;

let vscodeApi: VSCodeAPI | null = null;

export function getVSCodeAPI(): VSCodeAPI {
  if (!vscodeApi) { vscodeApi = acquireVsCodeApi(); }
  return vscodeApi;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function postMessage(message: WebviewMessage | Record<string, any>): void {
  getVSCodeAPI().postMessage(message);
}

export function onMessage(callback: (message: Record<string, unknown>) => void): () => void {
  const handler = (event: MessageEvent) => { callback(event.data); };
  window.addEventListener('message', handler);
  return () => { window.removeEventListener('message', handler); };
}

export function copyToClipboard(text: string): void { postMessage({ type: 'copyToClipboard', text }); }
export function insertCode(code: string): void { postMessage({ type: 'insertCode', code }); }
export function openFile(path: string): void { postMessage({ type: 'openFile', path }); }
