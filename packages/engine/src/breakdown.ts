import {
  BREAKDOWN_INSTRUCTIONS,
  BREAKDOWN_SCHEMA,
  FRANK_SYSTEM,
  renderContext,
} from './prompt.ts';
import type {
  Brain,
  BrainRequest,
  Call,
  CallKind,
  Context,
  Evidence,
  UndoCost,
} from './types.ts';

export const MAX_CALLS = 5;

const KINDS: readonly CallKind[] = ['option', 'silent-choice', 'assumption'];
const UNDO: readonly UndoCost[] = ['hard', 'medium', 'easy'];
const UNDO_RANK: Record<UndoCost, number> = { hard: 0, medium: 1, easy: 2 };

export type BreakdownResult =
  | { status: 'calls'; calls: Call[]; via: 'json' | 'repaired' | 'fallback' }
  | { status: 'nothing'; via: 'json' | 'repaired' | 'fallback' }
  | { status: 'failed'; error: string };

export function buildBreakdownRequest(ctx: Context): BrainRequest {
  return {
    system: `${FRANK_SYSTEM}\n\n${BREAKDOWN_INSTRUCTIONS}`,
    messages: [{ role: 'user', content: renderContext(ctx) }],
    jsonSchema: BREAKDOWN_SCHEMA,
  };
}

/**
 * Asks the brain for the plan's calls. Validates and grounds the answer,
 * tries one repair if the JSON is broken, then falls back to reading a plain
 * numbered list, so a session never stalls on a formatting problem.
 */
export async function runBreakdown(
  brain: Brain,
  ctx: Context,
  signal?: AbortSignal,
): Promise<BreakdownResult> {
  const request = buildBreakdownRequest(ctx);
  let raw: string;
  try {
    raw = await collect(brain.stream(request, signal));
  } catch (err) {
    return { status: 'failed', error: errorMessage(err) };
  }

  const first = parseBreakdown(raw, ctx);
  if (first.ok) return toResult(first.calls, 'json');

  let repaired = '';
  try {
    repaired = await collect(
      brain.stream(
        {
          system: request.system,
          messages: [
            ...request.messages,
            { role: 'assistant', content: raw },
            {
              role: 'user',
              content: `That wasn't valid: ${first.errors.join('; ')}. Reply again with JSON only, matching the schema.`,
            },
          ],
          ...(request.jsonSchema ? { jsonSchema: request.jsonSchema } : {}),
        },
        signal,
      ),
    );
  } catch (err) {
    if (signal?.aborted) return { status: 'failed', error: errorMessage(err) };
  }

  const second = parseBreakdown(repaired, ctx);
  if (second.ok) return toResult(second.calls, 'repaired');

  const fallback = parseNumberedList(repaired || raw, ctx);
  if (fallback.length) return toResult(fallback, 'fallback');
  if (looksEmpty(repaired || raw)) return { status: 'nothing', via: 'fallback' };
  return {
    status: 'failed',
    error: `The brain's answer couldn't be read: ${first.errors[0] ?? 'unknown format'}`,
  };
}

function toResult(calls: Call[], via: 'json' | 'repaired' | 'fallback'): BreakdownResult {
  return calls.length ? { status: 'calls', calls, via } : { status: 'nothing', via };
}

export type ParseResult = { ok: true; calls: Call[] } | { ok: false; errors: string[] };

/** Parses, validates, grounds and ranks a JSON breakdown. */
export function parseBreakdown(text: string, ctx: Context): ParseResult {
  const json = extractJson(text);
  if (json === undefined) return { ok: false, errors: ['no JSON object found'] };

  const root = json as { calls?: unknown };
  if (typeof root !== 'object' || root === null || !Array.isArray(root.calls)) {
    return { ok: false, errors: ['expected an object with a "calls" array'] };
  }

  const errors: string[] = [];
  const calls: Call[] = [];
  root.calls.forEach((item, i) => {
    const call = validateCall(item, i, errors);
    if (call) calls.push(ground(call, ctx));
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, calls: rank(calls) };
}

function validateCall(item: unknown, i: number, errors: string[]): Call | undefined {
  const where = `call ${i + 1}`;
  if (typeof item !== 'object' || item === null) {
    errors.push(`${where} is not an object`);
    return undefined;
  }
  const c = item as Record<string, unknown>;
  const title = str(c.title);
  const kind = c.kind as CallKind;
  const undoCost = c.undoCost as UndoCost;
  if (!title) errors.push(`${where} has no title`);
  if (!KINDS.includes(kind))
    errors.push(`${where} has an unknown kind "${String(c.kind)}"`);
  if (!UNDO.includes(undoCost))
    errors.push(`${where} has an unknown undoCost "${String(c.undoCost)}"`);
  if (!title || !KINDS.includes(kind) || !UNDO.includes(undoCost)) return undefined;

  const evidence: Evidence[] = Array.isArray(c.evidence)
    ? c.evidence.flatMap((e): Evidence[] => {
        if (typeof e !== 'object' || e === null) return [];
        const ev = e as Record<string, unknown>;
        const file = str(ev.file);
        const note = str(ev.note);
        if (!file || !note) return [];
        const line =
          typeof ev.line === 'number' && Number.isInteger(ev.line) && ev.line > 0
            ? ev.line
            : undefined;
        return [line ? { file, line, note } : { file, note }];
      })
    : [];

  return {
    id: '',
    title,
    kind,
    planQuote: str(c.planQuote),
    planChoice: str(c.planChoice) || title,
    alternatives: Array.isArray(c.alternatives)
      ? c.alternatives.map(str).filter(Boolean).slice(0, 2)
      : [],
    undoCost,
    contradicted: c.contradicted === true,
    evidence,
  };
}

/**
 * Keeps the brain honest: evidence must come from files Frank actually sent,
 * "contradicted" needs evidence, and the quote must really be in the plan.
 */
function ground(call: Call, ctx: Context): Call {
  const known = new Set(ctx.files.map((f) => normalizePath(f.path)));
  const evidence = call.evidence.filter((e) => known.has(normalizePath(e.file)));
  const span = locateQuote(ctx.plan.body, call.planQuote);
  const grounded: Call = {
    ...call,
    evidence,
    contradicted: call.contradicted && evidence.length > 0,
    planQuote: span ? ctx.plan.body.slice(span.start, span.end) : '',
  };
  if (span) grounded.quoteSpan = span;
  return grounded;
}

function rank(calls: Call[]): Call[] {
  return calls
    .map((c, i) => ({ c, i }))
    .sort((a, b) => UNDO_RANK[a.c.undoCost] - UNDO_RANK[b.c.undoCost] || a.i - b.i)
    .slice(0, MAX_CALLS)
    .map(({ c }, i) => ({ ...c, id: String(i + 1) }));
}

/**
 * Finds the quote in the plan, ignoring case and runs of whitespace or
 * Markdown emphasis. Returns the span in the original text, or undefined.
 */
export function locateQuote(
  body: string,
  quote: string,
): { start: number; end: number } | undefined {
  const target = normalizeForMatch(quote);
  if (target.length < 3) return undefined;

  // Build a normalized copy of the body with a map back to original offsets.
  let norm = '';
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (/[*_`]/.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      norm += ' ';
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    norm += ch.toLowerCase();
    map.push(i);
    lastWasSpace = false;
  }

  const at = norm.indexOf(target);
  if (at === -1) return undefined;
  let start = map[at]!;
  let end = map[at + target.length - 1]! + 1;
  // Take in emphasis wrapped around the edges, so a mark never splits `code` or **bold**.
  while (start > 0 && /[*_`]/.test(body[start - 1]!)) start--;
  while (end < body.length && /[*_`]/.test(body[end]!)) end++;
  return { start, end };
}

function normalizeForMatch(s: string): string {
  return s
    .replace(/[*_`]/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Last-resort reader for when a brain answers in prose. Picks up lines like
 * "1. Store counts in Redis" or "- Add express-rate-limit".
 */
export function parseNumberedList(text: string, ctx: Context): Call[] {
  const items = text
    .split('\n')
    .map((l) => l.match(/^\s*(?:\d+[.)]|[-*])\s+(.{3,120})$/)?.[1]?.trim())
    .filter((t): t is string => !!t && !t.startsWith('{') && !t.startsWith('"'));
  const calls: Call[] = items.slice(0, MAX_CALLS).map((line) => {
    const title = line
      .replace(/[*_`]/g, '')
      .split(/[:—–]| - /)[0]!
      .trim()
      .slice(0, 80);
    return ground(
      {
        id: '',
        title,
        kind: 'silent-choice',
        planQuote: title,
        planChoice: title,
        alternatives: [],
        undoCost: 'medium',
        contradicted: false,
        evidence: [],
      },
      ctx,
    );
  });
  return rank(calls);
}

function looksEmpty(text: string): boolean {
  const json = extractJson(text) as { calls?: unknown } | undefined;
  if (json && Array.isArray(json.calls) && json.calls.length === 0) return true;
  return /nothing (here )?worth|no calls|ship it/i.test(text);
}

/** Pulls the first JSON object out of a reply, tolerating code fences and chatter around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

export async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of chunks) out += chunk;
  return out;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
