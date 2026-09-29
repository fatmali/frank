/** Words and keys the panel shows, per the vocabulary in docs/ux.md §3. */
import { agentName, type Call, type Plan, type UndoCost } from '@frank/engine';

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl+';

const UNDO: Record<UndoCost, string> = {
  hard: 'hard to undo',
  medium: 'some work to undo',
  easy: 'easy to undo',
};

export function undoLabel(cost: UndoCost): string {
  return UNDO[cost];
}

/** What became of a call: "In memory, changed", "kept", "dropped", "as planned". */
export function outcomeWord(call: Call): string {
  const o = call.outcome;
  if (!o) return 'as planned';
  if (o.verdict === 'keep') return 'kept';
  if (o.verdict === 'drop') return 'dropped';
  const chosen = o.option ? call.options[o.option - 1]?.label : undefined;
  return chosen ? `${chosen}, changed` : 'changed';
}

/** The right-hand label of a call in the read. */
export function readLabel(call: Call): string {
  if (call.outcome) return outcomeWord(call);
  return call.contradicted ? 'code disagrees' : UNDO[call.undoCost];
}

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];

/** The size of the job, said first (ux.md §2): "Two calls need you." */
export function sizeOfIt(calls: number, reading: boolean): string {
  if (reading) return calls ? `${COUNT[calls] ?? calls} so far.` : 'Finding the calls';
  if (!calls) return 'Nothing here worth a second look. Ship it.';
  const n = COUNT[calls] ?? String(calls);
  return calls === 1
    ? 'One call needs you. The rest is routine.'
    : `${n} calls need you. The rest is routine.`;
}

/** The plan's words without Markdown punctuation: `x` and **x** read as x. */
export function plainQuote(quote: string): string {
  return quote.replace(/`([^`]*)`/g, '$1').replace(/(\*\*|__)(.+?)\1/g, '$2');
}

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return hours < 48 ? 'yesterday' : `${Math.round(hours / 24)} days ago`;
}

function basename(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? path
  );
}

/** "Claude Code plan, 3 min ago, in my-app" */
export function planMeta(plan: Plan): string {
  const ago = timeAgo(plan.modifiedAt);
  const where = plan.project ? `, in ${basename(plan.project)}` : '';
  switch (plan.source) {
    case 'pasted':
      return `Pasted plan, ${ago}`;
    case 'file':
      return `From ${basename(plan.origin)}, ${ago}${where}`;
    default:
      return `${agentName(plan.source)} plan, ${ago}${where}`;
  }
}

/** "Alt+Shift+Space" as the OS writes it: ⌥⇧Space on a Mac. */
export function displayHotkey(accelerator: string): string {
  if (!isMac) return accelerator.replace(/\bSuper\b/, 'Win');
  const symbols: Record<string, string> = {
    Control: '⌃',
    Ctrl: '⌃',
    Alt: '⌥',
    Option: '⌥',
    Shift: '⇧',
    Super: '⌘',
    Cmd: '⌘',
    Command: '⌘',
    CommandOrControl: '⌘',
  };
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  return parts.map((p) => symbols[p] ?? p).join('') + key;
}
