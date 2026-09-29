import { describe, expect, it } from 'vitest';
import {
  buildBreakdownRequest,
  extractJson,
  locateQuote,
  parseBreakdown,
  parsePartialRead,
  runBreakdown,
  type PartialRead,
} from '../src/breakdown.ts';
import { BREAKDOWN_SCHEMA } from '../src/prompt.ts';
import {
  LEGACY_BREAKDOWN,
  RATE_LIMIT_BREAKDOWN,
  ScriptedBrain,
  loadFixture,
} from './helpers.ts';

const ctx = loadFixture('rate-limit');

describe('parseBreakdown', () => {
  it('ranks calls hardest to undo first and numbers them', () => {
    const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.calls.map((c) => [c.id, c.title, c.undoCost])).toEqual([
      ['1', 'Counter storage', 'hard'],
      ['2', 'Limited routes', 'medium'],
      ['3', 'New dependencies', 'easy'],
    ]);
  });

  it('reads the gist, what is fine, and each call as a question with options', () => {
    const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
    if (!r.ok) throw new Error('parse failed');
    expect(r.read.gist).toMatch(/^Adds a per-key limit/);
    expect(r.read.fine).toEqual([
      '429 with a Retry-After header',
      'Tests in test/rateLimit.test.ts',
    ]);
    const redis = r.read.calls[0]!;
    expect(redis.question).toBe('Where should the counters live?');
    expect(redis.stakes).toMatch(/new service/);
    expect(redis.options.map((o) => o.label)).toEqual(['Redis', 'In memory']);
    expect(redis.options[1]).toMatchObject({
      gain: 'nothing new to run',
      cost: 'resets on deploy',
    });
    expect(redis.hinge?.answers).toEqual([
      { answer: 'Yes', option: 1 },
      { answer: 'No', option: 2 },
    ]);
    // The older fields still describe the plan's choice and the alternatives.
    expect(redis.planChoice).toBe('Keep counters in Redis, shared across instances.');
    expect(redis.alternatives).toEqual(['In memory']);
  });

  it('still reads the older shape, without options or a hinge', () => {
    const r = parseBreakdown(LEGACY_BREAKDOWN, ctx);
    if (!r.ok) throw new Error('parse failed');
    const redis = r.read.calls[0]!;
    expect(redis.question).toBe('Store counts in Redis');
    expect(redis.options.map((o) => o.label)).toEqual([
      'Counters live in Redis, shared across instances',
      'In-memory counters',
    ]);
    expect(redis.hinge).toBeUndefined();
    expect(r.read.gist).toBe('');
  });

  it('drops a hinge whose answers point at options that do not exist', () => {
    const odd = JSON.parse(RATE_LIMIT_BREAKDOWN);
    odd.calls[1].hinge.answers[1].option = 7;
    const r = parseBreakdown(JSON.stringify(odd), ctx);
    if (!r.ok) throw new Error('parse failed');
    expect(r.read.calls[0]!.hinge).toBeUndefined();
  });

  it("anchors each quote to the plan's own words, ignoring Markdown", () => {
    const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
    if (!r.ok) throw new Error('parse failed');
    for (const c of r.read.calls) {
      expect(c.quoteSpan).toBeDefined();
      expect(ctx.plan.body.slice(c.quoteSpan!.start, c.quoteSpan!.end)).toBe(c.planQuote);
    }
    // The model quoted without backticks; the span still covers the original text.
    expect(r.read.calls[1]!.planQuote).toContain('`src/server.ts`');
  });

  it('drops evidence from files Frank never sent', () => {
    const bad = JSON.stringify({
      calls: [
        {
          title: 'Store counts in Redis',
          kind: 'option',
          planQuote: 'Use Redis',
          planChoice: 'Redis',
          alternatives: [],
          undoCost: 'hard',
          contradicted: true,
          evidence: [{ file: 'infra/redis.tf', note: 'made up' }],
        },
      ],
    });
    const r = parseBreakdown(bad, ctx);
    if (!r.ok) throw new Error('parse failed');
    expect(r.read.calls[0]!.evidence).toEqual([]);
    // "contradicted" without evidence isn't allowed to stand.
    expect(r.read.calls[0]!.contradicted).toBe(false);
  });

  it('clears a quote that is not in the plan', () => {
    const invented = RATE_LIMIT_BREAKDOWN.replace(
      'Use Redis to share counters across instances',
      'Use Memcached for everything',
    );
    const r = parseBreakdown(invented, ctx);
    if (!r.ok) throw new Error('parse failed');
    const redis = r.read.calls.find((c) => c.title === 'Counter storage')!;
    expect(redis.planQuote).toBe('');
    expect(redis.quoteSpan).toBeUndefined();
  });

  it('keeps at most five calls', () => {
    const many = JSON.stringify({
      calls: Array.from({ length: 8 }, (_, i) => ({
        title: `Call ${i}`,
        kind: 'silent-choice',
        planQuote: '',
        planChoice: 'x',
        alternatives: [],
        undoCost: 'medium',
        contradicted: false,
        evidence: [],
      })),
    });
    const r = parseBreakdown(many, ctx);
    if (!r.ok) throw new Error('parse failed');
    expect(r.read.calls).toHaveLength(5);
  });

  it('reports what is wrong with malformed output', () => {
    const r = parseBreakdown(
      '{"calls":[{"title":"x","kind":"vibes","undoCost":"soon"}]}',
      ctx,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/unknown kind "vibes"/);
    expect(r.errors.join(' ')).toMatch(/unknown undoCost "soon"/);
  });

  it('finds JSON inside code fences and chatter', () => {
    expect(extractJson('Sure!\n```json\n{"calls":[]}\n```\nHope that helps')).toEqual({
      calls: [],
    });
    expect(extractJson('no json here')).toBeUndefined();
  });
});

describe('locateQuote', () => {
  it('matches across case, whitespace and emphasis', () => {
    const body = 'Step 2. **Use  Redis** to share\ncounters.';
    const span = locateQuote(body, 'use redis to share counters');
    expect(span).toBeDefined();
    expect(body.slice(span!.start, span!.end)).toBe('**Use  Redis** to share\ncounters');
  });

  it('ignores quotes too short to mean anything', () => {
    expect(locateQuote('a b c', 'a')).toBeUndefined();
  });
});

describe('runBreakdown', () => {
  it('sends the plan first, the schema, and Frank as the system prompt', async () => {
    const brain = new ScriptedBrain([RATE_LIMIT_BREAKDOWN]);
    await runBreakdown(brain, ctx);
    const req = brain.requests[0]!;
    expect(req.system).toMatch(/You are Frank/);
    expect(req.jsonSchema).toBe(BREAKDOWN_SCHEMA);
    expect(req.messages[0]!.content.startsWith('<plan source="claude-code"')).toBe(true);
    expect(req.messages[0]!.content).toContain('<file path="docker-compose.yml">');
    expect(buildBreakdownRequest(ctx).messages).toHaveLength(1);
  });

  it('returns ranked calls from good JSON', async () => {
    const r = await runBreakdown(new ScriptedBrain([RATE_LIMIT_BREAKDOWN]), ctx);
    expect(r.status).toBe('calls');
    if (r.status !== 'calls') return;
    expect(r.via).toBe('json');
    expect(r.calls[0]!.contradicted).toBe(true);
    expect(r.gist).toMatch(/^Adds a per-key limit/);
  });

  it('repairs once when the first answer is broken', async () => {
    const brain = new ScriptedBrain(['{"calls": [ oops', RATE_LIMIT_BREAKDOWN]);
    const r = await runBreakdown(brain, ctx);
    expect(r.status).toBe('calls');
    if (r.status === 'calls') expect(r.via).toBe('repaired');
    expect(brain.requests[1]!.messages.at(-1)!.content).toMatch(/wasn't valid/);
  });

  it('falls back to a plain numbered list when JSON never arrives', async () => {
    const prose =
      'Here are the calls:\n1. Use Redis to share counters across instances\n2. Apply the limiter to every route';
    const r = await runBreakdown(new ScriptedBrain([prose, prose]), ctx);
    expect(r.status).toBe('calls');
    if (r.status !== 'calls') return;
    expect(r.via).toBe('fallback');
    expect(r.calls.map((c) => c.title)).toEqual([
      'Use Redis to share counters across instances',
      'Apply the limiter to every route',
    ]);
    expect(r.calls[0]!.quoteSpan).toBeDefined();
  });

  it('says so when nothing deserves a second look', async () => {
    const r = await runBreakdown(
      new ScriptedBrain(['{"calls":[]}']),
      loadFixture('tidy-rename'),
    );
    expect(r).toEqual({ status: 'nothing', via: 'json', gist: '', fine: [] });
  });

  it('fails clearly when the brain errors', async () => {
    const r = await runBreakdown(
      new ScriptedBrain([new Error('Claude Code is not signed in')]),
      ctx,
    );
    expect(r).toEqual({ status: 'failed', error: 'Claude Code is not signed in' });
  });
});

describe('the read, streaming in', () => {
  it('shows the gist, then each call as soon as it is complete', async () => {
    const seen: PartialRead[] = [];
    const brain = new ScriptedBrain([RATE_LIMIT_BREAKDOWN]);
    const r = await runBreakdown(brain, ctx, undefined, (p) => seen.push(p));
    expect(seen[0]).toEqual({
      gist: expect.stringMatching(/^Adds a per-key/),
      calls: [],
    });
    expect(seen.map((p) => p.calls.length)).toEqual([0, 1, 2, 3]);
    // While streaming, calls are numbered in arrival order...
    expect(seen[1]!.calls[0]).toMatchObject({ id: '1', title: 'New dependencies' });
    // ...and the final read ranks them.
    if (r.status === 'calls') expect(r.calls[0]!.title).toBe('Counter storage');
  });

  it('never throws on half an answer', () => {
    const half = RATE_LIMIT_BREAKDOWN.slice(
      0,
      RATE_LIMIT_BREAKDOWN.indexOf('Counter storage'),
    );
    const p = parsePartialRead(half, ctx);
    expect(p.calls.map((c) => c.title)).toEqual(['New dependencies']);
    expect(parsePartialRead('{"gist":"Adds a lim', ctx)).toEqual({ gist: '', calls: [] });
    expect(
      parsePartialRead('{"gist":"A \\"quoted\\" plan","calls":[{"title":"x}"', ctx).gist,
    ).toBe('A "quoted" plan');
  });
});
