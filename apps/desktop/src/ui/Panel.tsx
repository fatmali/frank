import { useEffect, useRef } from 'react';
import type { PanelController } from '../controller.ts';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { NoteFooter } from './Footer.tsx';
import { Onboarding } from './Onboarding.tsx';
import { PlanHeader, PlanPicker } from './PlanHeader.tsx';
import { CallView } from './CallView.tsx';
import { TheRead } from './TheRead.tsx';
import { YourCalls } from './YourCalls.tsx';
import { Settings } from './Settings.tsx';
import { VoiceMenu } from './VoiceMenu.tsx';
import { BrainError, ContextCheck, NoPlan, Nothing, Preparing } from './States.tsx';
import { ControllerContext, usePanel } from './store.ts';

export function Panel({ controller }: { controller: PanelController }) {
  return (
    <ControllerContext.Provider value={controller}>
      <PanelFrame controller={controller} />
    </ControllerContext.Provider>
  );
}

function PanelFrame({ controller: c }: { controller: PanelController }) {
  const state = usePanel();
  const frame = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const { view, settingsOpen, pickerOpen, voiceMenuOpen } = state;

  // Opening: start (or resume), and focus the composer.
  useEffect(() => {
    const opened = () => {
      frame.current?.classList.remove('opening');
      void frame.current?.offsetWidth;
      frame.current?.classList.add('opening');
      void c.start();
      composer.current?.focus();
    };
    c.host.onShown(opened);
    c.host.onOpenSettings(() => c.openSettings());
    c.host.onFileDrop((paths) => void c.dropFiles(paths));
    void c.start();
  }, [c]);

  // The window grows with the content, up to 70% of the screen.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => void c.host.fitHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [c]);

  // A plan pasted anywhere when there's no session starts one.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const s = c.getSnapshot();
      const typing =
        e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (text.trim() && (s.pickerOpen || (s.view.name === 'no-plan' && !typing))) {
        e.preventDefault();
        void c.pastePlan(text);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [c]);

  // The keyboard map (ux.md §5.3). Letter and number keys act only when the
  // composer is empty, so typing is never hijacked.
  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let talking = false;
    let tapped = false;

    const onKey = (e: KeyboardEvent) => {
      const s = c.getSnapshot();
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const inComposer = target.closest('.composer') !== null;
      const inField = !inComposer && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      const composerEmpty = composer.current?.isEmpty() ?? true;

      // Any key stops Frank talking, and does nothing else.
      if (s.voice.state === 'speaking' && !e.repeat && e.key !== ' ') {
        e.preventDefault();
        c.stopSpeaking();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        void c.close();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void c.copyNote();
        return;
      }
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        c.togglePicker();
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        c.openSettings();
        return;
      }
      if (inField || s.settingsOpen || mod || e.altKey) return;
      if (inComposer && !composerEmpty) return;
      if (s.changing) return;

      // Hold Space to talk: the microphone starts after a quarter second.
      // A tap turns hands-free on or off (on key up).
      if (
        e.key === ' ' &&
        (s.view.name === 'read' || s.view.name === 'call' || s.view.name === 'calls')
      ) {
        e.preventDefault();
        if (!e.repeat && !holdTimer && !talking) {
          tapped = true;
          holdTimer = setTimeout(() => {
            tapped = false;
            holdTimer = undefined;
            talking = true;
            void c.startTalking();
          }, 250);
        }
        return;
      }

      if (e.key === 'Enter') {
        if (s.voice.state === 'needs-pack') {
          e.preventDefault();
          void c.downloadPack(s.voice.pack);
        } else if (s.newerPlan) {
          e.preventDefault();
          void c.switchToNewer();
        } else if (s.view.name === 'context-check') {
          e.preventDefault();
          void c.confirmContext(false);
        } else if (s.view.name === 'error') {
          e.preventDefault();
          void c.retry();
        } else if (s.view.name === 'read') {
          e.preventDefault();
          c.beginCalls();
        } else if (s.view.name === 'call') {
          e.preventDefault();
          c.accept();
        } else if (s.view.name === 'calls') {
          e.preventDefault();
          void c.copyNote();
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        c.next();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        c.back();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'v' && inSessionView(s.view.name)) {
        e.preventDefault();
        c.toggleVoiceMenu();
        return;
      }
      if (s.view.name === 'read' && /^[1-5]$/.test(key) && !s.reading) {
        const call = s.calls[Number(key) - 1];
        if (call) {
          e.preventDefault();
          c.show(call.id);
        }
        return;
      }
      if (s.view.name !== 'call') return;
      if (/^[1-3]$/.test(key)) {
        e.preventDefault();
        c.choose(Number(key));
      } else if (key === 'a' || key === 'b' || key === 'c') {
        e.preventDefault();
        c.answer(key.charCodeAt(0) - 97);
      } else if (key === 'd') {
        e.preventDefault();
        c.drop();
      } else if (key === 's') {
        e.preventDefault();
        c.somethingElse();
      } else if (e.key === '?') {
        e.preventDefault();
        void c.whatWouldYouDo();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = undefined;
      }
      if (tapped) {
        tapped = false;
        void c.toggleHandsFree();
      }
      if (talking) {
        talking = false;
        void c.stopTalking();
      }
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [c]);

  const body = (() => {
    if (settingsOpen) return <Settings />;
    switch (view.name) {
      case 'starting':
        return null;
      case 'onboarding':
        return <Onboarding />;
      case 'no-plan':
        return <NoPlan />;
      case 'preparing':
        return <Preparing step={view.step} />;
      case 'context-check':
        return <ContextCheck />;
      case 'error':
        return <BrainError message={view.message} />;
      case 'read':
        return <TheRead />;
      case 'call':
        return <CallView />;
      case 'calls':
        return <YourCalls />;
    }
  })();

  const chrome = !settingsOpen && view.name !== 'onboarding' && view.name !== 'starting';
  const inSession = view.name === 'read' || view.name === 'call' || view.name === 'calls';
  const showComposer = chrome && (inSession || view.name === 'no-plan');

  return (
    <div
      ref={frame}
      className="panel opening"
      style={{ maxHeight: Math.floor(window.screen.availHeight * 0.7) }}
      onDragOver={(e) => e.preventDefault()}
    >
      {chrome && <PlanHeader />}
      {chrome && pickerOpen && <PlanPicker />}
      <main className="panel-body">{body}</main>
      {showComposer && inSession && voiceMenuOpen && <VoiceMenu />}
      {showComposer && <Composer ref={composer} />}
      {chrome && (inSession || state.notice) && <NoteFooter />}
    </div>
  );
}

function inSessionView(name: string): boolean {
  return name === 'read' || name === 'call' || name === 'calls';
}
