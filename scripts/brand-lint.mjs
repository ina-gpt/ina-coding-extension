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
import { readFileSync, existsSync, statSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const MODE_STAGED = argv.includes('--staged');
const MODE_STDIN = argv.includes('--stdin');
const MODE_JSON = argv.includes('--json');
// --provenance-guard is a placement check, not a text check: the NDA-scoped
// provenance document must never be tracked in a repository the public can read.
const MODE_PROV = argv.includes('--provenance-guard');
// --model-licence-guard: a model this system SERVES must have a licence row.
// The gap it closes: aya-expanse:8b sat in the serving fleet under CC-BY-NC-4.0
// with nothing recording its terms, because weight licences are invisible to
// the software-dependency notices generator.
const MODE_MLIC = argv.includes('--model-licence-guard');
const rootArg = argv.find((a) => a.startsWith('--root='));
// --dir scans a plain directory tree with no git. It exists for SHIPPED
// ARTIFACTS: an unpacked .vsix is a public surface that a `git ls-files` scan
// can never reach, because the bundle it contains is generated at package time.
const dirArg = argv.find((a) => a.startsWith('--dir='));
const MODE_DIR = Boolean(dirArg);
const REPO = rootArg ? resolve(rootArg.slice('--root='.length)) : resolve(HERE, '..');

function die(msg) {
  process.stderr.write(`brand-lint: FATAL ${msg}\n`);
  process.exit(2);
}

/* ----------------------------------------------- model-licence-guard mode */
if (MODE_MLIC) {
  const LEDGER = join(REPO, 'docs/licenses/MODEL_LICENCES.md');
  if (!existsSync(LEDGER)) die(`docs/licenses/MODEL_LICENCES.md not found under ${REPO}`);
  const ledger = readFileSync(LEDGER, 'utf8').toLowerCase();

  // A model id looks like `family[.ver][-variant]:size`. It must NOT match a
  // host:port pair or a credential.
  //
  // The first version of this guard scanned .env line-by-line with a loose
  // `\w+:\w+` shape. It matched `localhost:11436`, `stun:<ip>` — and it printed
  // the DATABASE_URL password to stdout, which is precisely the failure this
  // programme's secret gate exists to prevent. Two changes follow from that:
  // read only the KEYS that name models, and never echo a value that did not
  // match the model shape.
  // The tag may be a size (`:14b`, `:30b-a3b`) OR a name (`:latest`). Requiring
  // a leading digit silently skipped `devstral:latest` and
  // `nomic-embed-text:latest` — both served — so the guard reported 5 of 7 and
  // called it clean. A guard that quietly narrows its own input set is the same
  // defect as one that cannot fail.
  const MODEL_ID = /^[a-z][a-z0-9.]*(?:-[a-z0-9.]+)*:[a-z0-9][a-z0-9.-]*$/;
  const NOT_A_MODEL = /^(localhost|stun|turn|https?|redis|rediss|postgres|postgresql|mysql|amqp|ws|wss|file|smtp|imap|s3|gs|mongodb)$/;
  const looksLikeModel = (v) => {
    if (!MODEL_ID.test(v)) return false;
    const scheme = v.split(':')[0];
    if (NOT_A_MODEL.test(scheme)) return false;
    // a port is all digits; a model tag never is
    if (/^[0-9]+$/.test(v.split(':')[1])) return false;
    return true;
  };

  const seen = new Map();
  let read = 0;

  // 1. engine host spec: `- { name: "<model>", digest_prefix: ... }`
  const spec = join(REPO, 'ops/engine-host/host-spec.yaml');
  if (existsSync(spec)) {
    read++;
    for (const m of readFileSync(spec, 'utf8').matchAll(/name:\s*"([^"]+)"/g)) {
      const v = m[1].trim().toLowerCase();
      if (looksLikeModel(v) && !seen.has(v)) seen.set(v, 'ops/engine-host/host-spec.yaml');
    }
  }
  // 2. warmup manifest: the declared resident set
  for (const rel of ['ops/host/ollama-warmup.sh', 'scripts/ollama-warmup.sh']) {
    const w = join(REPO, rel);
    if (!existsSync(w)) continue;
    read++;
    const mm = /WARMUP_MANIFEST\s*=\s*"([^"]*)"/.exec(readFileSync(w, 'utf8'));
    if (mm) for (const v of mm[1].split(/\s+/)) {
      const id = v.trim().toLowerCase();
      if (looksLikeModel(id) && !seen.has(id)) seen.set(id, rel);
    }
  }
  // 3. .env — ONLY keys that name a model. Never the whole file.
  const envp = join(REPO, '.env');
  if (existsSync(envp)) {
    read++;
    for (const line of readFileSync(envp, 'utf8').split('\n')) {
      const kv = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!kv) continue;
      const [, k, rawv] = kv;
      if (!/(_MODEL|^ROUTER_TIER_)/.test(k)) continue;   // key allowlist, not a value scan
      const v = rawv.replace(/^["']|["']$/g, '').trim().toLowerCase();
      if (looksLikeModel(v) && !seen.has(v)) seen.set(v, `.env:${k}`);
    }
  }

  if (read === 0) die(`no serving config found under ${REPO} — a guard that read nothing is not a pass`);
  if (seen.size === 0) die(`no model id parsed from ${read} serving config(s) — refusing to report clean`);

  const missing = [...seen.entries()].filter(([id]) => !ledger.includes(id));
  if (missing.length) {
    for (const [id, src] of missing) {
      process.stdout.write(`${src}: [MODEL-LICENCE] "${id}" is served but has no row in docs/licenses/MODEL_LICENCES.md\n`);
    }
    process.stdout.write(`brand-lint --model-licence-guard: FAIL — ${missing.length} served model(s) without a licence row.\n`);
    process.exit(1);
  }
  process.stdout.write(`brand-lint --model-licence-guard: OK — ${seen.size} served model id(s) across ${read} config(s), all present in the licence ledger.\n`);
  process.exit(0);
}

/* -------------------------------------------------- provenance-guard mode */
if (MODE_PROV) {
  // Visibility is asked of GitHub, never inferred from a path or a filename.
  // "It looks like a private repo" is not evidence, and this is the one check
  // whose false negative publishes a confidential document.
  let files;
  try {
    files = execFileSync('git', ['-C', REPO, 'ls-files'], {
      encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    die(`git listing failed in ${REPO}: ${e.message}`);
  }
  if (files.length === 0) die(`git ls-files returned 0 files in ${REPO} — scan did not execute`);
  const hits = files.filter((f) => /(^|\/)model-provenance\.md$/.test(f));
  if (hits.length === 0) {
    process.stdout.write('brand-lint --provenance-guard: OK — no provenance document is tracked here.\n');
    process.exit(0);
  }
  let visibility = process.env.INA_PROVENANCE_VISIBILITY || '';
  if (!visibility) {
    let slug = '';
    try {
      const url = execFileSync('git', ['-C', REPO, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
      const m = url.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
      if (m) slug = `${m[1]}/${m[2]}`;
    } catch { /* no remote */ }
    if (!slug) die('cannot determine the GitHub slug — refusing to guess the visibility of a repository holding a confidential document');
    try {
      visibility = execFileSync('gh', ['api', `repos/${slug}`, '--jq', '.visibility'], { encoding: 'utf8' }).trim();
    } catch (e) {
      die(`could not read the visibility of ${slug} (${e.message}). "Could not check" is not "private" — set INA_PROVENANCE_VISIBILITY to assert it deliberately.`);
    }
  }
  if (visibility === 'public') {
    for (const h of hits) {
      process.stdout.write(`${h}:1: [PROVENANCE] a confidential model-provenance document is tracked in a PUBLIC repository\n`);
    }
    process.stdout.write(`brand-lint --provenance-guard: FAIL — ${hits.length} provenance document(s) in a public repository.\n`);
    process.exit(1);
  }
  process.stdout.write(`brand-lint --provenance-guard: OK — ${hits.length} provenance document(s), repository visibility "${visibility}".\n`);
  process.exit(0);
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

// Exemptions that hold for a SOURCE scan and must NOT hold for an ARTIFACT
// scan. `dist/` and `out/` are generated output in a repository — and the whole
// product inside an unpacked .vsix. Applying the repo rule to the artifact made
// the artifact gate skip extension/dist/extension.js (1.9 MB) and the packaged
// webview bundle, i.e. everything it exists to inspect, and report clean on the
// 11 files that were left. Measured 2026-09-11.
const BUILD_OUTPUT = (MAP.build_output_paths || []).map((p) => (p.endsWith('/') ? p : `${p}/`));
function isBuildOutputExemption(p) {
  const norm = p.endsWith('/') ? p : `${p}/`;
  return BUILD_OUTPUT.includes(norm);
}

function isExempt(rel) {
  // Matches at the root AND at any path segment boundary. A packaged .vsix
  // relocates everything under `extension/`, so an exact-path-only rule meant
  // the Apache-2.0 attribution exemption did not apply to `extension/LICENSE`
  // — the artifact gate would have failed a licence file for containing
  // precisely the notice the licence requires. Caught by its negative proof.
  return (MAP.exempt_paths || []).some((p) => {
    // In artifact mode the build output is the thing under test.
    if (MODE_DIR && isBuildOutputExemption(p)) return false;
    if (p.endsWith('/')) {
      const d = p.slice(0, -1);
      return rel === d || rel.startsWith(p) || rel.includes(`/${p}`) || rel.endsWith(`/${d}`);
    }
    return rel === p || rel.endsWith(`/${p}`);
  });
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

/**
 * @param ctx        the text to judge: the whole source line, or — inside a
 *                   minified bundle — a local window around the match.
 * @param fullLine   true when ctx is a complete source line. Quote PAIRING is
 *                   only trustworthy then: from an arbitrary offset inside a
 *                   minified blob the same `"qwen3:14b"` reads as either a
 *                   literal or the gap between two others.
 */
function classify(rel, ctx, fullLine = true) {
  const line = ctx;
  if (isDoc(rel)) return 'DOC';
  // An identifier is a hit the wire, the filesystem or a config key depends
  // on. Renaming one is a compatibility change, not a copy edit — so it gets
  // its own class and is never auto-replaced.
  // Token-based, not pattern-stacked. The previous version required at least
  // one character BEFORE the root, so it could never match a token that begins
  // with one — `QWEN_FIM_TOKENS` was classified as prose, which would have put
  // a symbol name on the hard-zero public-surface list and forced a rename.
  // TOKEN-BASED, not quote-paired. Quote pairing is alignment-dependent: from an
  // arbitrary offset inside a minified bundle the same `"qwen3:14b"` reads as
  // either a quoted literal or the gap between two others, so 16 plainly quoted
  // model ids classified as prose. A token carries its own shape regardless of
  // where the scan window began.
  // Quote pairing: only where it is sound.
  if (fullLine) {
    for (const m of line.matchAll(/["'`]([^"'`\n]{1,160})["'`]/g)) {
      if (ID_ROOT.test(m[1])) return 'ID';        // quoted model id, config key, shell command
    }
  }
  for (const m of line.matchAll(/[A-Za-z0-9_.:@\/-]+/g)) {
    const tok = m[0];
    if (!ID_ROOT.test(tok)) continue;
    if (tok.includes(':')) return 'ID';           // model tag, e.g. qwen3:14b
    if (tok.includes('/')) return 'ID';           // package or URL path
    if (/^[a-z0-9][a-z0-9._-]*$/.test(tok) && /[.-]/.test(tok)) return 'ID'; // nomic-embed-text, secret-openai
    // Dotted member access is one token to the regex but several identifiers to
    // a reader: `FIMModel.QWEN_CODER_32B` and `ConnectionTarget.OLLAMA` are a
    // symbol reference, not prose, and judging the whole token missed both.
    for (const seg of tok.split('.')) {
      if (!ID_ROOT.test(seg)) continue;
      if (seg === seg.toUpperCase() && /[A-Z]/.test(seg)) return 'ID';
    }
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

// A minified bundle is ONE line — 1.9 MB of it in this project's shipped VSIX.
// The previous `if (line.length > 4000) continue` therefore skipped the entire
// artifact and reported it clean: a gate that inspected nothing. Long lines are
// now scanned in overlapping windows instead, so a term spanning a window
// boundary is still seen. Measured: no tracked file in these repositories has a
// line this long, so no baseline moved when the skip was removed.
const WINDOW = 4000;
const OVERLAP = 256;
function* windows(line) {
  if (line.length <= WINDOW) { yield [line, 0]; return; }
  for (let start = 0; start < line.length; start += WINDOW - OVERLAP) {
    yield [line.slice(start, start + WINDOW), start];
    if (start + WINDOW >= line.length) break;
  }
}

function scanText(rel, text, findings) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Every distinct term on the line is reported, not just the first: a line
    // reading "Ollama with Qwen 2.5 Coder" is two violations and the
    // replacement phase needs both. Spans already covered by a LONGER term are
    // dropped, so "Qwen" is not re-reported inside "Qwen 2.5 Coder 32B".
    const taken = [];
    const covered = (s, e) => taken.some(([a, b]) => s >= a && e <= b);
    // Interoperability lines (secret-scanner labels, egress hostnames) keep
    // their third-party names; see CTX above for why.
    if (!contextAllowed(rel, line)) for (const [chunk, base] of windows(line)) {
      for (const { term, re } of DENY_RE) {
        const g = new RegExp(re.source, 'gi');
        let m;
        while ((m = g.exec(chunk)) !== null) {
          if (m[0].length === 0) { g.lastIndex++; continue; }
          const s = base + m.index, e = s + m[0].length;
          if (covered(s, e)) continue;
          // A whole minified bundle is ONE line, so a line-level context
          // exemption there would exempt the entire artifact. Exemptions are
          // therefore also tested against the local neighbourhood, which is
          // identical to the line for ordinary source.
          const near = chunk.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
          if (line.length > WINDOW && contextAllowed(rel, near)) continue;
          taken.push([s, e]);
          findings.push({
            file: rel, line: i + 1, column: s + 1, term,
            // Classify on the NEIGHBOURHOOD of the match, not the whole chunk.
            // In a minified bundle the chunk is 4000 characters of densely
            // quoted code, and quote-PAIRING from an arbitrary window start is
            // alignment-dependent: `"qwen3:14b"` was read as the closing quote
            // of one pair and the opening of the next, so a plainly quoted
            // model id classified as prose and showed up as public surface.
            // A local window is alignment-independent and, for ordinary source
            // lines, identical to passing the whole line.
            rule: 'deny-term',
            class: line.length > WINDOW
              ? classify(rel, chunk.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80), false)
              : classify(rel, line, true),
            excerpt: chunk.slice(Math.max(0, m.index - 60), m.index + 140).trim(),
          });
        }
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
} else if (MODE_DIR) {
  const base = resolve(dirArg.slice('--dir='.length));
  if (!existsSync(base)) die(`--dir target does not exist: ${base}`);
  const NUL = String.fromCharCode(0);
  // statSync FOLLOWS symlinks; Dirent.isDirectory() does not. See the scar note
  // in secret-lint's walker — the same blindness, the same fix.
  const visited = new Set();
  const walk = (abs, rel) => {
    let ents;
    try { ents = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const a = join(abs, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      let st;
      try { st = statSync(a); } catch { continue; }
      if (st.isDirectory()) {
        let real; try { real = realpathSync(a); } catch { continue; }
        if (visited.has(real)) continue;
        visited.add(real);
        walk(a, r);
        continue;
      }
      if (!st.isFile()) continue;
      if (isExempt(r)) continue;
      if (BIN.has(extname(r).toLowerCase())) continue;
      if (st.size > 32 * 1024 * 1024) continue;
      let text; try { text = readFileSync(a, 'utf8'); } catch { continue; }
      if (text.includes(NUL)) continue;
      scanned++;
      scanText(r, text, findings);
    }
  };
  walk(base, '');
  if (scanned === 0) die(`--dir scanned 0 readable files under ${base} — a scan that read nothing is not a clean artifact`);
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
// --dir sees a whole artifact, so baselines apply there as they do to a tree.
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
  mode: MODE_STDIN ? 'stdin' : MODE_DIR ? 'dir' : MODE_STAGED ? 'staged' : 'tracked',
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
