/**
 * Traversal proof — the scanners must reach THROUGH a symlink and ACROSS a
 * filesystem boundary.
 *
 * THE SCAR. Phase 2's credential audit reported clean while a live personal
 * access token sat in a git remote. The regex was fine; the traversal never
 * reached the file. `/root/ina-coding-extension` was a SYMLINK onto another
 * filesystem, and both of the obvious walks miss that:
 *
 *     find /root -type d -name .git      symlinks are not followed (-P default)
 *     find / -xdev  -name config         will not cross a filesystem boundary
 *
 * The consequence was not a missed line — it was a leak attributed to the wrong
 * repository for a whole phase. These tests exist so the traversal, not just the
 * pattern, stays proven.
 *
 * Run: node --test tests/traversal.symlink.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SECRET_LINT = join(ROOT, 'scripts', 'secret-lint.mjs');
const BRAND_LINT = join(ROOT, 'scripts', 'brand-lint.mjs');

// Assembled at runtime so this file is not itself a finding.
const GH = ['gh', 'p_'].join('') + 'A'.repeat(36);

/** A real git repo with a credentialed remote, reachable only via a symlink. */
function plantedBehindSymlink() {
  const real = mkdtempSync(join(tmpdir(), 'traversal-real-'));
  const outer = mkdtempSync(join(tmpdir(), 'traversal-outer-'));
  execFileSync('git', ['-C', real, 'init', '-q']);
  execFileSync('git', ['-C', real, 'config', 'user.email', 't@e.invalid']);
  execFileSync('git', ['-C', real, 'config', 'user.name', 't']);
  writeFileSync(join(real, 'README.md'), '# fixture\n');
  execFileSync('git', ['-C', real, 'add', '-A']);
  execFileSync('git', ['-C', real, 'remote', 'add', 'origin',
    `https://user:${GH}@github.com/x/y.git`]);
  // the shape that hid the real leak: a link named like a normal clone
  symlinkSync(real, join(outer, 'linked-clone'));
  return { real, outer };
}

/**
 * A rule-set root with the host repository's baselines ZEROED.
 *
 * Without this the test inherits whatever migration debt the host repo carries.
 * In a repository with public_surface_baseline 2171, a single planted finding is
 * comfortably under budget and the scanner exits 0 — so the proof passes while
 * proving nothing. That is exactly the defect this programme already fixed once
 * in the brand-lint negproof; it recurred here because a new test copied the
 * pattern without the neutralisation.
 */
function zeroedRoot() {
  const d = mkdtempSync(join(tmpdir(), 'traversal-rules-'));
  const m = JSON.parse(readFileSync(join(ROOT, '.brandmap.json'), 'utf8'));
  m.id_baseline = 0;
  m.public_surface_baseline = 0;
  delete m.vsix_id_baseline;
  writeFileSync(join(d, '.brandmap.json'), JSON.stringify(m, null, 2));
  const si = join(ROOT, '.secretlintignore');
  if (existsSync(si)) writeFileSync(join(d, '.secretlintignore'), readFileSync(si, 'utf8'));
  return d;
}

function run(bin, args) {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('secret-lint --remotes reaches a credentialed remote THROUGH a symlink', () => {
  const { real, outer } = plantedBehindSymlink();
  try {
    const { code, out } = run(SECRET_LINT, ['--remotes', `--scan=${outer}`, `--root=${ROOT}`, '--json']);
    assert.equal(code, 1, 'a credential behind a symlink must be found, not walked past');
    const rep = JSON.parse(out);
    const f = rep.results.find((x) => x.rule === 'remote-userinfo');
    assert.ok(f, 'the finding must be classified as remote-userinfo');
    // and it must not echo the credential
    assert.ok(!out.includes(GH), 'the scanner must not print the full credential');
  } finally {
    rmSync(outer, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test('the naive walks that MISSED it still miss it — the control for this whole test', () => {
  // Without this, the test above could pass on any traversal at all and would
  // not be evidence that the symlink is what mattered.
  const { real, outer } = plantedBehindSymlink();
  try {
    const naive = spawnSync('find', [outer, '-type', 'd', '-name', '.git'], { encoding: 'utf8' });
    assert.equal((naive.stdout || '').trim(), '',
      'find -type d -name .git must still walk past the symlink — that is the scar');

    const followed = spawnSync('find', ['-L', outer, '-type', 'd', '-name', '.git'], { encoding: 'utf8' });
    assert.ok((followed.stdout || '').includes('.git'),
      'find -L must reach it, confirming the symlink is the only difference');
  } finally {
    rmSync(outer, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test('secret-lint --dir reads a planted key THROUGH a symlinked directory', () => {
  const real = mkdtempSync(join(tmpdir(), 'traversal-dir-'));
  const outer = mkdtempSync(join(tmpdir(), 'traversal-dirout-'));
  try {
    mkdirSync(join(real, 'nested'), { recursive: true });
    writeFileSync(join(real, 'nested', 'deploy.sh'), `#!/bin/sh\nGH_TOKEN="${GH}" gh repo list\n`);
    symlinkSync(real, join(outer, 'linked-dir'));
    const rules = zeroedRoot();
    const { code, out } = run(SECRET_LINT, [`--dir=${outer}`, `--root=${rules}`, '--json']);
    rmSync(rules, { recursive: true, force: true });
    assert.equal(code, 1, 'a credential under a symlinked directory must be found');
    const rep = JSON.parse(out);
    assert.ok(rep.results.some((x) => x.rule === 'inline-env-prefix'));
    assert.ok(!out.includes(GH), 'the scanner must not print the full credential');
  } finally {
    rmSync(outer, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test('brand-lint --dir reads a forbidden term THROUGH a symlinked directory', () => {
  const real = mkdtempSync(join(tmpdir(), 'traversal-brand-'));
  const outer = mkdtempSync(join(tmpdir(), 'traversal-brandout-'));
  try {
    const OLLAMA = ['O', 'llama'].join('');
    mkdirSync(join(real, 'docs'), { recursive: true });
    writeFileSync(join(real, 'docs', 'setup.md'), `# Setup\n\nRun the ${OLLAMA} server.\n`);
    symlinkSync(real, join(outer, 'linked-docs'));
    const rules = zeroedRoot();
    const { code, out } = run(BRAND_LINT, [`--dir=${outer}`, `--root=${rules}`, '--json']);
    rmSync(rules, { recursive: true, force: true });
    assert.equal(code, 1, 'a forbidden term under a symlinked directory must be found');
    const rep = JSON.parse(out);
    assert.ok(rep.findings.some((f) => f.term === OLLAMA));
  } finally {
    rmSync(outer, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test('a scan that reaches nothing EXITS 2 — blindness is never reported as clean', () => {
  const empty = mkdtempSync(join(tmpdir(), 'traversal-empty-'));
  try {
    const { code } = run(SECRET_LINT, ['--remotes', `--scan=${empty}`, `--root=${ROOT}`]);
    assert.equal(code, 2, '"we could not look" and "there is nothing there" are different answers');
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
