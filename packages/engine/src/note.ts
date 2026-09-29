import type { Call, PlanSource } from './types.ts';

const AGENT_NAMES: Record<PlanSource, string> = {
  'claude-code': 'Claude Code',
  copilot: 'Copilot',
  cursor: 'Cursor',
  codex: 'Codex',
  pasted: 'your agent',
  file: 'your agent',
};

export function agentName(source: PlanSource): string {
  return AGENT_NAMES[source];
}

/**
 * Builds the note the developer pastes back to their agent. Only calls the
 * developer made are listed; everything else stays as the plan wrote it.
 */
export function composeNote(calls: Call[]): string {
  const made = calls.filter((c) => c.outcome);
  const changes = made.filter((c) => c.outcome?.verdict !== 'keep');

  if (made.length === 0 || changes.length === 0) {
    return 'Go ahead with the plan as written.';
  }

  const lines = made.map((c) => {
    const o = c.outcome!;
    if (o.verdict === 'keep') return `- Keep: ${sentence(c.planChoice)}`;
    if (o.verdict === 'drop') return `- Drop: ${sentence(c.title)}`;
    return `- ${sentence(c.title)} Instead: ${sentence(o.detail)}`;
  });

  return [
    'Revise the plan before building:',
    ...lines,
    'Everything else stays as planned.',
  ].join('\n');
}

/** What Frank says once the note is copied, naming the agent the plan came from. */
export function copiedMessage(source: PlanSource): string {
  return `Note copied. Paste it into ${agentName(source)}.`;
}

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  const capped = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}
