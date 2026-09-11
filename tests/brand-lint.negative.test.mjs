/**
 * Negative proof for scripts/brand-lint.mjs.
 *
 * A gate that cannot fail proves nothing. Each fixture below is an artificial
 * violation (or an artificial exemption) with a KNOWN required exit code, run
 * against a throwaway git repo the test builds itself.
 *
 * The test owns its premise: it never reads the live tree and hopes. If the
 * linter stops biting, these go red.
 *
 * Run: node --test tests/brand-lint.negative.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const LINTER = join(REPO_ROOT, 'scripts', 'brand-lint.mjs');
const BRANDMAP = join(REPO_ROOT, '.brandmap.json');

/** Build a disposable git repo containing exactly the given files. */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'brand-lint-neg-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.invalid']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'test']);
  // The fixture NEUTRALISES the host repo's baselines.
  //
  // Copying .brandmap.json verbatim inherited whatever id_baseline /
  // public_surface_baseline the host repo happens to carry. Installed into a
  // repository with a large migration debt, that silently made five of these
  // proofs pass on a linter that had stopped biting — a proof must control its
  // premise, never read the live tree and hope. Tests that need a baseline set
  // it explicitly afterwards.
  const map = JSON.parse(readFileSync(BRANDMAP, 'utf8'));
  map.id_baseline = 0;
  map.public_surface_baseline = 0;
  writeFileSync(join(dir, '.brandmap.json'), JSON.stringify(map, null, 2));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  execFileSync('git', ['-C', dir, 'add', '-A']);
  return dir;
}

function runLint(dir) {
  const r = spawnSync(process.execPath, [LINTER, '--json', `--root=${dir}`], {
    encoding: 'utf8',
  });
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* exit 2 paths print no JSON */ }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, report };
}

// The deny term is assembled at runtime so this test file does not itself
// contain a literal violation — otherwise the linter would flag its own proof.
const OLLAMA = ['O', 'llama'].join('');
const QWEN = ['Q', 'wen'].join('');

test('(a) a docs file containing a deny term FAILS and names file + term', () => {
  const dir = fixture({
    'docs/setup.md': `# Setup\n\nRun the ${OLLAMA} server before starting.\n`,
    'README.md': '# Clean\n\nPowered by INA Inference Runtime.\n',
  });
  try {
    const { code, report } = runLint(dir);
    assert.equal(code, 1, 'linter must exit 1 on a deny term in a docs file');
    assert.ok(report, 'linter must emit a JSON report');
    assert.equal(report.violations, 1);
    const f = report.findings[0];
    assert.equal(f.file, 'docs/setup.md', 'report must name the offending file');
    assert.equal(f.term, OLLAMA, 'report must name the offending term');
    assert.equal(f.line, 3, 'report must name the offending line');
    assert.equal(f.class, 'DOC');
    assert.equal(f.rule, 'deny-term');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(b) a LICENSE containing a deny term PASSES (attribution exemption)', () => {
  const dir = fixture({
    'LICENSE': `Apache License 2.0\n\nThis product includes software from the ${QWEN} project.\n`,
    'README.md': '# Clean\n\nPowered by INA 8.\n',
  });
  try {
    const { code, report } = runLint(dir);
    assert.equal(code, 0, 'LICENSE must be exempt — Apache-2.0 s.4 makes attribution mandatory');
    assert.equal(report.violations, 0);
    assert.ok(report.files_scanned >= 1, 'the scan must actually have read something');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(c) a README with a superlative claim FAILS (s.5 UWG)', () => {
  const dir = fixture({
    'README.md': '# INA Coding\n\nthe best AI assistant in the world\n',
  });
  try {
    const { code, report } = runLint(dir);
    assert.equal(code, 1, 'an absolute-supremacy claim must fail the gate');
    const f = report.findings.find((x) => x.rule === 'superlative-claim');
    assert.ok(f, 'a superlative-claim finding must be reported');
    assert.equal(f.file, 'README.md');
    assert.equal(f.line, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- Controls: without these the three fixtures above could pass on a linter
// --- that simply always fails, or one that never reads anything.

test('(control) a clean repo PASSES', () => {
  const dir = fixture({
    'README.md': '# INA Coding\n\nSelf-hosted assistant on INA Inference Runtime.\n',
    'docs/setup.md': '# Setup\n\nConfigure INA 8 and the INA Embedding Model.\n',
  });
  try {
    const { code, report } = runLint(dir);
    assert.equal(code, 0, 'the gate must not be permanently red');
    assert.equal(report.violations, 0);
    assert.ok(report.files_scanned >= 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(control) a factual certification claim PASSES', () => {
  const dir = fixture({
    'README.md':
      '# INA Coding\n\nISO/IEC 27001:2022 certified by TUV SUD, ' +
      'Reg. No. 12 310 71178 TMS, valid until 2029-08-09.\n',
  });
  try {
    const { code } = runLint(dir);
    assert.equal(code, 0, 'a documented fact is not a superlative and must not be blocked');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(control) an unreadable rule set EXITS 2, never 0', () => {
  const dir = fixture({ 'README.md': '# Clean\n' });
  try {
    writeFileSync(join(dir, '.brandmap.json'), '{ this is not json');
    const { code } = runLint(dir);
    assert.equal(code, 2, '"we could not check" must not be reported as "clean"');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(control) a scan that reads no files EXITS 2, never 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-lint-empty-'));
  try {
    execFileSync('git', ['-C', dir, 'init', '-q']);
    const m0 = JSON.parse(readFileSync(BRANDMAP, 'utf8'));
    m0.id_baseline = 0; m0.public_surface_baseline = 0;
    writeFileSync(join(dir, '.brandmap.json'), JSON.stringify(m0, null, 2));
    const { code } = runLint(dir); // nothing added -> git ls-files is empty
    assert.equal(code, 2, 'an empty scan is a broken scan, not a clean repo');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(control) two deny terms on one line are BOTH reported', () => {
  const dir = fixture({
    'docs/x.md': `Run ${OLLAMA} with ${QWEN} 2.5 Coder 32B.\n`,
  });
  try {
    const { code, report } = runLint(dir);
    assert.equal(code, 1);
    const terms = report.findings.map((f) => f.term).sort();
    assert.deepEqual(terms, [`${QWEN} 2.5 Coder 32B`, OLLAMA].sort(),
      'the longest term must win its span, and the second term must still be reported');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(control) a context exemption is NARROW, not a file-wide pass', () => {
  // The exemption lets a secret-scanner label name a real credential type.
  // It must NOT turn the whole file into a free-for-all — otherwise the
  // interoperability carve-out becomes a hole in the gate.
  const dir = fixture({
    'src/services/codesec/CodeSecurityTypes.ts':
      `export const P = [\n` +
      `  { name: 'OpenAI Key', pattern: 'sk-[A-Za-z0-9]{48,}', type: 'api_key' },\n` +
      `];\n` +
      `// We run our inference on ${OLLAMA}.\n`,
    'README.md': '# Clean\n',
  });
  try {
    const { code, report } = runLint(dir);
    assert.equal(code, 1, 'a non-exempt line in an exempt file must still fail');
    assert.equal(report.violations, 1, 'exactly the prose line, not the pattern line');
    assert.equal(report.findings[0].line, 4);
    assert.equal(report.findings[0].term, OLLAMA);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- The ID ratchet. A baseline that cannot fail is just a mute button.

function withBaseline(dir, n) {
  const p = join(dir, '.brandmap.json');
  const m = JSON.parse(readFileSync(p, 'utf8'));
  m.id_baseline = n;
  writeFileSync(p, JSON.stringify(m, null, 2));
}

test('(ratchet) an identifier ABOVE the baseline FAILS', () => {
  const dir = fixture({
    'src/models.ts': `export const M = { '${QWEN.toLowerCase()}2.5-coder:32b': 1 };\n`,
    'README.md': '# Clean\n',
  });
  try {
    withBaseline(dir, 0);
    const { code, report } = runLint(dir);
    assert.equal(report.id_hits, 1, 'the hit must be classified as an identifier');
    assert.equal(report.public_surface, 0, 'it must not be counted as public surface');
    assert.equal(code, 1, 'an identifier above the baseline must fail the build');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(ratchet) the SAME identifier AT the baseline passes', () => {
  const dir = fixture({
    'src/models.ts': `export const M = { '${QWEN.toLowerCase()}2.5-coder:32b': 1 };\n`,
    'README.md': '# Clean\n',
  });
  try {
    withBaseline(dir, 1);
    const { code, report } = runLint(dir);
    assert.equal(report.id_hits, 1);
    assert.equal(code, 0, 'a held baseline must not be permanently red');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(ratchet) a baseline NEVER excuses a public-surface hit', () => {
  const dir = fixture({
    'README.md': `# Docs\n\nWe run ${OLLAMA}.\n`,
  });
  try {
    withBaseline(dir, 999);
    const { code, report } = runLint(dir);
    assert.equal(report.public_surface, 1);
    assert.equal(code, 1, 'no baseline may ever let prose through — that is the whole point');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- Staged mode. This is what the pre-commit hook runs, and it shipped with
// --- a bug that blocked a legitimate commit, so it gets its own proofs.

function runStaged(dir) {
  const r = spawnSync(process.execPath, [LINTER, '--json', '--staged', `--root=${dir}`], {
    encoding: 'utf8',
  });
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* exit 2 prints no JSON */ }
  return { code: r.status, report };
}

function commitAll(dir) {
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'base', '--no-verify']);
}

test('(staged) editing a clean line in a file FULL of existing ids PASSES', () => {
  const dir = fixture({
    'src/models.ts':
      `// header\n` +
      `export const M = {\n` +
      `  '${QWEN.toLowerCase()}2.5-coder:32b': 1,\n` +
      `  '${QWEN.toLowerCase()}3:14b': 2,\n` +
      `};\n`,
    'README.md': '# Clean\n',
  });
  try {
    commitAll(dir);
    writeFileSync(join(dir, 'src/models.ts'),
      readFileSync(join(dir, 'src/models.ts'), 'utf8').replace('// header', '// header, reworded'));
    execFileSync('git', ['-C', dir, 'add', '-A']);
    const { code, report } = runStaged(dir);
    assert.equal(report.id_hits, 0,
      'pre-existing ids in an edited file are not hits introduced by this commit');
    assert.equal(code, 0, 'a comment edit must not be blocked by lines the author never touched');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(staged) ADDING a line with a new upstream id FAILS', () => {
  const dir = fixture({ 'src/models.ts': '// header\n', 'README.md': '# Clean\n' });
  try {
    commitAll(dir);
    writeFileSync(join(dir, 'src/models.ts'),
      `// header\nexport const M = { '${QWEN.toLowerCase()}3:8b': 1 };\n`);
    execFileSync('git', ['-C', dir, 'add', '-A']);
    const { code, report } = runStaged(dir);
    assert.equal(report.id_hits, 1, 'the added line must be counted');
    assert.equal(report.findings[0].line, 2, 'the report must point at the real file line');
    assert.equal(code, 1, 'a newly introduced upstream id must fail the hook');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(staged) ADDING prose with a deny term FAILS on public surface', () => {
  const dir = fixture({ 'README.md': '# Clean\n' });
  try {
    commitAll(dir);
    writeFileSync(join(dir, 'README.md'), `# Clean\n\nWe run ${OLLAMA}.\n`);
    execFileSync('git', ['-C', dir, 'add', '-A']);
    const { code, report } = runStaged(dir);
    assert.equal(report.public_surface, 1);
    assert.equal(code, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(migration baseline) a public-surface hit ABOVE the debt baseline FAILS', () => {
  const dir = fixture({ 'README.md': `# Docs\n\nWe run ${OLLAMA}.\nAnd ${QWEN}.\n` });
  try {
    const p = join(dir, '.brandmap.json');
    const m = JSON.parse(readFileSync(p, 'utf8'));
    m.public_surface_baseline = 1;   // debt allows one, the tree has two
    writeFileSync(p, JSON.stringify(m, null, 2));
    const { code, report } = runLint(dir);
    assert.equal(report.public_surface, 2);
    assert.equal(code, 1, 'exceeding the migration debt must still fail');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(migration baseline) it NEVER applies to a staged slice', () => {
  const dir = fixture({ 'README.md': '# Clean\n' });
  try {
    const p = join(dir, '.brandmap.json');
    const m = JSON.parse(readFileSync(p, 'utf8'));
    m.public_surface_baseline = 999;  // a huge debt on the tree...
    writeFileSync(p, JSON.stringify(m, null, 2));
    execFileSync('git', ['-C', dir, 'add', '-A']);
    execFileSync('git', ['-C', dir, 'commit', '-qm', 'base', '--no-verify']);
    writeFileSync(join(dir, 'README.md'), `# Clean\n\nWe run ${OLLAMA}.\n`);
    execFileSync('git', ['-C', dir, 'add', '-A']);
    const r = spawnSync(process.execPath, [LINTER, '--json', '--staged', `--root=${dir}`], { encoding: 'utf8' });
    assert.equal(r.status, 1,
      '...must never excuse a line the author is adding right now');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- provenance-guard. Its false negative publishes a confidential document,
// --- so it gets the strictest controls: it must refuse to guess.

function runProv(dir, env = {}) {
  const r = spawnSync(process.execPath, [LINTER, '--provenance-guard', `--root=${dir}`], {
    encoding: 'utf8', env: { ...process.env, ...env },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('(provenance) the document in a PUBLIC repository FAILS', () => {
  const dir = fixture({
    'docs/compliance/model-provenance.md': '# Provenance\n\nCONFIDENTIAL.\n',
    'README.md': '# Clean\n',
  });
  try {
    const { code, out } = runProv(dir, { INA_PROVENANCE_VISIBILITY: 'public' });
    assert.equal(code, 1, 'a confidential document in a public repo must fail');
    assert.match(out, /model-provenance\.md/, 'the report must name the file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(provenance) the same document in a PRIVATE repository PASSES', () => {
  const dir = fixture({
    'docs/compliance/model-provenance.md': '# Provenance\n\nCONFIDENTIAL.\n',
    'README.md': '# Clean\n',
  });
  try {
    const { code } = runProv(dir, { INA_PROVENANCE_VISIBILITY: 'private' });
    assert.equal(code, 0, 'the guard must not block the document from its correct home');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(provenance) a repository with no such document PASSES', () => {
  const dir = fixture({ 'README.md': '# Clean\n' });
  try {
    const { code } = runProv(dir, { INA_PROVENANCE_VISIBILITY: 'public' });
    assert.equal(code, 0, 'the guard must not be always-red');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(provenance) UNKNOWN visibility REFUSES rather than assuming private', () => {
  const dir = fixture({
    'docs/compliance/model-provenance.md': '# Provenance\n',
    'README.md': '# Clean\n',
  });
  try {
    // No remote, no override: the guard cannot learn the visibility.
    const { code, out } = runProv(dir);
    assert.equal(code, 2, '"could not check" must not resolve to "private"');
    assert.match(out, /refusing to guess|could not read/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// ARTIFACT MODE (--dir). The gate that scans an unpacked .vsix.
//
// The scar these three pin, measured 2026-09-11: .brandmap.json exempts `dist/`
// and `out/` because in a SOURCE scan they hold generated output nobody
// reviews. Those same exemptions were applied to the ARTIFACT scan, where the
// generated bundle IS the product — so the gate skipped
// extension/dist/extension.js (1.9 MB) and the packaged webview bundle, scanned
// 11 of 673 files, and reported the artifact clean. A gate that inspects
// everything except the thing under test is the decorative-gate class, and the
// fix for it needs its own proof or it is just a second unverified claim.
// ---------------------------------------------------------------------------

function runLintDir(dir, rootForMap) {
  const r = spawnSync(
    process.execPath,
    [LINTER, '--json', `--dir=${dir}`, `--root=${rootForMap}`],
    { encoding: 'utf8' }
  );
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* exit 2 paths print no JSON */ }
  return { code: r.status, stdout: r.stdout, report };
}

test('(artifact) a deny term in the packaged BUNDLE under dist/ FAILS', () => {
  // The fixture supplies the rule set; `artifact` is a plain directory, the
  // shape an unpacked .vsix actually has.
  const dir = fixture({ 'README.md': '# Clean\n' });
  const art = mkdtempSync(join(tmpdir(), 'brand-lint-artifact-'));
  try {
    mkdirSync(join(art, 'extension', 'dist'), { recursive: true });
    writeFileSync(
      join(art, 'extension', 'dist', 'extension.js'),
      `var m="${QWEN.toLowerCase()}2.5-coder:32b";\n`
    );
    const { code, report } = runLintDir(art, dir);
    assert.equal(code, 1, 'a model id inside the SHIPPED bundle must fail the artifact gate');
    assert.ok(report, 'the artifact gate must emit a report');
    assert.ok(
      report.findings.some((f) => f.file.includes('dist/extension.js')),
      'the finding must name the bundle, not some other file'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(art, { recursive: true, force: true });
  }
});

test('(artifact) the SAME bundle path is still exempt in a SOURCE scan', () => {
  // The build-output exemption is not deleted — it is scoped to the mode where
  // it is correct. If this goes red, the fix over-corrected and every repo with
  // a committed dist/ starts failing its own tree scan.
  const dir = fixture({
    'README.md': '# Clean\n',
    'dist/extension.js': `var m="${QWEN.toLowerCase()}2.5-coder:32b";\n`,
  });
  try {
    const { code } = runLint(dir);
    assert.equal(code, 0, 'generated output in a SOURCE tree must stay exempt');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(artifact) a clean artifact PASSES — the gate is not always-red', () => {
  const dir = fixture({ 'README.md': '# Clean\n' });
  const art = mkdtempSync(join(tmpdir(), 'brand-lint-artifact-ok-'));
  try {
    mkdirSync(join(art, 'extension', 'dist'), { recursive: true });
    writeFileSync(join(art, 'extension', 'dist', 'extension.js'), 'var m="ina-8-coding-pro";\n');
    writeFileSync(join(art, 'extension', 'package.json'), '{"name":"ina-coding"}\n');
    const { code } = runLintDir(art, dir);
    assert.equal(code, 0, 'a clean artifact must pass, or the gate carries no signal');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(art, { recursive: true, force: true });
  }
});

test('(artifact) an EMPTY artifact EXITS 2, never 0', () => {
  // "We unpacked nothing" and "the artifact is clean" must not share an exit
  // code — the same rule the tree scan already carries.
  const dir = fixture({ 'README.md': '# Clean\n' });
  const art = mkdtempSync(join(tmpdir(), 'brand-lint-artifact-empty-'));
  try {
    const { code } = runLintDir(art, dir);
    assert.equal(code, 2, 'an artifact scan that read nothing must not report clean');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(art, { recursive: true, force: true });
  }
});
