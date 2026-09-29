import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { EYE, HEAD, MOUTH } from '../duck.ts';
import { usePanel } from './store.ts';

/**
 * Frank in the margin of the plan, beside what's being talked about, the way
 * a listener's eyes follow your finger down the code (docs/ux-redesign.md
 * §6.2). Nodding with your voice while you talk; still while you think;
 * rocking while he talks; blinking while he thinks.
 */
export function MarginDuck({ fallback }: { fallback: string }) {
  const { speakingAbout, voice, handsFree, streaming, reading, turnKind } = usePanel();
  const self = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | undefined>(undefined);
  const target = speakingAbout ?? fallback;

  useLayoutEffect(() => {
    const el = self.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const place = () => {
      const anchor = box.querySelector<HTMLElement>(`[data-anchor="${target}"]`);
      if (!anchor) return;
      const y =
        anchor.getBoundingClientRect().top -
        box.getBoundingClientRect().top +
        box.scrollTop;
      setTop(Math.max(0, y - 4));
      if (speakingAbout) anchor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => observer.disconnect();
  }, [target, speakingAbout]);

  const hearing =
    handsFree && (handsFree.state === 'hearing' || handsFree.state === 'checking');
  const state =
    voice.state === 'speaking'
      ? 'talking'
      : hearing || voice.state === 'listening'
        ? 'listening'
        : streaming || reading
          ? 'thinking'
          : turnKind === 'hold'
            ? 'waiting'
            : 'resting';
  const level =
    voice.state === 'listening' ? voice.level : hearing ? (handsFree?.level ?? 0) : 0;

  return (
    <div
      ref={self}
      className={`margin-duck ${state}`}
      style={
        {
          top: top ?? 0,
          opacity: top === undefined ? 0 : 1,
          '--level': level,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <svg width="30" height="30" viewBox="-1 -1 38 38">
        <path
          d={HEAD}
          fill="var(--duck)"
          stroke="var(--ink)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle className="eye" cx={EYE.cx} cy={EYE.cy} r={EYE.r} fill="var(--ink)" />
        <path d={MOUTH} fill="var(--ink)" />
      </svg>
    </div>
  );
}
