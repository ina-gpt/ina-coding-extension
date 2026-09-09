#!/usr/bin/env node
/**
 * brand-lint — enforces the public naming standard in BRANDING.md.
 *
 * Zero dependencies. Node >= 18. ESM.
 *
 * WHY THIS EXISTS
 *   The naming rule previously lived only as human judgement, so it was
 *   violated on public surfaces without anything going red. This is the
 *   machine half of the rule.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It never touches LICENSE / NOTICE / THIRD_PARTY_NOTICES. Apache-2.0 §4
 *   makes upstream attribution a legal obligation; stripping it to satisfy a
 *   branding preference would trade a marketing problem for a licensing one.
 *   The exemption is part of the gate, not an oversight in it.
 *
 * MODES
 *   (default)   scan tracked files       -> git ls-files
 *   --staged    scan staged files only   -> git diff --cached --name-only
 *   --stdin     scan stdin as one document (rendered-README checks)
 *   --json      machine-readable report on stdout
 *   --root=DIR  scan DIR instead of the script's own repo (used by the tests)
 *
 * EXIT
 *   0 clean · 1 violations found · 2 the scan could not run
 *
 * A scan that reads nothing exits 2, never 0. "We could not look" and
 * "there is nothing there" are different answers.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const MODE_STAGED = argv.includes('--staged');
const MODE_STDIN = argv.includes('--stdin');
const MODE_JSON = argv.includes('--json');
const rootArg = argv.find((a) => a.startsWith('--root='));
const REPO = rootArg ? resolve(rootArg.slice('--root='.length)) : resolve(HERE, '..');

function die(msg) {
  process.stderr.write(`brand-lint: FATAL ${msg}\n`);
  process.exit(2);
}

const mapPath = join(REPO, '.brandmap.json');
if (!existsSync(mapPath)) die(`.brandmap.json not found at ${mapPath}`);
let MAP;
try {
  MAP = JSON.parse(readFileSync(mapPath, 'utf8'));
} catch (e) {
  die(`.brandmap.json is unreadable: ${e.message}`);
}
for (const k of ['deny', 'superlatives', 'exempt_paths']) {
  if (!Array.isArray(MAP[k]) || MAP[k].length === 0) {
    die(`.brandmap.json key "${k}" missing or empty — refusing to scan with a blind rule set`);
  }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest first, so "Qwen 2.5 Coder 32B" is reported before bare "Qwen".
const DENY = [...MAP.deny].sort((a, b) => b.length - a.length);
// Proper product names, matched case-insensitively so "OLLAMA_HOST" and
// "ollama" are caught alongside "Ollama". Bounded by non-alphanumerics so a
// term never fires inside an unrelated longer identifier.
const DENY_RE = DENY.map((t) => ({
  term: t,
  re: new RegExp(`(?<![A-Za-z0-9])${esc(t)}(?![A-Za-z0-9])`, 'i'),
}));
// Superlative entries are REGEX SOURCES, not literals. §5 UWG bites on the
// SHAPE of an absolute-supremacy claim, and a literal phrase list cannot see
// "the best AI assistant in the world" unless someone thought to type that
// exact sentence into the list first.
const SUPER_RE = (MAP.superlatives || []).map((t) => {
  try {
    return { term: t, re: new RegExp(t, 'i') };
  } catch (e) {
    die(`.brandmap.json superlatives entry is not a valid regex: ${t} — ${e.message}`);
  }
});

const BIN = new Set(MAP.binary_ext || []);

// The engine/model roots that mark a hit as an IDENTIFIER rather than prose.
// Deliberately separate from the deny list: the deny list says "this name may
// not appear on a public surface", this says "this occurrence is a wire-level
// name, so renaming it is a compatibility change" (BRANDING.md §5).
const ID_ROOT = /(ollama|qwen|whisper|piper|nomic|deepseek|codellama|starcoder|mistral|gemma|anthropic|openai)/i;
const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst']);

function isExempt(rel) {
  return (MAP.exempt_paths || []).some((p) =>
    p.endsWith('/') ? rel === p.slice(0, -1) || rel.startsWith(p) : rel === p
  );
}

// A CONTEXT exemption allows a named term on a specific line shape in a
// specific file — never a whole file, and never a bare term. It exists for
// interoperability surfaces: a secret scanner's label must name the real
// credential type, and an egress blocklist must carry the literal hostname, or
// the feature stops working. BRANDING.md §2 permits a third-party name as
// market context; it never permits one as a statement of what INA runs on.
const CTX = (MAP.context_exemptions || []).map((c) => ({
  files: new Set(c.files || []),
  re: new RegExp(c.line_pattern, 'i'),
  reason: c.reason,
}));

function contextAllowed(rel, line) {
  return CTX.some((c) => c.files.has(rel) && c.re.test(line));
}

function isDoc(rel) {
  // --stdin is fed rendered README / marketplace prose, so it is always DOC.
  // Getting this wrong would silently disable the superlative rule on exactly
  // the surface §5 UWG cares about most.
  if (rel === '<stdin>') return true;
  const ext = extname(rel).toLowerCase();
  const base = basename(rel);
  return (
    DOC_EXT.has(ext) ||
    rel.startsWith('docs/') ||
    /^README/i.test(base) ||
    /^CHANGELOG/i.test(base)
  );
}

function classify(rel, line) {
  if (isDoc(rel)) return 'DOC';
  // An identifier is a hit the wire, the filesystem or a config key depends
  // on. Renaming one is a compatibility change, not a copy edit — so it gets
  // its own class and is never auto-replaced.
  // Token-based, not pattern-stacked. The previous version required at least
  // one character BEFORE the root, so it could never match a token that begins
  // with one — `QWEN_FIM_TOKENS` was classified as prose, which would have put
  // a symbol name on the hard-zero public-surface list and forced a rename.
  for (const m of line.matchAll(/["'`]([^"'`\n]{1,160})["'`]/g)) {
    if (ID_ROOT.test(m[1])) return 'ID';          // quoted model id, config key, shell command
  }
  for (const m of line.matchAll(/\b[A-Za-z][A-Za-z0-9_]{2,}\b/g)) {
    const tok = m[0];
    if (!ID_ROOT.test(tok)) continue;
    if (tok === tok.toUpperCase()) return 'ID';   // SCREAMING_SNAKE symbol / env var
  }
  if (/[.?]\s*[a-z_][A-Za-z0-9_]*/.test(line)) {  // property access on a wire object
    for (const m of line.matchAll(/[.?]\s*([a-z_][A-Za-z0-9_]*)/g)) {
      if (ID_ROOT.test(m[1])) return 'ID';
    }
  }
  for (const m of line.matchAll(/\/(?![/*])((?:\\.|\[[^\]]*\]|[^/\n\\])+)\/[gimsuy]*/g)) {
    if (ID_ROOT.test(m[1])) return 'ID';          // regex literal matching upstream text
  }
  // KEY=value in an env file: the VALUE is a wire identifier, the key is not.
  const envAssign = /^[\s#]*[A-Z][A-Z0-9_]*\s*=\s*(.+)$/.exec(line);
  if (envAssign && ID_ROOT.test(envAssign[1])) return 'ID';
  return 'CODE';
}

function scanText(rel, text, findings) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 4000) continue; // minified / generated single-line blobs
    // Every distinct term on the line is reported, not just the first: a line
    // reading "Ollama with Qwen 2.5 Coder" is two violations and the
    // replacement phase needs both. Spans already covered by a LONGER term are
    // dropped, so "Qwen" is not re-reported inside "Qwen 2.5 Coder 32B".
    const taken = [];
    const covered = (s, e) => taken.some(([a, b]) => s >= a && e <= b);
    // Interoperability lines (secret-scanner labels, egress hostnames) keep
    // their third-party names; see CTX above for why.
    if (!contextAllowed(rel, line)) for (const { term, re } of DENY_RE) {
      const g = new RegExp(re.source, 'gi');
      let m;
      while ((m = g.exec(line)) !== null) {
        const s = m.index, e = m.index + m[0].length;
        if (m[0].length === 0) { g.lastIndex++; continue; }
        if (covered(s, e)) continue;
        taken.push([s, e]);
        findings.push({
          file: rel, line: i + 1, column: s + 1, term,
          rule: 'deny-term', class: classify(rel, line),
          excerpt: line.trim().slice(0, 200),
        });
      }
    }
    // §5 UWG governs ADVERTISING. A superlative inside a code comment or a
    // shell script is not a market claim, and flagging it produced pure noise
    // ("BUG FIX #1-C", "an unmatched quote" in gradlew) — a gate nobody
    // believes is a gate nobody keeps. The rule therefore runs on prose only.
    if (isDoc(rel)) {
      for (const { term, re } of SUPER_RE) {
        const m = re.exec(line);
        if (m) {
          findings.push({
            file: rel, line: i + 1, column: m.index + 1, term,
            rule: 'superlative-claim', class: 'DOC',
            excerpt: line.trim().slice(0, 200),
          });
          break; // one superlative finding per line is enough to fail it
        }
      }
    }
  }
}

const findings = [];
let scanned = 0;

if (MODE_STDIN) {
  scanText('<stdin>', readFileSync(0, 'utf8'), findings);
  scanned = 1;
} else if (MODE_STAGED) {
  // Staged mode scans the ADDED LINES of the staged diff, not whole files.
  //
  // Scanning whole files here was wrong and unusable: editing one comment in a
  // file that already holds 40 pre-existing model ids reported 40 "new"
  // identifiers and blocked the commit. A pre-commit gate that fires on work
  // the author did not do is a gate that gets bypassed with --no-verify, which
  // is the same as not having one.
  let diff;
  try {
    diff = execFileSync(
      'git',
      ['-C', REPO, 'diff', '--cached', '-U0', '--no-color', '--diff-filter=ACMR'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
    );
  } catch (e) {
    die(`git diff --cached failed in ${REPO}: ${e.message}`);
  }
  let file = null;
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim();
      file = p === '/dev/null' ? null : p.replace(/^b\//, '');
      if (file && (isExempt(file) || BIN.has(extname(file).toLowerCase()))) file = null;
      if (file) scanned++;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { lineNo = parseInt(hunk[1], 10); continue; }
    if (!file || !raw.startsWith('+')) continue;
    const before = findings.length;
    scanText(file, raw.slice(1), findings);
    // scanText numbers lines from 1 within the string it was handed; rewrite to
    // the real file line so the report points somewhere a human can open.
    for (let k = before; k < findings.length; k++) findings[k].line = lineNo;
    lineNo++;
  }
} else {
  let files;
  try {
    // maxBuffer is explicit: the 1 MB default silently turns a large repo's
    // file list into a spawn error, and an error here must never be mistaken
    // for an empty repo.
    files = execFileSync('git', ['-C', REPO, 'ls-files'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    die(`git listing failed in ${REPO}: ${e.message}`);
  }
  // --staged legitimately has nothing to scan (a commit touching only exempt
  // or binary files). A FULL scan that finds no files means git told us
  // nothing — a broken scan, not a clean repo.
  if (files.length === 0 && !MODE_STAGED) {
    die(`git ls-files returned 0 files in ${REPO} — scan did not execute`);
  }
  const NUL = String.fromCharCode(0);
  for (const rel of files) {
    if (isExempt(rel)) continue;
    if (BIN.has(extname(rel).toLowerCase())) continue;
    const abs = join(REPO, rel);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.includes(NUL)) continue; // binary without a known extension
    scanned++;
    scanText(rel, text, findings);
  }
}

// ---------------------------------------------------------------------------
// SEVERITY: the public surface is hard zero; identifiers are a shrink-only
// ratchet.
//
// DOC and CODE hits are prose and user-visible strings — the actual public
// surface, and there is no defensible baseline above zero for them.
//
// ID hits are protocol and configuration identifiers: a shell command that
// really is `ina pull <upstream-id>`, a JSON key the server really sends, a
// regex that really matches an upstream error string. Renaming one is a
// compatibility change, not a copy edit (BRANDING.md §5). Failing the build on
// the pre-existing population would make the gate permanently red, and a gate
// that is always red carries no signal — so ID hits are held at a MEASURED
// baseline that may only shrink. A new one fails the build.
// ---------------------------------------------------------------------------
const counts = findings.reduce((a, f) => ((a[f.class] = (a[f.class] || 0) + 1), a), {});
const publicSurface = (counts.DOC || 0) + (counts.CODE || 0);
const idCount = counts.ID || 0;
const idBaseline = Number.isInteger(MAP.id_baseline) ? MAP.id_baseline : 0;
// A PUBLIC-SURFACE baseline is only ever a migration aid for a repository that
// is still PRIVATE. It carries a terminal condition: it must reach 0 before the
// repository may be made public. It is deliberately noisy on every run, because
// a debt nobody is reminded of is a debt nobody pays.
const pubBaseline = Number.isInteger(MAP.public_surface_baseline)
  ? MAP.public_surface_baseline
  : 0;
// --stdin and --staged scan a slice, so a baseline comparison is meaningless
// there: any ID hit in a slice is a hit the author just touched.
const sliceMode = MODE_STDIN || MODE_STAGED;
const idRegression = sliceMode ? idCount > 0 : idCount > idBaseline;
// In a slice (staged/stdin) any public-surface hit is one the author just
// wrote, so the baseline never applies there.
const pubRegression = sliceMode ? publicSurface > 0 : publicSurface > pubBaseline;
const failed = pubRegression || idRegression;

const report = {
  tool: 'brand-lint',
  version: MAP.version,
  repo: REPO,
  mode: MODE_STDIN ? 'stdin' : MODE_STAGED ? 'staged' : 'tracked',
  files_scanned: scanned,
  violations: findings.length,
  public_surface: publicSurface,
  id_hits: idCount,
  id_baseline: sliceMode ? null : idBaseline,
  public_surface_baseline: sliceMode ? null : pubBaseline,
  failed,
  by_class: findings.reduce((a, f) => ((a[f.class] = (a[f.class] || 0) + 1), a), {}),
  by_rule: findings.reduce((a, f) => ((a[f.rule] = (a[f.rule] || 0) + 1), a), {}),
  by_term: findings.reduce((a, f) => ((a[f.term] = (a[f.term] || 0) + 1), a), {}),
  findings,
};

if (MODE_JSON) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  for (const f of findings) {
    process.stdout.write(
      `${f.file}:${f.line}:${f.column}: [${f.class}] ${f.rule} "${f.term}" — ${f.excerpt}\n`
    );
  }
  process.stdout.write(
    `brand-lint: ${scanned} file(s) scanned · public-surface ${publicSurface} (must be 0) · ` +
    `identifiers ${idCount}${sliceMode ? '' : `/${idBaseline} baseline`}\n`
  );
  if (pubRegression) {
    process.stdout.write('brand-lint: FAIL — a forbidden term is on a public surface.\n');
  }
  if (!sliceMode && pubBaseline > 0) {
    process.stdout.write(
      `brand-lint: WARNING — public-surface debt held at ${publicSurface}/${pubBaseline}. ` +
      'This baseline is a migration aid for a PRIVATE repository and MUST reach 0 ' +
      'before this repository is made public.\n'
    );
  }
  if (idRegression) {
    process.stdout.write(
      sliceMode
        ? 'brand-lint: FAIL — this change introduces a new upstream identifier. See BRANDING.md §5.\n'
        : `brand-lint: FAIL — identifier count ${idCount} exceeds the baseline ${idBaseline}. ` +
          'The baseline may only shrink.\n'
    );
  }
  if (!failed && idCount > 0 && !sliceMode) {
    process.stdout.write(
      `brand-lint: OK — ${idCount} identifier(s) held at baseline; lower it as they migrate ` +
      'behind src/config/model-registry.ts.\n'
    );
  }
}
// process.exit() truncates a pending stdout write when stdout is a pipe, which
// silently corrupted the --json report on a repo with ~800 findings (the JSON
// ended mid-string). Setting exitCode lets Node flush and exit on its own.
process.exitCode = failed ? 1 : 0;
