import { useEffect, useState } from 'react';
import { DuckMark } from '../DuckMark.tsx';
import { displayHotkey } from '../format.ts';
import { BrainList } from './BrainList.tsx';
import { HotkeyRecorder } from './HotkeyRecorder.tsx';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

type Step = 'brain' | 'hotkey' | 'voice' | 'try';

/** First run: a brain, a hotkey, voice or chat, and a plan to try. Under a minute (ux.md §5.1). */
export function Onboarding() {
  const c = useController();
  const { config, packs } = usePanel();
  const [step, setStep] = useState<Step>('brain');
  const [hotkey, setHotkey] = useState(config?.hotkey ?? 'Alt+Shift+Space');
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  useEffect(() => {
    void c.host.hotkeyStatus().then(setHotkeyError);
  }, [c]);

  const missing = packs ? packs.listening.megabytes + packs.voices.megabytes : 0;

  const record = async (accelerator: string) => {
    try {
      await c.host.setHotkey(accelerator);
      setHotkey(accelerator);
      setHotkeyError(null);
    } catch (err) {
      setHotkeyError(String(err));
    }
  };

  return (
    <section className="onboarding">
      <header>
        <DuckMark size={32} className="duck" />
        <h1>Hi, I'm Frank.</h1>
      </header>
      {step === 'brain' && (
        <>
          <p>
            When your agent hands you a plan, I find the calls in it worth a second look,
            check them against your code, and help you make them. First, what should I
            think with?
          </p>
          <BrainList onReady={() => setTimeout(() => setStep('hotkey'), 600)} />
          <p className="quiet">
            I use what you already have. I never see or keep your sign-in; API keys stay
            in your keychain.
          </p>
        </>
      )}
      {step === 'hotkey' && (
        <>
          <p>Summon me from any app with</p>
          <HotkeyRecorder
            value={hotkey}
            onChange={(a) => void record(a)}
            error={hotkeyError}
          />
          <div className="state-actions">
            <button className="button primary" autoFocus onClick={() => setStep('voice')}>
              Continue <Kbd>↵</Kbd>
            </button>
          </div>
        </>
      )}
      {step === 'voice' && (
        <>
          <p>
            I'm best out loud. I'll tell you what each plan does and what needs you, then
            listen while you talk it through.
          </p>
          {missing > 0 && (
            <p className="quiet">
              That takes {missing} MB of voice models, downloaded once. They run on this
              Mac; your voice never leaves it.
            </p>
          )}
          <div className="state-actions">
            <button
              className="text-button"
              onClick={() => void c.chooseMode('chat').then(() => setStep('try'))}
            >
              I'd rather type
            </button>
            <button
              className="button primary"
              autoFocus
              onClick={() => void c.chooseMode('voice').then(() => setStep('try'))}
            >
              {missing > 0 ? 'Download and talk' : 'Talk'} <Kbd>↵</Kbd>
            </button>
          </div>
        </>
      )}
      {step === 'try' && (
        <>
          <p>
            Next time an agent finishes a plan, press {displayHotkey(hotkey)} and I'll
            already have it. Or see what I do with a sample plan now.
          </p>
          <div className="state-actions">
            <button
              className="text-button"
              onClick={() => void c.finishOnboarding(false)}
            >
              Skip
            </button>
            <button
              className="button primary"
              autoFocus
              onClick={() => void c.finishOnboarding(true)}
            >
              Try me on a sample plan <Kbd>↵</Kbd>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
