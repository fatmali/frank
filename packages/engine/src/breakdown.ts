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
  Hinge,
  Option,
  Read,
  UndoCost,
} from './types.ts';

export const MAX_CALLS = 5;

const KINDS: readonly CallKind[] = ['option', 'silent-choice', 'assumption'];
const UNDO: readonly UndoCost[] = ['hard', 'medium', 'easy'];
const UNDO_RANK: Record<UndoCost, number> = { hard: 0, medium: 1, easy: 2 };

export type BreakdownResult =
  | ({ status: 'calls'; via: 'json' | 'repaired' | 'fallback' } & Read)
  | ({ status: 'nothing'; via: 'json' | 'repaired' | 'fallback' } & Omit<Read, 'calls'>)
  | { status: 'failed'; error: string };

/** What has arrived so far while the read streams in. */
export interface PartialRead {
  gist: string;
  /** Complete, grounded calls, numbered in the order they arrived. */
  calls: Call[];
}

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
  onProgress?: (partial: PartialRead) => void,
): Promise<BreakdownResult> {
  const request = buildBreakdownRequest(ctx);
  let raw = '';
  // Nothing to show until the gist or a call has arrived.
  let shown = '\u00000';
  try {
    for await (const chunk of brain.stream(request, signal)) {
      raw += chunk;
      if (!onProgress) continue;
      const partial = parsePartialRead(raw, ctx);
      const key = `${partial.gist}\u0000${partial.calls.length}`;
      if (key !== shown) {
        shown = key;
        onProgress(partial);
      }
    }
  } catch (err) {
    return { status: 'failed', error: errorMessage(err) };
  }

  const first = parseBreakdown(raw, ctx);
  if (first.ok) return toResult(first.read, 'json');

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
  if (second.ok) return toResult(second.read, 'repaired');

  const fallback = parseNumberedList(repaired || raw, ctx);
  if (fallback.length)
    return toResult({ gist: '', calls: fallback, fine: [] }, 'fallback');
  if (looksEmpty(repaired || raw))
    return { status: 'nothing', via: 'fallback', gist: '', fine: [] };
  return {
    status: 'failed',
    error: `The brain's answer couldn't be read: ${first.errors[0] ?? 'unknown format'}`,
  };
}

function toResult(read: Read, via: 'json' | 'repaired' | 'fallback'): BreakdownResult {
  return read.calls.length
    ? { status: 'calls', via, ...read }
    : { status: 'nothing', via, gist: read.gist, fine: read.fine };
}

export type ParseResult = { ok: true; read: Read } | { ok: false; errors: string[] };

/** Parses, validates, grounds and ranks a JSON breakdown. */
export function parseBreakdown(text: string, ctx: Context): ParseResult {
  const json = extractJson(text);
  if (json === undefined) return { ok: false, errors: ['no JSON object found'] };

  const root = json as { calls?: unknown; gist?: unknown; fine?: unknown };
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
  return {
    ok: true,
    read: { gist: str(root.gist), calls: rank(calls), fine: strings(root.fine, 4) },
  };
}

/**
 * Reads what has streamed in so far: the gist once its string is complete,
 * and each call once its object is complete. Never throws.
 */
export function parsePartialRead(text: string, ctx: Context): PartialRead {
  const gistMatch = /"gist"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(text);
  let gist = '';
  if (gistMatch) {
    try {
      gist = str(JSON.parse(gistMatch[1]!));
    } catch {
      gist = '';
    }
  }
  const calls: Call[] = [];
  const open = /"calls"\s*:\s*\[/.exec(text);
  if (open) {
    for (const raw of completeObjects(text, open.index + open[0].length)) {
      let item: unknown;
      try {
        item = JSON.parse(raw);
      } catch {
        continue;
      }
      const call = validateCall(item, calls.length, []);
      if (call && calls.length < MAX_CALLS) {
        calls.push({ ...ground(call, ctx), id: String(calls.length + 1) });
      }
    }
  }
  return { gist, calls };
}

/** The complete top-level JSON objects in an array that starts at `from`. */
function completeObjects(text: string, from: number): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) out.push(text.slice(start, i + 1));
    } else if (ch === ']' && depth === 0) break;
  }
  return out;
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

  // Older replies name the plan's choice and alternatives as plain strings.
  const planChoice = str(c.planChoice);
  const legacyAlternatives = strings(c.alternatives, 2);
  let options = parseOptions(c.options);
  if (!options.length && (planChoice || legacyAlternatives.length)) {
    options = [planChoice || title, ...legacyAlternatives].map((label) => ({
      label,
      gain: '',
      cost: '',
      instruction: label,
    }));
  }
  const hinge = parseHinge(c.hinge, options.length);

  const call: Call = {
    id: '',
    title,
    question: str(c.question) || title,
    stakes: str(c.stakes),
    kind,
    planQuote: str(c.planQuote),
    planChoice: options[0]?.instruction || planChoice || title,
    alternatives: options.length
      ? options.slice(1).map((o) => o.label)
      : legacyAlternatives,
    options,
    undoCost,
    contradicted: c.contradicted === true,
    evidence,
  };
  if (hinge) call.hinge = hinge;
  return call;
}

function parseOptions(v: unknown): Option[] {
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((o): Option[] => {
      if (typeof o !== 'object' || o === null) return [];
      const r = o as Record<string, unknown>;
      const label = str(r.label);
      if (!label) return [];
      return [
        {
          label,
          gain: str(r.gain),
          cost: str(r.cost),
          instruction: str(r.instruction) || label,
        },
      ];
    })
    .slice(0, 3);
}

function parseHinge(v: unknown, optionCount: number): Hinge | undefined {
  if (typeof v !== 'object' || v === null || optionCount < 2) return undefined;
  const r = v as Record<string, unknown>;
  const question = str(r.question);
  const answers = Array.isArray(r.answers)
    ? r.answers
        .flatMap((a): Hinge['answers'] => {
          if (typeof a !== 'object' || a === null) return [];
          const x = a as Record<string, unknown>;
          const answer = str(x.answer);
          const option = typeof x.option === 'number' ? Math.round(x.option) : NaN;
          return answer && option >= 1 && option <= optionCount
            ? [{ answer, option }]
            : [];
        })
        .slice(0, 3)
    : [];
  return question && answers.length >= 2 ? { question, answers } : undefined;
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
        question: title,
        stakes: '',
        kind: 'silent-choice',
        planQuote: title,
        planChoice: title,
        alternatives: [],
        options: [],
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

function strings(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : [];
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
