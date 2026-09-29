import { describe, expect, it } from 'vitest';
import { PanelController } from '../src/controller.ts';
import { demoHost } from '../src/demo.ts';
import { callExcerpt, planLines } from '../src/planLines.ts';

async function sample() {
  const c = new PanelController(demoHost({ delay: 0, mode: 'chat' }));
  await c.start();
  await c.confirmContext(true);
  const s = c.getSnapshot();
  return { body: s.plan!.body, calls: s.calls };
}

describe('the plan, with Frank’s marks on it', () => {
  it('keeps the plan’s own structure: headings, list items, text', async () => {
    const { body, calls } = await sample();
    const lines = planLines(body, calls);
    expect(lines[0]).toMatchObject({ kind: 'heading', marker: '#' });
    expect(lines.some((l) => l.kind === 'item' && /^\d+\.$/.test(l.marker))).toBe(true);
    // Never two blank lines in a row.
    expect(
      lines.some((l, i) => l.kind === 'blank' && lines[i - 1]?.kind === 'blank'),
    ).toBe(false);
  });

  it('marks exactly the words each call quotes, and says where each starts', async () => {
    const { body, calls } = await sample();
    const lines = planLines(body, calls);
    for (const call of calls) {
      const marked = lines
        .flatMap((l) => l.segments)
        .filter((s) => s.call === call.id)
        .map((s) => s.text)
        .join(' ');
      expect(marked.replace(/\s+/g, ' ')).toBe(call.planQuote.replace(/\s+/g, ' '));
      expect(lines.filter((l) => l.starts.includes(call.id))).toHaveLength(1);
    }
  });

  it('rebuilds each line from its segments', async () => {
    const { body, calls } = await sample();
    const raw = body.split('\n');
    for (const l of planLines(body, calls)) {
      if (l.kind === 'code') continue;
      const text = l.segments.map((s) => s.text).join('');
      // A soft-wrapped line carries the lines after it, joined by a space.
      const source = raw.slice(l.n, l.n + 1 + (l.joined ?? 0)).join(' ');
      expect(source.endsWith(text)).toBe(true);
    }
  });

  it('joins a soft-wrapped paragraph into one line', () => {
    const lines = planLines('Some text\ncarried on.\n\n1. An item\nstill the item', []);
    expect(lines.map((l) => l.segments.map((s) => s.text).join(''))).toEqual([
      'Some text carried on.',
      '',
      'An item still the item',
    ]);
  });

  it('shows a call’s words with a line of context either side', async () => {
    const { body, calls } = await sample();
    const lines = planLines(body, calls);
    const excerpt = callExcerpt(lines, '1');
    expect(excerpt.some((l) => l.segments.some((s) => s.call === '1'))).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(4);
    expect(callExcerpt(lines, 'nope')).toEqual([]);
  });

  it('treats fenced code as code, not as marks or items', () => {
    const lines = planLines('# T\n```\n- not an item\n```\n1. real', []);
    expect(lines.map((l) => [l.kind, l.marker])).toEqual([
      ['heading', '#'],
      ['code', ''],
      ['item', '1.'],
    ]);
  });
});
