/**
 * Executable proof for the security and privacy claims made in README.md.
 *
 * BRANDING.md §4: a security claim may sit under "Features" only if it has an
 * implementation AND a test that proves it. Every claim below is anchored to
 * the exact README bullet it supports; if a test here is deleted, the
 * corresponding claim must move to "Roadmap" in the same commit.
 *
 * Run: node --require ./tests/vscode-stub.cjs --test tests/claims.test.cjs
 * (requires `npm run compile-tests` first — these exercise the compiled output,
 *  not a re-implementation of it.)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const vscode = require('./vscode-stub.cjs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out');

function req(rel) {
  const p = path.join(OUT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(
      `compiled module missing: ${rel} — run "npm run compile-tests" before the claim tests`
    );
  }
  return require(p);
}

function settings() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const c = pkg.contributes && pkg.contributes.configuration;
  if (!c) throw new Error('package.json declares no configuration');
  return Array.isArray(c)
    ? Object.assign({}, ...c.map((x) => x.properties || {}))
    : (c.properties || {});
}

// ---------------------------------------------------------------------------
// DOCUMENTATION INTEGRITY
//
// This is the test that caught the defect the whole claim audit exists to find:
// README.md documented `inaCoding.privacy.telemetryEnabled` with a default of
// `false` and advertised "Zero telemetry by default". That setting does not
// exist in package.json, and the settings that DO exist
// (`inaCoding.telemetry.enabled`, `.abTesting`, `.modelRouting`) ship `true`.
// A privacy property advertised on a public surface and contradicted by the
// shipped default is a §5 UWG exposure, not a documentation nit.
// ---------------------------------------------------------------------------
test('DOC-INTEGRITY: every setting named in the README exists in package.json', () => {
  const props = settings();
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const referenced = [...readme.matchAll(/`(inaCoding\.[A-Za-z0-9_.]+)`/g)].map((m) => m[1]);
  assert.ok(referenced.length > 0, 'the README must document at least one setting');
  const missing = [...new Set(referenced)].filter((k) => !(k in props));
  assert.deepEqual(missing, [],
    `README documents setting(s) that do not exist: ${missing.join(', ')}`);
});

test('TELEMETRY DEFAULTS are pinned, so a silent flip shows up as a diff', () => {
  const props = settings();
  // These are the values as SHIPPED, asserted so that any change to them is a
  // deliberate, reviewable edit rather than a quiet drift away from whatever
  // the README says. They are deliberately NOT asserted to be "privacy-safe" —
  // that is a product decision, and this test's job is visibility, not policy.
  const pinned = {
    // Flipped to false on 2026-09-09 after tests/telemetry-default.test.cjs
    // proved that an empty configuration still sent telemetry. Origin of the
    // `true` defaults AND of the contradicting README claim: commit 3cf5f96,
    // the initial commit — they were inconsistent from day one.
    'inaCoding.telemetry.enabled': false,
    'inaCoding.telemetry.abTesting': false,
    'inaCoding.telemetry.modelRouting': false,
    'inaCoding.telemetry.retentionDays': 180,
    'inaCoding.privacy.telemetry': 'off',
    'inaCoding.privacy.encryptAtRest': true,
    'inaCoding.privacy.secretDetection': true,
  };
  for (const [k, v] of Object.entries(pinned)) {
    assert.ok(k in props, `${k} must remain a declared setting`);
    assert.deepEqual(props[k].default, v,
      `${k} default changed to ${JSON.stringify(props[k].default)} — update README.md in the same commit`);
  }
});

// ---------------------------------------------------------------------------
// CLAIM: "Encryption at rest: AES-256-GCM for stored data"
// ---------------------------------------------------------------------------
test('CLAIM aes-256-gcm: round-trips, and a tampered ciphertext does not decrypt', async () => {
  const { DataEncryptionService } = req('services/privacy/DataEncryptionService.js');
  const svc = DataEncryptionService.getInstance();
  await svc.initialize(vscode.__makeContext());
  assert.equal(svc.isReady(), true, 'encryption must initialise');

  const plain = 'const apiKey = "sk-not-a-real-secret-000";';
  const enc = svc.encrypt(plain);
  assert.notEqual(enc, plain, 'ciphertext must differ from plaintext');
  assert.ok(enc.startsWith('enc:v1:'), 'ciphertext must carry the version prefix');
  assert.equal(svc.decrypt(enc), plain, 'round-trip must restore the plaintext');

  // GCM is authenticated: a flipped byte must NOT yield the plaintext.
  const body = Buffer.from(enc.slice('enc:v1:'.length), 'base64');
  body[body.length - 1] ^= 0xff;
  const tampered = 'enc:v1:' + body.toString('base64');
  assert.notEqual(svc.decrypt(tampered), plain,
    'a tampered ciphertext must not decrypt to the original — otherwise "GCM" is decorative');

  // Two encryptions of the same plaintext must differ (random IV per message).
  assert.notEqual(svc.encrypt(plain), svc.encrypt(plain),
    'a fresh IV must be used per message');
});

// ---------------------------------------------------------------------------
// CLAIM: "Secret detection: auto-strips API keys, passwords, tokens before sending"
// ---------------------------------------------------------------------------
test('CLAIM secret-detection: detects credentials and does not fire on clean code', () => {
  const { SecretDetector } = req('services/privacy/SecretDetector.js');
  const d = SecretDetector.getInstance();

  const dirty = [
    'const password = "hunter2-not-real";',
    'AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE',
    'authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
  ].join('\n');
  assert.equal(d.containsSecrets(dirty), true, 'credentials must be detected');
  const found = d.detectSecrets(dirty);
  assert.ok(found.length > 0, 'detections must be enumerable, not just a boolean');
  for (const f of found) {
    assert.ok(!/hunter2-not-real|AKIAIOSFODNN7EXAMPLE/.test(f.match),
      'a detection record must not itself carry the raw secret');
  }

  // The control that stops this test passing on an always-true detector.
  const clean = 'export function add(a: number, b: number) {\n  return a + b;\n}\n';
  assert.equal(d.containsSecrets(clean), false,
    'ordinary code must not be reported as a secret');
});

// ---------------------------------------------------------------------------
// CLAIM: "Sensitive file protection: .env, .pem, .key files auto-excluded"
// ---------------------------------------------------------------------------
test('CLAIM sensitive-file-protection: .env/.pem/.key excluded, ordinary source is not', () => {
  const { SensitiveFileDetector } = req('services/codesec/SensitiveFileDetector.js');
  const det = new SensitiveFileDetector();

  for (const p of ['/w/.env', '/w/.env.production', '/w/certs/server.pem', '/w/id_rsa.key']) {
    assert.equal(det.isSensitiveFile(p), true, `${p} must be treated as sensitive`);
    const access = det.checkFileAccess(p, 'ai-context');
    assert.equal(access.allowed, false, `${p} must not be allowed into AI context`);
  }
  for (const p of ['/w/src/index.ts', '/w/README.md']) {
    assert.equal(det.isSensitiveFile(p), false,
      `${p} must NOT be blocked — an always-true detector protects nothing`);
  }
});

// ---------------------------------------------------------------------------
// CLAIM: "Ephemeral processing" (the CLIENT asks for it on every request)
// ---------------------------------------------------------------------------
test('CLAIM ephemeral-processing: the client signals no-retention on the request', () => {
  const { EphemeralPolicyEnforcer } = req('services/codesec/EphemeralPolicyEnforcer.js');
  const e = new EphemeralPolicyEnforcer();
  e.updateConfig({ enabled: true });
  assert.equal(e.isEnabled(), true);
  const out = e.enforceOnRequest({ prompt: 'hello' });
  const headerBlob = JSON.stringify(out.headers).toLowerCase();
  assert.ok(/ephemeral|no-retention|no-store|retention/.test(headerBlob),
    'an ephemeral request must carry an explicit no-retention signal');
});

// ---------------------------------------------------------------------------
// CLAIM: "RBAC: role-based access control with API key management"
// ---------------------------------------------------------------------------
test('CLAIM rbac: distinct roles exist and are not all equivalent', () => {
  const t = req('services/access/AccessTypes.js');
  assert.ok(t.ApiKeyRole, 'ApiKeyRole enum must exist');
  const roles = Object.values(t.ApiKeyRole).filter((v) => typeof v === 'string');
  assert.ok(roles.length >= 2,
    'RBAC requires at least two distinct roles — one role is not access control');
  assert.equal(new Set(roles).size, roles.length, 'roles must be distinct');
});
