'use strict';

// Local-first storage. Decisions are plain Markdown + YAML frontmatter under
// .duck/decisions/. Human-readable, greppable, diffable, survives without the
// app. We only parse/emit the small YAML subset we ourselves write.

const fs = require('fs');
const path = require('path');

function duckDir(baseDir) {
  return path.join(baseDir || process.cwd(), '.duck');
}
function decisionsDir(baseDir) {
  return path.join(duckDir(baseDir), 'decisions');
}

function ensureDirs(baseDir) {
  fs.mkdirSync(decisionsDir(baseDir), { recursive: true });
}

function slugify(text) {
  return (text || 'decision')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'decision';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- tiny YAML (subset) -----------------------------------------------------

function emitYaml(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  return lines.join('\n');
}

function yamlScalar(v) {
  const s = String(v);
  return /[:#]/.test(s) ? JSON.stringify(s) : s;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  let currentKey = null;
  for (const line of m[1].split('\n')) {
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      meta[currentKey].push(unquote(listItem[1]));
      continue;
    }
    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      if (kv[2] === '') meta[currentKey] = [];
      else {
        meta[currentKey] = unquote(kv[2]);
        currentKey = null;
      }
    }
  }
  return { meta, body: m[2] };
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try { return JSON.parse(t); } catch { return t.slice(1, -1); }
  }
  return t;
}

// --- records ----------------------------------------------------------------

function renderRecord(rec) {
  const meta = {
    id: rec.id,
    created: rec.created,
    status: rec.status,
    decision: rec.decision,
    options_considered: rec.options_considered || [],
    reconsider_if: rec.reconsider_if || [],
    review_on: rec.review_on,
    review_trigger: rec.review_trigger || 'time',
    dial_used: rec.dial_used || 'socratic',
    model_used: rec.model_used || 'none (no-brain heuristic)',
  };
  return (
    `---\n${emitYaml(meta)}\n---\n\n` +
    `## Why (your words, captured at commit)\n> ${rec.why || ''}\n\n` +
    `## Retro log\n${rec.retro || '<!-- appended by `duck retro` -->'}\n`
  );
}

function writeRecord(baseDir, rec) {
  ensureDirs(baseDir);
  const file = path.join(decisionsDir(baseDir), `${rec.id}.md`);
  fs.writeFileSync(file, renderRecord(rec));
  return file;
}

function listRecords(baseDir) {
  const dir = decisionsDir(baseDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const full = path.join(dir, f);
      const { meta, body } = parseFrontmatter(fs.readFileSync(full, 'utf8'));
      return { file: full, meta, body };
    });
}

function newId(topic) {
  return `${today()}-${slugify(topic)}`;
}

module.exports = {
  duckDir,
  decisionsDir,
  ensureDirs,
  slugify,
  today,
  addDays,
  parseFrontmatter,
  renderRecord,
  writeRecord,
  listRecords,
  newId,
};
