import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('ships the design contract and a single page heading', () => {
  assert.match(html, /THESIS:/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
});

test('keeps the primary experience and actions accessible', () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="run-pass" type="button"/);
  assert.match(css, /prefers-reduced-motion/);
});

test('links only to truthful current install and source destinations', () => {
  assert.match(html, /github\.com\/fatmali\/frank\/actions\/workflows\/ci\.yml/);
  assert.match(html, /github\.com\/fatmali\/frank/);
  assert.doesNotMatch(html, /releases\/latest/);
});
