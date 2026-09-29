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
- Keep your position under pushback unless the developer gives you new information.
- The developer may be talking, not typing: expect loose phrasing, and keep replies easy to hear.
- When your reply recommends one of the current call's options, end it with a line containing only [option N].`;

export const BREAKDOWN_INSTRUCTIONS = `Give the developer your read of this plan. They are tired and have two minutes. Tell them what it does, which decisions in it need them, and what they can stop worrying about.

A call is a decision inside the plan that deserves a second look:
- "option": the plan names alternatives, e.g. "Redis or in memory".
- "silent-choice": the plan makes a consequential choice without asking: a new dependency, a new service, a schema or data migration, a public API change, a deletion, an auth or security change, or a broad scope such as "every route".
- "assumption": the plan relies on something the provided code may not support.

Rules:
- Order calls by how hard they would be to undo, hardest first. Return at most 5, and prefer fewer. Leave out trivial calls. If nothing deserves a second look, return an empty list.
- "gist": what the plan does, in one plain sentence of at most 25 words.
- "title": at most 5 words, a noun phrase, e.g. "Counter storage".
- "question": the decision as a plain question of at most 12 words, e.g. "Where should the counters live?"
- "planQuote": the plan's exact words for this call, at most 20 words, copied verbatim.
- "stakes": why it matters, one sentence of at most 20 words.
- "options": the plan's own choice first, then 1 or 2 realistic alternatives. Each has a "label" of at most 4 words, a "gain" and a "cost" of at most 8 words each, and an "instruction": what the agent should do if this option is chosen, as one sentence.
- "hinge": the one fact about the developer's situation that decides this call, as a question they can answer without research, with 2 or 3 short "answers", each naming the "option" (1-based) it leads to. Leave it out if no single fact decides it.
- "undoCost": "hard", "medium" or "easy".
- "contradicted": true only if the provided code contradicts the plan.
- "evidence": only from the provided files: the file path, the line if known, and a note of at most 12 words.
- "fine": up to 4 things in the plan you checked and found fine, at most 8 words each.

Respond with JSON only, no prose, with the keys in this order:
{"gist":string,"calls":[{"title":string,"question":string,"kind":"option"|"silent-choice"|"assumption","planQuote":string,"stakes":string,"options":[{"label":string,"gain":string,"cost":string,"instruction":string}],"hinge":{"question":string,"answers":[{"answer":string,"option":number}]},"undoCost":"hard"|"medium"|"easy","contradicted":boolean,"evidence":[{"file":string,"line"?:number,"note":string}]}],"fine":[string]}`;

const OPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'gain', 'cost', 'instruction'],
  properties: {
    label: { type: 'string' },
    gain: { type: 'string' },
    cost: { type: 'string' },
    instruction: { type: 'string' },
  },
};

export const BREAKDOWN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['gist', 'calls', 'fine'],
  properties: {
    gist: { type: 'string' },
    calls: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'question',
          'kind',
          'planQuote',
          'stakes',
          'options',
          'undoCost',
          'contradicted',
          'evidence',
        ],
        properties: {
          title: { type: 'string' },
          question: { type: 'string' },
          kind: { enum: ['option', 'silent-choice', 'assumption'] },
          planQuote: { type: 'string' },
          stakes: { type: 'string' },
          options: { type: 'array', minItems: 1, maxItems: 3, items: OPTION_SCHEMA },
          hinge: {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'answers'],
            properties: {
              question: { type: 'string' },
              answers: {
                type: 'array',
                maxItems: 3,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['answer', 'option'],
                  properties: {
                    answer: { type: 'string' },
                    option: { type: 'integer' },
                  },
                },
              },
            },
          },
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
    fine: { type: 'array', maxItems: 4, items: { type: 'string' } },
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
      const lines = [`${c.id}. ${c.question || c.title}${focus}${outcome}`];
      if (c.options.length) {
        c.options.forEach((o, i) => {
          const tag = i === 0 ? ' (the plan)' : '';
          const trade = [o.gain && `gain: ${o.gain}`, o.cost && `cost: ${o.cost}`]
            .filter(Boolean)
            .join('; ');
          lines.push(`   option ${i + 1}${tag}: ${o.label}${trade ? ` (${trade})` : ''}`);
        });
      } else {
        lines.push(`   plan: ${c.planChoice}`);
      }
      if (c.hinge) lines.push(`   it comes down to: ${c.hinge.question}`);
      lines.push(`   undo cost: ${c.undoCost}`);
      if (c.contradicted) lines.push('   the code contradicts the plan here');
      return lines.join('\n');
    })
    .join('\n');
}

export function describeOutcome(call: Call): string {
  const o = call.outcome;
  if (!o) return 'not decided';
  if (o.verdict === 'keep') return 'keep the plan';
  if (o.verdict === 'drop') return 'drop this step';
  return o.option ? `option ${o.option}: ${o.detail}` : `change: ${o.detail}`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/\n/g, ' ');
}
