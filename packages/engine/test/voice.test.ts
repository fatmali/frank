import { describe, expect, it } from 'vitest';
import { parseBreakdown, parsePartialRead } from '../src/breakdown.ts';
import type { Call } from '../src/types.ts';
import {
  briefing,
  callIntro,
  leadsTo,
  madeCall,
  wrapUp,
  type Line,
} from '../src/voice.ts';
import { LEGACY_BREAKDOWN, RATE_LIMIT_BREAKDOWN, loadFixture } from './helpers.ts';

const ctx = loadFixture('rate-limit');

function read() {
  const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
  if (!r.ok) throw new Error('fixture breakdown failed');
  return r.read;
}

const words = (lines: Line[]) =>
  lines
    .map((l) => l.text)
    .join(' ')
    .split(/\s+/).length;

describe('the briefing', () => {
  it('says what the plan does and why, each call in a line, then asks', () => {
    const lines = briefing({ ...read(), source: 'claude-code' }, true);
    expect(lines).toEqual([
      {
        about: 'plan',
        text: "Claude Code's plan adds a per-key limit of 100 requests a minute to the public API, with counters in Redis, so one noisy key can't slow the API for everyone.",
      },
      {
        about: 'call:1',
        text: "Here's what needs you. First, where the counters live: Redis like the plan says, or in memory.",
      },
      {
        about: 'call:2',
        text: 'Second, whether the health check is limited: every route like the plan, or just the public API.',
      },
      {
        about: 'call:3',
        text: 'Third, whether two new packages are worth it, or just one.',
      },
      {
        about: 'ask',
        text: 'Which one do you want to talk through? Or say go to take them in order.',
      },
    ]);
  });

  it('is short enough to hear: under 35 seconds at a speaking pace', () => {
    // About 2.6 words a second.
    expect(words(briefing(read(), true))).toBeLessThanOrEqual(90);
  });

  it('only ever adds lines as the read streams in, so what was said stays true', () => {
    let said: Line[] = [];
    const ends = [];
    for (let end = 1; end < RATE_LIMIT_BREAKDOWN.length; end += 13) ends.push(end);
    for (const end of [...ends, RATE_LIMIT_BREAKDOWN.length]) {
      const partial = parsePartialRead(RATE_LIMIT_BREAKDOWN.slice(0, end), ctx);
      const now = briefing(partial, false);
      expect(now.slice(0, said.length)).toEqual(said);
      said = now;
    }
    // By the time the read is in, everything but the question has been said.
    expect(briefing(read(), true).slice(0, -1)).toEqual(said);
  });

  it('starts talking as soon as the plan sentence is complete', () => {
    const upToGoal = RATE_LIMIT_BREAKDOWN.slice(
      0,
      RATE_LIMIT_BREAKDOWN.indexOf('"fine"'),
    );
    const lines = briefing(parsePartialRead(upToGoal, ctx), false);
    expect(lines.map((l) => l.about)).toEqual(['plan']);
  });

  it('speaks three calls at most, and says how many more are on screen', () => {
    const r = read();
    const five: Call[] = [...r.calls, ...r.calls.slice(0, 2)].map((c, i) => ({
      ...c,
      id: String(i + 1),
    }));
    const lines = briefing({ ...r, calls: five }, true);
    expect(lines.filter((l) => l.about.startsWith('call:'))).toHaveLength(3);
    expect(lines.at(-2)).toEqual({
      about: 'more',
      text: 'And two smaller ones, on screen.',
    });
  });

  it('with one call, asks to talk it through; with none, says ship it', () => {
    const r = read();
    expect(briefing({ ...r, calls: r.calls.slice(0, 1) }, true).at(-1)!.text).toBe(
      'Want to talk it through?',
    );
    expect(briefing({ ...r, calls: [] }, true).at(-1)!.text).toBe(
      'Nothing in it needs you. Ship it.',
    );
  });

  it('still works from an older read, with no goal or spoken lines', () => {
    const r = parseBreakdown(LEGACY_BREAKDOWN, ctx);
    if (!r.ok) throw new Error('parse failed');
    const lines = briefing(r.read, true);
    expect(lines[0]!.text).toBe('I read the plan.');
    expect(lines[1]!.text).toBe("Here's what needs you. First: Add express-rate-limit.");
  });
});

describe('talking a call through', () => {
  it('says the question, what each option buys and costs, and what decides it', () => {
    const counters = read().calls[0]!;
    expect(callIntro(counters).map((l) => l.text)).toEqual([
      'Where should the counters live?',
      'The code disagrees with the plan here.',
      'The plan goes with Redis: works across instances, but a new service to run.',
      'Or in memory: nothing new to run, but resets on deploy.',
      'It comes down to: will you run more than one instance soon?',
    ]);
    expect(callIntro(counters).every((l) => l.about === 'call:1')).toBe(true);
  });

  it('without a hinge, asks which way to go', () => {
    expect(callIntro(read().calls[1]!).at(-1)!.text).toBe(
      "Keep the plan's choice, or go another way?",
    );
  });

  it('confirms the option an answer leads to, then says what was decided', () => {
    const counters = read().calls[0]!;
    expect(leadsTo(counters, 2)).toBe('Then in memory. Go with that?');
    expect(madeCall({ ...counters, outcome: { verdict: 'keep' } })).toBe(
      'Keeping Redis.',
    );
    expect(
      madeCall({ ...counters, outcome: { verdict: 'change', detail: 'x', option: 2 } }),
    ).toBe('Going with in memory.');
    expect(madeCall({ ...counters, outcome: { verdict: 'drop' } })).toBe('Dropped.');
  });

  it('at the end of the list, says what stays as planned', () => {
    const calls: Call[] = read().calls;
    calls[1] = { ...calls[1]!, outcome: { verdict: 'drop' } };
    expect(wrapUp(calls, 'claude-code')).toBe(
      "That's the end of the list. Two calls stay as planned. You changed one thing: dropped limited routes. Want me to copy the note for Claude Code?",
    );
  });

  it('wraps up with what changed and offers the note', () => {
    const calls: Call[] = read().calls.map((c) => ({
      ...c,
      outcome: { verdict: 'keep' },
    }));
    expect(wrapUp(calls, 'claude-code')).toBe(
      "That's all three. You kept the plan as it is. Want me to copy the note for Claude Code?",
    );
    calls[0] = {
      ...calls[0]!,
      outcome: { verdict: 'change', detail: 'x', option: 2 },
    };
    expect(wrapUp(calls, 'pasted')).toBe(
      "That's all three. You changed one thing: counter storage, in memory. Want me to copy the note for your agent?",
    );
  });
});
