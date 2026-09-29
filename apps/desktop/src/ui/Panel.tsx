import { useEffect, useRef } from 'react';
import type { PanelController } from '../controller.ts';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { NoteFooter } from './Footer.tsx';
import { Onboarding } from './Onboarding.tsx';
import { PlanHeader, PlanPicker } from './PlanHeader.tsx';
import { CallActions, CallsList, Conversation } from './Session.tsx';
import { Settings } from './Settings.tsx';
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
  const { view, settingsOpen, pickerOpen, calls } = state;

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

  // The keyboard map (ux.md §4.3). Letter keys only act when the composer is
  // empty, so typing is never hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = c.getSnapshot();
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const inComposer = target.closest('.composer') !== null;
      const inField = !inComposer && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      const composerEmpty = composer.current?.isEmpty() ?? true;

      if (e.key === 'Escape') {
        e.preventDefault();
        void c.close();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (s.view.name === 'session') void c.copyNote();
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

      if (e.key === 'Enter') {
        if (s.newerPlan) {
          e.preventDefault();
          void c.switchToNewer();
        } else if (s.view.name === 'context-check') {
          e.preventDefault();
          void c.confirmContext(false);
        } else if (s.view.name === 'error') {
          e.preventDefault();
          void c.retry();
        }
        return;
      }
      if (s.view.name !== 'session' || s.changing) return;
      const key = e.key.toLowerCase();
      if (/^[1-5]$/.test(key) && Number(key) <= s.calls.length) {
        e.preventDefault();
        void c.select(key);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        void c.move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (key === 'k' || key === 'c' || key === 'd') {
        e.preventDefault();
        void c.act(key === 'k' ? 'keep' : key === 'c' ? 'change' : 'drop');
      } else if (e.key === '?') {
        e.preventDefault();
        void c.whatWouldYouDo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
      case 'session':
        return calls.length ? (
          <>
            <CallsList />
            <Conversation />
            <CallActions />
          </>
        ) : (
          <Nothing />
        );
    }
  })();

  const chrome = !settingsOpen && view.name !== 'onboarding' && view.name !== 'starting';
  const showComposer = chrome && (view.name === 'session' || view.name === 'no-plan');

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
      {showComposer && <Composer ref={composer} />}
      {chrome && (view.name === 'session' || state.notice) && <NoteFooter />}
    </div>
  );
}
