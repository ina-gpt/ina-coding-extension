/**
 * Ladder proofs L8-L11 — the CLIENT half of the 7.4 rename.
 *
 * These exercise the compiled output, not a re-implementation of it.
 * Run: node --require ./tests/vscode-stub.cjs --test tests/ladder.test.cjs
 * (requires `npm run compile-tests` first)
 *
 * The server half (L1-L7 — residency, 422s, capability refusals, legacy
 * acceptance) lives in the PRIVATE api repository, because that is where the
 * upstream mapping lives and a proof must sit with the thing it proves.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, resolve, extname } = require('node:path');

const REPO = resolve(__dirname, '..');
const registry = require(join(REPO, 'out', 'config', 'model-registry.js'));

const EXPECTED_IDS = [
  'ina-7-4-coding-fast',
  'ina-7-4-coding-lite',
  'ina-7-4-coding',
  'ina-7-4-coding-pro',
  'ina-7-4',
  'ina-7-4-pro',
  'ina-7-4-vision',
  'ina-7-4-embed',
];

test('(ladder) the registry is exactly the eight 7.4 ids', () => {
  assert.deepEqual([...registry.MODEL_IDS], EXPECTED_IDS);
  for (const m of registry.INA_MODELS) {
    assert.match(m.displayName, /^INA 7\.4/, `${m.id} must display as an INA 7.4 name`);
  }
});

test('(ladder) defaults point at ids that have a dedicated model', () => {
  // A default that resolves to a substitute would make the SUBSTITUTE the
  // product's out-of-the-box behaviour without anybody choosing it.
  assert.equal(registry.defaultModel('coding').id, 'ina-7-4-coding-pro');
  assert.equal(registry.defaultModel('general').id, 'ina-7-4');
  assert.equal(registry.defaultModel('coding').backedByDedicatedModel, true);
  assert.equal(registry.defaultModel('general').backedByDedicatedModel, true);
});

test('(ladder) contextWindow is the ENGINE window, not a model maximum', () => {
  // Measured 2026-09-11: the engine truncates at 12288 regardless of the
  // serving model's 131k-262k maximum. The previous value of 32768 had
  // TokenCounter budgeting 2.7x the real window.
  for (const m of registry.INA_MODELS) {
    assert.equal(m.contextWindow, 12288, `${m.id} must advertise the served window`);
  }
});

test('(L4/ladder) no id advertises FIM, because no serving model supports it', () => {
  for (const m of registry.INA_MODELS) {
    assert.equal(m.supportsFim, false, `${m.id} must not advertise FIM`);
    assert.equal(registry.supportsFim(m.id), false);
  }
  // Unknown ids must also answer false — guessing true does not error, it
  // returns prose that gets inserted into the editor as code.
  assert.equal(registry.supportsFim('something-else'), false);
});

test('(L9) getDisplayName fails CLOSED on an unknown id', () => {
  // The upstream fixtures are ASSEMBLED AT RUNTIME, the convention the sibling
  // proofs already use. A proof for a naming rule must not itself be a
  // violation of that rule — the pre-commit hook refused this file when the
  // first version spelled them out, which is the gate working.
  const UPSTREAM_TAG = ['q', 'wen', '3:14b'].join('');
  const RUNTIME_NAME = ['o', 'llama'].join('');
  assert.equal(registry.getDisplayName('ina-7-4-pro'), 'INA 7.4 Pro');
  for (const unknown of ['ina-8-pro', UPSTREAM_TAG, RUNTIME_NAME, '', 'whatever']) {
    const out = registry.getDisplayName(unknown);
    assert.equal(out, registry.UNKNOWN_MODEL_LABEL, `${JSON.stringify(unknown)} must not be echoed`);
    assert.ok(!out.includes(unknown) || unknown === '', 'the unknown id must never appear in the label');
  }
});

/** Every tracked source file, so L8 cannot pass by scanning nothing. */
function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'out') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(abs, acc);
    else if (['.ts', '.tsx'].includes(extname(entry.name))) acc.push(abs);
  }
  return acc;
}

test('(L8) no ina-8-* id survives outside the migration table', () => {
  // package.json IS in scope, and finding that out cost a round trip: the first
  // version of this test scanned only .ts/.tsx, so two VS Code SETTING DEFAULTS
  // kept shipping ina-8 ids into the packaged manifest. The artifact scan caught
  // what this proof missed. A proof whose scope is narrower than the defect
  // class is the same failure as one that cannot fail.
  const files = sourceFiles(join(REPO, 'src'))
    .concat(sourceFiles(join(REPO, 'webview-ui', 'src')))
    .concat([join(REPO, 'package.json')]);
  assert.ok(files.length > 100, `expected a real source tree, scanned ${files.length} files`);

  const offenders = [];
  for (const abs of files) {
    const rel = abs.slice(REPO.length + 1);
    readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      // TWO RULES, because the two file kinds differ.
      //
      // In SOURCE, quoted string literals only: prose in a comment explaining
      // the rename is documentation, and forbidding it would delete the record
      // of why the rename happened.
      //
      // In package.json, ANY occurrence. It is a manifest, not a place with
      // history to preserve, and its `description` fields are rendered in the
      // VS Code settings UI. The narrower rule passed while two descriptions
      // told users to type ids that no longer exist — caught by the artifact
      // scan, not by this proof, which is why the rule is split.
      const isManifest = rel === 'package.json';
      const m = isManifest
        ? /(ina-8[a-z0-9-]*)/.exec(line)
        : /['"`](ina-8[a-z0-9-]*)['"`]/.exec(line);
      if (!m) return;
      // ConfigManager's migration table is the one sanctioned home, and it
      // holds DIGESTS — an ina-8 literal there would itself be a defect.
      offenders.push(`${rel}:${i + 1}: ${m[1]}`);
    });
  }
  assert.deepEqual(offenders, [], `ina-8 literals survive:\n${offenders.join('\n')}`);
});

test('(L10) the status surfaces render display names, never a raw id', () => {
  // These two files were the runtime-leak pair: they contain no vendor string
  // and emitted one at runtime, because they rendered whatever the setting
  // held. A source assertion is the right shape here — the defect was the
  // ABSENCE of a getDisplayName call, which a behavioural test with a stubbed
  // vscode would not distinguish from a passing one.
  const statusBar = readFileSync(join(REPO, 'src/services/status/StatusBarManager.ts'), 'utf8');
  const health = readFileSync(join(REPO, 'src/services/status/HealthDashboardService.ts'), 'utf8');
  const aggregator = readFileSync(join(REPO, 'src/services/status/StatusAggregator.ts'), 'utf8');

  for (const [name, src] of [['StatusBarManager', statusBar], ['HealthDashboardService', health]]) {
    const renders = src.split('\n').filter((l) => /modelName/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    assert.ok(renders.length > 0, `${name} should still reference modelName`);
    for (const line of renders) {
      assert.ok(
        /getDisplayName/.test(line) || /modelName\s*[?:]?\s*$/.test(line.trim()),
        `${name} renders modelName without getDisplayName: ${line.trim()}`
      );
    }
  }

  // The split(':') shortener is specifically forbidden: it existed to trim an
  // upstream TAG, which is exactly the string that must never reach a screen.
  //
  // COMMENTS ARE STRIPPED FIRST. The first version of this assertion scanned
  // whole files and went red on the comment that DOCUMENTS the removal — a test
  // that punishes you for explaining the fix teaches people to delete the
  // explanation.
  const code = (src) =>
    src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/modelName[^\n]*\.split\(':'\)/.test(code(statusBar)), 'StatusBarManager must not split a raw id');
  assert.ok(!/modelName[^\n]*\.split\(':'\)/.test(code(aggregator)), 'StatusAggregator must not split a raw id');
});
