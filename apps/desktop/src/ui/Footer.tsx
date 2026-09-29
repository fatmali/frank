import { MOD } from '../format.ts';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

/**
 * The line at the bottom: what just happened, or the keys that matter here,
 * and the one primary action, Copy note.
 */
export function NoteFooter() {
  const c = useController();
  const { view, calls, progress, notice, flash, noteCopied, voice, reading, highlight } =
    usePanel();
  const nothing = view.name === 'read' && !reading && calls.length === 0;
  const current = c.current;

  let status: React.ReactNode = null;
  if (notice) status = notice;
  else if (voice.state === 'speaking')
    status = (
      <button className="text-button quiet-button" onClick={() => c.stopSpeaking()}>
        Frank is talking. Any key stops him.
      </button>
    );
  else if (flash) status = flash;
  else if (view.name === 'read' && calls.length && !reading)
    status = (
      <>
        <Kbd>↵</Kbd> Start with 1
      </>
    );
  else if (view.name === 'call' && current)
    status = (
      <span className="hints">
        {current.options.length > 1 && (
          <span>
            <Kbd>{`1–${current.options.length}`}</Kbd> choose
          </span>
        )}
        {highlight && !current.outcome ? (
          <span>
            <Kbd>↵</Kbd> take {highlight.option}
          </span>
        ) : (
          <span>
            <Kbd>?</Kbd> Frank's take
          </span>
        )}
        <span>
          <Kbd>→</Kbd> later
        </span>
      </span>
    );
  else if (view.name === 'calls')
    status = `${progress.made} of ${progress.total} decided. The rest stay as planned.`;

  return (
    <footer className="note-footer">
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
            className={view.name === 'calls' ? 'button primary' : 'button'}
            disabled={reading}
            onClick={() => void c.copyNote()}
          >
            Copy note <Kbd>{`${MOD}↵`}</Kbd>
          </button>
        )}
      </div>
    </footer>
  );
}
