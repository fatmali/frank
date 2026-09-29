import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { displayHotkey } from '../format.ts';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

export interface ComposerHandle {
  focus(): void;
  isEmpty(): boolean;
}

const METER_BARS = 28;

/** What hands-free is doing, in the composer. */
const HANDS_FREE_WORDS = {
  waiting: 'Listening. Just talk.',
  hearing: 'Hearing you',
  checking: 'Hearing you',
} as const;

function VoiceButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      className={open ? 'tool on' : 'tool'}
      aria-label="Frank's voice"
      aria-expanded={open}
      title="Frank's voice (V)"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M2.5 6v4h2.5l3.5 3V3L5 6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect
        x="5.5"
        y="1.5"
        width="5"
        height="8.5"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Meter({ levels }: { levels: number[] }) {
  return (
    <span className="meter" aria-hidden="true">
      {levels.map((l, i) => (
        <span key={i} style={{ height: `${Math.max(8, Math.min(1, l * 1.6) * 100)}%` }} />
      ))}
    </span>
  );
}

/**
 * One line that grows as you type, or a live level meter while you talk.
 * Enter sends; Shift+Enter adds a line; hold Space (when empty) to talk, or tap
 * it to talk hands-free.
 */
export const Composer = forwardRef<ComposerHandle>(function Composer(_, ref) {
  const c = useController();
  const {
    view,
    changing,
    streaming,
    selected,
    voice,
    voiceError,
    config,
    reading,
    handsFree,
    downloads,
    voiceMenuOpen,
    packs,
    typing,
  } = usePanel();
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(METER_BARS).fill(0));

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    isEmpty: () => !input.current?.value,
  }));

  useEffect(() => {
    if (changing) input.current?.focus();
  }, [changing]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // The meter scrolls: each new level pushes the oldest out.
  const level =
    voice.state === 'listening'
      ? voice.level
      : handsFree && handsFree.state !== 'paused'
        ? handsFree.level
        : undefined;
  useEffect(() => {
    if (level === undefined) {
      setLevels(Array(METER_BARS).fill(0));
      return;
    }
    setLevels((l) => [...l.slice(1), level]);
  }, [level]);

  const hotkey = displayHotkey(config?.hotkey ?? 'Alt+Shift+Space');

  if (voice.state === 'needs-pack') {
    return (
      <div className="composer voice-consent" role="dialog" aria-label="Download voice">
        <p>
          Voice runs on this Mac. It needs {voice.megabytes} MB of speech models,
          downloaded once. Your voice never leaves this Mac.
        </p>
        <div className="state-actions">
          <button className="text-button" onClick={() => c.declinePack()}>
            Not now <Kbd>esc</Kbd>
          </button>
          <button
            className="button primary"
            autoFocus
            onClick={() => void c.downloadPack(voice.pack)}
          >
            Download <Kbd>↵</Kbd>
          </button>
        </div>
      </div>
    );
  }
  const listening = downloads.listening;
  if (listening !== undefined) {
    return (
      <div className="composer voice-status" role="status">
        <span>Downloading the speech models, {Math.round(listening * 100)}%</span>
        <span className="download-bar" style={{ width: `${listening * 100}%` }} />
      </div>
    );
  }
  if (voice.state === 'listening' || voice.state === 'transcribing') {
    return (
      <div
        className="composer voice-status listening"
        role="status"
        onClick={() => void c.stopTalking()}
      >
        <Meter levels={levels} />
        <span>
          {voice.state === 'listening' ? 'Listening. Let go to send.' : 'Got it.'}
        </span>
      </div>
    );
  }
  const inSession = view.name === 'read' || view.name === 'call' || view.name === 'calls';
  if (c.voiceFirst && inSession && !typing && !changing) {
    const hearing = handsFree && handsFree.state !== 'paused';
    const voiceDownload = downloads.voices;
    const words =
      voice.state === 'speaking'
        ? 'Frank is talking. Any key to cut in.'
        : streaming
          ? 'Thinking it over'
          : reading
            ? 'Frank is reading the plan'
            : hearing
              ? handsFree.state === 'waiting'
                ? 'Your turn. Just talk.'
                : 'Hearing you'
              : handsFree
                ? 'One moment'
                : 'Tap Space to talk';
    return (
      <div className="composer voice-bar-wrap">
        {voiceError && <p className="composer-hint error">{voiceError}</p>}
        {packs && !packs.voices.installed && (
          <p className="composer-hint">
            {voiceDownload === undefined ? (
              <>
                <span>Frank can't talk yet: his voice isn't downloaded.</span>
                <button
                  className="text-button"
                  onClick={() => void c.downloadPack('voices')}
                >
                  Download, {packs.voices.megabytes || 212} MB
                </button>
              </>
            ) : (
              <span>Downloading his voice, {Math.round(voiceDownload * 100)}%</span>
            )}
          </p>
        )}
        <div
          className={`voice-status voice-bar ${hearing ? `listening hands-free ${handsFree.state}` : ''}`}
          role="status"
          aria-live="polite"
        >
          {hearing ? (
            <Meter levels={levels} />
          ) : (
            <span
              className={
                voice.state === 'speaking' || streaming ? 'hands-free-dot' : 'idle-dot'
              }
              aria-hidden="true"
            />
          )}
          <span>{words}</span>
          <span className="composer-tools inline">
            <VoiceButton open={voiceMenuOpen} onClick={() => c.toggleVoiceMenu()} />
            <button
              className="tool"
              aria-label="Type instead"
              title="Type instead"
              onClick={() => c.setTyping(true)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect
                  x="1.5"
                  y="4"
                  width="13"
                  height="8"
                  rx="1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M4 6.5h1M7 6.5h1M10 6.5h2M4.5 9.5h7"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              className={handsFree ? 'tool on' : 'tool'}
              aria-label={handsFree ? 'Stop listening' : 'Talk to Frank'}
              title={handsFree ? 'Stop listening (tap Space)' : 'Talk (tap Space)'}
              onClick={() => void c.toggleHandsFree()}
            >
              <MicIcon />
            </button>
          </span>
        </div>
      </div>
    );
  }
  if (handsFree && handsFree.state !== 'paused') {
    return (
      <div
        className={`composer voice-status listening hands-free ${handsFree.state}`}
        role="status"
        aria-live="polite"
      >
        <Meter levels={levels} />
        <span>{HANDS_FREE_WORDS[handsFree.state]}</span>
        <button className="text-button" onClick={() => void c.stopHandsFree()}>
          Stop <Kbd>space</Kbd>
        </button>
      </div>
    );
  }
  if (handsFree) {
    return (
      <div className="composer voice-status hands-free paused" role="status">
        <span className="hands-free-dot" aria-hidden="true" />
        <span>
          {voice.state === 'speaking'
            ? 'Your turn when Frank finishes. Space to cut in.'
            : 'Your turn when Frank finishes.'}
        </span>
        <button className="text-button" onClick={() => void c.stopHandsFree()}>
          Stop <Kbd>esc</Kbd>
        </button>
      </div>
    );
  }

  const placeholder = changing
    ? 'What should the agent do instead?'
    : reading
      ? 'Frank is still reading'
      : view.name === 'no-plan'
        ? 'Paste a plan here, or drop a file'
        : view.name === 'call'
          ? 'Ask about this. Hold Space to talk, tap it to talk freely'
          : `Ask about the plan, or hold ${hotkey} to talk`;

  const send = () => {
    const t = text.trim();
    if (!t || (streaming && !changing)) return;
    setText('');
    void c.send(t);
  };

  return (
    <div className={changing ? 'composer changing' : 'composer'}>
      {changing && (
        <p className="composer-hint">
          <span>Call {selected}, in your words: what should the agent do?</span>
          <span>esc to cancel</span>
        </p>
      )}
      {voiceError && !changing && <p className="composer-hint error">{voiceError}</p>}
      <div className="composer-row">
        <textarea
          ref={input}
          rows={1}
          disabled={reading}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.metaKey &&
              !e.ctrlKey &&
              !e.nativeEvent.isComposing &&
              (text.trim() || changing)
            ) {
              e.preventDefault();
              e.stopPropagation();
              send();
            }
          }}
        />
        {view.name !== 'no-plan' && (
          <div className="composer-tools">
            <VoiceButton open={voiceMenuOpen} onClick={() => c.toggleVoiceMenu()} />
            <button
              className="tool"
              aria-label="Talk to Frank hands-free. He hears when you've finished."
              title="Talk freely (tap Space)"
              onClick={() => {
                // Voice mode: back from typing to talking.
                c.setTyping(false);
                void c.toggleHandsFree();
              }}
            >
              <MicIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
