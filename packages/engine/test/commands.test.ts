import { describe, expect, it } from 'vitest';
import { parseBreakdown } from '../src/breakdown.ts';
import { parseCommand, pickByWords } from '../src/commands.ts';
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
    ['no, just one', { type: 'answer', answer: 1 }],
    ['yeah probably soon', { type: 'answer', answer: 0 }],
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

describe('picking a call by voice', () => {
  const calls = r.read.calls; // 1 counters (Redis), 2 health check routes, 3 new packages

  it.each([
    ['go', { type: 'start' }],
    ["Okay, let's go.", { type: 'start' }],
    ['in order', { type: 'start' }],
    ['the second one', { type: 'open', call: '2' }],
    ['number three', { type: 'open', call: '3' }],
    ['the last one', { type: 'open', call: '3' }],
    ['the Redis one', { type: 'open', call: '1' }],
    ['the reddis one', { type: 'open', call: '1' }],
    ['counters', { type: 'open', call: '1' }],
    ['health checks', { type: 'open', call: '2' }],
    ["let's talk about the packages", { type: 'open', call: '3' }],
  ])('%s', (said, command) => {
    expect(parseCommand(said, undefined, { calls })).toEqual(command);
  });

  it.each([
    'Why Redis?',
    'what does the limiter do on a 429',
    'is this plan any good',
    'the thing about the plan',
  ])('leaves "%s" for Frank', (said) => {
    expect(parseCommand(said, undefined, { calls })).toBeUndefined();
  });

  it('switches calls from inside one only when asked to', () => {
    expect(parseCommand("let's talk about the health check", redis, { calls })).toEqual({
      type: 'open',
      call: '2',
    });
    // Inside a call, "in memory" is still one of its options.
    expect(parseCommand('in memory', redis, { calls })).toEqual({
      type: 'choose',
      option: 2,
    });
  });
});

describe('answering Frank’s yes-or-no questions', () => {
  it.each([
    ['yes', { type: 'yes' }],
    ['Yeah.', { type: 'yes' }],
    ['go with that', { type: 'yes' }],
    ['yeah go for it', { type: 'yes' }],
    ['no, not that', { type: 'no' }],
    ['okay', { type: 'yes' }],
    ['nope', { type: 'no' }],
    ['wait', { type: 'no' }],
  ])('%s', (said, command) => {
    expect(parseCommand(said, redis, { expecting: 'yes-no' })).toEqual(command);
  });

  it('means the hinge when Frank asked the hinge, not a yes-or-no question', () => {
    expect(parseCommand('yeah', redis)).toEqual({ type: 'answer', answer: 0 });
  });
});

describe('finding your way by voice', () => {
  it.each([
    ['show me my plans', { type: 'plans' }],
    ['back to plans', { type: 'plans' }],
    ['switch plan', { type: 'plans' }],
    ['you explain it', { type: 'explain' }],
    ["I haven't read it", { type: 'explain' }],
    ['hold on', { type: 'hold' }],
    ['let me think', { type: 'hold' }],
    ['wait, what?', { type: 'again' }],
    ['say that again', { type: 'again' }],
    ['simpler', { type: 'again' }],
  ])('%s', (said, command) => {
    expect(parseCommand(said, redis)).toEqual(command);
  });

  it('"I don’t know" means unsure only when there is something to answer', () => {
    expect(parseCommand("I don't know", redis)).toEqual({ type: 'unsure' });
    expect(
      parseCommand("I don't know", { ...redis, hinge: undefined } as never),
    ).toBeUndefined();
  });
});

describe('picking a plan by voice', () => {
  const plans = [
    { id: 'a', text: 'Add rate limiting to the public API' },
    { id: 'b', text: 'Migrate sessions to JWT' },
    { id: 'c', text: 'Tidy the logger' },
  ];
  it.each([
    ['the second one', 'b'],
    ['the last one', 'c'],
    ['the rate limiting one', 'a'],
    ['JWT', 'b'],
    ["let's do the logger", 'c'],
  ])('%s', (said, id) => {
    expect(pickByWords(said, plans)).toBe(id);
  });

  it.each(['why is the logger slow', 'the plan', 'something else entirely'])(
    'leaves "%s" alone',
    (said) => {
      expect(pickByWords(said, plans)).toBeUndefined();
    },
  );
});
