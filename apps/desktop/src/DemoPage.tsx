import type { PanelController } from './controller.ts';
import { Panel } from './ui/Panel.tsx';

/**
 * The panel in a browser, with a pretend brain and a pretend microphone
 * (`pnpm demo`). The page around it says what's pretend and what to try.
 */
export function DemoPage({
  controller,
  nextLine,
  onRestart,
}: {
  controller: PanelController;
  nextLine: string | undefined;
  onRestart: () => void;
}) {
  return (
    <div className="demo-page">
      <header className="demo-intro">
        <h1>Try Frank</h1>
        <p>
          This is Frank's real panel, running in your browser with a pretend brain and a
          pretend microphone. The plan is a sample from a Claude Code session. Click the
          panel first so it has the keyboard.
        </p>
        <ul className="demo-keys">
          <li>
            <kbd className="kbd">↵</kbd> starts, and takes the option that's lit
          </li>
          <li>
            <kbd className="kbd">1</kbd> <kbd className="kbd">2</kbd> choose,{' '}
            <kbd className="kbd">A</kbd> <kbd className="kbd">B</kbd> answer,{' '}
            <kbd className="kbd">?</kbd> Frank's take
          </li>
          <li>
            Hold <kbd className="kbd">Space</kbd> to talk and let go to send, or tap the
            microphone, then tap again
          </li>
        </ul>
      </header>
      <Panel controller={controller} />
      <footer className="demo-foot">
        <p className="demo-next" aria-live="polite">
          {nextLine ? (
            <>
              When you hold Space, the pretend microphone hears: <q>{nextLine}</q>
            </>
          ) : (
            'The pretend microphone has run out of lines.'
          )}
        </p>
        <button className="text-button" onClick={onRestart}>
          Start over
        </button>
      </footer>
    </div>
  );
}
