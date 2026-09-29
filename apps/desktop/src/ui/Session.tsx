import type { Call, Evidence as EvidenceItem, FileContext, Turn } from '@frank/engine';
import { useEffect, useRef, type CSSProperties } from 'react';
import { Markdown } from '../Markdown.tsx';
import { callLabel, callStatus } from '../format.ts';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

/** The calls Frank found, hardest to undo first, each with the plan's own words. */
export function CallsList() {
  const c = useController();
  const { calls, selected, marking } = usePanel();
  return (
    <ol className={marking ? 'calls marking' : 'calls'} aria-label="Calls in this plan">
      {calls.map((call, i) => (
        <li key={call.id}>
          <button
            className="call"
            aria-current={call.id === selected}
            aria-label={callLabel(call, calls.length)}
            data-made={call.outcome ? call.outcome.verdict : undefined}
            style={{ '--i': i } as CSSProperties}
            onClick={() => void c.select(call.id)}
          >
            <span className="call-number" aria-hidden="true">
              {call.id}
            </span>
            <span className="call-title">{call.title}</span>
            <span className="call-status">
              {call.contradicted && !call.outcome ? (
                <span className="margin-note flagged">code disagrees</span>
              ) : (
                callStatus(call)
              )}
            </span>
            {call.planQuote && (
              <q className="plan-quote">
                <span className="underline">{plainQuote(call.planQuote)}</span>
              </q>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** The plan's words without Markdown punctuation: `x` and **x** read as x. */
function plainQuote(quote: string): string {
  return quote.replace(/`([^`]*)`/g, '$1').replace(/(\*\*|__)(.+?)\1/g, '$2');
}

/** Frank and the developer on the selected call. */
export function Conversation() {
  const c = useController();
  const { calls, selected, turns, streaming, slow, turnError, gathered } = usePanel();
  const call = calls.find((x) => x.id === selected);
  const box = useRef<HTMLElement>(null);
  const streamingNow = Boolean(streaming);
  // A new turn scrolls to its start, so Frank is read from the top; the text
  // streaming in below it doesn't drag the view along.
  useEffect(() => {
    const turnsEl = box.current?.querySelectorAll('.turn');
    turnsEl?.[turnsEl.length - 1]?.scrollIntoView({ block: 'start' });
  }, [turns.length, streamingNow, turnError, selected]);
  if (!call) return null;

  const files = gathered?.files ?? [];
  const firstFrank = turns.findIndex((t) => t.role === 'frank');
  const live = streaming && streaming.callId === call.id ? streaming : undefined;

  return (
    <section
      ref={box}
      className="conversation"
      aria-label={`About call ${call.id}`}
      aria-live="polite"
    >
      {turns.map((t, i) => (
        <TurnView key={i} turn={t}>
          {i === firstFrank && <EvidenceList call={call} files={files} />}
        </TurnView>
      ))}
      {live && (
        <div className="turn frank">
          <span className="speaker">Frank</span>
          {live.text ? (
            <div className="words">
              <Markdown text={live.text} />
            </div>
          ) : (
            <p className="words quiet">
              {slow === 'waiting' ? (
                <>
                  Still waiting on {c.brainName}.{' '}
                  <button className="text-button" onClick={() => c.cancel()}>
                    Cancel
                  </button>
                </>
              ) : slow === 'warming' ? (
                `${c.brainName} is warming up.`
              ) : live.callId && turns.length === 0 ? (
                `Looking at call ${call.id}`
              ) : (
                'Thinking it over'
              )}
            </p>
          )}
          {firstFrank < 0 && live.text && <EvidenceList call={call} files={files} />}
        </div>
      )}
      {turnError && (
        <div className="turn frank" role="alert">
          <span className="speaker">Frank</span>
          <p className="words">{turnError.message}</p>
          <p className="actions-inline">
            <button className="button" onClick={() => void c.retry()}>
              Retry
            </button>
            {turnError.kind === 'not-ready' && (
              <button className="text-button" onClick={() => c.openSettings()}>
                Switch brain
              </button>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

function TurnView({ turn, children }: { turn: Turn; children?: React.ReactNode }) {
  return (
    <div className={`turn ${turn.role}`}>
      <span className="speaker">{turn.role === 'frank' ? 'Frank' : 'You'}</span>
      <div className="words">
        {turn.role === 'frank' ? <Markdown text={turn.text} /> : <p>{turn.text}</p>}
      </div>
      {children}
    </div>
  );
}

function EvidenceList({ call, files }: { call: Call; files: FileContext[] }) {
  if (!call.evidence.length) return null;
  return (
    <>
      {call.evidence.map((e, i) => (
        <Evidence
          key={i}
          item={e}
          file={files.find((f) => f.path === e.file)}
          flagged={call.contradicted}
        />
      ))}
    </>
  );
}

const EVIDENCE_LINES = 6;

/** A few lines of the file Frank is citing, with the file and line as its title. */
function Evidence({
  item,
  file,
  flagged,
}: {
  item: EvidenceItem;
  file: FileContext | undefined;
  flagged: boolean;
}) {
  const c = useController();
  const lines = file?.content.split('\n') ?? [];
  const at = item.line && item.line <= lines.length ? item.line : undefined;
  const start = at ? Math.max(1, at - 1) : 1;
  const shown = lines.slice(start - 1, start - 1 + EVIDENCE_LINES);
  while (shown.length && !shown[shown.length - 1]!.trim()) shown.pop();
  const where = at ? `${item.file}:${at}` : item.file;
  return (
    <figure className={flagged ? 'evidence flagged' : 'evidence'}>
      <figcaption>
        <button
          className="evidence-path"
          title="Copy the path"
          onClick={() => void c.host.copy(item.file)}
        >
          {where}
        </button>
        <span className="evidence-note">{item.note}</span>
      </figcaption>
      {shown.length > 0 && (
        <pre className="evidence-code">
          {shown.map((l, i) => (
            <span key={i} className={start + i === at ? 'line cited' : 'line'}>
              <span className="ln" aria-hidden="true">
                {start + i}
              </span>
              {l || ' '}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
    </figure>
  );
}

/** Keep, Change, Drop, and "what would you do?" for the selected call. */
export function CallActions() {
  const c = useController();
  const { streaming, selected, calls, changing } = usePanel();
  const call = calls.find((x) => x.id === selected);
  if (!call) return null;
  const busy = Boolean(streaming);
  return (
    <div className="call-actions" role="group" aria-label={`Make call ${call.id}`}>
      <button
        className="button"
        disabled={busy}
        onClick={() => void c.act('keep')}
        aria-pressed={call.outcome?.verdict === 'keep'}
      >
        <Kbd>K</Kbd> Keep
      </button>
      <button
        className="button"
        disabled={busy}
        onClick={() => void c.act('change')}
        aria-pressed={changing || call.outcome?.verdict === 'change'}
      >
        <Kbd>C</Kbd> Change
      </button>
      <button
        className="button"
        disabled={busy}
        onClick={() => void c.act('drop')}
        aria-pressed={call.outcome?.verdict === 'drop'}
      >
        <Kbd>D</Kbd> Drop
      </button>
      <button
        className="text-button push"
        disabled={busy}
        onClick={() => void c.whatWouldYouDo()}
      >
        <Kbd>?</Kbd> What would you do?
      </button>
    </div>
  );
}
