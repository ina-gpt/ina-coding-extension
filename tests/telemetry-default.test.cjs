/**
 * Runtime proof for the telemetry default.
 *
 * The README claim is about BEHAVIOUR, so this test asserts behaviour: with NO
 * configuration present, does a telemetry request actually leave the machine?
 *
 * It boots TelemetryClient against a stub editor whose configuration store is
 * EMPTY (every `get(key, fallback)` returns the fallback, which is exactly what
 * a fresh install sees), intercepts global fetch, drives the code paths that
 * would emit, and asserts zero requests to any telemetry endpoint.
 *
 * Reading package.json is not enough on its own: the client carries its OWN
 * fallback in `.get('enabled', <default>)`, so the manifest and the code can
 * disagree. Both are asserted here.
 *
 * Run: node --require ./tests/vscode-stub.cjs --test tests/telemetry-default.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('./vscode-stub.cjs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out');

function req(rel) {
  const p = path.join(OUT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`compiled module missing: ${rel} — run "npm run compile-tests" first`);
  }
  return require(p);
}

/** Record every outbound fetch instead of performing it. */
function interceptFetch() {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || 'GET' });
    return {
      ok: true, status: 200,
      json: async () => ({}),
      text: async () => '',
    };
  };
  return {
    calls,
    restore() { global.fetch = original; },
    telemetry() { return calls.filter((c) => /\/api\/telemetry\//.test(c.url)); },
  };
}

const TELEMETRY_KEYS = [
  'inaCoding.telemetry.enabled',
  'inaCoding.telemetry.abTesting',
  'inaCoding.telemetry.modelRouting',
];

test('DEFAULT: the shipped manifest declares telemetry OFF', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const c = pkg.contributes && pkg.contributes.configuration;
  const props = Array.isArray(c)
    ? Object.assign({}, ...c.map((x) => x.properties || {}))
    : (c.properties || {});
  for (const k of TELEMETRY_KEYS) {
    assert.ok(k in props, `${k} must be a declared setting`);
    assert.equal(props[k].default, false,
      `${k} must ship OFF — the README states zero telemetry by default`);
  }
});

test('DEFAULT: the CODE fallback is OFF, not just the manifest', () => {
  // A user with no setting written gets the code's own fallback, so a manifest
  // default of false with a code fallback of true still sends telemetry.
  const src = fs.readFileSync(
    path.join(ROOT, 'src/services/telemetry/TelemetryClient.ts'), 'utf8');
  const fallbacks = [...src.matchAll(/\.get<boolean>\(\s*'enabled'\s*,\s*(true|false)\s*\)/g)]
    .map((m) => m[1]);
  assert.ok(fallbacks.length > 0, 'the enabled fallback must be readable in the source');
  for (const f of fallbacks) {
    assert.equal(f, 'false',
      'TelemetryClient must default to disabled when no configuration exists');
  }
});

test('RUNTIME: with an EMPTY configuration, zero telemetry requests are sent', async () => {
  const { TelemetryClient } = req('services/telemetry/TelemetryClient.js');
  const net = interceptFetch();
  let client;
  try {
    // The vscode stub's getConfiguration returns the caller's fallback for every
    // key — precisely a fresh install with nothing configured.
    client = new TelemetryClient('https://telemetry.invalid', async () => ({}));

    // Drive the paths that would emit if telemetry were on.
    if (typeof client.track === 'function') {
      client.track('test_event', { a: 1 });
      client.track('another_event', { b: 2 });
    }
    if (typeof client.flush === 'function') await client.flush();
    // A second flush proves the queue was never filled, not merely drained.
    if (typeof client.flush === 'function') await client.flush();

    const hits = net.telemetry();
    assert.deepEqual(hits, [],
      `expected zero telemetry requests with an empty configuration, got:\n` +
      hits.map((h) => `  ${h.method} ${h.url}`).join('\n'));
  } finally {
    if (client && typeof client.dispose === 'function') {
      try { client.dispose(); } catch { /* disposal must not mask the assertion */ }
    }
    net.restore();
  }
});

test('CONTROL: when telemetry is explicitly ENABLED, requests DO flow', async () => {
  // Without this the test above would pass on a client that can never send
  // anything at all — an inert feature would read as a privacy guarantee.
  const vscode = require('./vscode-stub.cjs');
  const { TelemetryClient } = req('services/telemetry/TelemetryClient.js');
  const originalGet = vscode.workspace.getConfiguration;
  const net = interceptFetch();
  let client;
  try {
    vscode.workspace.getConfiguration = () => ({
      get: (_k, _d) => true,          // operator has switched telemetry on
      update: async () => {}, has: () => true,
    });
    client = new TelemetryClient('https://telemetry.invalid', async () => ({}));
    if (typeof client.track === 'function') client.track('test_event', { a: 1 });
    if (typeof client.flush === 'function') await client.flush();

    assert.ok(net.telemetry().length > 0,
      'with telemetry explicitly enabled the client must actually send — otherwise ' +
      'the "off by default" proof above is vacuous');
  } finally {
    if (client && typeof client.dispose === 'function') {
      try { client.dispose(); } catch { /* ignore */ }
    }
    vscode.workspace.getConfiguration = originalGet;
    net.restore();
  }
});
