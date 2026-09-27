'use strict';

// Phase 0 hypothesis test — the MACHINERY, with zero API keys.
// Drives a full session end-to-end through the real CLI, then the retro loop,
// and asserts the protocol's guarantees hold:
//   1. A session reaches a committed, written decision record.
//   2. The record captures the user's OWN words + a reconsider-if clause.
//   3. HARD RULE: the duck never proposes an option.
//   4. The retro loop reopens a due decision, logs the outcome, updates status.
//
// This proves the loop RUNS and is well-formed. Whether it produces *felt*
// ownership is Phase 1 (a human in the loop) — see docs/mvp-spec.md.

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DUCK = path.join(__dirname, '..', 'bin', 'duck.js');

function run(args, stdin) {
  const res = spawnSync('node', [DUCK, ...args], {
    input: stdin.join('\n') + '\n',
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`duck exited ${res.status}\n${res.stderr}`);
  }
  return res.stdout;
}

function ok(name) {
  console.log(`  ✓ ${name}`);
}

// A model-free phrase scan: would this text be PROPOSING an option?
const OPTION_PROPOSING = [
  /have you (thought about|considered)/i,
  /what about (a |an |the |using )/i,
  /you could (try|do|use|add|write)/i,
  /i(?:'d| would) (suggest|recommend|go with)/i,
  /here(?:'s| is) (an|another|a better) option/i,
  /\boption:\s/i,
];

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-test-'));
  console.log(`\nRubber Duck — Phase 0 machinery test  (dir: ${tmp})\n`);

  // --- A full session (devil's-advocate dial) -----------------------------
  const sessionInput = [
    'whether to refactor the auth module now or just ship the fix',           // topic
    '1) ship the one-line fix 2) refactor the whole module now 3) fix now and ticket the refactor', // options
    "if I don't do it now I know the ticket will rot in the backlog forever",  // the hard thing (fear)
    "honestly it's the backlog I don't trust, not the code",                   // answer to fear probe
    'shipping the fix matters most, the refactor can wait a week',             // answer to future probe
    'totally reversible, it is a two-way door',                                // answer to reversible challenge
    'option 1, ship the fix',                                                  // converge: the choice
    'it is reversible, we are mid-incident, and forgetting is a process problem not a code problem', // why (verbatim)
    'if the refactor ticket is still untouched in two weeks',                  // reconsider-if
    'y',                                                                       // confirm
  ];
  const out = run(['--dial', 'devil', '--dir', tmp, '--review-days', '14'], sessionInput);

  assert(/Decided\./.test(out), 'session should reach a committed decision');
  assert(/Reconsider if:/.test(out), 'commit summary should show reconsider-if');
  ok('session runs to a committed decision');

  // HARD RULE: the duck never proposes an option.
  for (const re of OPTION_PROPOSING) {
    assert(!re.test(out), `HARD RULE violated — duck proposed an option: ${re}`);
  }
  ok('hard rule holds: the duck never proposed an option');

  // --- The record is well-formed and in the user's words ------------------
  const decisionsDir = path.join(tmp, '.duck', 'decisions');
  const files = fs.readdirSync(decisionsDir).filter((f) => f.endsWith('.md'));
  assert.strictEqual(files.length, 1, 'exactly one decision record written');
  const recFile = path.join(decisionsDir, files[0]);
  let raw = fs.readFileSync(recFile, 'utf8');

  assert(/^status: committed$/m.test(raw), 'status is committed');
  assert(/ship the one-line fix/.test(raw), 'decision resolved to the chosen option');
  assert(/options_considered:/.test(raw) && (raw.match(/^\s+- /gm) || []).length >= 2, 'kept >=2 options considered');
  assert(/forgetting is a process problem not a code problem/.test(raw), 'why is captured verbatim in the user\'s words');
  assert(/refactor ticket is still untouched in two weeks/.test(raw), 'reconsider-if captured');
  ok('record is well-formed and in the user\'s own words');

  // --- Make it due, then run the retro loop -------------------------------
  raw = raw.replace(/^review_on: .*$/m, 'review_on: 2000-01-01');
  fs.writeFileSync(recFile, raw);

  const retroInput = [
    'y',                                                   // did it hold up?
    'n',                                                   // did a reconsider-if fire?
    'ship reversible changes fast; fix the backlog, not the code', // takeaway
  ];
  const retroOut = run(['retro', '--dir', tmp], retroInput);
  assert(/hold up/i.test(retroOut), 'retro asks whether the call held up');

  const after = fs.readFileSync(recFile, 'utf8');
  assert(/^status: closed$/m.test(after), 'held-up decision is closed after retro');
  assert(/ship reversible changes fast/.test(after), 'retro takeaway appended to the record');
  ok('retro loop reopens a due decision, logs outcome, updates status');

  console.log('\nAll Phase 0 checks passed. The machinery works with no model. 🦆\n');
  fs.rmSync(tmp, { recursive: true, force: true });
}

main();
