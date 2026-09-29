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
          pretend microphone. The plan is a sample from a Claude Code session. Frank talks
          you through it with your browser's voice; when it's your turn, the pretend
          microphone says the line below for you. Click the panel first so it has the
          keyboard.
        </p>
        <ul className="demo-keys">
          <li>Any key cuts Frank off</li>
          <li>
            Tap <kbd className="kbd">Space</kbd> to stop or start listening,{' '}
            <kbd className="kbd">V</kbd> for his voice
          </li>
          <li>
            <kbd className="kbd">↵</kbd> <kbd className="kbd">1</kbd>{' '}
            <kbd className="kbd">2</kbd> <kbd className="kbd">A</kbd>{' '}
            <kbd className="kbd">B</kbd> <kbd className="kbd">?</kbd> still work, and{' '}
            <a href="?chat">chat mode</a> keeps to the panel
          </li>
        </ul>
      </header>
      <Panel controller={controller} />
      <footer className="demo-foot">
        <p className="demo-next" aria-live="polite">
          {nextLine ? (
            <>
              On your turn, the pretend microphone says: <q>{nextLine}</q>
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
