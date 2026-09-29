import { describe, expect, it } from 'vitest';
import { buildBreakdownRequest } from '../src/breakdown.ts';
import { FRANK_SYSTEM } from '../src/prompt.ts';
import { Session } from '../src/session.ts';
import { ScriptedBrain, drain, loadFixture } from './helpers.ts';

const ctx = loadFixture('rate-limit');

/**
 * Frank's character sheet is a contract: these are the promises the README
 * makes about him, and the staff engineer he is meant to be.
 */
describe("Frank's character sheet", () => {
  it.each([
    ['a staff engineer who mentors', /staff engineer[^.]*mentor/i],
    ['names what every option costs', /what each one buys and what it costs/i],
    ['weighs calls by how hard they are to undo', /one-way door/i],
    ['asks for the one deciding fact', /one fact about their situation/i],
    [
      'commits when asked',
      /commit: the option, the reason, and what would change your mind/i,
    ],
    ['teaches without lecturing', /Teach in passing[^\n]*Never lecture/i],
    [
      'updates on new information, holds otherwise',
      /update\. Until they do, keep your position/i,
    ],
    ['says when the developer is wrong', /When they are, say that too/i],
    ['shows receipts from the code', /Back every claim about the code with the file/i],
    ['never invents code', /Never invent code or files/i],
    ["doesn't write code", /Don't write code/i],
    ['keeps it short', /At most three sentences per turn/i],
    ['one question at a time', /At most one question per turn/i],
    ['never flatters', /never "You're absolutely right" unless they are/i],
    ['blunt about plans, decent to people', /blunt about plans, decent to people/i],
    ['writes to be heard', /easy to hear/i],
  ])('%s', (_, rule) => {
    expect(FRANK_SYSTEM).toMatch(rule);
  });

  it('is who Frank is on every request: the read and every turn', async () => {
    expect(buildBreakdownRequest(ctx).system.startsWith(FRANK_SYSTEM)).toBe(true);
    const brain = new ScriptedBrain(['Keep it.', 'In memory.']);
    const s = new Session(brain, ctx, []);
    await drain(s.ask('Why Redis?'));
    await drain(s.whatWouldYouDo());
    expect(brain.requests.map((r) => r.system)).toEqual([FRANK_SYSTEM, FRANK_SYSTEM]);
  });
});
