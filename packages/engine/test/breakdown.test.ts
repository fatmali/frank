import { describe, expect, it } from 'vitest';
import {
  buildBreakdownRequest,
  extractJson,
  locateQuote,
  parseBreakdown,
  runBreakdown,
} from '../src/breakdown.ts';
import { BREAKDOWN_SCHEMA } from '../src/prompt.ts';
import { RATE_LIMIT_BREAKDOWN, ScriptedBrain, loadFixture } from './helpers.ts';

const ctx = loadFixture('rate-limit');

describe('parseBreakdown', () => {
  it('ranks calls hardest to undo first and numbers them', () => {
    const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calls.map((c) => [c.id, c.title, c.undoCost])).toEqual([
      ['1', 'Store counts in Redis', 'hard'],
      ['2', 'Apply to every route', 'medium'],
      ['3', 'Add express-rate-limit', 'easy'],
    ]);
  });

  it("anchors each quote to the plan's own words, ignoring Markdown", () => {
    const r = parseBreakdown(RATE_LIMIT_BREAKDOWN, ctx);
    if (!r.ok) throw new Error('parse failed');
    for (const c of r.calls) {
      expect(c.quoteSpan).toBeDefined();
      expect(ctx.plan.body.slice(c.quoteSpan!.start, c.quoteSpan!.end)).toBe(c.planQuote);
    }
    // The model quoted without backticks; the span still covers the original text.
    expect(r.calls[1]!.planQuote).toContain('`src/server.ts`');
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
    expect(r.calls[0]!.evidence).toEqual([]);
    // "contradicted" without evidence isn't allowed to stand.
    expect(r.calls[0]!.contradicted).toBe(false);
  });

  it('clears a quote that is not in the plan', () => {
    const invented = RATE_LIMIT_BREAKDOWN.replace(
      'Use Redis to share counters across instances',
      'Use Memcached for everything',
    );
    const r = parseBreakdown(invented, ctx);
    if (!r.ok) throw new Error('parse failed');
    const redis = r.calls.find((c) => c.title === 'Store counts in Redis')!;
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
    expect(r.calls).toHaveLength(5);
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
    expect(r).toEqual({ status: 'nothing', via: 'json' });
  });

  it('fails clearly when the brain errors', async () => {
    const r = await runBreakdown(
      new ScriptedBrain([new Error('Claude Code is not signed in')]),
      ctx,
    );
    expect(r).toEqual({ status: 'failed', error: 'Claude Code is not signed in' });
  });
});
