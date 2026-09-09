#!/usr/bin/env node
/**
 * vsix-brand-scan — brand-lint for the SHIPPED ARTIFACT.
 *
 * WHY A SEPARATE GATE
 *   `brand-lint` scans `git ls-files`. The published .vsix is not in git: its
 *   largest file is a webpack bundle generated at package time, and it also
 *   carries whatever `.vscodeignore` failed to exclude. A tree can therefore be
 *   perfectly clean while the artifact a customer downloads is not — which is
 *   exactly what was measured here the first time: 92 raw hits across five
 *   files, three of which (.brandmap.json, BRANDING.md, tests/) had no business
 *   shipping at all.
 *
 * WHAT IT ENFORCES
 *   public surface (DOC + CODE) == 0        — hard, no baseline, ever
 *   identifiers <= vsix_id_baseline         — shrink-only, same policy as the tree
 *
 * Usage:
 *   node scripts/vsix-brand-scan.mjs --vsix=path/to/x.vsix [--json]
 *   node scripts/vsix-brand-scan.mjs --selftest      (its negative proof)
 *
 * Exit: 0 clean · 1 violations · 2 the scan could not run.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const LINT = join(HERE, 'brand-lint.mjs');
const argv = process.argv.slice(2);
const JSON_MODE = argv.includes('--json');

function die(msg) {
  process.stderr.write(`vsix-brand-scan: FATAL ${msg}\n`);
  process.exit(2);
}

/** Unpack a .vsix (a zip) and run brand-lint over the unpacked tree. */
function scanVsix(vsixPath, brandmapDir) {
  if (!existsSync(vsixPath)) die(`vsix not found: ${vsixPath}`);
  const dir = mkdtempSync(join(tmpdir(), 'vsix-scan-'));
  try {
    try {
      execFileSync('unzip', ['-q', '-o', vsixPath, '-d', dir], { stdio: 'pipe' });
    } catch (e) {
      die(`could not unpack ${vsixPath}: ${e.message}`);
    }
    const files = readdirSync(dir);
    if (files.length === 0) die(`${vsixPath} unpacked to nothing — an empty scan is not a clean artifact`);

    const r = execFileSync(
      process.execPath,
      [LINT, '--json', `--dir=${dir}`, `--root=${brandmapDir}`],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return JSON.parse(r);
  } catch (e) {
    // brand-lint exits 1 on findings; that is data, not an error.
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch { /* fall through */ }
    }
    die(`brand-lint failed on the unpacked artifact: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function run(vsixPath, brandmapDir) {
  const map = JSON.parse(readFileSync(join(brandmapDir, '.brandmap.json'), 'utf8'));
  const baseline = Number.isInteger(map.vsix_id_baseline) ? map.vsix_id_baseline : 0;
  const rep = scanVsix(vsixPath, brandmapDir);
  const pub = rep.public_surface;
  const ids = rep.id_hits;
  const failed = pub > 0 || ids > baseline;

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(
      { artifact: vsixPath, files_scanned: rep.files_scanned, public_surface: pub, id_hits: ids, vsix_id_baseline: baseline, failed, findings: rep.findings },
      null, 2) + '\n');
  } else {
    for (const f of rep.findings.filter((x) => x.class !== 'ID')) {
      process.stdout.write(`${f.file}:${f.line}: [${f.class}] "${f.term}" — ${f.excerpt}\n`);
    }
    process.stdout.write(
      `vsix-brand-scan: ${rep.files_scanned} file(s) in the artifact · public-surface ${pub} (must be 0) · identifiers ${ids}/${baseline} baseline\n`
    );
    if (pub > 0) process.stdout.write('vsix-brand-scan: FAIL — a forbidden term ships to users in this artifact.\n');
    if (ids > baseline) process.stdout.write(`vsix-brand-scan: FAIL — identifiers ${ids} exceed the baseline ${baseline}. The baseline may only shrink.\n`);
  }
  return failed ? 1 : 0;
}

/* ------------------------------------------------------------------ selftest */
// A gate that cannot fail proves nothing. The fixture builds a real .vsix-shaped
// zip, so the proof exercises unpacking as well as scanning.
function selftest() {
  const work = mkdtempSync(join(tmpdir(), 'vsix-negproof-'));
  let failures = 0;
  const check = (name, got, want) => {
    const ok = got === want;
    if (!ok) failures++;
    process.stdout.write(`  ${ok ? 'ok' : 'NOT OK'}  ${name} (exit ${got}, want ${want})\n`);
  };
  try {
    const mapDir = join(work, 'map');
    mkdirSync(mapDir, { recursive: true });
    const map = JSON.parse(readFileSync(join(REPO, '.brandmap.json'), 'utf8'));
    map.vsix_id_baseline = 0;
    map.id_baseline = 0;
    map.public_surface_baseline = 0;
    writeFileSync(join(mapDir, '.brandmap.json'), JSON.stringify(map, null, 2));

    const build = (name, files) => {
      const stage = join(work, name);
      mkdirSync(join(stage, 'extension'), { recursive: true });
      for (const [rel, body] of Object.entries(files)) {
        const abs = join(stage, rel);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, body);
      }
      const out = join(work, `${name}.vsix`);
      execFileSync('zip', ['-qr', out, '.'], { cwd: stage });
      return out;
    };

    // Assembled at runtime so this file is not itself a violation.
    const OLLAMA = ['O', 'llama'].join('');

    const dirty = build('dirty', {
      'extension/README.md': `# Ext\n\nPowered by ${OLLAMA}.\n`,
      'extension/package.json': '{"name":"x"}\n',
    });
    check('a deny term inside the packaged README FAILS', run(dirty, mapDir), 1);

    const clean = build('clean', {
      'extension/README.md': '# Ext\n\nPowered by INA Inference Runtime.\n',
      'extension/package.json': '{"name":"x"}\n',
    });
    check('a clean artifact PASSES (the gate is not always-red)', run(clean, mapDir), 0);

    const licensed = build('licensed', {
      'extension/README.md': '# Ext\n\nINA 8.\n',
      'extension/LICENSE': `Apache 2.0 — includes work from the ${OLLAMA} project.\n`,
      'extension/package.json': '{"name":"x"}\n',
    });
    check('a deny term in the packaged LICENSE PASSES (attribution exemption)', run(licensed, mapDir), 0);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  process.stdout.write(failures === 0 ? 'SELFTEST PASS\n' : `SELFTEST FAIL (${failures})\n`);
  return failures === 0 ? 0 : 1;
}

if (argv.includes('--selftest')) {
  process.exitCode = selftest();
} else {
  const v = argv.find((a) => a.startsWith('--vsix='));
  if (!v) die('usage: --vsix=<path> [--json]  |  --selftest');
  process.exitCode = run(resolve(v.slice('--vsix='.length)), REPO);
}
