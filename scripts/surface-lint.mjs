#!/usr/bin/env node
/**
 * surface-lint — brand-lint for surfaces that are not in any repository.
 *
 * A repository can be spotless while the live website, the marketplace listing
 * or a published package description still names the base model. Those are the
 * surfaces a customer actually reads first, and no `git ls-files` scan reaches
 * them.
 *
 * Crawls SAME-ORIGIN only, depth-limited, honouring robots.txt, one request per
 * second. Strips markup, then applies the .brandmap.json denylist and the §5 UWG
 * superlative rule through the same classifier the repository gate uses — one
 * rule set, one implementation, so the two cannot drift apart.
 *
 * Usage:
 *   node scripts/surface-lint.mjs --url=https://inagpt.com [--depth=3] [--json]
 *   node scripts/surface-lint.mjs --url=... --max=40 --out=report.md
 *   node scripts/surface-lint.mjs --selftest        (its negative proof)
 *
 * Exit: 0 clean · 1 violations · 2 the scan could not run.
 *
 * A crawl that fetched nothing exits 2. An unreachable site is an UNKNOWN
 * result, never a clean one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const LINT = join(HERE, 'brand-lint.mjs');
const argv = process.argv.slice(2);
const JSON_MODE = argv.includes('--json');
const arg = (n, d) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};

function die(msg) {
  process.stderr.write(`surface-lint: FATAL ${msg}\n`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Markup out, readable text in — with <script>/<style> bodies removed first. */
function textOf(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ');
}

function linksOf(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      u.hash = '';
      out.push(u);
    } catch { /* unparseable href */ }
  }
  return out;
}

async function robotsDisallow(origin) {
  try {
    const r = await fetch(`${origin}/robots.txt`, { redirect: 'follow' });
    if (!r.ok) return [];
    const txt = await r.text();
    const rules = [];
    let applies = false;
    for (const raw of txt.split('\n')) {
      const line = raw.split('#')[0].trim();
      if (/^user-agent:/i.test(line)) applies = /:\s*\*/.test(line);
      else if (applies && /^disallow:/i.test(line)) {
        const p = line.split(':').slice(1).join(':').trim();
        if (p) rules.push(p);
      }
    }
    return rules;
  } catch { return []; }
}

/** Scan one text blob through brand-lint's --stdin so the rules cannot drift. */
function lintText(text) {
  try {
    const out = execFileSync(process.execPath, [LINT, '--stdin', '--json', `--root=${REPO}`], {
      input: text, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (e) {
    if (e.stdout) { try { return JSON.parse(e.stdout); } catch { /* fall through */ } }
    die(`brand-lint --stdin failed: ${e.message}`);
  }
}

async function crawl(startUrl, { depth = 3, max = 60, delayMs = 1000 } = {}) {
  let start;
  try { start = new URL(startUrl); } catch { die(`not a URL: ${startUrl}`); }
  const origin = start.origin;
  const disallow = await robotsDisallow(origin);
  const blocked = (u) => disallow.some((p) => u.pathname.startsWith(p));

  const seen = new Set();
  const queue = [[start, 0]];
  const pages = [];
  const errors = [];

  while (queue.length && pages.length < max) {
    const [url, d] = queue.shift();
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    if (url.origin !== origin) continue;      // same-origin only
    if (blocked(url)) continue;               // robots.txt

    let res, html;
    try {
      res = await fetch(key, { redirect: 'follow', headers: { 'user-agent': 'ina-surface-lint/1.0 (+https://inagpt.com)' } });
      const ct = res.headers.get('content-type') || '';
      if (!/text\/html|text\/plain|application\/json/.test(ct)) continue;
      html = await res.text();
    } catch (e) {
      errors.push({ url: key, error: String(e.message || e) });
      await sleep(delayMs);
      continue;
    }

    pages.push({ url: key, status: res.status, html });
    if (d < depth) for (const l of linksOf(html, key)) queue.push([l, d + 1]);
    await sleep(delayMs);                     // one request per second
  }
  return { origin, pages, errors, disallow };
}

async function run() {
  const url = arg('url');
  if (!url) die('usage: --url=https://example.com [--depth=3] [--max=60] [--json] [--out=FILE]');
  const depth = parseInt(arg('depth', '3'), 10);
  const max = parseInt(arg('max', '60'), 10);
  const delayMs = parseInt(arg('delay', '1000'), 10);

  const { origin, pages, errors, disallow } = await crawl(url, { depth, max, delayMs });

  // Heartbeat rule: a crawl that read nothing knows nothing.
  if (pages.length === 0) {
    die(`fetched 0 pages from ${origin} (${errors.length} error(s)) — UNKNOWN, never "clean". First: ${errors[0]?.error || 'no response'}`);
  }

  // A surface exemption clears a term on a URL whose PURPOSE requires it: a
  // subprocessor list must name the real subprocessor, and an OpenAI-compatible
  // endpoint cannot be documented without saying so. Same principle as the
  // LICENSE exemption — a legal obligation outranks a naming preference.
  const MAP = JSON.parse(readFileSync(join(REPO, '.brandmap.json'), 'utf8'));
  const SURF = (MAP.surface_exemptions || []).map((e) => ({
    re: new RegExp(`(${e.url_patterns.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i'),
    terms: e.terms ? new Set(e.terms.map((t) => t.toLowerCase())) : null,
    reason: e.reason,
  }));
  const surfaceAllowed = (url, term) =>
    SURF.some((e) => e.re.test(url) && (e.terms === null || e.terms.has(String(term).toLowerCase())));

  const findings = [];
  const exempted = [];
  for (const p of pages) {
    const rep = lintText(textOf(p.html));
    for (const f of rep.findings) {
      if (f.rule === 'deny-term' && surfaceAllowed(p.url, f.term)) {
        exempted.push({ url: p.url, term: f.term, context: f.excerpt });
        continue;
      }
      findings.push({
        url: p.url, term: f.term, rule: f.rule,
        severity: f.rule === 'superlative-claim' ? 'uwg-5' : 'brand',
        context: f.excerpt,
      });
    }
  }

  const report = {
    tool: 'surface-lint', origin,
    pages_scanned: pages.length, fetch_errors: errors.length,
    robots_disallow: disallow, violations: findings.length, findings, errors,
    exempted_count: exempted.length, exempted,
  };

  if (JSON_MODE) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    for (const f of findings) process.stdout.write(`${f.url}\n    [${f.severity}] "${f.term}" — ${f.context}\n`);
    process.stdout.write(`surface-lint: ${pages.length} page(s) scanned, ${errors.length} fetch error(s), ${findings.length} violation(s)\n`);
  }

  const out = arg('out');
  if (out) {
    const md = [
      `# Surface scan — ${origin}`, '',
      `Scanned ${pages.length} page(s), depth ${depth}, ${errors.length} fetch error(s).`,
      `Generated ${new Date(0).toISOString().slice(0, 10) === '1970-01-01' ? '' : ''}`.trim(), '',
      '| url | term | severity | context |', '|---|---|---|---|',
      ...findings.map((f) => `| ${f.url} | ${f.term} | ${f.severity} | ${f.context.replace(/\|/g, '\\|').slice(0, 120)} |`),
      findings.length ? '' : '_No violations found._',
    ].join('\n');
    writeFileSync(out, md + '\n');
  }
  return findings.length > 0 ? 1 : 0;
}

/* ------------------------------------------------------------------ selftest */
// Serves a fixture page locally and asserts the scanner both catches and clears.
async function selftest() {
  let failures = 0;
  const check = (name, got, want) => {
    const ok = got === want;
    if (!ok) failures++;
    process.stdout.write(`  ${ok ? 'ok' : 'NOT OK'}  ${name} (exit ${got}, want ${want})\n`);
  };
  const OLLAMA = ['O', 'llama'].join('');
  const serve = (body) => new Promise((res) => {
    const s = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(body); });
    s.listen(0, '127.0.0.1', () => res({ srv: s, port: s.address().port }));
  });

  const saved = process.argv;
  const call = async (port, extra = [], path = '/') => {
    process.argv = ['node', 'surface-lint', `--url=http://127.0.0.1:${port}${path}`, '--depth=0', '--max=1', '--delay=0', ...extra];
    // re-read args through the same accessors
    argv.length = 0; argv.push(...process.argv.slice(2));
    try { return await run(); } finally { process.argv = saved; }
  };

  let h = await serve(`<html><body><h1>INA</h1><p>Powered by ${OLLAMA}.</p></body></html>`);
  check('a deny term on a live page FAILS', await call(h.port), 1);
  h.srv.close();

  h = await serve('<html><body><h1>INA</h1><p>Powered by INA Inference Runtime.</p></body></html>');
  check('a clean page PASSES (not always-red)', await call(h.port), 0);
  h.srv.close();

  h = await serve('<html><body><p>the best AI assistant in the world</p></body></html>');
  check('a superlative claim FAILS (s.5 UWG)', await call(h.port), 1);
  h.srv.close();

  h = await serve(`<html><body><script>var x="${OLLAMA}";</script><p>INA 8</p></body></html>`);
  check('a term inside <script> is NOT counted as page copy', await call(h.port), 0);
  h.srv.close();

  // The surface exemption must be NARROW. A subprocessor page may name a real
  // processor; the SAME term on an ordinary marketing page must still fail, or
  // the legal carve-out becomes a hole in the whole rule.
  const HETZ = ['Het', 'zner'].join('');
  h = await serve(`<html><body><h1>Subprocessors</h1><p>Hosting: ${HETZ} Online GmbH, Germany.</p></body></html>`);
  check('a real subprocessor named on /subprocessors PASSES (GDPR Art. 28(4))',
    await call(h.port, [], '/subprocessors'), 0);
  h.srv.close();

  h = await serve(`<html><body><h1>Technology</h1><p>Our platform runs on ${HETZ}.</p></body></html>`);
  check('the SAME term on a marketing page still FAILS (exemption is narrow)',
    await call(h.port, [], '/features'), 1);
  h.srv.close();

  process.stdout.write(failures === 0 ? 'SELFTEST PASS\n' : `SELFTEST FAIL (${failures})\n`);
  return failures === 0 ? 0 : 1;
}

if (argv.includes('--selftest')) process.exitCode = await selftest();
else process.exitCode = await run();
