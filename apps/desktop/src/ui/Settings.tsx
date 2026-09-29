import { useEffect, useState } from 'react';
import type { Config, SystemVoice, TalkBack } from '../host.ts';
import { BrainList } from './BrainList.tsx';
import { HotkeyRecorder } from './HotkeyRecorder.tsx';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

const WINDOWS = [15, 30, 60, 120, 240];

/** Brain, hotkey, sticky mode, how far back to look for plans, and trusted projects. */
export function Settings() {
  const c = useController();
  const { config } = usePanel();
  const [draft, setDraft] = useState<Config | undefined>(config);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SystemVoice[]>([]);
  useEffect(() => {
    void c.host.listVoices().then(setVoices);
  }, [c]);

  useEffect(() => setDraft(config), [config]);
  useEffect(() => {
    void c.host.hotkeyStatus().then(setHotkeyError);
  }, [c]);
  if (!draft) return null;
  const best = voices[0];

  const save = async (next: Config) => {
    setDraft(next);
    await c.host.saveConfig(next);
    await c.reloadConfig();
  };
  const kind = draft.brain.kind;
  const needsUrl = kind === 'openai-compatible' || kind === 'ollama';

  return (
    <section className="settings" aria-label="Settings">
      <header className="settings-head">
        <h1>Settings</h1>
        <button className="text-button" onClick={() => c.closeSettings()}>
          Done <Kbd>esc</Kbd>
        </button>
      </header>

      <section>
        <h2>Brain</h2>
        <BrainList />
        <div className="fields">
          <label>
            <span>Model</span>
            <input
              value={draft.brain.model ?? ''}
              placeholder="The brain's default"
              onChange={(e) =>
                setDraft({ ...draft, brain: { ...draft.brain, model: e.target.value } })
              }
              onBlur={() => void save(draft)}
            />
          </label>
          {needsUrl && (
            <label>
              <span>Base URL</span>
              <input
                value={draft.brain.base_url ?? ''}
                placeholder={
                  kind === 'ollama'
                    ? 'http://127.0.0.1:11434'
                    : 'http://localhost:1234/v1'
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    brain: { ...draft.brain, base_url: e.target.value },
                  })
                }
                onBlur={() => void save(draft)}
              />
            </label>
          )}
        </div>
      </section>

      <section>
        <h2>Hotkey</h2>
        <HotkeyRecorder
          value={draft.hotkey}
          error={hotkeyError}
          onChange={(hotkey) =>
            void c.host
              .setHotkey(hotkey)
              .then(() => {
                setHotkeyError(null);
                return c.reloadConfig();
              })
              .catch((err: unknown) => setHotkeyError(String(err)))
          }
        />
      </section>

      <section>
        <h2>Sticky Frank</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.sticky.enabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setDraft({ ...draft, sticky: { ...draft.sticky, enabled } });
              void c.host.setSticky(enabled).then(() => c.reloadConfig());
            }}
          />
          Keep Frank on screen, on top of other windows. Click him to open the panel.
        </label>
      </section>

      <section>
        <h2>Voice</h2>
        <label className="inline-field">
          Frank talks back
          <select
            value={draft.voice?.talk_back ?? 'when-spoken'}
            onChange={(e) =>
              void save({
                ...draft,
                voice: { ...draft.voice, talk_back: e.target.value as TalkBack },
              })
            }
          >
            <option value="when-spoken">when I talk to him</option>
            <option value="always">always</option>
            <option value="never">never</option>
          </select>
        </label>
        <div className="inline-field">
          <label htmlFor="voice-name">His voice</label>
          <select
            id="voice-name"
            value={draft.voice?.name ?? ''}
            onChange={(e) =>
              void save({ ...draft, voice: { ...draft.voice, name: e.target.value } })
            }
          >
            <option value="">
              {best ? `Best installed: ${best.name}` : 'The system voice'}
            </option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            disabled={!draft.voice?.name && !best}
            onClick={() =>
              void c.host.previewVoice(draft.voice?.name || best?.name || '')
            }
          >
            Listen
          </button>
        </div>
        {!voices.some((v) => v.quality !== 'standard') && (
          <p className="quiet">
            macOS has natural-sounding voices as a free download: System Settings,
            Accessibility, Spoken Content, System voice, Manage Voices. Pick an English
            voice marked Premium, then choose it here.
          </p>
        )}
        <p className="quiet">
          Hold the hotkey, or Space in the panel, to talk. Speech is turned into text on
          this Mac; audio is never saved or sent.
        </p>
      </section>

      <section>
        <h2>Plans</h2>
        <label className="inline-field">
          Look for plans written in the last
          <select
            value={draft.plans.window_minutes}
            onChange={(e) =>
              void save({ ...draft, plans: { window_minutes: Number(e.target.value) } })
            }
          >
            {WINDOWS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>Projects Frank doesn't ask about</h2>
        {draft.context.trusted_projects.length ? (
          <ul className="trusted">
            {draft.context.trusted_projects.map((p) => (
              <li key={p}>
                <code>{p}</code>
                <button
                  className="text-button"
                  onClick={() =>
                    void save({
                      ...draft,
                      context: {
                        ...draft.context,
                        trusted_projects: draft.context.trusted_projects.filter(
                          (x) => x !== p,
                        ),
                      },
                    })
                  }
                >
                  Ask again
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="quiet">
            None. Frank shows the files he'll read the first time he works on a project.
          </p>
        )}
      </section>
    </section>
  );
}
