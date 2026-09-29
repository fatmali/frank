import { useEffect, useRef, useState } from 'react';
import { IllustratedDuck } from '../DuckMark.tsx';
import type { Mood } from '../duck.ts';

/**
 * Sticky Frank: always on top, draggable, and a click opens the panel beside
 * him. His mood follows the menu bar icon.
 */
export function Sticky({
  onClick,
  onDrag,
  subscribe,
}: {
  onClick: () => void;
  onDrag: () => void;
  subscribe: (handler: (mood: Mood) => void) => void;
}) {
  const [mood, setMood] = useState<Mood>('idle');
  const [nod, setNod] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    subscribe((m) => {
      setMood(m);
      if (m === 'done') {
        setNod(true);
        setTimeout(() => setNod(false), 120);
      }
    });
  }, [subscribe]);

  return (
    <button
      className={nod ? 'sticky nod' : 'sticky'}
      aria-label="Open Frank"
      onMouseDown={(e) => (down.current = { x: e.screenX, y: e.screenY })}
      onMouseMove={(e) => {
        const d = down.current;
        if (d && Math.hypot(e.screenX - d.x, e.screenY - d.y) > 3) {
          down.current = null;
          onDrag();
        }
      }}
      onMouseUp={() => {
        if (down.current) onClick();
        down.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
    >
      <IllustratedDuck mood={mood} size={64} />
    </button>
  );
}
