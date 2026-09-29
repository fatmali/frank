import { agentName } from './note.ts';
import type { Call, PlanSource } from './types.ts';

/**
 * What Frank says out loud in voice mode (docs/ux.md §6). Built from the
 * read, not asked of the brain, so it's instant, the same every time, and
 * starts while the read is still streaming in.
 */

/** A sentence to say, and what on screen it's about, so the panel can show it. */
export interface Line {
  text: string;
  /** "plan", "call:<id>", "more" or "ask". */
  about: string;
}

/** As much of the read as has arrived. */
export interface BriefingInput {
  gist: string;
  goal: string;
  /** Undefined until the list is complete. Shown, not said. */
  fine: string[] | undefined;
  calls: Call[];
  source?: PlanSource;
}

/** More than this many calls is too much to hold in your head by ear. */
export const SPOKEN_CALLS = 3;

const ORDINALS = ['First', 'Second', 'Third'];
const COUNTS = ['no', 'one', 'two', 'three', 'four', 'five'];

/**
 * The briefing: what the plan does and why, what Frank found fine, each call
 * in a line, and which one to talk through. Call it again as the read
 * streams in: lines are only ever added, never changed, so the ones already
 * said stay true.
 */
export function briefing(read: BriefingInput, done: boolean): Line[] {
  const lines: Line[] = [];
  const { calls } = read;
  // The plan sentence waits for the goal, which completes it.
  const planReady = read.goal || read.fine !== undefined || calls.length > 0 || done;
  // What Frank found fine stays on screen: by ear, only what needs you.
  if (planReady) lines.push({ text: planSentence(read), about: 'plan' });
  calls.slice(0, SPOKEN_CALLS).forEach((call, i) => {
    const said = call.spoken
      ? `${ORDINALS[i]}, ${lowerFirst(sentence(call.spoken))}`
      : `${ORDINALS[i]}: ${sentence(call.question)}`;
    const text = i === 0 ? `Here's what needs you. ${said}` : said;
    lines.push({ text, about: `call:${call.id}` });
  });
  if (!done) return lines;

  const more = calls.length - SPOKEN_CALLS;
  if (more > 0) {
    lines.push({
      text: `And ${COUNTS[more] ?? more} smaller ${more === 1 ? 'one' : 'ones'}, on screen.`,
      about: 'more',
    });
  }
  if (calls.length === 0) {
    lines.push({ text: 'Nothing in it needs you. Ship it.', about: 'ask' });
  } else if (calls.length === 1) {
    lines.push({ text: 'Want to talk it through?', about: 'ask' });
  } else {
    lines.push({
      text: 'Which one do you want to talk through? Or say go to take them in order.',
      about: 'ask',
    });
  }
  return lines;
}

/** Frank opening a call: the question, what each option buys and costs, and what decides it. */
export function callIntro(call: Call): Line[] {
  const about = `call:${call.id}`;
  const lines: Line[] = [{ text: sentence(call.question), about }];
  if (call.contradicted) {
    lines.push({ text: 'The code disagrees with the plan here.', about });
  }
  const [plan, ...others] = call.options;
  if (plan) {
    lines.push({
      text: `The plan goes with ${phrase(plan.label)}${trade(plan)}.`,
      about,
    });
    for (const o of others)
      lines.push({ text: `Or ${phrase(o.label)}${trade(o)}.`, about });
  } else if (call.stakes) {
    lines.push({ text: sentence(call.stakes), about });
  }
  const ask = call.hinge
    ? `It comes down to: ${lowerFirst(sentence(call.hinge.question))}`
    : call.options.length > 1
      ? "Keep the plan's choice, or go another way?"
      : 'Keep it, drop it, or tell me what to do instead.';
  lines.push({ text: ask, about });
  return lines;
}

/** After an answer to "it comes down to": the option it points at, to confirm. */
export function leadsTo(call: Call, option: number): string {
  return `Then ${phrase(label(call, option))}. Go with that?`;
}

/** After a call is made. */
export function madeCall(call: Call): string {
  const o = call.outcome;
  if (!o) return '';
  if (o.verdict === 'keep') return `Keeping ${phrase(label(call, 1))}.`;
  if (o.verdict === 'drop') return 'Dropped.';
  return o.option ? `Going with ${phrase(label(call, o.option))}.` : 'Got it.';
}

/**
 * At the end of the list: what changed, what stays as planned, and the
 * offer to copy the note.
 */
export function wrapUp(calls: Call[], source?: PlanSource): string {
  const changed = calls.filter((c) => c.outcome && c.outcome.verdict !== 'keep');
  const open = calls.filter((c) => !c.outcome).length;
  const all = open
    ? `That's the end of the list. ${upperFirst(count(open))} ${open === 1 ? 'call stays' : 'calls stay'} as planned.`
    : calls.length === 1
      ? "That's the one."
      : `That's all ${count(calls.length)}.`;
  const what =
    changed.length === 0
      ? open
        ? ''
        : ' You kept the plan as it is.'
      : changed.length === 1
        ? ` You changed one thing: ${changeName(changed[0]!)}.`
        : ` You changed ${count(changed.length)} things.`;
  const agent = source ? agentName(source) : 'your agent';
  return `${all}${what} Want me to copy the note for ${agent}?`;
}

function planSentence(read: BriefingInput): string {
  if (!read.gist) return 'I read the plan.';
  const gist = read.gist.trim().replace(/[.!]+$/, '');
  const agent = read.source ? agentName(read.source) : undefined;
  const owner = agent && !agent.startsWith('your') ? `${agent}'s plan` : 'The plan';
  // "Adds a limit…" reads as "Claude Code's plan adds a limit…".
  const verb = /^[A-Z][a-z]+s\b/.test(gist);
  const start = verb ? `${owner} ${lowerFirst(gist)}` : gist;
  const goal = read.goal.trim().replace(/[.!]+$/, '');
  if (!goal) return `${start}.`;
  return /^(so|to|in order)\b/i.test(goal)
    ? `${start}, ${lowerFirst(goal)}.`
    : `${start}. ${upperFirst(goal)}.`;
}

function trade(o: { gain: string; cost: string }): string {
  if (o.gain && o.cost) return `: ${lowerFirst(o.gain)}, but ${lowerFirst(o.cost)}`;
  if (o.gain) return `: ${lowerFirst(o.gain)}`;
  if (o.cost) return `, which costs ${lowerFirst(o.cost)}`;
  return '';
}

function changeName(call: Call): string {
  const o = call.outcome!;
  const title = phrase(call.title);
  if (o.verdict === 'drop') return `dropped ${title}`;
  if (o.verdict === 'change' && o.option)
    return `${title}, ${phrase(label(call, o.option))}`;
  return title;
}

function label(call: Call, option: number): string {
  return call.options[option - 1]?.label ?? call.planChoice;
}

function count(n: number): string {
  return COUNTS[n] ?? String(n);
}

/** Ends with punctuation, starts with a capital. */
function sentence(s: string): string {
  const t = upperFirst(s.trim().replace(/\s+/g, ' '));
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** A label in the middle of a sentence: "In memory" becomes "in memory"; "Redis" and "API" stay. */
function phrase(s: string): string {
  const first = s.trim().split(/\s+/)[0] ?? '';
  const properNoun = s.trim().split(/\s+/).length === 1 || /[A-Z].*[A-Z]/.test(first);
  return properNoun ? s.trim() : lowerFirst(s.trim());
}

function lowerFirst(s: string): string {
  // Leave acronyms and names like "API" or "JSON" alone.
  if (/^[A-Z]{2}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
