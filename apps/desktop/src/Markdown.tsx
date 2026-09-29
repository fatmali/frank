/**
 * Renders the small slice of Markdown Frank writes: paragraphs, lists,
 * `code`, **bold**, fenced code and comparison tables. Builds elements
 * directly; brain output never becomes HTML.
 */
import type { ReactNode } from 'react';

export function Markdown({ text }: { text: string }) {
  return <>{blocks(text)}</>;
}

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```'))
        code.push(lines[i++]!);
      i++;
      out.push(
        <pre key={out.length} className="md-code">
          {code.join('\n')}
        </pre>,
      );
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(lines[i++]!);
      out.push(<Compare key={out.length} rows={rows} />);
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i]!)) {
        items.push(lines[i++]!.replace(/^\s*([-*]|\d+[.)])\s+/, ''));
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={out.length} className="md-list">
          {items.map((it, n) => (
            <li key={n}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^\s*(\||```|[-*]\s|\d+[.)]\s)/.test(lines[i]!)
    ) {
      para.push(lines[i++]!.trim());
    }
    out.push(<p key={out.length}>{inline(para.join(' '))}</p>);
  }
  return out;
}

/** One line of brain text with its `code` and **bold**, and nothing else. */
export function Inline({ text }: { text: string }) {
  return <>{inline(text)}</>;
}

/** A comparison table: 2–3 options across 3–4 dimensions (ux.md §7, Compare). */
function Compare({ rows }: { rows: string[] }) {
  const cells = rows
    .map((r) =>
      r
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    )
    .filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  const [head, ...body] = cells;
  if (!head) return null;
  return (
    <table className="compare">
      <thead>
        <tr>
          {head.map((c, n) => (
            <th key={n} scope="col">
              {inline(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((r, n) => (
          <tr key={n}>
            {r.map((c, m) =>
              m === 0 ? (
                <th key={m} scope="row">
                  {inline(c)}
                </th>
              ) : (
                <td key={m}>{inline(c)}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<code key={m.index}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={m.index}>{m[2]}</strong>);
    else out.push(<em key={m.index}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
