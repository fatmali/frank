/**
 * Frank's silhouette: a duck's head and chest, facing right, on a 36×36 grid.
 * The single source for the menu bar icons, sticky Frank, the app icon and
 * the panel (docs/ux.md §8.5).
 */

export type Mood = 'idle' | 'listening' | 'thinking' | 'judging' | 'done';

/** Head, bill and chest. The bottom edge is flat so the bust can sit on a line. */
export const HEAD =
  'M15.5 4.5 C20 4.5 23 7.4 23.6 11 C26.6 10.9 29.8 11.3 31.8 12.3 C33.9 13.4 33.8 16.9 31.6 17.9 ' +
  'C29.2 19 26.2 19.4 23.6 19.4 C23.3 20.4 22.8 21.2 22.2 21.9 C26.6 23.2 29.8 26.8 30.2 35 L5 35 ' +
  'C4.5 29.5 5.8 25.4 8.4 22.6 C6.7 20.8 5.8 18.2 5.8 15.2 C5.8 9 9.8 4.5 15.5 4.5 Z';

export const EYE = { cx: 18.6, cy: 11.1, r: 1.8 };

/** The line between the upper and lower bill. Only drawn at 32 pt and up. */
export const MOUTH =
  'M23.9 15.6 C26.4 15.8 29 15.6 31.2 15 L31.3 15.8 C29 16.5 26.4 16.7 23.8 16.5 Z';

/** Marks above the head, one per mood. Drawn in `currentColor`. */
export const MARKS: Record<Mood, string> = {
  idle: '',
  listening:
    '<rect x="24.2" y="2.6" width="2.4" height="5" rx="1.2"/><rect x="28.4" y="0.2" width="2.4" height="7.4" rx="1.2"/><rect x="32.6" y="3.4" width="2.4" height="4.2" rx="1.2"/>',
  thinking:
    '<circle cx="23.5" cy="2.6" r="1.8"/><circle cx="28.5" cy="2.6" r="1.8"/><circle cx="33.5" cy="2.6" r="1.8"/>',
  judging:
    '<rect x="29.3" y="0.4" width="2.8" height="6.4" rx="1.4"/><circle cx="30.7" cy="9.1" r="1.5"/>',
  done: '<path d="M26 4.8 L29 7.8 L34.4 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

const eyeHole = `M${EYE.cx} ${EYE.cy - EYE.r} a${EYE.r} ${EYE.r} 0 1 0 0.01 0 Z`;

/** A one-colour silhouette with the eye cut out: the menu bar template image. */
export function silhouetteSvg(mood: Mood, size = 36): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36" fill="#000" color="#000">` +
    `<path fill-rule="evenodd" d="${HEAD} ${eyeHole}"/>${MARKS[mood]}</svg>`
  );
}

/** Sticky Frank: duck amber with an ink outline, eye and mouth. */
export function illustratedSvg(
  mood: Mood,
  colors: { body: string; ink: string },
  size = 64,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-1 -1 38 38" color="${colors.ink}">` +
    `<path d="${HEAD}" fill="${colors.body}" stroke="${colors.ink}" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<circle cx="${EYE.cx}" cy="${EYE.cy}" r="${EYE.r}" fill="${colors.ink}"/>` +
    `<path d="${MOUTH}" fill="${colors.ink}"/>` +
    `<g fill="${colors.ink}">${MARKS[mood]}</g></svg>`
  );
}

/** The app icon: Frank's bust rising from the bottom of a pond-water square. */
export function appIconSvg(size = 1024): string {
  // macOS icon grid: an 824 pt rounded square centred in 1024.
  const inset = 100;
  const side = 824;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">` +
    `<defs><clipPath id="c"><rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="185"/></clipPath></defs>` +
    `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="185" fill="#1B2421"/>` +
    `<g clip-path="url(#c)"><g transform="translate(150 250) scale(21)">` +
    `<path fill-rule="evenodd" d="${HEAD} ${eyeHole}" fill="#F2B53A"/>` +
    `<path d="${MOUTH}" fill="#1B2421"/></g></g></svg>`
  );
}
