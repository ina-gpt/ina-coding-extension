#!/usr/bin/env node
/**
 * secret-lint — credential detection in the four channels that actually leaked.
 *
 * Zero dependencies. Node >= 18. ESM.
 *
 * WHY THESE FOUR CHANNELS
 *   A personal access token reached this host in a git remote URL and in
 *   assistant state files. None of that is "source code", so a scanner that
 *   only reads tracked files would have reported clean throughout.
 *
 *   CHANNEL 1  git remote URLs         userinfo embedded in a remote
 *   CHANNEL 2  tracked file contents   token/key shapes in `git ls-files`
 *   CHANNEL 3  inline command prefixes  GH_TOKEN="ghp_..." style invocations
 *   CHANNEL 4  staged content          channels 2+3 against the staged diff
 *
 * WHAT THIS SCANNER WILL NOT DO
 *   It never prints more than SECRET_PREVIEW characters of a match. A scanner
 *   that echoes what it finds turns every CI log and every terminal scrollback
 *   into a second copy of the credential — worse than no scanner.
 *
 * EXIT
 *   0 clean · 1 findings · 2 the scan could not run
 *
 * A scan that read nothing exits 2, never 0.
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
const MODE_REMOTES = argv.includes('--remotes');
// --dir walks a plain directory tree with no git. It exists for material that
// is not a repository: an extracted archive, a packaged artifact, a backup.
const dirArg = argv.find((a) => a.startsWith('--dir='));
const MODE_DIR = Boolean(dirArg);
const rootArg = argv.find((a) => a.startsWith('--root='));
const scanArg = argv.find((a) => a.startsWith('--scan='));
const REPO = rootArg ? resolve(rootArg.slice('--root='.length)) : resolve(HERE, '..');

const SECRET_PREVIEW = 6;

function die(msg) {
  process.stderr.write(`secret-lint: FATAL ${msg}\n`);
  process.exit(2);
}

/** Never let more than SECRET_PREVIEW characters of a secret escape. */
const redact = (s) => `${String(s).slice(0, SECRET_PREVIEW)}…[redacted ${String(s).length} chars]`;

// ---------------------------------------------------------------- rule set
// Ordered: the most specific vendor shapes first so a match is attributed to
// the right rule rather than to a generic catch-all.
const RULES = [
  { id: 'github-pat',   re: /gh[pousr]_[A-Za-z0-9]{20,}/g,            what: 'GitHub personal access token' },
  { id: 'github-pat',   re: /github_pat_[A-Za-z0-9_]{20,}/g,          what: 'GitHub fine-grained PAT' },
  { id: 'slack-token',  re: /xox[baprs]-[A-Za-z0-9-]{10,}/g,          what: 'Slack token' },
  { id: 'openai-key',   re: /sk-[A-Za-z0-9]{20,}/g,                   what: 'OpenAI-style API key' },
  { id: 'aws-akid',     re: /AKIA[0-9A-Z]{16}/g,                      what: 'AWS access key id' },
  { id: 'private-key',  re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g,
                                                                       what: 'private key block' },
];

// CHANNEL 3 — a credential passed as an inline environment prefix.
const INLINE_ENV = /\b(GH_TOKEN|GITHUB_TOKEN|GITHUB_PERSONAL_ACCESS_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY)\s*=\s*["']?(gh[pousr]_|github_pat_|sk-|AKIA)[A-Za-z0-9_\-]*/g;

// CHANNEL 1 — userinfo in a URL. Deliberately shape-based, not token-shaped:
// ANY credential in a remote is a finding whatever its format.
const REMOTE_USERINFO = /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]*:?[^/@\s]*@/i;

// ------------------------------------------------------------- allowlist
// .secretlintignore — one entry per line: `<pattern>\t<reason>` or
// `<pattern> # <reason>`. An entry WITHOUT a reason is itself a finding: an
// unexplained allowlist is how a real credential gets waved through later.
function loadAllowlist(root) {
  const p = join(root, '.secretlintignore');
  const entries = [];
  const problems = [];
  if (!existsSync(p)) return { entries, problems };
  const lines = readFileSync(p, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let pattern = line;
    let reason = '';
    if (line.includes('\t')) {
      const t = line.split('\t');
      pattern = t[0].trim();
      reason = t.slice(1).join('\t').trim();
    } else if (line.includes(' # ')) {
      const idx = line.indexOf(' # ');
      pattern = line.slice(0, idx).trim();
      reason = line.slice(idx + 3).trim();
    }
    if (!reason) {
      problems.push({
        file: '.secretlintignore', line: i + 1, rule: 'unexplained-allowlist',
        what: 'allowlist entry without a reason',
        match: pattern.slice(0, 40),
      });
      continue;
    }
    let re = null;
    try { re = new RegExp(pattern); } catch { re = null; }
    entries.push({ pattern, reason, re });
  }
  return { entries, problems };
}

function allowed(allowlist, file, line, matched) {
  return allowlist.some((a) =>
    (a.re && (a.re.test(file) || a.re.test(line) || a.re.test(matched))) ||
    file.includes(a.pattern) || line.includes(a.pattern)
  );
}

// ------------------------------------------------------------------ scan
const findings = [];
let scanned = 0;

function scanLine(file, lineNo, line, allowlist) {
  if (line.length > 8000) line = line.slice(0, 8000);
  for (const r of RULES) {
    const g = new RegExp(r.re.source, r.re.flags);
    let m;
    while ((m = g.exec(line)) !== null) {
      if (m[0].length === 0) { g.lastIndex++; continue; }
      if (allowed(allowlist, file, line, m[0])) continue;
      findings.push({
        file, line: lineNo, rule: r.id, what: r.what,
        match: redact(m[0]), channel: 'file-contents',
      });
    }
  }
  const gi = new RegExp(INLINE_ENV.source, INLINE_ENV.flags);
  let mi;
  while ((mi = gi.exec(line)) !== null) {
    if (allowed(allowlist, file, line, mi[0])) continue;
    findings.push({
      file, line: lineNo, rule: 'inline-env-prefix',
      what: `credential passed inline as ${mi[1]}`,
      match: redact(mi[0]), channel: 'inline-command',
    });
  }
}

/** CHANNEL 1. Walks with symlinks FOLLOWED and across filesystems. */
function scanRemotes(root) {
  // A `find -type d -name .git` walk misses two real cases, both of which hid
  // an actual leak on this host: a clone reached through a SYMLINK, and a clone
  // whose files live on another filesystem. Resolve the real path and read the
  // config directly rather than trusting the directory walk.
  const seen = new Set();
  const configs = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = join(dir, e.name);
      if (e.name === 'node_modules' || e.name === '.cache') continue;
      let real;
      try { real = realpathSync(p); } catch { continue; }
      if (seen.has(real)) continue;
      let st;
      try { st = statSync(p); } catch { continue; }   // stat FOLLOWS symlinks
      if (st.isDirectory()) {
        seen.add(real);
        if (e.name === '.git') {
          const c = join(p, 'config');
          if (existsSync(c)) configs.push(c);
          continue;
        }
        walk(p, depth + 1);
      }
    }
  };
  walk(root, 0);
  if (configs.length === 0) {
    return { configs: 0, note: 'no git config found under the scan root' };
  }
  for (const c of configs) {
    scanned++;
    let text;
    try { text = readFileSync(c, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*url\s*=\s*(\S+)/.exec(lines[i]);
      if (!m) continue;
      if (REMOTE_USERINFO.test(m[1])) {
        const userinfo = m[1].replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('@')[0];
        findings.push({
          file: c, line: i + 1, rule: 'remote-userinfo',
          what: 'credential embedded in a git remote URL',
          match: redact(userinfo), channel: 'git-remote',
        });
      }
    }
  }
  return { configs: configs.length };
}

const { entries: allowlist, problems } = loadAllowlist(REPO);
findings.push(...problems.map((p) => ({ ...p, channel: 'allowlist' })));

if (MODE_REMOTES) {
  const root = scanArg ? resolve(scanArg.slice('--scan='.length)) : REPO;
  const r = scanRemotes(root);
  if (r.configs === 0) die(`scanned 0 git configs under ${root} — a scan that read nothing is not a clean result`);
} else if (MODE_DIR) {
  const base = resolve(dirArg.slice('--dir='.length));
  if (!existsSync(base)) die(`--dir target does not exist: ${base}`);
  const SKIPD = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.gz','.tgz','.woff','.woff2','.ttf','.mp3','.mp4','.wav','.node','.wasm','.so','.dylib','.class','.jar']);
  const NULC = String.fromCharCode(0);
  const walk = (dir, rel, depth) => {
    if (depth > 12) return;
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const abs = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(abs, r, depth + 1); continue; }
      if (!e.isFile()) continue;
      if (SKIPD.has(extname(r).toLowerCase())) continue;
      let st; try { st = statSync(abs); } catch { continue; }
      if (st.size > 512 * 1024 * 1024) { scanned++; continue; }
      let text; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
      if (text.includes(NULC)) continue;
      scanned++;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) scanLine(r, i + 1, lines[i], allowlist);
    }
  };
  walk(base, '', 0);
  if (scanned === 0) die(`--dir scanned 0 readable files under ${base} — a scan that read nothing is not a clean result`);
} else if (MODE_STDIN) {
  // Read in CHUNKS. Slurping stdin into one string threw ERR_STRING_TOO_LONG on
  // a 519 MB archive and the scan simply died — which is UNKNOWN, never clean.
  // A scanner that crashes on large input while its caller reads the exit code
  // as a verdict is the same defect class as a gate that cannot fail.
  const CHUNK = 64 * 1024 * 1024;
  let buf = Buffer.alloc(0);
  let carry = '';
  let lineNo = 0;
  const fd = 0;
  const tmp = Buffer.alloc(CHUNK);
  const { readSync } = await import('node:fs');
  for (;;) {
    let n = 0;
    try { n = readSync(fd, tmp, 0, CHUNK, null); } catch (e) {
      if (e && e.code === 'EAGAIN') continue;
      if (e && e.code === 'EOF') break;
      throw e;
    }
    if (n === 0) break;
    const text = carry + tmp.slice(0, n).toString('utf8');
    const lines = text.split('\n');
    carry = lines.pop() ?? '';
    for (const l of lines) scanLine('<stdin>', ++lineNo, l, allowlist);
  }
  if (carry) scanLine('<stdin>', ++lineNo, carry, allowlist);
  scanned = 1;
} else if (MODE_STAGED) {
  let diff;
  try {
    diff = execFileSync('git', ['-C', REPO, 'diff', '--cached', '-U0', '--no-color', '--diff-filter=ACMR'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (e) { die(`git diff --cached failed in ${REPO}: ${e.message}`); }
  let file = null, lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim();
      file = p === '/dev/null' ? null : p.replace(/^b\//, '');
      if (file) scanned++;
      continue;
    }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) { lineNo = parseInt(h[1], 10); continue; }
    if (!file || !raw.startsWith('+')) continue;
    scanLine(file, lineNo, raw.slice(1), allowlist);
    lineNo++;
  }
} else {
  let files;
  try {
    files = execFileSync('git', ['-C', REPO, 'ls-files'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) { die(`git listing failed in ${REPO}: ${e.message}`); }
  if (files.length === 0) die(`git ls-files returned 0 files in ${REPO} — scan did not execute`);
  const SKIP = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.gz','.tgz','.woff','.woff2','.ttf','.mp3','.mp4','.wav','.jks','.keystore','.vsix','.node','.wasm','.so','.dylib','.class','.jar']);
  const NUL = String.fromCharCode(0);
  for (const rel of files) {
    if (SKIP.has(extname(rel).toLowerCase())) continue;
    const abs = join(REPO, rel);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.includes(NUL)) continue;
    scanned++;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) scanLine(rel, i + 1, lines[i], allowlist);
  }
  // Channel 3 also covers assistant permission allowlists and shell history
  // present in the tree — neither is tracked, but both live beside it.
  for (const extra of ['.claude/settings.json', '.claude/settings.local.json', '.bash_history', '.zsh_history']) {
    const abs = join(REPO, extra);
    if (!existsSync(abs)) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    scanned++;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) scanLine(extra, i + 1, lines[i], allowlist);
  }
}

const report = {
  tool: 'secret-lint',
  repo: REPO,
  mode: MODE_REMOTES ? 'remotes' : MODE_DIR ? 'dir' : MODE_STDIN ? 'stdin' : MODE_STAGED ? 'staged' : 'tracked',
  sources_scanned: scanned,
  findings: findings.length,
  by_rule: findings.reduce((a, f) => ((a[f.rule] = (a[f.rule] || 0) + 1), a), {}),
  by_channel: findings.reduce((a, f) => ((a[f.channel] = (a[f.channel] || 0) + 1), a), {}),
  results: findings,
};

if (MODE_JSON) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
else {
  for (const f of findings) {
    process.stdout.write(`${f.file}:${f.line}: [${f.rule}] ${f.what} — ${f.match}\n`);
  }
  process.stdout.write(`secret-lint: ${scanned} source(s) scanned, ${findings.length} finding(s)\n`);
}
process.exitCode = findings.length > 0 ? 1 : 0;
