import { Kbd } from './Kbd.tsx';
import { useController } from './store.ts';
import { VoicePicker } from './VoicePicker.tsx';

/** Frank's voice, changed without leaving the call (the voice button, or V). */
export function VoiceMenu() {
  const c = useController();
  return (
    <section className="voice-menu" role="dialog" aria-label="Frank's voice">
      <header className="voice-menu-head">
        <h2>Frank's voice</h2>
        <button className="text-button" onClick={() => c.toggleVoiceMenu(false)}>
          Done <Kbd>esc</Kbd>
        </button>
      </header>
      <VoicePicker />
    </section>
  );
}
