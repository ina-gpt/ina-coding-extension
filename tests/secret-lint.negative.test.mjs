/**
 * Negative proof for scripts/secret-lint.mjs.
 *
 * A scanner that cannot fail proves nothing, and a scanner that ECHOES what it
 * finds is worse than none — so every failing fixture also asserts that the
 * output carries at most 6 characters of the matched secret.
 *
 * Fixtures are built in throwaway directories. The test never reads the live
 * tree and never contains a real credential: every token-shaped string here is
 * assembled at runtime from harmless parts, so this file is not itself a
 * finding.
 *
 * Run: node --test tests/secret-lint.negative.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const LINTER = join(REPO_ROOT, 'scripts', 'secret-lint.mjs');

// Assembled at runtime — never a literal credential in this file.
const GH   = ['gh', 'p_'].join('') + 'A'.repeat(36);
const PEM  = '-----BEGIN RSA PRIVATE ' + 'KEY-----';
const BODY = GH.slice(4);

function repo(files, { allowlist } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'secret-lint-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.invalid']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'test']);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  if (allowlist !== undefined) writeFileSync(join(dir, '.secretlintignore'), allowlist);
  execFileSync('git', ['-C', dir, 'add', '-A']);
  return dir;
}

function run(dir, extra = []) {
  const r = spawnSync(process.execPath, [LINTER, '--json', `--root=${dir}`, ...extra], { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* exit 2 prints no JSON */ }
  return { code: r.status, out: r.stdout + r.stderr, report };
}

/** The whole point: the scanner must never echo the credential it found. */
function assertTruncated(out, secret) {
  assert.ok(!out.includes(secret),
    'output contained the FULL secret — a scanner that leaks what it detects is worse than none');
  const tail = secret.slice(6);
  assert.ok(tail.length === 0 || !out.includes(tail),
    'output contained the secret beyond its first 6 characters');
}

test('(a) a credentialed git remote FAILS with rule=remote-userinfo', () => {
  const dir = repo({ 'README.md': '# x\n' });
  try {
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin',
      `https://user:${GH}@github.com/x/y.git`]);
    const { code, out, report } = run(dir, ['--remotes', `--scan=${dir}`]);
    assert.equal(code, 1, 'a credential in a remote URL must fail');
    const f = report.results.find((x) => x.rule === 'remote-userinfo');
    assert.ok(f, 'rule must be remote-userinfo');
    assert.equal(f.channel, 'git-remote');
    assertTruncated(out, GH);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(b) an inline GH_TOKEN= prefix FAILS with rule=inline-env-prefix', () => {
  const dir = repo({ 'deploy.sh': `#!/bin/sh\nGH_TOKEN="${GH}" gh repo list\n` });
  try {
    const { code, out, report } = run(dir);
    assert.equal(code, 1);
    const f = report.results.find((x) => x.rule === 'inline-env-prefix');
    assert.ok(f, 'rule must be inline-env-prefix');
    assert.equal(f.file, 'deploy.sh');
    assert.equal(f.line, 2);
    assertTruncated(out, GH);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(c) a PEM private key header FAILS with rule=private-key', () => {
  const dir = repo({ 'id_rsa': `${PEM}\nMIIEow...\n` });
  try {
    const { code, out, report } = run(dir);
    assert.equal(code, 1);
    const f = report.results.find((x) => x.rule === 'private-key');
    assert.ok(f, 'rule must be private-key');
    assertTruncated(out, PEM);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(d) an allowlisted pattern with a reason PASSES', () => {
  const dir = repo(
    { 'scripts/scanner.mjs': `const RE = /gh[pousr]_[A-Za-z0-9]{20,}/g;\nconst SAMPLE = "${GH}";\n` },
    { allowlist: 'scripts/scanner\\.mjs\tthe scanner\'s own detection regex and its sample, not a live credential\n' },
  );
  try {
    const { code, report } = run(dir);
    assert.equal(code, 0, 'an explained allowlist entry must suppress the finding');
    assert.equal(report.findings, 0);
    assert.ok(report.sources_scanned > 0, 'the scan must actually have read something');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(e) an allowlist entry with NO reason FAILS with rule=unexplained-allowlist', () => {
  const dir = repo({ 'README.md': '# clean\n' }, { allowlist: 'scripts/scanner\\.mjs\n' });
  try {
    const { code, report } = run(dir);
    assert.equal(code, 1, 'an unexplained allowlist entry is itself a finding');
    const f = report.results.find((x) => x.rule === 'unexplained-allowlist');
    assert.ok(f, 'rule must be unexplained-allowlist');
    assert.equal(f.line, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- controls: without these the five above could pass on a scanner that
// --- always fails, or one that never reads anything.

test('(control) a clean repository PASSES', () => {
  const dir = repo({ 'README.md': '# clean\n', 'src/a.ts': 'export const a = 1;\n' });
  try {
    const { code, report } = run(dir);
    assert.equal(code, 0, 'the gate must not be permanently red');
    assert.equal(report.findings, 0);
    assert.ok(report.sources_scanned >= 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(control) a scan that reads no git config EXITS 2, never 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-lint-empty-'));
  try {
    const { code } = run(dir, ['--remotes', `--scan=${dir}`]);
    assert.equal(code, 2, '"we could not look" must not be reported as "clean"');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(control) a SYMLINKED clone on another path is still scanned', () => {
  // This is the case that actually hid a leak on this host: /root/x was a
  // symlink to a clone on another filesystem, so `find -type d -name .git`
  // and `find -xdev` both walked straight past it.
  const real = repo({ 'README.md': '# x\n' });
  const outer = mkdtempSync(join(tmpdir(), 'secret-lint-outer-'));
  try {
    execFileSync('git', ['-C', real, 'remote', 'add', 'origin',
      `https://user:${GH}@github.com/x/y.git`]);
    execFileSync('ln', ['-s', real, join(outer, 'linked-clone')]);
    const { code, report } = run(outer, ['--remotes', `--scan=${outer}`]);
    assert.equal(code, 1, 'a credentialed remote behind a symlink must still be found');
    assert.ok(report.results.some((x) => x.rule === 'remote-userinfo'));
  } finally {
    rmSync(outer, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test('(control) --staged sees an added line, not the whole file', () => {
  const dir = repo({ 'a.sh': '#!/bin/sh\necho ok\n' });
  try {
    execFileSync('git', ['-C', dir, 'commit', '-qm', 'base', '--no-verify']);
    writeFileSync(join(dir, 'a.sh'), `#!/bin/sh\necho ok\nGH_TOKEN="${GH}" gh repo list\n`);
    execFileSync('git', ['-C', dir, 'add', '-A']);
    const { code, out, report } = run(dir, ['--staged']);
    assert.equal(code, 1);
    assert.equal(report.results[0].line, 3, 'must point at the real file line');
    assertTruncated(out, GH);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
