import { useEffect, useState } from 'react';
import type { Config, TalkBack, VoiceChoice } from '../host.ts';
import { BrainList } from './BrainList.tsx';
import { HotkeyRecorder } from './HotkeyRecorder.tsx';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

const WINDOWS = [15, 30, 60, 120, 240];
/** The natural-voice pack, roughly (packs.rs). */
const NATURAL_MB = 212;

/** Brain, hotkey, sticky mode, how far back to look for plans, and trusted projects. */
export function Settings() {
  const c = useController();
  const { config, downloads } = usePanel();
  const [draft, setDraft] = useState<Config | undefined>(config);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const downloadingVoices = downloads.voices;
  useEffect(() => {
    // Again when the natural voices finish downloading.
    if (downloadingVoices === undefined) void c.host.listVoices().then(setVoices);
  }, [c, downloadingVoices]);

  useEffect(() => setDraft(config), [config]);
  useEffect(() => {
    void c.host.hotkeyStatus().then(setHotkeyError);
  }, [c]);
  if (!draft) return null;
  const natural = voices.filter((v) => v.kind === 'natural');
  const system = voices.filter((v) => v.kind === 'system');
  const naturalReady = natural.some((v) => v.installed);
  // What speaks when nothing is chosen: the first natural voice once
  // they're downloaded, else the best macOS voice.
  const fallback = naturalReady ? natural[0] : system[0];
  const chosen = draft.voice?.name || fallback?.id || '';
  const setVoice = (name: string) =>
    void save({ ...draft, voice: { ...draft.voice, name } });

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
        <fieldset className="voice-picker">
          <legend>His voice</legend>
          {natural.map((v) => (
            <div key={v.id} className="voice-row">
              <label>
                <input
                  type="radio"
                  name="voice"
                  value={v.id}
                  disabled={!v.installed}
                  checked={chosen === v.id}
                  onChange={() => setVoice(v.id)}
                />
                <span>{v.name}</span>
                <span className="quiet">{v.description}</span>
              </label>
              {v.installed && (
                <button
                  className="text-button"
                  onClick={() => void c.host.previewVoice(v.id)}
                >
                  Listen
                </button>
              )}
            </div>
          ))}
          {!naturalReady &&
            (downloadingVoices === undefined ? (
              <div className="voice-download">
                <p className="quiet">
                  Natural voices run on this Mac, and sound like a person, not a screen
                  reader. They're a one-time download.
                </p>
                <button className="button" onClick={() => void c.downloadPack('voices')}>
                  Download natural voices, {NATURAL_MB} MB
                </button>
              </div>
            ) : (
              <p className="voice-download quiet" role="status">
                Downloading natural voices, {Math.round(downloadingVoices * 100)}%
                <span
                  className="download-bar"
                  style={{ width: `${downloadingVoices * 100}%` }}
                />
              </p>
            ))}
          <div className="voice-row">
            <label>
              <input
                type="radio"
                name="voice"
                checked={chosen.startsWith('system:')}
                disabled={system.length === 0}
                onChange={() => setVoice(system[0]?.id ?? '')}
              />
              <span>A macOS voice</span>
            </label>
            <select
              aria-label="macOS voice"
              value={chosen.startsWith('system:') ? chosen : ''}
              onChange={(e) => setVoice(e.target.value)}
            >
              {!chosen.startsWith('system:') && <option value="">Choose</option>}
              {system.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {chosen.startsWith('system:') && (
              <button
                className="text-button"
                onClick={() => void c.host.previewVoice(chosen)}
              >
                Listen
              </button>
            )}
          </div>
        </fieldset>
        <p className="quiet">
          Hold the hotkey, or Space in the panel, to talk. Tap Space, or the microphone,
          to talk freely: Frank hears when you've finished, and listens again after he
          answers. Speech is turned into text on this Mac; audio is never saved or sent.
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
