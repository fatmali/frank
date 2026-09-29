import type { Call } from './types.ts';

/**
 * Something the developer said or typed that Frank can act on at once,
 * without asking the brain (docs/ux.md §6.2).
 */
export type Command =
  | { type: 'choose'; option: number }
  | { type: 'answer'; answer: number }
  | { type: 'drop' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'take' }
  | { type: 'accept' }
  | { type: 'copy' };

const NUMBERS: Record<string, number> = {
  one: 1,
  '1': 1,
  first: 1,
  two: 2,
  '2': 2,
  second: 2,
  three: 3,
  '3': 3,
  third: 3,
};

const YES = /^(yes|yeah|yep|yup|sure|correct|definitely|probably)$/;
const NO = /^(no|nope|nah|not really|probably not|not yet)$/;
const FILLER = /^(um+|uh+|er+|so|ok|okay|alright|well|right|hmm+|frank)\b[\s,]*/;

/**
 * Reads a command from a short utterance about the current call. Anything
 * longer than a command, or anything ambiguous, returns undefined and goes to
 * Frank as a question.
 */
export function parseCommand(input: string, call?: Call): Command | undefined {
  let t = input
    .toLowerCase()
    .replace(/[“”"'.!,?;:]+/g, (m) => (m.includes("'") ? "'" : ' '))
    .replace(/\s+/g, ' ')
    .trim();
  // Leading filler ("okay so, next") never changes the meaning.
  for (let i = 0; i < 3 && FILLER.test(t) && t.replace(FILLER, '').trim(); i++) {
    t = t.replace(FILLER, '').trim();
  }
  if (!t || t.split(' ').length > 9) return undefined;

  if (/^(copy( the)? note|that's it|thats it|done|all done|we're done|ship it)$/.test(t))
    return { type: 'copy' };
  if (
    /^(what would you do|what do you think|what's your take|whats your take|your take|what would you pick|which one would you pick|which would you pick)$/.test(
      t,
    )
  )
    return { type: 'take' };
  if (/^(next( one)?|skip( it| this( one)?)?|later|move on|leave it( for now)?)$/.test(t))
    return { type: 'next' };
  if (/^(back|go back|previous( one)?)$/.test(t)) return { type: 'back' };
  if (
    /^(drop( it| that| this)?( step)?|drop (that|this|the) step|remove (it|that|that step))$/.test(
      t,
    )
  )
    return { type: 'drop' };
  if (/^(take it|do that|sounds good|let's do that|agreed|ok let's do it)$/.test(t))
    return { type: 'accept' };
  if (
    /^(keep( it| that| the plan)?|go with the plan|stick with the plan|the plan's fine|plan's fine|fine as is|as planned|leave it as planned)$/.test(
      t,
    )
  )
    return { type: 'choose', option: 1 };

  if (!call) return undefined;
  const count = Math.max(call.options.length, 1);

  // "option two", "the second one", "go with 2"
  const verb =
    /^(?:(?:let's |lets )?(?:go with|take|pick|choose|use|do)|i'll take|i want)\s+/;
  const rest = t.replace(verb, '');
  const numbered =
    /^(?:the\s+)?(?:option|number|choice)?\s*(one|two|three|1|2|3|first|second|third)(?:\s+(?:one|option))?$/.exec(
      rest,
    );
  if (numbered) {
    const n = NUMBERS[numbered[1]!]!;
    if (n <= count) return { type: 'choose', option: n };
  }

  // "go with in memory", or just "in memory"
  const said = rest.replace(/^the\s+/, '');
  const byName = call.options.findIndex((o) => normalize(o.label) === said);
  if (byName >= 0) return { type: 'choose', option: byName + 1 };
  if (verb.test(t)) {
    const partial = call.options.findIndex((o) => {
      const label = normalize(o.label);
      return label.length > 2 && (said.includes(label) || label.includes(said));
    });
    if (partial >= 0) return { type: 'choose', option: partial + 1 };
  }

  // Hinge answers: by their own words, or yes and no.
  const answers = call.hinge?.answers ?? [];
  const exact = answers.findIndex((a) => normalize(a.answer) === t);
  if (exact >= 0) return { type: 'answer', answer: exact };
  const yesNo = YES.test(t) ? /^yes\b/ : NO.test(t) ? /^no\b/ : undefined;
  if (yesNo) {
    const i = answers.findIndex((a) => yesNo.test(normalize(a.answer)));
    if (i >= 0) return { type: 'answer', answer: i };
  }
  return undefined;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"'.!,?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
