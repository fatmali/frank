import type { Call, Context } from './types.ts';

/**
 * Frank's voice. Mirrors docs/ux.md §3; change both together.
 */
export const FRANK_SYSTEM = `You are Frank, a duck who helps a developer make the calls inside a plan their coding agent wrote. You are frank: blunt about plans, decent to people.

How you talk:
- Short. At most three sentences per turn, plus an optional small comparison table. At most one question per turn.
- Conclusion first, then the reason.
- Talk about the plan and the code, not the person. Say "The plan adds Redis", never "You forgot Redis".
- No praise, no filler, no apologies, no emoji.
- Quote the plan's own words when pointing at something.
- Back every claim about the code with the file, and the line if you know it. If something isn't in the files you were given, say you didn't see it. Never invent code or files.
- Don't write code and don't draft a new plan. Help the developer decide about what's already in this plan.
- When asked what you'd do, give a clear recommendation, the reason, and what would change your answer.
- When the plan's choice is fine, say so plainly.
- Keep your position under pushback unless the developer gives you new information.`;

export const BREAKDOWN_INSTRUCTIONS = `Find the calls in this plan that deserve a second look. A call is a decision inside the plan:
- "option": the plan names alternatives, e.g. "Redis or in memory".
- "silent-choice": the plan makes a consequential choice without asking: a new dependency, a new service, a schema or data migration, a public API change, a deletion, an auth or security change, or a broad scope such as "every route".
- "assumption": the plan relies on something the provided code may not support.

Rules:
- Rank by how hard the call would be to undo, hardest first. Return at most 5.
- Leave out trivial calls. If nothing deserves a second look, return an empty list.
- "title": at most 8 words, in the developer's language.
- "planQuote": the plan's exact words for this call, at most 20 words, copied verbatim.
- "planChoice": what the plan does, in one short sentence.
- "alternatives": 1 or 2 realistic alternatives.
- "undoCost": "hard", "medium" or "easy".
- "contradicted": true only if the provided code contradicts the plan.
- "evidence": only from the provided files: the file path, the line if known, and a short note.

Respond with JSON only, no prose, matching:
{"calls":[{"title":string,"kind":"option"|"silent-choice"|"assumption","planQuote":string,"planChoice":string,"alternatives":string[],"undoCost":"hard"|"medium"|"easy","contradicted":boolean,"evidence":[{"file":string,"line"?:number,"note":string}]}]}`;

export const BREAKDOWN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['calls'],
  properties: {
    calls: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'kind',
          'planQuote',
          'planChoice',
          'alternatives',
          'undoCost',
          'contradicted',
          'evidence',
        ],
        properties: {
          title: { type: 'string' },
          kind: { enum: ['option', 'silent-choice', 'assumption'] },
          planQuote: { type: 'string' },
          planChoice: { type: 'string' },
          alternatives: { type: 'array', items: { type: 'string' } },
          undoCost: { enum: ['hard', 'medium', 'easy'] },
          contradicted: { type: 'boolean' },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['file', 'note'],
              properties: {
                file: { type: 'string' },
                line: { type: 'integer' },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

/** Renders the confirmed context as labelled blocks. The plan always comes first. */
export function renderContext(ctx: Context): string {
  const parts: string[] = [];
  const { plan } = ctx;
  parts.push(
    `<plan source="${plan.source}" title="${escapeAttr(plan.title)}">\n${plan.body}\n</plan>`,
  );
  for (const f of ctx.files) {
    const note = f.truncated ? ' truncated="true"' : '';
    parts.push(`<file path="${escapeAttr(f.path)}"${note}>\n${f.content}\n</file>`);
  }
  if (ctx.repo) {
    const r = ctx.repo;
    const lines = [`root: ${r.root}`];
    if (r.branch) lines.push(`branch: ${r.branch}`);
    if (r.changedFiles.length) lines.push(`changed files: ${r.changedFiles.join(', ')}`);
    parts.push(`<repo>\n${lines.join('\n')}\n</repo>`);
    for (const rule of r.rules) {
      parts.push(`<rules path="${escapeAttr(rule.path)}">\n${rule.content}\n</rules>`);
    }
  }
  for (const extra of ctx.extras) parts.push(`<note>\n${extra}\n</note>`);
  return parts.join('\n\n');
}

/** A compact summary of every call, so each turn knows the whole picture without the full transcript. */
export function renderCalls(calls: Call[], focusId?: string): string {
  return calls
    .map((c) => {
      const focus = c.id === focusId ? ' (discussing now)' : '';
      const outcome = c.outcome ? ` [decided: ${describeOutcome(c)}]` : '';
      return `${c.id}. ${c.title}${focus}${outcome}\n   plan: ${c.planChoice}\n   alternatives: ${c.alternatives.join('; ') || 'none named'}\n   undo cost: ${c.undoCost}${c.contradicted ? '\n   the code contradicts the plan here' : ''}`;
    })
    .join('\n');
}

export function describeOutcome(call: Call): string {
  const o = call.outcome;
  if (!o) return 'not decided';
  if (o.verdict === 'keep') return 'keep the plan';
  if (o.verdict === 'drop') return 'drop this step';
  return `change: ${o.detail}`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/\n/g, ' ');
}
