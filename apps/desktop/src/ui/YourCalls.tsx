import { outcomeWord } from '../format.ts';
import { useController, usePanel } from './store.ts';

/** Every decision, and the note they make. */
export function YourCalls() {
  const c = useController();
  const { calls, note, noteCopied } = usePanel();
  return (
    <section className="your-calls" aria-label="Your calls">
      <h2>Your calls</h2>
      <ol className="decisions">
        {calls.map((call) => (
          <li key={call.id}>
            <button className="decision" onClick={() => c.show(call.id)}>
              <span className="call-number" aria-hidden="true">
                {call.id}
              </span>
              <span className="decision-title">{call.title}</span>
              <span className="decision-outcome">{outcomeWord(call)}</span>
            </button>
          </li>
        ))}
      </ol>
      {!noteCopied && (
        <section className="note-preview" aria-label="Note for your agent">
          <h2>Note for your agent</h2>
          <pre>{note}</pre>
        </section>
      )}
    </section>
  );
}
