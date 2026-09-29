import type { Call } from '@frank/engine';
import { outcomeWord, plainQuote, undoLabel } from '../format.ts';
import { Inline } from '../Markdown.tsx';
import { Conversation, EvidenceList } from './Conversation.tsx';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

/** One decision, everything needed to make it, nothing else (ux.md §5.2). */
export function CallView() {
  const c = useController();
  const { calls, selected, gathered, answers, highlight, streaming, speakingAbout } =
    usePanel();
  const call = calls.find((x) => x.id === selected);
  if (!call) return null;
  const answered = answers[call.id];
  const busy = Boolean(streaming);
  return (
    <section
      className="call-view"
      key={call.id}
      aria-label={`Call ${call.id} of ${calls.length}`}
    >
      <header
        className={
          speakingAbout === `call:${call.id}` ? 'call-head speaking' : 'call-head'
        }
      >
        <ProgressRail calls={calls} current={call.id} />
        <h2 className="question">
          <Inline text={call.question} />
        </h2>
      </header>
      {call.planQuote && (
        <p className="plan-said">
          <q className="plan-quote">
            <span className="underline">{plainQuote(call.planQuote)}</span>
          </q>
        </p>
      )}
      {call.stakes && (
        <p className="stakes">
          <Inline text={call.stakes} />
        </p>
      )}

      {call.options.length > 0 && (
        <ol className="options" aria-label="Options">
          {call.options.map((o, i) => {
            const n = i + 1;
            const chosen =
              (n === 1 && call.outcome?.verdict === 'keep') ||
              (call.outcome?.verdict === 'change' && call.outcome.option === n);
            return (
              <li key={n}>
                <button
                  className="option"
                  data-lit={highlight?.option === n || undefined}
                  aria-pressed={chosen}
                  disabled={busy}
                  aria-label={`Option ${n} of ${call.options.length}, ${o.label}${n === 1 ? ', the plan' : ''}. ${o.gain ? `Gain: ${o.gain}. ` : ''}${o.cost ? `Cost: ${o.cost}.` : ''}`}
                  onClick={() => c.choose(n)}
                >
                  <span className="option-number" aria-hidden="true">
                    {n}
                  </span>
                  <span className="option-label">
                    <Inline text={o.label} />
                  </span>
                  <span className="margin-note">
                    {chosen ? 'chosen' : n === 1 ? 'the plan' : ''}
                  </span>
                  {o.gain && (
                    <span className="trade">
                      <span className="sign" aria-hidden="true">
                        +
                      </span>
                      <Inline text={o.gain} />
                    </span>
                  )}
                  {o.cost && (
                    <span className="trade">
                      <span className="sign" aria-hidden="true">
                        −
                      </span>
                      <Inline text={o.cost} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {call.hinge && (
        <section className="hinge" aria-label="It comes down to">
          <p>
            <span className="hinge-label">It comes down to:</span>{' '}
            <Inline text={call.hinge.question} />
          </p>
          <div className="answers">
            {call.hinge.answers.map((a, i) => (
              <button
                key={i}
                className="button"
                aria-pressed={answered === i}
                onClick={() => c.answer(i)}
              >
                <Kbd>{'ABC'[i]!}</Kbd> {a.answer}
                <span className="leads">
                  leads to {call.options[a.option - 1]?.label ?? a.option}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {highlight && <Pointer call={call} option={highlight.option} why={highlight.why} />}

      <EvidenceList call={call} files={gathered?.files ?? []} />
      <Conversation callId={call.id} />
    </section>
  );
}

/** "That points to 2, In memory. ↵ takes it." */
function Pointer({
  call,
  option,
  why,
}: {
  call: Call;
  option: number;
  why: 'answer' | 'frank';
}) {
  const o = call.options[option - 1];
  if (!o || call.outcome) return null;
  return (
    <p className="pointer" role="status">
      {why === 'frank' ? 'Frank would take' : 'That points to'} {option}, {o.label}.{' '}
      <span className="quiet">
        <Kbd>↵</Kbd> takes it
      </span>
    </p>
  );
}

/** Where you are: one segment per call. */
function ProgressRail({ calls, current }: { calls: Call[]; current: string }) {
  const c = useController();
  const call = calls.find((x) => x.id === current)!;
  return (
    <div className="rail">
      <ol className="segments" aria-label="Calls">
        {calls.map((x) => (
          <li key={x.id}>
            <button
              className="segment"
              aria-current={x.id === current}
              data-made={x.outcome?.verdict}
              aria-label={`Call ${x.id}, ${x.title}, ${x.outcome ? outcomeWord(x) : 'not made yet'}`}
              onClick={() => c.show(x.id)}
            />
          </li>
        ))}
      </ol>
      <span className="meta">
        Call {current} of {calls.length}
      </span>
      <span className={call.contradicted ? 'margin-note flagged' : 'meta'}>
        {call.contradicted ? 'code disagrees' : undoLabel(call.undoCost)}
      </span>
    </div>
  );
}
