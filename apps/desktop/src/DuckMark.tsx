import { EYE, HEAD, MARKS, MOUTH, type Mood } from './duck.ts';

/** Frank's head as a small mark: one colour, the eye cut out. */
export function DuckMark({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      aria-hidden="true"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d={`${HEAD} M${EYE.cx} ${EYE.cy - EYE.r} a${EYE.r} ${EYE.r} 0 1 0 0.01 0 Z`}
      />
    </svg>
  );
}

/** Sticky Frank: the illustrated duck, with his mood marked above his head. */
export function IllustratedDuck({ mood, size = 64 }: { mood: Mood; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -1 38 38"
      role="img"
      aria-label={`Frank, ${mood}`}
    >
      <path
        d={HEAD}
        fill="var(--duck)"
        stroke="var(--ink)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx={EYE.cx} cy={EYE.cy} r={EYE.r} fill="var(--ink)" />
      <path d={MOUTH} fill="var(--ink)" />
      <g
        fill="var(--ink)"
        color="var(--ink)"
        dangerouslySetInnerHTML={{ __html: MARKS[mood] }}
      />
    </svg>
  );
}
