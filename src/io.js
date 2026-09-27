'use strict';

// Thin readline wrapper so the conductor can `await ask(...)` one line at a
// time. Works both interactively and with piped stdin (for automated tests).

const readline = require('readline');

function createIO(opts = {}) {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;
  const rl = readline.createInterface({ input, output, terminal: false });

  const queue = [];
  const waiters = [];
  let closed = false;

  rl.on('line', (line) => {
    if (waiters.length) waiters.shift()(line);
    else queue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });

  function nextLine() {
    if (queue.length) return Promise.resolve(queue.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  }

  // The duck's visible "state" prefix — the glanceable face from the spec.
  const FACE = {
    articulate: '🦆',
    surface: '🦆',
    probe: '🦆 ?',
    challenge: '🦆 !',
    converge: '🦆',
    commit: '🦆 ✓',
    plain: '🦆',
  };

  function say(state, text) {
    const face = FACE[state] || FACE.plain;
    output.write(`\n${face}  ${text}\n`);
  }

  async function ask(state, text) {
    say(state, text);
    output.write('\n>  ');
    const line = await nextLine();
    return line == null ? null : line.trim();
  }

  function note(text) {
    output.write(`\n    ${text}\n`);
  }

  function close() {
    rl.close();
  }

  return { ask, say, note, close };
}

module.exports = { createIO };
