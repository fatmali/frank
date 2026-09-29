import type { Context, FileContext } from './types.ts';

/** Rough size of a context in characters; about 4 characters per token. */
export function contextSize(ctx: Context): number {
  let n = ctx.plan.body.length;
  for (const f of ctx.files) n += f.content.length + f.path.length;
  if (ctx.repo) {
    n += ctx.repo.changedFiles.join(', ').length;
    for (const r of ctx.repo.rules) n += r.content.length;
  }
  for (const e of ctx.extras) n += e.length;
  return n;
}

const MIN_FILE_LINES = 12;

/**
 * Fits a context into a character budget. Priority: the plan first, then the
 * files it mentions, then the repo summary. Files shrink largest first; if
 * that isn't enough, the largest files are left out and listed in a note.
 */
export function fitToBudget(ctx: Context, maxChars: number): Context {
  if (contextSize(ctx) <= maxChars) return ctx;

  let plan = ctx.plan;
  if (plan.body.length > maxChars * 0.6) {
    plan = { ...plan, body: trimMiddle(plan.body, Math.floor(maxChars * 0.6)) };
  }

  let files: FileContext[] = ctx.files.map((f) => ({ ...f }));
  const dropped: string[] = [];
  let next: Context = { ...ctx, plan, files };

  // Shrink the largest file by half its lines, repeatedly, down to a floor.
  while (contextSize(next) > maxChars) {
    const largest = [...files].sort((a, b) => b.content.length - a.content.length)[0];
    if (!largest) break;
    const lines = largest.content.split('\n');
    // +1 accounts for the "… more lines" marker a trimmed file already carries.
    if (lines.length > MIN_FILE_LINES + 1) {
      const keep = Math.max(MIN_FILE_LINES, Math.floor(lines.length / 2));
      largest.content = `${lines.slice(0, keep).join('\n')}\n… (${lines.length - keep} more lines)`;
      largest.truncated = true;
    } else {
      files = files.filter((f) => f !== largest);
      dropped.push(largest.path);
    }
    next = { ...next, files };
  }

  // Rules files are the least important; trim them last.
  if (contextSize(next) > maxChars && next.repo) {
    next = { ...next, repo: { ...next.repo, rules: [] } };
  }

  if (dropped.length) {
    next = {
      ...next,
      extras: [
        ...next.extras,
        `Files mentioned by the plan but left out for size: ${dropped.join(', ')}`,
      ],
    };
  }
  return next;
}

function trimMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n… (part of the plan left out for size) …\n\n${text.slice(-tail)}`;
}
