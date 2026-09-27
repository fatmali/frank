'use strict';

// The retro loop — the part nothing else does. Reopens committed decisions
// whose review date has arrived and asks whether the call held up. Appends the
// outcome to the record's Retro log. This is the seed corpus for the future
// "taste model," and it's independently valuable today because developers
// otherwise never get feedback on whether their decisions were right.

const fs = require('fs');
const store = require('./store');

async function runRetro(io, opts = {}) {
  const baseDir = opts.baseDir || process.cwd();
  const today = store.today();

  const due = store
    .listRecords(baseDir)
    .filter((r) => r.meta.status === 'committed' && r.meta.review_on && r.meta.review_on <= today);

  if (!due.length) {
    io.say('plain', 'No decisions are due for a retro. Nothing to reopen.');
    io.close();
    return { reviewed: 0 };
  }

  let reviewed = 0;
  for (const r of due) {
    const decision = r.meta.decision;
    const created = (r.meta.created || '').slice(0, 10);
    const conds = Array.isArray(r.meta.reconsider_if) ? r.meta.reconsider_if : [r.meta.reconsider_if].filter(Boolean);

    io.say('plain', `On ${created} you chose: ${decision}`);
    const held = await io.ask('plain', 'Did that hold up? (y = good call / n = went wrong / meh = too soon to tell)');
    if (held == null) break;

    let firedNote = '';
    if (conds.length) {
      const fired = await io.ask(
        'plain',
        `You said reconsider if: ${conds.join('; ')}. Did any of that actually happen? (y/n)`
      );
      if (fired == null) break;
      firedNote = /^y/i.test(fired) ? 'a reconsider-if condition fired' : 'no reconsider-if condition fired';
    }

    const takeaway = await io.ask('plain', 'One line for future-you: what did this teach you?');
    if (takeaway == null) break;

    const verdict = /^y/i.test(held) ? 'held up' : /^n/i.test(held) ? 'went wrong' : 'too soon to tell';
    appendRetro(r.file, { today, verdict, firedNote, takeaway: takeaway.trim() });

    // Move status: reopen if it went wrong or a condition fired, else close.
    const conditionFired = firedNote === 'a reconsider-if condition fired';
    const newStatus = verdict === 'went wrong' || conditionFired ? 'open' : verdict === 'too soon to tell' ? 'committed' : 'closed';
    setStatus(r.file, newStatus);

    if (newStatus === 'open') {
      io.note('Reopened — this one earned a fresh look. That is the trigger you set firing, not just discomfort.');
    } else if (newStatus === 'closed') {
      io.note('Closed. Logged that it held up — worth remembering next time you weigh a call like this.');
    } else {
      io.note('Left open for another look later.');
    }
    reviewed++;
  }

  io.close();
  return { reviewed };
}

function appendRetro(file, { today, verdict, firedNote, takeaway }) {
  let raw = fs.readFileSync(file, 'utf8');
  const entry =
    `\n- **${today}** — ${verdict}` +
    (firedNote ? `; ${firedNote}` : '') +
    (takeaway ? `\n  - takeaway: ${takeaway}` : '');
  if (raw.includes('<!-- appended by `duck retro` -->')) {
    raw = raw.replace('<!-- appended by `duck retro` -->', entry.trimStart());
  } else {
    raw = raw.replace(/(## Retro log\n)/, `$1${entry.trimStart()}\n`);
  }
  fs.writeFileSync(file, raw);
}

function setStatus(file, status) {
  let raw = fs.readFileSync(file, 'utf8');
  raw = raw.replace(/^status:\s*.*$/m, `status: ${status}`);
  fs.writeFileSync(file, raw);
}

module.exports = { runRetro };
