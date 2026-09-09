/**
 * Minimal `vscode` module stub so claim tests can run headlessly.
 *
 * The repository's own test script boots a real VS Code (`runTest.js`), which
 * cannot run in CI without a display server. The security and privacy claims in
 * README.md are pure logic, so they are proven here against the compiled
 * modules with the editor API stubbed to the small surface they actually touch.
 *
 * Preload with: node --require ./tests/vscode-stub.cjs
 */
const Module = require('node:module');

const memoSecrets = new Map();

const vscodeStub = {
  window: {
    createOutputChannel: () => ({
      appendLine() {}, append() {}, clear() {}, show() {}, hide() {}, dispose() {},
    }),
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  },
  workspace: {
    workspaceFolders: undefined,
    asRelativePath: (p) => String(p),
    findFiles: async () => [],
    getConfiguration: () => ({ get: (_k, d) => d, update: async () => {}, has: () => false }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
  env: { machineId: 'stub-machine-id-for-tests' },
  Uri: { file: (p) => ({ fsPath: p, path: p, scheme: 'file' }) },
  EventEmitter: class {
    constructor() { this._h = []; this.event = (fn) => { this._h.push(fn); return { dispose: () => {} }; }; }
    fire(x) { for (const h of this._h) h(x); }
    dispose() {}
  },
  Disposable: class { constructor(fn) { this._fn = fn; } dispose() { if (this._fn) this._fn(); } },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
};

/** A stand-in ExtensionContext with a working in-memory SecretStorage. */
vscodeStub.__makeContext = function makeContext() {
  return {
    subscriptions: [],
    extensionMode: 3,
    globalState: { get: (k, d) => d, update: async () => {}, keys: () => [] },
    workspaceState: { get: (k, d) => d, update: async () => {}, keys: () => [] },
    secrets: {
      get: async (k) => memoSecrets.get(k),
      store: async (k, v) => { memoSecrets.set(k, v); },
      delete: async (k) => { memoSecrets.delete(k); },
      onDidChange: () => ({ dispose() {} }),
    },
    extensionPath: process.cwd(),
    globalStorageUri: { fsPath: require('node:os').tmpdir() },
  };
};

const origLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscodeStub;
  return origLoad.apply(this, arguments);
};

module.exports = vscodeStub;
