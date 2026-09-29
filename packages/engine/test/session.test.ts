import { describe, expect, it } from 'vitest';
import { parseBreakdown } from '../src/breakdown.ts';
import { Session } from '../src/session.ts';
import type { Call } from '../src/types.ts';
import { RATE_LIMIT_BREAKDOWN, ScriptedBrain, drain, loadFixture } from './helpers.ts';

const ctx = loadFixture('rate-limit');

function calls(): Call[] {
  const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
  if (!r.ok) throw new Error('fixture breakdown failed');
  return r.calls;
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
    expect(last).toMatch(/Open call 1: "Store counts in Redis"/);
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
    expect(all).toContain('Apply to every route (discussing now)');
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
      /What would you do about "Store counts in Redis"/,
    );
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
      - Store counts in Redis. Instead: Use in-memory counters; we run one instance.
      - Apply to every route. Instead: Limit /api/public only, not /health.
      - Keep: Adds two new dependencies.
      Everything else stays as planned."
    `);
  });
});
