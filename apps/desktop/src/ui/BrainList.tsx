import { useEffect, useState } from 'react';
import type { BrainKind, BrainOption } from '../host.ts';
import { Markdown } from '../Markdown.tsx';
import { useController } from './store.ts';

const API_KINDS: BrainKind[] = ['anthropic', 'openai', 'openai-compatible'];
const INSTALL: Partial<Record<BrainKind, string>> = {
  'claude-code': 'https://claude.com/claude-code',
  copilot: 'https://github.com/features/copilot/cli',
  ollama: 'https://ollama.com/download',
};

type Check =
  | { kind: BrainKind; state: 'checking' }
  | { kind: BrainKind; state: 'ready' }
  | { kind: BrainKind; state: 'failed'; message: string };

/**
 * The brains Frank found, each with its status. Choosing one saves it and
 * runs a tiny test request, then shows "Ready" or the exact fix (ux.md §5.1).
 */
export function BrainList({ onReady }: { onReady?: (kind: BrainKind) => void }) {
  const c = useController();
  const [options, setOptions] = useState<BrainOption[] | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [keyFor, setKeyFor] = useState<BrainKind | null>(null);
  const [key, setKey] = useState('');
  const current = c.getSnapshot().config?.brain.kind;

  const detect = () => {
    setOptions(null);
    void c.host.detectBrains().then(setOptions);
  };
  useEffect(detect, [c]);

  const use = async (kind: BrainKind) => {
    const config = await c.host.getConfig();
    await c.host.saveConfig({ ...config, brain: { ...config.brain, kind } });
    await c.reloadConfig();
    setCheck({ kind, state: 'checking' });
    const result = await c.testBrain();
    if (result.ok) {
      setCheck({ kind, state: 'ready' });
      onReady?.(kind);
    } else {
      setCheck({ kind, state: 'failed', message: result.message });
    }
  };

  const saveKey = async (kind: BrainKind) => {
    await c.host.saveApiKey(kind, key);
    setKey('');
    setKeyFor(null);
    detect();
  };

  if (!options) return <p className="quiet">Looking for brains on this Mac</p>;

  return (
    <ul className="brain-list">
      {options.map((o) => {
        const mine = check?.kind === o.kind ? check : null;
        const status =
          mine?.state === 'checking'
            ? 'Checking'
            : mine?.state === 'ready'
              ? 'Ready'
              : o.status === 'ready'
                ? o.keyFrom
                  ? o.keyFrom === 'keychain'
                    ? 'key saved'
                    : `key in ${o.keyFrom}`
                  : 'found'
                : o.status === 'signed-out'
                  ? 'signed out'
                  : o.status === 'not-running'
                    ? 'not running'
                    : API_KINDS.includes(o.kind)
                      ? 'no key yet'
                      : 'not installed';
        // API brains without a key say so in the status and the Add key button.
        const fix =
          mine?.state === 'failed'
            ? mine.message
            : o.status !== 'ready' && !API_KINDS.includes(o.kind)
              ? o.fix
              : null;
        return (
          <li key={o.kind} className={o.kind === current ? 'brain current' : 'brain'}>
            <span className="brain-name">{o.label}</span>
            <span
              className={mine?.state === 'ready' ? 'brain-status ok' : 'brain-status'}
            >
              {status}
            </span>
            <span className="brain-action">
              {o.status === 'ready' ? (
                <button
                  className="button"
                  disabled={mine?.state === 'checking'}
                  onClick={() => void use(o.kind)}
                >
                  {o.kind === current && mine?.state !== 'failed' ? 'In use' : 'Use this'}
                </button>
              ) : API_KINDS.includes(o.kind) ? (
                <button
                  className="button"
                  onClick={() => setKeyFor(keyFor === o.kind ? null : o.kind)}
                >
                  Add key
                </button>
              ) : INSTALL[o.kind] && o.status === 'missing' ? (
                <button
                  className="text-button"
                  onClick={() => void c.host.openUrl(INSTALL[o.kind]!)}
                >
                  How to install
                </button>
              ) : (
                <button className="text-button" onClick={detect}>
                  Retry
                </button>
              )}
            </span>
            {keyFor === o.kind && (
              <form
                className="key-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveKey(o.kind);
                }}
              >
                <input
                  type="password"
                  autoFocus
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Paste the key. It's kept in your keychain."
                  aria-label={`${o.label} key`}
                />
                <button className="button" disabled={!key.trim()}>
                  Save
                </button>
              </form>
            )}
            {fix && (
              <div className="brain-fix">
                <Markdown text={fix} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
