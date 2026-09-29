import { useMemo } from 'react';
import { sizeOfIt } from '../format.ts';
import { Inline } from '../Markdown.tsx';
import { planLines } from '../planLines.ts';
import { Conversation } from './Conversation.tsx';
import { MarginDuck } from './MarginDuck.tsx';
import { PlanText } from './PlanText.tsx';
import { useController, usePanel } from './store.ts';

/**
 * The read: what the plan does in Frank's words, then the plan itself with
 * his marks on it, and what he found fine (docs/ux-redesign.md §6.1).
 */
export function TheRead() {
  const c = useController();
  const { gist, calls, fine, reading, plan, speakingAbout } = usePanel();
  const lines = useMemo(() => {
    if (!plan) return [];
    const all = planLines(plan.body, calls);
    // The plan's title is in the header already.
    const first = all[0];
    return first?.kind === 'heading' &&
      first.segments
        .map((s) => s.text)
        .join('')
        .trim() === plan.title
      ? all.slice(1)
      : all;
  }, [plan, calls]);
  const current = speakingAbout?.startsWith('call:') ? speakingAbout.slice(5) : undefined;
  return (
    <section className="the-read" aria-label="Frank's read of the plan">
      <MarginDuck fallback="plan" />
      <p className={gist ? 'gist' : 'gist quiet'} data-anchor="plan">
        {gist ? <Inline text={gist} /> : 'Reading the plan'}
      </p>
      <p className={reading && !calls.length ? 'size working' : 'size'} role="status">
        {sizeOfIt(calls.length, reading)}
      </p>
      <PlanText
        lines={lines}
        calls={calls}
        current={current}
        {...(reading ? {} : { onOpen: (id: string) => c.show(id) })}
      />
      {!reading && fine.length > 0 && (
        <p className="fine-line">Checked and fine: {fine.join('; ')}.</p>
      )}
      <Conversation callId={undefined} />
    </section>
  );
}
