import { describe, expect, it } from 'vitest';
import { contextSize, fitToBudget } from '../src/budget.ts';
import { composeNote, copiedMessage } from '../src/note.ts';
import type { Call, Context } from '../src/types.ts';
import { loadFixture } from './helpers.ts';

const base: Call = {
  id: '1',
  title: 'Drop the sessions table',
  kind: 'silent-choice',
  planQuote: '',
  planChoice: 'Drops the sessions table in a new migration',
  alternatives: ['Keep the table until every client is on JWT'],
  undoCost: 'hard',
  contradicted: false,
  evidence: [],
};

describe('composeNote', () => {
  it('says go ahead when nothing changed', () => {
    expect(composeNote([])).toBe('Go ahead with the plan as written.');
    expect(composeNote([{ ...base, outcome: { verdict: 'keep' } }])).toBe(
      'Go ahead with the plan as written.',
    );
  });

  it('lists drops and changes, and leaves undecided calls alone', () => {
    const note = composeNote([
      { ...base, outcome: { verdict: 'drop' } },
      { ...base, id: '2', title: 'Undecided call' },
    ]);
    expect(note).toBe(
      'Revise the plan before building:\n- Drop: Drop the sessions table.\nEverything else stays as planned.',
    );
  });

  it('names the agent the plan came from when the note is copied', () => {
    expect(copiedMessage('claude-code')).toBe('Note copied. Paste it into Claude Code.');
    expect(copiedMessage('copilot')).toBe('Note copied. Paste it into Copilot.');
    expect(copiedMessage('pasted')).toBe('Note copied. Paste it into your agent.');
  });
});

describe('fitToBudget', () => {
  const bigFile = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`).join(
    '\n',
  );

  function withFiles(n: number): Context {
    const ctx = loadFixture('rate-limit');
    return {
      ...ctx,
      files: Array.from({ length: n }, (_, i) => ({
        path: `src/big${i}.ts`,
        content: bigFile,
        truncated: false,
      })),
    };
  }

  it('leaves a context that already fits untouched', () => {
    const ctx = loadFixture('rate-limit');
    expect(fitToBudget(ctx, 100_000)).toBe(ctx);
  });

  it('shrinks files before touching the plan', () => {
    const ctx = withFiles(3);
    const fitted = fitToBudget(ctx, 12_000);
    expect(contextSize(fitted)).toBeLessThanOrEqual(12_000);
    expect(fitted.plan.body).toBe(ctx.plan.body);
    expect(fitted.files.every((f) => f.truncated)).toBe(true);
  });

  it('leaves files out, and says so, when shrinking is not enough', () => {
    const ctx = withFiles(20);
    const fitted = fitToBudget(ctx, 3_000);
    expect(contextSize(fitted)).toBeLessThanOrEqual(3_000 + 400); // the note itself adds a little
    expect(fitted.files.length).toBeLessThan(20);
    expect(fitted.extras.at(-1)).toMatch(/left out for size: src\/big/);
  });

  it('terminates on files already at the minimum size', () => {
    const ctx = loadFixture('rate-limit');
    const tiny = {
      ...ctx,
      files: [{ path: 'a.ts', content: 'x\n'.repeat(12), truncated: true }],
    };
    expect(() => fitToBudget(tiny, 10)).not.toThrow();
  });
});
