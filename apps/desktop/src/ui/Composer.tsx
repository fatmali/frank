import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useController, usePanel } from './store.ts';

export interface ComposerHandle {
  focus(): void;
  isEmpty(): boolean;
}

/** One line that grows as you type. Enter sends; Shift+Enter adds a line. */
export const Composer = forwardRef<ComposerHandle>(function Composer(_, ref) {
  const c = useController();
  const { view, calls, changing, streaming, selected } = usePanel();
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

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

  const placeholder = changing
    ? 'What should the agent do instead?'
    : view.name === 'no-plan'
      ? 'Paste a plan here, or drop a file'
      : calls.length
        ? `Ask Frank, or press 1–${calls.length}`
        : 'Ask Frank';

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
          <span>Changing call {selected}. Say what the agent should do instead.</span>
          <span>esc to cancel</span>
        </p>
      )}
      <textarea
        ref={input}
        rows={1}
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
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            send();
          }
        }}
      />
    </div>
  );
});
