'use strict';

// The "no-brain" conductor's senses. No LLM, no network, no API key.
// These detectors are deliberately shallow — the point of the MVP is to test
// whether STRUCTURE (not intelligence) forces ownership. A real model adapter
// would replace these with far sharper judgment behind the same interface.

// Fear / avoidance language: talk about what you'd lose or dread, not merits.
const FEAR = [
  'afraid', 'scared', 'scary', 'worry', 'worried', 'nervous', 'anxious',
  'fear', 'dread', 'guilty', 'guilt', 'regret', 'what if', "don't want",
  'dont want', "can't face", 'cant face', 'forever', 'rot', 'stuck',
  'lose', 'losing', 'miss out', 'fomo', 'never',
];

// Expectation language: a "should" is usually someone else's voice.
const EXPECTATION = ['should', 'supposed to', 'have to', 'ought', 'expected', 'must'];

// Vague virtue words people hide behind instead of naming the trade-off.
const VIRTUE = [
  'cleaner', 'clean', 'nicer', 'nice', 'simpler', 'simple', 'better',
  'proper', 'right way', 'elegant', 'faster', 'safer', 'robust', 'scalable',
];

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'but', 'i', 'im', "i'm", 'it',
  'is', 'in', 'on', 'for', 'that', 'this', 'be', 'do', 'if', 'so', 'my', 'me',
  'we', 'you', 'its', "it's", 'at', 'as', 'was', 'are', 'with', 'just', 'not',
]);

function lower(text) {
  return (text || '').toLowerCase();
}

function findAny(text, list) {
  const t = lower(text);
  return list.filter((w) => t.includes(w));
}

function detectFear(text) {
  return findAny(text, FEAR);
}

function detectExpectation(text) {
  return findAny(text, EXPECTATION);
}

function detectVirtue(text) {
  return findAny(text, VIRTUE);
}

function tokens(text) {
  return new Set(
    lower(text)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Are we going in circles? High overlap with something already said.
function isCircling(text, history, threshold = 0.5) {
  const t = tokens(text);
  return history.some((h) => jaccard(t, tokens(h)) >= threshold);
}

// Pull candidate options out of a line like "1) ship  2) refactor  3) both"
// or "ship it or refactor now". Shallow on purpose.
function parseOptions(text) {
  const t = (text || '').trim();
  let parts;
  if (/\d\s*[).:]/.test(t)) {
    parts = t.split(/\s*\d+\s*[).:]\s*/).map((s) => s.trim()).filter(Boolean);
  } else if (/\bor\b/.test(t)) {
    parts = t.split(/\s*,?\s*\bor\b\s*/i);
  } else {
    parts = t.split(/\s*[;,]\s*/);
  }
  return parts.map((s) => s.replace(/[.,;]+$/, '').trim()).filter((s) => s.length > 1);
}

// Try to match what the user said they're choosing to a known option.
function matchOption(text, options) {
  const t = lower(text);
  // "option 2" / "the second one" style
  const num = t.match(/\b(?:option\s*)?(\d+)\b/);
  if (num) {
    const idx = parseInt(num[1], 10) - 1;
    if (options[idx]) return options[idx];
  }
  let best = null;
  let bestScore = 0;
  for (const opt of options) {
    const score = jaccard(tokens(text), tokens(opt));
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  return bestScore >= 0.2 ? best : null;
}

module.exports = {
  detectFear,
  detectExpectation,
  detectVirtue,
  tokens,
  jaccard,
  isCircling,
  parseOptions,
  matchOption,
};
