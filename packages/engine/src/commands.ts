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
  | { type: 'copy' }
  /** Talk through this call (by number or by what it's about). */
  | { type: 'open'; call: string }
  /** Take the calls in order. */
  | { type: 'start' }
  /** An answer to a yes-or-no question Frank just asked. */
  | { type: 'yes' }
  | { type: 'no' };

export interface CommandContext {
  /** Every call, to pick one by voice: "the Redis one", "the second one". */
  calls?: Call[];
  /** Frank just asked a yes-or-no question ("Go with that?"). */
  expecting?: 'yes-no';
}

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
const CONFIRM =
  /^(yes|yeah|yep|yup|sure|ok|okay|please|yes please|go with that|go with it|do it|do that|go for it|sounds good|let's do it|let's do that|correct|right|perfect|great|copy it)$/;
const DECLINE = /^(no|nope|nah|no thanks|not that|not yet|wait|hold on|not now)$/;
const START =
  /^(go|let's go|lets go|start|let's start|lets start|in order|from the top|go ahead|yes|yeah|sure|ok|okay|let's do it|take them in order)$/;
const SWITCH =
  /^(?:(?:let's |lets )?(?:talk about|talk through|go to|switch to|back to|open)|what about|how about)\s/;
const ORDINAL: Record<string, number> = {
  one: 1,
  first: 1,
  '1': 1,
  two: 2,
  second: 2,
  '2': 2,
  three: 3,
  third: 3,
  '3': 3,
  four: 4,
  fourth: 4,
  '4': 4,
  five: 5,
  fifth: 5,
  '5': 5,
};
const QUESTION =
  /^(why|how|is|are|does|do|can|could|should|would|will|what|when|where|who|which)\b/;
const STOP = new Set(
  'the a an one call about of to in on for and or is be it this that with like plan says just which whether where what should we our my'.split(
    ' ',
  ),
);
const NO = /^(no|nope|nah|not really|probably not|not yet)$/;
const FILLER = /^(um+|uh+|er+|so|ok|okay|alright|well|right|hmm+|frank)\b[\s,]*/;

/**
 * Reads a command from a short utterance about the current call. Anything
 * longer than a command, or anything ambiguous, returns undefined and goes to
 * Frank as a question.
 */
export function parseCommand(
  input: string,
  call?: Call,
  context: CommandContext = {},
): Command | undefined {
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

  if (context.expecting === 'yes-no') {
    // "yes", or a short answer that starts with it: "yeah go for it".
    const first = t.split(' ').length <= 4 ? (t.split(' ')[0] ?? '') : t;
    if (CONFIRM.test(t) || YES.test(first)) return { type: 'yes' };
    if (DECLINE.test(t) || NO.test(first)) return { type: 'no' };
  }

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

  const calls = context.calls ?? [];
  if (!call) {
    if (!calls.length) return undefined;
    if (START.test(t)) return { type: 'start' };
    const picked = pickCall(t, calls);
    return picked ? { type: 'open', call: picked } : undefined;
  }
  // From inside a call: "let's talk about the health check".
  if (calls.length && SWITCH.test(t)) {
    const picked = pickCall(t, calls);
    if (picked) return { type: 'open', call: picked };
  }
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
  // "no", or a short answer that starts with it: "no, just one".
  const lead = t.split(' ').length <= 4 ? (t.split(' ')[0] ?? '') : t;
  const yesNo =
    YES.test(t) || YES.test(lead)
      ? /^yes\b/
      : NO.test(t) || NO.test(lead)
        ? /^no\b/
        : undefined;
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

/**
 * Which call a short phrase means: "the second one", "the last one", "the
 * Redis one", "health checks". Returns undefined for a question or when it
 * could be more than one call, so Frank asks rather than guesses.
 */
function pickCall(said: string, calls: Call[]): string | undefined {
  let t = said
    .replace(SWITCH, '')
    .replace(
      /^(?:let's |lets )?(?:talk about|talk through|tell me about|start with|do)\s+/,
      '',
    )
    .replace(/^the\s+/, '')
    .replace(/\s+(?:one|call|thing)$/, '')
    .trim();
  const number = /^(?:number|call)?\s*(\w+)$/.exec(t)?.[1];
  if (number === 'last') return calls.at(-1)?.id;
  if (number && ORDINAL[number]) return calls[ORDINAL[number] - 1]?.id;
  if (!t || QUESTION.test(said) || t.split(' ').length > 5) return undefined;

  t = t.replace(/^the\s+/, '');
  const words = t.split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return undefined;
  const scores = calls.map((call) => {
    const keys = keywords(call);
    return words.filter((w) => keys.some((k) => sameWord(w, k))).length;
  });
  const best = Math.max(...scores);
  if (best === 0 || scores.filter((s) => s === best).length > 1) return undefined;
  return calls[scores.indexOf(best)]!.id;
}

function keywords(call: Call): string[] {
  return [call.title, call.question, call.spoken, ...call.options.map((o) => o.label)]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Loosely the same word, since speech gets transcribed: "counter" and "counters", "reddis" and "redis". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return a.length >= 5 && b.length >= 5 && editDistance(a, b) <= 1;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
}
