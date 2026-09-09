#!/usr/bin/env node
/**
 * claim-audit — a published security or privacy claim must carry a passing test.
 *
 * WHY THIS EXISTS
 *   README.md claimed "Zero telemetry by default" from the initial commit. The
 *   shipped defaults enabled telemetry, and the code carried its own `true`
 *   fallback besides. The claim was false for five months and nothing went red,
 *   because a claim in a README is documentation and nothing verifies
 *   documentation. NC-2026-09-09-01.
 *
 *   The class is not "telemetry was wrong". The class is "a public statement
 *   about system behaviour with nothing that checks it". This gate closes that
 *   class: in the Privacy & Security section, every claim must name a test file
 *   that EXISTS, and that test must PASS.
 *
 * THE CONTRACT IN THE README
 *   A claim is a top-level bullet in the "### Privacy & Security" section.
 *   Each must carry a proof reference on one of its lines:
 *       → `tests/claims.test.cjs` · `src/services/...`
 *   The first backticked path under `tests/` is taken as the proof.
 *   A bullet may opt out ONLY by carrying `(no-test:` followed by a reason —
 *   which is itself reported, so opting out is visible rather than silent.
 *
 * Usage:
 *   node scripts/claim-audit.mjs [--json] [--readme=PATH] [--no-run]
 *   node scripts/claim-audit.mjs --selftest
 *
 * Exit: 0 all claims proven · 1 a claim is unproven · 2 the audit could not run.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const JSON_MODE = argv.includes('--json');
const NO_RUN = argv.includes('--no-run');
const rootArg = argv.find((a) => a.startsWith('--root='));
const readmeArg = argv.find((a) => a.startsWith('--readme='));
const REPO = rootArg ? resolve(rootArg.slice('--root='.length)) : resolve(HERE, '..');

function die(msg) {
  process.stderr.write(`claim-audit: FATAL ${msg}\n`);
  process.exit(2);
}

const SECTION = /^###\s+Privacy\s*&\s*Security\s*$/i;

/** Pull the claims out of the Privacy & Security section of a README. */
export function parseClaims(md) {
  const lines = md.split('\n');
  let i = lines.findIndex((l) => SECTION.test(l.trim()));
  if (i < 0) return null;                       // section absent -> caller decides
  const claims = [];
  let cur = null;
  for (i++; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,3}\s/.test(l)) break;             // next section ends it
    const bullet = /^-\s+(.*)$/.exec(l);
    if (bullet) {
      if (cur) claims.push(cur);
      cur = { line: i + 1, text: bullet[1], body: bullet[1] };
      continue;
    }
    if (cur && /^\s+\S/.test(l)) cur.body += '\n' + l;   // continuation
    else if (cur && l.trim() === '') { /* keep, a blank line may precede more */ }
  }
  if (cur) claims.push(cur);
  return claims;
}

function titleOf(text) {
  const b = /\*\*(.+?)\*\*/.exec(text);
  return (b ? b[1] : text).replace(/[—:].*$/, '').trim().slice(0, 80);
}

function proofOf(body) {
  const m = /`((?:tests|test|src\/.*__tests__)\/[^`]+)`/.exec(body);
  return m ? m[1] : null;
}

function optOut(body) {
  const m = /\(no-test:\s*([^)]+)\)/.exec(body);
  return m ? m[1].trim() : null;
}

function audit(repo, readmePath) {
  const p = readmePath || join(repo, 'README.md');
  if (!existsSync(p)) die(`README not found at ${p}`);
  const claims = parseClaims(readFileSync(p, 'utf8'));
  if (claims === null) {
    die(`no "### Privacy & Security" section in ${p} — the audit could not run, ` +
        'which is not the same as having no claims');
  }
  if (claims.length === 0) {
    die(`the Privacy & Security section in ${p} contains no claims — an empty ` +
        'section reads as "audited" while proving nothing');
  }

  const results = [];
  const ran = new Map();
  for (const c of claims) {
    const title = titleOf(c.text);
    const waiver = optOut(c.body);
    const proof = proofOf(c.body);
    if (waiver) {
      results.push({ claim: title, line: c.line, status: 'WAIVED', reason: waiver, proof: null });
      continue;
    }
    if (!proof) {
      results.push({ claim: title, line: c.line, status: 'UNPROVEN',
        reason: 'no test file referenced — add `tests/<file>` or an explicit (no-test: reason)', proof: null });
      continue;
    }
    const abs = join(repo, proof);
    if (!existsSync(abs)) {
      results.push({ claim: title, line: c.line, status: 'MISSING-TEST',
        reason: `referenced test does not exist: ${proof}`, proof });
      continue;
    }
    if (NO_RUN) {
      results.push({ claim: title, line: c.line, status: 'LINKED', reason: 'test exists (not executed: --no-run)', proof });
      continue;
    }
    if (!ran.has(proof)) {
      const stub = join(repo, 'tests', 'vscode-stub.cjs');
      const args = existsSync(stub)
        ? ['--require', stub, '--test', abs]
        : ['--test', abs];
      const r = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8' });
      ran.set(proof, r.status === 0);
    }
    const ok = ran.get(proof);
    results.push({ claim: title, line: c.line, status: ok ? 'PROVEN' : 'FAILING',
      reason: ok ? 'linked test passes' : 'linked test FAILS', proof });
  }

  const bad = results.filter((r) => ['UNPROVEN', 'MISSING-TEST', 'FAILING'].includes(r.status));
  return { readme: p, claims: results.length, results, failed: bad.length };
}

/* ------------------------------------------------------------------ selftest */
function selftest() {
  let fails = 0;
  const check = (n, got, want) => {
    const ok = got === want;
    if (!ok) fails++;
    process.stdout.write(`  ${ok ? 'ok' : 'NOT OK'}  ${n} (exit ${got}, want ${want})\n`);
  };
  const build = (readme, tests = {}) => {
    const d = mkdtempSync(join(tmpdir(), 'claim-audit-'));
    writeFileSync(join(d, 'README.md'), readme);
    mkdirSync(join(d, 'tests'), { recursive: true });
    for (const [f, body] of Object.entries(tests)) writeFileSync(join(d, 'tests', f), body);
    return d;
  };
  const run = (d) => spawnSync(process.execPath, [join(HERE, 'claim-audit.mjs'), `--root=${d}`],
    { encoding: 'utf8' }).status;

  const PASSING = "import test from 'node:test';\ntest('t', () => {});\n";
  const FAILING = "import test from 'node:test';\nimport assert from 'node:assert';\ntest('t', () => assert.equal(1,2));\n";
  const SECT = '### Privacy & Security\n\n';

  let d = build(`${SECT}- **A claim** with a proof.\n  → \`tests/ok.test.mjs\`\n`, { 'ok.test.mjs': PASSING });
  check('a claim with a PASSING linked test passes', run(d), 0); rmSync(d, { recursive: true, force: true });

  d = build(`${SECT}- **A claim** with no proof at all.\n`);
  check('a claim with NO linked test FAILS', run(d), 1); rmSync(d, { recursive: true, force: true });

  d = build(`${SECT}- **A claim** pointing at a file that is not there.\n  → \`tests/gone.test.mjs\`\n`);
  check('a claim linking a MISSING test FAILS', run(d), 1); rmSync(d, { recursive: true, force: true });

  d = build(`${SECT}- **A claim** whose test is red.\n  → \`tests/bad.test.mjs\`\n`, { 'bad.test.mjs': FAILING });
  check('a claim whose linked test FAILS is caught', run(d), 1); rmSync(d, { recursive: true, force: true });

  d = build(`${SECT}- **A claim** deliberately unproven. (no-test: architectural, not a code property)\n`);
  check('an explicit (no-test: reason) waiver passes', run(d), 0); rmSync(d, { recursive: true, force: true });

  d = build('# readme\n\nno section here\n');
  check('a README with no Privacy & Security section EXITS 2', run(d), 2); rmSync(d, { recursive: true, force: true });

  d = build(`${SECT}\n## Next\n`);
  check('an EMPTY Privacy & Security section EXITS 2', run(d), 2); rmSync(d, { recursive: true, force: true });

  process.stdout.write(fails === 0 ? 'SELFTEST PASS\n' : `SELFTEST FAIL (${fails})\n`);
  return fails === 0 ? 0 : 1;
}

if (argv.includes('--selftest')) {
  process.exitCode = selftest();
} else {
  const rep = audit(REPO, readmeArg ? resolve(readmeArg.slice('--readme='.length)) : null);
  if (JSON_MODE) process.stdout.write(JSON.stringify(rep, null, 2) + '\n');
  else {
    for (const r of rep.results) {
      const mark = { PROVEN: '✓', WAIVED: '·', LINKED: '~' }[r.status] || '✗';
      process.stdout.write(`  ${mark} [${r.status}] ${r.claim}${r.proof ? ` → ${r.proof}` : ''}\n`);
      if (['UNPROVEN', 'MISSING-TEST', 'FAILING'].includes(r.status)) {
        process.stdout.write(`      README:${r.line} — ${r.reason}\n`);
      }
    }
    process.stdout.write(`claim-audit: ${rep.claims} claim(s), ${rep.failed} unproven\n`);
    if (rep.failed) {
      process.stdout.write('claim-audit: FAIL — a published security or privacy claim has no passing proof.\n');
    }
  }
  process.exitCode = rep.failed > 0 ? 1 : 0;
}
