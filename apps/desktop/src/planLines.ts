/**
 * The plan as lines to show, with Frank's marks on them: which calls quote
 * which part of which line (docs/ux-redesign.md §6.1). Pure, so it's tested.
 */
import type { Call } from '@frank/engine';

export type LineKind = 'heading' | 'item' | 'code' | 'text' | 'blank';

/** A run of a line's text, marked when a call quotes it. */
export interface Segment {
  text: string;
  /** The call quoting this run, if any. */
  call?: string;
}

export interface PlanLine {
  /** 0-based line number in the plan. */
  n: number;
  kind: LineKind;
  /** "1." or "-" for list items; the number of #s for headings. */
  marker: string;
  segments: Segment[];
  /** Calls whose quote starts on this line: their margin notes go here. */
  starts: string[];
  /** How many following lines were joined into this one (a soft wrap). */
  joined?: number;
}

export function planLines(body: string, calls: Call[]): PlanLine[] {
  const spans = calls
    .filter((c) => c.quoteSpan)
    .map((c) => ({ id: c.id, ...c.quoteSpan! }))
    .sort((a, b) => a.start - b.start);
  const lines: PlanLine[] = [];
  let offset = 0;
  let inCode = false;
  body.split('\n').forEach((raw, n) => {
    const start = offset;
    offset += raw.length + 1;
    const fence = /^\s*```/.test(raw);
    if (fence) {
      inCode = !inCode;
      return;
    }
    let kind: LineKind;
    let marker = '';
    let textStart = 0;
    if (inCode) kind = 'code';
    else if (!raw.trim()) kind = 'blank';
    else {
      const heading = /^(#{1,6})\s+/.exec(raw);
      const item = /^(\s*)([-*]|\d+[.)])\s+/.exec(raw);
      if (heading) {
        kind = 'heading';
        marker = heading[1]!;
        textStart = heading[0].length;
      } else if (item) {
        kind = 'item';
        marker = item[2]!;
        textStart = item[0].length;
      } else kind = 'text';
    }
    const from = start + textStart;
    const to = start + raw.length;
    lines.push({
      n,
      kind,
      marker,
      segments: segmentsOf(raw.slice(textStart), from, to, spans),
      starts: spans.filter((s) => s.start >= start && s.start < offset).map((s) => s.id),
    });
  });
  // A line that carries on the one before (Markdown's soft wrap) joins it,
  // and runs of blank lines read as one.
  const joined: PlanLine[] = [];
  for (const line of lines) {
    const prev = joined.at(-1);
    if (
      line.kind === 'text' &&
      prev &&
      (prev.kind === 'text' || prev.kind === 'item') &&
      prev.n === line.n - 1 - (prev.joined ?? 0)
    ) {
      prev.segments.push({ text: ' ' }, ...line.segments);
      prev.starts.push(...line.starts);
      prev.joined = (prev.joined ?? 0) + 1;
      continue;
    }
    if (line.kind === 'blank' && prev?.kind === 'blank') continue;
    joined.push(line);
  }
  return joined;
}

/** The lines a call quotes, with `around` lines of context on each side. */
export function callExcerpt(lines: PlanLine[], callId: string, around = 1): PlanLine[] {
  const marked = lines
    .map((l, i) => (l.segments.some((s) => s.call === callId) ? i : -1))
    .filter((i) => i >= 0);
  if (!marked.length) return [];
  const first = Math.max(0, marked[0]! - around);
  const last = Math.min(lines.length - 1, marked.at(-1)! + around);
  return lines.slice(first, last + 1).filter((l) => l.kind !== 'blank');
}

function segmentsOf(
  text: string,
  from: number,
  to: number,
  spans: { id: string; start: number; end: number }[],
): Segment[] {
  const out: Segment[] = [];
  let at = from;
  for (const s of spans) {
    if (s.end <= at || s.start >= to) continue;
    const a = Math.max(s.start, at);
    const b = Math.min(s.end, to);
    if (a > at) out.push({ text: text.slice(at - from, a - from) });
    out.push({ text: text.slice(a - from, b - from), call: s.id });
    at = b;
  }
  if (at < to || !out.length) out.push({ text: text.slice(at - from) });
  return out.filter((s, i) => s.text || (i === 0 && out.length === 1));
}
