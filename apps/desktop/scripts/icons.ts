/**
 * Renders Frank's icons from src/duck.ts:
 *   src-tauri/icons/tray/<mood>.png   menu bar template images (18 pt @2x)
 *   src-tauri/icons/app-icon.png      1024 px master for `tauri icon`
 * Run with `pnpm icons` after changing the duck.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { appIconSvg, silhouetteSvg, type Mood } from '../src/duck.ts';

const out = new URL('../src-tauri/icons/', import.meta.url);
mkdirSync(new URL('tray/', out), { recursive: true });

const moods: Mood[] = ['idle', 'thinking', 'judging', 'done'];
for (const mood of moods) {
  const png = new Resvg(silhouetteSvg(mood), {
    fitTo: { mode: 'width', value: 36 },
  }).render();
  writeFileSync(new URL(`tray/${mood}.png`, out), png.asPng());
}
const icon = new Resvg(appIconSvg(), { fitTo: { mode: 'width', value: 1024 } }).render();
writeFileSync(new URL('app-icon.png', out), icon.asPng());
console.log('icons written');
