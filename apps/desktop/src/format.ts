/** Words and keys the panel shows, per the vocabulary in docs/ux.md §3. */
import { agentName, type Call, type Plan, type UndoCost } from '@frank/engine';

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl+';

const UNDO: Record<UndoCost, string> = {
  hard: 'hard to undo',
  medium: 'some work to undo',
  easy: 'easy to undo',
};

/** What the calls list shows at the right of a call. */
export function callStatus(call: Call): string {
  switch (call.outcome?.verdict) {
    case 'keep':
      return 'kept';
    case 'change':
      return 'changed';
    case 'drop':
      return 'dropped';
    default:
      return UNDO[call.undoCost];
  }
}

/** The screen-reader label for a call row (ux.md §6.7). */
export function callLabel(call: Call, total: number): string {
  const made = call.outcome ? callStatus(call) : 'not made yet';
  const flagged = call.contradicted ? ', the code disagrees with the plan' : '';
  return `Call ${call.id} of ${total}, ${call.title}, ${UNDO[call.undoCost]}${flagged}, ${made}.`;
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
