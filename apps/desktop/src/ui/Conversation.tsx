import type { Call, Evidence as EvidenceItem, FileContext, Turn } from '@frank/engine';
import { splitSuggestion } from '@frank/engine';
import { useEffect, useRef, useState } from 'react';
import { Inline, Markdown } from '../Markdown.tsx';
import { useController, usePanel } from './store.ts';

/** Frank and the developer: about one call, or about the whole plan. */
export function Conversation({ callId }: { callId: string | undefined }) {
  const c = useController();
  const { turns, streaming, slow, turnError } = usePanel();
  const box = useRef<HTMLElement>(null);
  const live = streaming && streaming.callId === callId ? streaming : undefined;
  const count = turns.length + (live ? 1 : 0) + (turnError ? 1 : 0);

  // A new turn scrolls to its start, so Frank is read from the top.
  useEffect(() => {
    const all = box.current?.querySelectorAll('.turn');
    all?.[all.length - 1]?.scrollIntoView({ block: 'nearest' });
  }, [count]);

  if (!count) return null;
  return (
    <section
      ref={box}
      className="conversation"
      aria-live="polite"
      aria-label="Conversation"
    >
      {turns.map((t, i) => (
        <TurnView key={i} turn={t} />
      ))}
      {live && (
        <div className="turn frank">
          <span className="speaker">Frank</span>
          {live.text ? (
            <div className="words">
              <Markdown text={splitSuggestion(live.text).text} />
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
              ) : (
                <ThinkingFor />
              )}
            </p>
          )}
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

/** "Thinking it over", then for how long, so a slow brain never looks stuck. */
function ThinkingFor() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <span className="thinking">
      {seconds >= 2 ? `Thinking it over, ${seconds} s` : 'Thinking it over'}
    </span>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className={`turn ${turn.role}`}>
      <span className="speaker">{turn.role === 'frank' ? 'Frank' : 'You'}</span>
      <div className="words">
        {turn.role === 'frank' ? <Markdown text={turn.text} /> : <p>{turn.text}</p>}
      </div>
    </div>
  );
}

const EVIDENCE_LINES = 6;

/** Receipts: one line each, opening to a few lines of the file. */
export function EvidenceList({ call, files }: { call: Call; files: FileContext[] }) {
  if (!call.evidence.length) return null;
  return (
    <div className="evidence-list">
      {call.evidence.map((e, i) => (
        <Evidence
          key={i}
          item={e}
          file={files.find((f) => f.path === e.file)}
          flagged={call.contradicted}
        />
      ))}
    </div>
  );
}

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
    <details className={flagged ? 'evidence flagged' : 'evidence'}>
      <summary>
        <span className="evidence-path">{where}</span>
        <span className="evidence-note">
          <Inline text={item.note} />
        </span>
      </summary>
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
      <button
        className="text-button copy-path"
        onClick={() => void c.host.copy(item.file)}
      >
        Copy path
      </button>
    </details>
  );
}
