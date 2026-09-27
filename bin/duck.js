#!/usr/bin/env node
'use strict';

// Rubber Duck CLI (MVP, no-brain mode). Zero dependencies, no network, no keys.
//   duck                 start a decision session
//   duck retro           run follow-ups on decisions that are due
//   duck log             list your decisions
// Flags: --dial <sounding|socratic|devil|verdict>   --dir <path>   --review-days <n>

const path = require('path');
const { createIO } = require('../src/io');
const { runSession } = require('../src/session');
const { runRetro } = require('../src/retro');
const store = require('../src/store');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dial') args.dial = argv[++i];
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--review-days') args.reviewDays = parseInt(argv[++i], 10);
    else args._.push(a);
  }
  return args;
}

function logCmd(baseDir) {
  const records = store.listRecords(baseDir);
  if (!records.length) {
    process.stdout.write('No decisions yet. Run `duck` to make one.\n');
    return;
  }
  for (const r of records) {
    const m = r.meta;
    process.stdout.write(
      `${(m.created || '').slice(0, 10)}  [${m.status}]  ${m.decision}\n` +
        `            review: ${m.review_on}\n`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseDir = args.dir ? path.resolve(args.dir) : process.cwd();
  const cmd = args._[0] || 'session';

  if (cmd === 'log') {
    logCmd(baseDir);
    return;
  }

  const io = createIO();
  if (cmd === 'retro') {
    await runRetro(io, { baseDir });
  } else {
    process.stdout.write('\n🦆  Rubber Duck — talk it through. I will not give you another option.\n');
    await runSession(io, { baseDir, dial: args.dial, reviewDays: args.reviewDays });
  }
}

main().catch((err) => {
  process.stderr.write(`duck error: ${err.stack || err}\n`);
  process.exit(1);
});
