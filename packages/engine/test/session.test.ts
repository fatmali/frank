import { describe, expect, it } from 'vitest';
import { parseBreakdown } from '../src/breakdown.ts';
import { Session, splitSuggestion } from '../src/session.ts';
import type { Call } from '../src/types.ts';
import { RATE_LIMIT_BREAKDOWN, ScriptedBrain, drain, loadFixture } from './helpers.ts';

const ctx = loadFixture('rate-limit');

function calls(): Call[] {
  const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
  if (!r.ok) throw new Error('fixture breakdown failed');
  return r.read.calls;
}

describe('Session', () => {
  it('starts on the hardest call', () => {
    const s = new Session(new ScriptedBrain([]), ctx, calls());
    expect(s.selected).toBe('1');
    expect(s.progress).toEqual({ made: 0, total: 3 });
  });

  it("opens a call with Frank's instructions, not as something the developer said", async () => {
    const brain = new ScriptedBrain([
      'The plan adds Redis. There is no Redis in docker-compose.yml. More than one instance?',
    ]);
    const s = new Session(brain, ctx, calls());
    const text = await drain(s.openCall('1'));
    expect(text).toMatch(/no Redis/);
    expect(s.turns).toEqual([{ role: 'frank', text, callId: '1' }]);
    const last = brain.requests[0]!.messages.at(-1)!.content;
    expect(last).toMatch(/The code contradicts the plan here/);
    expect(last).toMatch(/Open call 1: "Counter storage"/);
  });

  it("sends only the current call's thread, with every call's state", async () => {
    const brain = new ScriptedBrain([
      'Opening on Redis.',
      'Then keep it in memory.',
      'Opening on routes.',
    ]);
    const s = new Session(brain, ctx, calls());
    await drain(s.openCall('1'));
    await drain(s.ask('Just one instance.'));
    s.decide('1', { verdict: 'change', detail: 'use in-memory counters' });
    await drain(s.openCall('2'));

    const req = brain.requests[2]!;
    const all = req.messages.map((m) => m.content).join('\n');
    expect(all).toContain('[decided: change: use in-memory counters]');
    expect(all).toContain('Should /health be rate limited? (discussing now)');
    // Call 1's back-and-forth stays out of call 2's request.
    expect(all).not.toContain('Just one instance.');
  });

  it('keeps roles alternating when a thread continues', async () => {
    const brain = new ScriptedBrain(['First.', 'Second.', 'Third.']);
    const s = new Session(brain, ctx, calls());
    await drain(s.openCall('1'));
    await drain(s.ask('Why?'));
    await drain(s.whatWouldYouDo());
    const roles = brain.requests[2]!.messages.map((m) => m.role);
    for (let i = 1; i < roles.length; i++) expect(roles[i]).not.toBe(roles[i - 1]);
    expect(roles[0]).toBe('user');
    expect(roles.at(-1)).toBe('user');
    expect(brain.requests[2]!.messages.at(-1)!.content).toMatch(
      /What would you do about "Where should the counters live\?"/,
    );
    // The thread shows what the developer asked, not Frank's instruction.
    const asked = s.turns.filter((t) => t.role === 'user').map((t) => t.text);
    expect(asked.at(-1)).toBe('What would you do?');
  });

  it('moves to the next open call after each decision', () => {
    const s = new Session(new ScriptedBrain([]), ctx, calls());
    expect(s.decide('1', { verdict: 'change', detail: 'in memory' })).toBe('2');
    expect(s.decide('2', { verdict: 'drop' })).toBe('3');
    expect(s.decide('3', { verdict: 'keep' })).toBeUndefined();
    expect(s.progress).toEqual({ made: 3, total: 3 });
  });

  it('refuses a change with nothing to change to', () => {
    const s = new Session(new ScriptedBrain([]), ctx, calls());
    expect(() => s.decide('1', { verdict: 'change', detail: '  ' })).toThrow(
      /say what to do instead/,
    );
  });

  it('does not modify the calls it was given', () => {
    const original = calls();
    const s = new Session(new ScriptedBrain([]), ctx, original);
    s.decide('1', { verdict: 'keep' });
    expect(original[0]!.outcome).toBeUndefined();
  });

  it('keeps a partial reply when a turn is cancelled', async () => {
    const brain = new ScriptedBrain(['This reply gets cut off halfway through.']);
    const s = new Session(brain, ctx, calls());
    const it = s.openCall('1')[Symbol.asyncIterator]();
    await it.next();
    await it.return?.();
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0]!.text.length).toBeGreaterThan(0);
  });

  it('writes the note from the calls actually made', () => {
    const s = new Session(new ScriptedBrain([]), ctx, calls());
    s.decide('1', {
      verdict: 'change',
      detail: 'use in-memory counters; we run one instance',
    });
    s.decide('2', { verdict: 'change', detail: 'limit /api/public only, not /health' });
    s.decide('3', { verdict: 'keep' });
    expect(s.note()).toMatchInlineSnapshot(`
      "Revise the plan before building:
      - Counter storage. Instead: Use in-memory counters; we run one instance.
      - Limited routes. Instead: Limit /api/public only, not /health.
      - Keep: Add express-rate-limit and rate-limit-redis.
      Everything else stays as planned."
    `);
  });

  it('chooses options: the plan keeps the call, another changes it', () => {
    const s = new Session(new ScriptedBrain([]), ctx, calls());
    expect(s.choose('1', 2)).toBe('2');
    expect(s.calls[0]!.outcome).toEqual({
      verdict: 'change',
      detail: 'Keep counters in memory in the API process instead of Redis.',
      option: 2,
    });
    expect(s.choose('2', 1)).toBe('3');
    expect(s.calls[1]!.outcome).toEqual({ verdict: 'keep' });
    expect(() => s.choose('3', 5)).toThrow(/no option 5/);
  });

  it('answers what a call comes down to, and remembers it for Frank', async () => {
    const brain = new ScriptedBrain([
      'In memory. One instance needs nothing shared.\n[option 2]',
    ]);
    const s = new Session(brain, ctx, calls());
    expect(s.answer('1', 1)).toBe(2);
    expect(s.answers['1']).toBe(1);
    await drain(s.whatWouldYouDo());
    expect(brain.requests[0]!.messages.at(-1)!.content).toContain(
      'I said "No" to "Will you run more than one instance soon?"',
    );
    // Frank's pointer to an option becomes a suggestion, not part of what he said.
    expect(s.suggestion).toEqual({ callId: '1', option: 2 });
    expect(s.turns.at(-1)!.text).toBe('In memory. One instance needs nothing shared.');
    s.choose('1', 2);
    expect(s.suggestion).toBeUndefined();
  });

  it('comes back to calls skipped earlier', () => {
    const s = new Session(new ScriptedBrain([]), ctx, calls());
    expect(s.neighbour('1', 1)).toBe('2');
    expect(s.neighbour('1', -1)).toBeUndefined();
    s.select('2');
    expect(s.decide('2', { verdict: 'keep' })).toBe('3');
    expect(s.decide('3', { verdict: 'keep' })).toBe('1');
  });

  it('writes option changes in the words meant for the agent', () => {
    const s = new Session(new ScriptedBrain([]), ctx, calls());
    s.choose('1', 2);
    s.choose('2', 2);
    expect(s.note()).toBe(
      [
        'Revise the plan before building:',
        '- Counter storage: Keep counters in memory in the API process instead of Redis.',
        '- Limited routes: Apply the limiter to /api/public only; leave /health alone.',
        'Everything else stays as planned.',
      ].join('\n'),
    );
  });
});

describe('splitSuggestion', () => {
  it('finds the option tag at the end, even mid-stream', () => {
    expect(splitSuggestion('Go with 2.\n[option 2]')).toEqual({
      text: 'Go with 2.',
      option: 2,
    });
    expect(splitSuggestion('Go with 2.\n[opt')).toEqual({ text: 'Go with 2.' });
    expect(splitSuggestion('No tag here.')).toEqual({ text: 'No tag here.' });
  });
});
