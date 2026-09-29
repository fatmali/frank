import type { CSSProperties } from 'react';
import { plainQuote, readLabel, sizeOfIt } from '../format.ts';
import { Inline } from '../Markdown.tsx';
import { Conversation } from './Conversation.tsx';
import { useController, usePanel } from './store.ts';

/** The read: what the plan does, what needs the developer, and what's fine. */
export function TheRead() {
  const c = useController();
  const { gist, calls, fine, reading, marking, speakingAbout } = usePanel();
  return (
    <section className="the-read" aria-label="Frank's read of the plan">
      {gist ? (
        <p className={speakingAbout === 'plan' ? 'gist speaking' : 'gist'}>
          <Inline text={gist} />
        </p>
      ) : (
        <p className="gist quiet">Reading the plan</p>
      )}
      <p className={reading && !calls.length ? 'size working' : 'size'} role="status">
        {sizeOfIt(calls.length, reading)}
      </p>
      {calls.length > 0 && (
        <ol className={marking ? 'read-calls marking' : 'read-calls'}>
          {calls.map((call, i) => (
            <li
              key={call.id}
              style={{ '--i': i } as CSSProperties}
              className={speakingAbout === `call:${call.id}` ? 'speaking' : undefined}
            >
              <button
                className="read-call"
                disabled={reading}
                onClick={() => c.show(call.id)}
                data-made={call.outcome?.verdict}
              >
                <span className="call-number" aria-hidden="true">
                  {call.id}
                </span>
                <span className="call-question">
                  <Inline text={call.question} />
                </span>
                <span
                  className={
                    call.contradicted && !call.outcome
                      ? 'call-status margin-note flagged'
                      : 'call-status'
                  }
                >
                  {readLabel(call)}
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
      )}
      {reading && calls.length > 0 && <p className="quiet more">Looking for more</p>}
      {!reading && fine.length > 0 && (
        <section className="fine" aria-label="Checked and fine">
          <h2>Checked and fine</h2>
          <p>
            <Inline text={fine.map((f) => f.replace(/\.?$/, '.')).join(' ')} />
          </p>
        </section>
      )}
      <Conversation callId={undefined} />
    </section>
  );
}
