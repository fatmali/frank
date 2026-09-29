import type { Call } from '@frank/engine';
import { readLabel } from '../format.ts';
import { Inline } from '../Markdown.tsx';
import type { PlanLine } from '../planLines.ts';

/**
 * The plan in the agent's own words, with Frank's marks on it: the words each
 * call is about, underlined, with its number and how hard it is to undo in
 * the margin (docs/ux-redesign.md §6.1). Clicking a mark opens the call.
 */
export function PlanText({
  lines,
  calls,
  onOpen,
  current,
  only,
}: {
  lines: PlanLine[];
  calls: Call[];
  onOpen?: (id: string) => void;
  /** The call being talked about, lit. */
  current?: string | undefined;
  /** Mark only this call, with no margin notes: a call's own excerpt. */
  only?: string;
}) {
  const byId = new Map(calls.map((c) => [c.id, c]));
  return (
    <div className="plan-text">
      {lines.map((line) => {
        const startId = line.starts.find((id) => !only || id === only);
        const start = startId && !only ? byId.get(startId) : undefined;
        return (
          <div
            key={line.n}
            className={`plan-line ${line.kind}`}
            data-level={line.kind === 'heading' ? line.marker.length : undefined}
            data-anchor={startId && !only ? `call:${startId}` : undefined}
          >
            <span className="plan-gutter" aria-hidden="true">
              {start ? start.id : ''}
            </span>
            <span className="plan-words">
              {line.kind === 'item' && <span className="plan-marker">{line.marker}</span>}
              {line.segments.map((s, i) => {
                if (!s.call || (only && s.call !== only)) {
                  return line.kind === 'code' ? (
                    <code key={i}>{s.text}</code>
                  ) : (
                    <Inline key={i} text={s.text} />
                  );
                }
                const call = byId.get(s.call);
                const cls = [
                  'plan-mark',
                  call?.contradicted && !call.outcome ? 'flagged' : '',
                  call?.outcome ? 'made' : '',
                  current === s.call ? 'current' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return onOpen ? (
                  // A span, not a button, so the plan's words wrap as a sentence.
                  <span
                    key={i}
                    role="button"
                    tabIndex={0}
                    className={cls}
                    onClick={() => onOpen(s.call!)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpen(s.call!);
                      }
                    }}
                    aria-label={`Call ${s.call}: ${call?.question ?? ''}`}
                  >
                    <Inline text={s.text} />
                  </span>
                ) : (
                  <mark key={i} className={cls}>
                    <Inline text={s.text} />
                  </mark>
                );
              })}
            </span>
            {start && (
              <span
                className={
                  start.outcome
                    ? 'plan-note made'
                    : start.contradicted
                      ? 'plan-note flagged'
                      : 'plan-note'
                }
              >
                {readLabel(start)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
