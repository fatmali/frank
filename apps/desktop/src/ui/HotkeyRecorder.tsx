import { useState } from 'react';
import { displayHotkey, isMac } from '../format.ts';

/**
 * Press a key combination to record it. Needs at least one modifier other
 * than Shift, so a stray letter can't become the hotkey.
 */
export function HotkeyRecorder({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (accelerator: string) => void;
  error?: string | null | undefined;
}) {
  const [recording, setRecording] = useState(false);
  return (
    <div className="hotkey">
      <button
        className={recording ? 'hotkey-box recording' : 'hotkey-box'}
        aria-label={`Hotkey: ${displayHotkey(value)}. Press a new combination to change it.`}
        onFocus={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') return;
          e.preventDefault();
          e.stopPropagation();
          const accelerator = toAccelerator(e);
          if (accelerator) onChange(accelerator);
        }}
      >
        {displayHotkey(value)}
      </button>
      <span className="quiet">
        {recording ? 'Press the new combination' : 'Click, then press a new combination'}
      </span>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** A keyboard event as a global-shortcut accelerator, e.g. "Alt+Shift+Space". */
export function toAccelerator(e: {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): string | null {
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else key = NAMED[e.code];
  if (!key) return null;
  if (!e.altKey && !e.ctrlKey && !e.metaKey && !/^F\d/.test(key)) return null;
  const mods = [
    e.ctrlKey && 'Control',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && (isMac ? 'Super' : 'Super'),
  ].filter(Boolean);
  return [...mods, key].join('+');
}
