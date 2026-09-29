import { useState } from 'react';
import { MOD } from '../format.ts';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

/** Real steps, never a spinner (ux.md §2.1). */
export function Preparing({ step }: { step: string }) {
  const c = useController();
  const { slow, gathered } = usePanel();
  const n = gathered?.files.length ?? 0;
  const at = step.startsWith('Finding') ? 2 : step === 'Reading the plan' ? 0 : 1;
  const labels = [
    'Reading the plan',
    n ? `Reading ${n} ${n === 1 ? 'file' : 'files'}` : null,
    'Finding the calls',
  ];
  return (
    <section className="state preparing" aria-live="polite">
      <ol className="steps">
        {labels.map((label, i) =>
          label ? (
            <li key={i} className={i < at ? 'done' : i === at ? 'now' : 'next'}>
              {label}
            </li>
          ) : null,
        )}
      </ol>
      {slow === 'warming' && <p className="quiet">{c.brainName} is warming up.</p>}
      {slow === 'waiting' && (
        <p className="quiet">
          Still waiting on {c.brainName}.{' '}
          <button className="text-button" onClick={() => c.cancel()}>
            Cancel
          </button>
        </p>
      )}
    </section>
  );
}

/** First use in a project: what Frank will read, before anything is sent. */
export function ContextCheck() {
  const c = useController();
  const { view } = usePanel();
  const [trust, setTrust] = useState(false);
  if (view.name !== 'context-check') return null;
  const { files, skipped, repo } = view.gathered;
  const rules = repo?.rules ?? [];
  return (
    <section className="state context-check">
      <p>
        Frank reads these, then sends them to {c.brainName} with the plan. Nothing else
        leaves this Mac.
      </p>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.path}>
            <code>{f.path}</code>
            <span className="meta">
              {f.content.split('\n').length} lines{f.truncated ? ', trimmed' : ''}
            </span>
          </li>
        ))}
        {rules.map((r) => (
          <li key={r.path}>
            <code>{r.path}</code>
            <span className="meta">project rules</span>
          </li>
        ))}
        {skipped.map((s) => (
          <li key={s.path} className="skipped">
            <code>{s.path}</code>
            <span className="meta">{s.reason}</span>
          </li>
        ))}
      </ul>
      <div className="state-actions">
        <label className="check">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
          />
          Don't ask again for this project
        </label>
        <button
          className="button primary"
          onClick={() => void c.confirmContext(trust)}
          autoFocus
        >
          Continue <Kbd>↵</Kbd>
        </button>
      </div>
    </section>
  );
}

/** A brain that isn't ready says exactly why, and how to fix it. */
export function BrainError({ message }: { message: string }) {
  const c = useController();
  return (
    <section className="state error" role="alert">
      <p>{message}</p>
      <div className="state-actions">
        <button className="text-button" onClick={() => c.openSettings()}>
          Switch brain
        </button>
        <button className="button primary" onClick={() => void c.retry()} autoFocus>
          Retry <Kbd>↵</Kbd>
        </button>
      </div>
    </section>
  );
}

export function NoPlan() {
  const c = useController();
  return (
    <section className="state no-plan">
      <p>No recent plan. Paste one with {MOD}V, or drop a file here.</p>
      <p className="quiet">
        Frank looks in Claude Code's plans folder for plans from the last{' '}
        {c.getSnapshot().config?.plans.window_minutes ?? 30} minutes.{' '}
        <button className="text-button" onClick={() => void c.trySample()}>
          Try the sample plan
        </button>
      </p>
    </section>
  );
}

export function Nothing() {
  return (
    <section className="state nothing">
      <p>Nothing here worth a second look. Ship it.</p>
    </section>
  );
}
