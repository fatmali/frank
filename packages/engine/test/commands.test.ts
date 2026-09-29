import { describe, expect, it } from 'vitest';
import { parseBreakdown } from '../src/breakdown.ts';
import { parseCommand } from '../src/commands.ts';
import { RATE_LIMIT_BREAKDOWN, loadFixture } from './helpers.ts';

const ctx = loadFixture('rate-limit');
const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
if (!r.ok) throw new Error('fixture breakdown failed');
const redis = r.read.calls[0]!; // options: Redis, In memory; hinge: Yes -> 1, No -> 2

describe('parseCommand', () => {
  it.each([
    ['keep it', { type: 'choose', option: 1 }],
    ['Go with the plan.', { type: 'choose', option: 1 }],
    ['option two', { type: 'choose', option: 2 }],
    ['the second one', { type: 'choose', option: 2 }],
    ["let's go with 2", { type: 'choose', option: 2 }],
    ['In memory', { type: 'choose', option: 2 }],
    ['okay so go with in memory', { type: 'choose', option: 2 }],
    ['use memory', { type: 'choose', option: 2 }],
    ['yeah', { type: 'answer', answer: 0 }],
    ['Nope.', { type: 'answer', answer: 1 }],
    ['no', { type: 'answer', answer: 1 }],
    ['drop it', { type: 'drop' }],
    ['drop that step', { type: 'drop' }],
    ['next', { type: 'next' }],
    ['skip this one', { type: 'next' }],
    ['go back', { type: 'back' }],
    ['What would you do?', { type: 'take' }],
    ["what's your take", { type: 'take' }],
    ['take it', { type: 'accept' }],
    ["That's it.", { type: 'copy' }],
    ['copy the note', { type: 'copy' }],
  ])('%s', (said, command) => {
    expect(parseCommand(said, redis)).toEqual(command);
  });

  it.each([
    'Why do we even need rate limiting on internal routes?',
    "I'm not sure about Redis, we might scale later",
    'option five',
    'memory',
    'maybe',
  ])('leaves "%s" for Frank', (said) => {
    expect(parseCommand(said, redis)).toBeUndefined();
  });

  it('only chooses options the call has', () => {
    expect(parseCommand('option three', redis)).toBeUndefined();
    expect(parseCommand('keep it')).toEqual({ type: 'choose', option: 1 });
    expect(parseCommand('option two')).toBeUndefined();
  });
});
