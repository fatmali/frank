import { describe, expect, it } from 'vitest';
import { parseBreakdown, parsePartialRead } from '../src/breakdown.ts';
import type { Call } from '../src/types.ts';
import {
  briefing,
  callIntro,
  leadsTo,
  madeCall,
  startWith,
  walkMeThrough,
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
  it('says what the plan does and why, the calls by name, then where to start', () => {
    const lines = briefing({ ...read(), source: 'claude-code' }, true);
    expect(lines).toEqual([
      {
        about: 'plan',
        text: "Claude Code's plan adds a per-key limit of 100 requests a minute to the public API, with counters in Redis, so one noisy key can't slow the API for everyone.",
      },
      {
        about: 'calls',
        text: 'Three things in it need you: counter storage, limited routes and new dependencies.',
      },
      {
        about: 'call:1',
        text: 'Counter storage is the hardest to undo. Where should we start?',
      },
    ]);
  });

  it('is short: about twenty seconds at a speaking pace', () => {
    expect(words(briefing(read(), true))).toBeLessThanOrEqual(55);
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
    // The plan sentence is said while the read streams; the rest once it's in.
    expect(said.map((l) => l.about)).toEqual(['plan']);
    expect(briefing(read(), true).slice(0, 1)).toEqual(said);
  });

  it('starts talking as soon as the plan sentence is complete', () => {
    const upToGoal = RATE_LIMIT_BREAKDOWN.slice(
      0,
      RATE_LIMIT_BREAKDOWN.indexOf('"fine"'),
    );
    const lines = briefing(parsePartialRead(upToGoal, ctx), false);
    expect(lines.map((l) => l.about)).toEqual(['plan']);
  });

  it('names three calls at most, and counts the rest', () => {
    const r = read();
    const five: Call[] = [...r.calls, ...r.calls.slice(0, 2)].map((c, i) => ({
      ...c,
      id: String(i + 1),
    }));
    expect(briefing({ ...r, calls: five }, true)[1]!.text).toBe(
      'Five things in it need you: counter storage, limited routes, new dependencies and two smaller ones.',
    );
  });

  it('with one call, asks to walk it through; with none, says ship it', () => {
    const r = read();
    expect(
      briefing({ ...r, calls: r.calls.slice(0, 1) }, true)
        .slice(1)
        .map((l) => l.text),
    ).toEqual([
      'One thing in it needs you: counter storage.',
      'Want to walk me through it?',
    ]);
    expect(briefing({ ...r, calls: [] }, true).at(-1)!.text).toBe(
      'Nothing in it needs you. Ship it.',
    );
  });

  it('without a call hard to undo, just asks where to start', () => {
    const r = read();
    const easy = r.calls.map((c) => ({ ...c, undoCost: 'easy' as const }));
    expect(briefing({ ...r, calls: easy }, true).at(-1)!.text).toBe(
      'Where should we start?',
    );
  });

  it('still works from an older read, with no goal or spoken lines', () => {
    const r = parseBreakdown(LEGACY_BREAKDOWN, ctx);
    if (!r.ok) throw new Error('parse failed');
    const lines = briefing(r.read, true);
    expect(lines[0]!.text).toBe('I read the plan.');
    expect(lines[1]!.text).toMatch(
      /^Three things in it need you: add express-rate-limit/,
    );
  });
});

describe('walk me through it', () => {
  it('hands the call to the developer to explain', () => {
    const counters = read().calls[0]!;
    expect(walkMeThrough(counters)).toEqual([
      {
        about: 'call:1',
        text: "Walk me through this bit. What's the plan doing here?",
      },
    ]);
    expect(walkMeThrough({ ...counters, planQuote: '' })[0]!.text).toBe(
      "Walk me through counter storage. What's the plan doing there?",
    );
  });

  it('starts with the call hardest to undo that is still open', () => {
    const calls = read().calls;
    expect(startWith(calls).id).toBe('1');
    const made = calls.map((c, i) =>
      i === 0 ? { ...c, outcome: { verdict: 'keep' as const } } : c,
    );
    expect(startWith(made).id).toBe('2');
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
