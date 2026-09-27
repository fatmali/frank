'use strict';

// The conductor: an explicit state machine that drives one decision to a
// committed, owned record. In this MVP the "brain" is the heuristics module
// (no LLM). The HARD RULES below are enforced by the harness, not the brain —
// that separation is the whole point, and it's what a model adapter would slot
// into later without being able to override these rules.

const h = require('./heuristics');
const store = require('./store');

// Dial ceilings: how hard the duck is allowed to push.
const DIAL_CEILING = { sounding: 1, socratic: 2, devil: 3, verdict: 4 };
const LEVEL = { surface: 1, probe: 2, challenge: 3, converge: 4 };

const MAX_PROBES = 4; // HARD RULE: forced termination — the loop must end.

async function runSession(io, opts = {}) {
  const baseDir = opts.baseDir || process.cwd();
  const dial = opts.dial && DIAL_CEILING[opts.dial] ? opts.dial : 'socratic';
  const ceiling = DIAL_CEILING[dial];

  io.say('articulate', "What are you trying to decide? (one line)");
  const topic = await io.ask('articulate', '');
  if (!topic) return abort(io);

  // --- Surface the real options -------------------------------------------
  let options = [];
  for (let tries = 0; tries < 2 && options.length < 2; tries++) {
    const prompt =
      tries === 0
        ? "What are the actual options — not 'do it or not', the real ones?"
        : 'Name at least two concrete options so we have something to weigh.';
    const raw = await io.ask('surface', prompt);
    if (raw == null) return abort(io);
    options = h.parseOptions(raw);
  }

  // --- Surface the difficulty (and the fear under it) ----------------------
  const hard = await io.ask('surface', 'What makes this hard? Say the real thing.');
  if (hard == null) return abort(io);

  const history = [hard];
  let fear = h.detectFear(hard);
  let expectation = h.detectExpectation(hard);
  let virtue = h.detectVirtue(hard);
  const usedMoves = new Set();

  // --- Probe / Challenge loop ---------------------------------------------
  let circles = 0;
  for (let turn = 0; turn < MAX_PROBES; turn++) {
    const move = pickMove({ fear, expectation, virtue, ceiling, usedMoves });
    if (!move) break;
    usedMoves.add(move.key);

    const answer = await io.ask(move.state, move.question);
    if (answer == null) return abort(io);

    // Re-sense on the new answer.
    fear = h.detectFear(answer);
    expectation = h.detectExpectation(answer);
    virtue = h.detectVirtue(answer);

    // HARD RULE: detect circling and force convergence.
    if (h.isCircling(answer, history)) circles++;
    history.push(answer);
    if (circles >= 1) break;
  }

  // --- Converge ------------------------------------------------------------
  const convergeMsg =
    circles >= 1
      ? "We've circled this a couple of times — I think you're avoiding the choice. What are you choosing?"
      : "We've looked at this from a few angles. What are you choosing?";
  const choiceRaw = await io.ask('converge', convergeMsg);
  if (choiceRaw == null) return abort(io);
  const choice = h.matchOption(choiceRaw, options) || choiceRaw;

  // --- Commit (their words, their reconsider-if, their confirmation) -------
  const why = await io.ask('converge', 'Why — in your own words? (this becomes the record)');
  if (why == null) return abort(io);

  const reconsiderRaw = await io.ask(
    'converge',
    'When should you let yourself reopen this? What would have to actually change?'
  );
  if (reconsiderRaw == null) return abort(io);
  const reconsider_if = h.parseOptions(reconsiderRaw);

  const created = new Date().toISOString();
  const rec = {
    id: store.newId(topic),
    created,
    status: 'committed',
    decision: choice,
    options_considered: options.length ? options : [choice],
    reconsider_if: reconsider_if.length ? reconsider_if : [reconsiderRaw.trim()],
    review_on: store.addDays(store.today(), opts.reviewDays || 14),
    review_trigger: 'time',
    dial_used: dial,
    model_used: 'none (no-brain heuristic)',
    why: why.trim(),
  };

  io.say('commit', 'Here is the record:');
  io.note(`Decision:      ${rec.decision}`);
  io.note(`Why:           ${rec.why}`);
  io.note(`Reconsider if: ${rec.reconsider_if.join('; ')}`);
  io.note(`Review on:     ${rec.review_on}`);

  const confirm = await io.ask('commit', 'Commit this? (y/n)');
  if (confirm == null) return abort(io);
  if (!/^y/i.test(confirm.trim())) {
    io.say('plain', "Okay — nothing written. Sleep on it, come back when you can name the choice.");
    io.close();
    return { committed: false };
  }

  const file = store.writeRecord(baseDir, rec);
  io.say('commit', `Decided. Written to ${relativize(baseDir, file)}`);
  io.note("You already decided this. Don't reopen it tomorrow just because it's uncomfortable — reopen it when your 'reconsider if' actually happens. Go ship. 🦆");
  io.close();
  return { committed: true, file, record: rec };
}

// Choose the next move given what we've sensed and the dial ceiling.
// Never proposes an option — every question is templated and option-free.
function pickMove({ fear, expectation, virtue, ceiling, usedMoves }) {
  if (expectation.length && LEVEL.probe <= ceiling && !usedMoves.has('expectation')) {
    return {
      key: 'expectation',
      state: 'probe',
      question: `You said "${expectation[0]}". Whose expectation is that — yours, or someone else's?`,
    };
  }
  if (fear.length && LEVEL.probe <= ceiling && !usedMoves.has('fear')) {
    return {
      key: 'fear',
      state: 'probe',
      question: `You keep talking about what you'd lose ("${fear[0]}"). Is that a reason to pick an option, or a fear you're steering around?`,
    };
  }
  if (virtue.length && LEVEL.challenge <= ceiling && !usedMoves.has('virtue')) {
    return {
      key: 'virtue',
      state: 'challenge',
      question: `You keep saying "${virtue[0]}". ${cap(virtue[0])} at the cost of what?`,
    };
  }
  if (LEVEL.probe <= ceiling && !usedMoves.has('future')) {
    return {
      key: 'future',
      state: 'probe',
      question: 'Which of these would still matter six months from now?',
    };
  }
  if (LEVEL.challenge <= ceiling && !usedMoves.has('reversible')) {
    return {
      key: 'reversible',
      state: 'challenge',
      question: 'Is this a one-way door or a two-way door? If it is reversible, what are you actually afraid of?',
    };
  }
  return null; // nothing left within the dial ceiling — go converge.
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function relativize(baseDir, file) {
  return file.startsWith(baseDir) ? '.' + file.slice(baseDir.length) : file;
}

function abort(io) {
  io.say('plain', 'No input — closing. The duck will be here when you are.');
  io.close();
  return { committed: false, aborted: true };
}

module.exports = { runSession, DIAL_CEILING, MAX_PROBES };
