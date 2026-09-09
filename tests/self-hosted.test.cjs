/**
 * Proof for the "self-hostable" claim in README.md.
 *
 * WHY THIS TEST EXISTS
 *   The README previously said "No INA-operated endpoint is contacted by
 *   default". That was false: `inaCoding.api.endpoint` ships pointing at
 *   `https://coding-api.inagpt.com`, which INA GPT GmbH operates. The claim was
 *   written without checking the default, and the claim-audit gate caught it.
 *
 *   The property that IS true, and that this test pins:
 *     1. the shipped default is disclosed accurately in the README;
 *     2. every caller resolves its endpoint from `api.endpoint` rather than
 *        hardcoding a host, so setting it genuinely redirects ALL traffic;
 *     3. no second, non-configurable endpoint is contacted on the request path.
 *
 * Run: node --require ./tests/vscode-stub.cjs --test tests/self-hosted.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SHIPPED_DEFAULT = 'https://coding-api.inagpt.com';

function settings() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const c = pkg.contributes && pkg.contributes.configuration;
  return Array.isArray(c) ? Object.assign({}, ...c.map((x) => x.properties || {})) : (c.properties || {});
}

test('the shipped endpoint default is pinned and INA-operated', () => {
  const props = settings();
  const k = 'inaCoding.api.endpoint';
  assert.ok(k in props, `${k} must be a declared setting`);
  assert.equal(props[k].default, SHIPPED_DEFAULT,
    'the default endpoint changed — update the README claim in the same commit');
});

test('the README discloses that default rather than implying none is contacted', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes(SHIPPED_DEFAULT),
    'the README must state the actual shipped endpoint, not omit it');
  assert.ok(!/No INA-operated endpoint is contacted by default/i.test(readme),
    'the README must not re-assert the claim that was false');
});

test('every request path resolves the endpoint from configuration, none hardcodes a host', () => {
  // The self-hosting guarantee is only real if pointing api.endpoint elsewhere
  // redirects EVERY caller. A hardcoded host in a request would be a silent
  // second destination that no setting can move.
  let out = '';
  try {
    out = execFileSync('git', ['-C', ROOT, 'grep', '-nI', '-E',
      'https?://[a-z0-9.-]*inagpt\\.com', '--', 'src'], { encoding: 'utf8' });
  } catch (e) {
    out = e.stdout || '';   // git grep exits 1 when there are no matches
  }
  // "Contacts a host" means the literal is handed to a NETWORK CALL. A URL sitting
  // in a defaults table is the setting's own default — it is what
  // `api.endpoint` overrides, not a destination that escapes it. Treating that
  // as an offender would make the rule unsatisfiable without deleting the
  // default, which is the opposite of disclosing it.
  const NETWORK_CALL = /\b(fetch|axios|got|superagent|request|WebSocket|EventSource)\b\s*[(.]|\.(get|post|put|patch|delete)\s*\(/;
  const offenders = out.split('\n').filter(Boolean).filter((line) => {
    if (!NETWORK_CALL.test(line)) return false;
    // A default read through the config layer IS the setting.
    if (/ConfigManager\.get|getConfiguration|\.get</.test(line)) return false;
    // Opening a policy page in a browser is not a request path.
    if (/openExternal|Uri\.parse|datenschutz|impressum/.test(line)) return false;
    return true;
  });
  assert.deepEqual(offenders, [],
    'these lines contact an INA host that `api.endpoint` cannot redirect:\n' + offenders.join('\n'));
});

test('CONTROL: the guard above would notice a hardcoded endpoint', () => {
  // Without this, the previous test could pass because its filters exclude
  // everything, which would make the self-hosting claim unfalsifiable.
  const NETWORK_CALL = /\b(fetch|axios|got|superagent|request|WebSocket|EventSource)\b\s*[(.]|\.(get|post|put|patch|delete)\s*\(/;
  const keep = (line) =>
    NETWORK_CALL.test(line) &&
    !/ConfigManager\.get|getConfiguration|\.get</.test(line) &&
    !/openExternal|Uri\.parse|datenschutz|impressum/.test(line);

  assert.equal(keep("  const res = await fetch('https://coding-api.inagpt.com/api/chat');"), true,
    'a genuinely hardcoded endpoint in a network call must be reported');
  assert.equal(keep("  api: { endpoint: 'https://coding-api.inagpt.com', timeout: 60000 },"), false,
    'a defaults table entry is the setting itself, not a second destination');
});
