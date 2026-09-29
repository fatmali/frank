import type { Call } from '@frank/engine';
import { useMemo } from 'react';
import { outcomeWord, plainQuote, undoLabel } from '../format.ts';
import { Inline } from '../Markdown.tsx';
import { callExcerpt, planLines } from '../planLines.ts';
import { Conversation, EvidenceList } from './Conversation.tsx';
import { Kbd } from './Kbd.tsx';
import { MarginDuck } from './MarginDuck.tsx';
import { PlanText } from './PlanText.tsx';
import { useController, usePanel } from './store.ts';

/**
 * One call, rubber-duck style (docs/ux-redesign.md §6.1): the plan's own
 * words for it, the receipts, then the two sides of the trade-off, with each
 * answer to what it comes down to under the side it leads to.
 */
export function CallView() {
  const { calls, selected, gathered, highlight, plan } = usePanel();
  const call = calls.find((x) => x.id === selected);
  const lines = useMemo(() => (plan ? planLines(plan.body, calls) : []), [plan, calls]);
  if (!call) return null;
  const excerpt = callExcerpt(lines, call.id);
  return (
    <section
      className="call-view"
      key={call.id}
      aria-label={`Call ${call.id} of ${calls.length}`}
    >
      <MarginDuck fallback={`call:${call.id}`} />
      <header className="call-head">
        <ProgressRail calls={calls} current={call.id} />
        <h2 className="question">
          <Inline text={call.question} />
        </h2>
      </header>
      {excerpt.length > 0 ? (
        <div className="excerpt" data-anchor={`call:${call.id}`}>
          <PlanText lines={excerpt} calls={calls} current={call.id} only={call.id} />
        </div>
      ) : (
        call.planQuote && (
          <p className="excerpt plain" data-anchor={`call:${call.id}`}>
            <mark className="plan-mark current">{plainQuote(call.planQuote)}</mark>
          </p>
        )
      )}
      <EvidenceList call={call} files={gathered?.files ?? []} />
      {call.options.length === 0 && call.stakes && (
        <p className="stakes">
          <Inline text={call.stakes} />
        </p>
      )}
      <Sides call={call} />
      {highlight && <Pointer call={call} option={highlight.option} why={highlight.why} />}
      <Conversation callId={call.id} />
    </section>
  );
}

/**
 * The trade-off: the plan's choice and the alternative side by side, what
 * each buys and costs, and what it comes down to, with each answer under the
 * side it leads to. A third option sits under them as one line.
 */
function Sides({ call }: { call: Call }) {
  const c = useController();
  const { answers, highlight, streaming } = usePanel();
  const busy = Boolean(streaming);
  const answered = answers[call.id];
  const shown = call.options.slice(0, 2);
  const extra = call.options.slice(2);
  if (!shown.length) return null;
  const chosen = (n: number) =>
    (n === 1 && call.outcome?.verdict === 'keep') ||
    (call.outcome?.verdict === 'change' && call.outcome.option === n);
  const side = (n: number) => {
    const o = call.options[n - 1]!;
    return (
      <button
        key={n}
        className="side"
        data-lit={highlight?.option === n || undefined}
        aria-pressed={chosen(n)}
        disabled={busy}
        aria-label={`${n === 1 ? 'The plan' : 'Instead'}: ${o.label}. ${o.gain ? `Gains ${o.gain}. ` : ''}${o.cost ? `Costs ${o.cost}.` : ''}`}
        onClick={() => c.choose(n)}
      >
        <span className="side-whose">
          {chosen(n) ? 'chosen' : n === 1 ? 'The plan' : 'Instead'}
        </span>
        <span className="side-label">
          <Inline text={o.label} />
        </span>
        {o.gain && (
          <span className="trade gain">
            <span className="sign" aria-hidden="true">
              +
            </span>
            <Inline text={o.gain} />
          </span>
        )}
        {o.cost && (
          <span className="trade cost">
            <span className="sign" aria-hidden="true">
              −
            </span>
            <Inline text={o.cost} />
          </span>
        )}
      </button>
    );
  };
  return (
    <section className="sides" aria-label="The trade-off" data-count={shown.length}>
      <div className="side-row">{shown.map((_, i) => side(i + 1))}</div>
      {extra.map((o, i) => (
        <button
          key={o.label}
          className="side-extra"
          aria-pressed={chosen(i + 3)}
          disabled={busy}
          onClick={() => c.choose(i + 3)}
        >
          Also possible: <strong>{o.label}</strong>
          {o.gain ? `, ${o.gain}` : ''}
          {o.cost ? `, but ${o.cost}` : ''}
        </button>
      ))}
      {call.hinge && (
        <div className="hinge">
          <p className="hinge-question">
            It comes down to: <Inline text={call.hinge.question} />
          </p>
          <div className="side-row side-answers">
            {shown.map((_, col) => (
              <div key={col} className="answer-col">
                {call.hinge!.answers.map((a, i) =>
                  a.option === col + 1 ? (
                    <button
                      key={i}
                      className="answer"
                      aria-pressed={answered === i}
                      onClick={() => c.answer(i)}
                    >
                      <Kbd>{'ABC'[i]!}</Kbd> {a.answer}
                    </button>
                  ) : null,
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
