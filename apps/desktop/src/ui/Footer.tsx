import { MOD } from '../format.ts';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

/** Progress in words, the note preview, and the one primary action. */
export function NoteFooter() {
  const c = useController();
  const { progress, note, notice, noteCopied, view } = usePanel();
  const inSession = view.name === 'session';
  const nothing = inSession && progress.total === 0;
  const allMade = progress.total > 0 && progress.made === progress.total;

  const status =
    notice ??
    (!inSession
      ? ''
      : nothing
        ? 'Nothing to change.'
        : allMade
          ? `All ${progress.total} calls made`
          : `${progress.made} of ${progress.total} calls made`);

  return (
    <footer className="note-footer">
      {inSession && allMade && !noteCopied && (
        <section className="note-preview" aria-label="Note for your agent">
          <h2>Note for your agent</h2>
          <pre>{note}</pre>
        </section>
      )}
      <div className="footer-bar">
        <span className={noteCopied ? 'progress copied' : 'progress'} role="status">
          {status}
        </span>
        {nothing ? (
          <button className="button primary" onClick={() => void c.close()}>
            Close <Kbd>esc</Kbd>
          </button>
        ) : (
          <button
            className="button primary"
            disabled={!inSession}
            onClick={() => void c.copyNote()}
          >
            Copy note <Kbd>{`${MOD}↵`}</Kbd>
          </button>
        )}
      </div>
    </footer>
  );
}
