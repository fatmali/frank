import { useEffect, useState } from 'react';
import type { Config, TalkBack, VoiceChoice } from '../host.ts';
import { useController, usePanel } from './store.ts';

/** The natural-voice pack, roughly (packs.rs). */
const NATURAL_MB = 212;

/**
 * Frank's voice: when he talks back, and which voice he uses. Natural voices
 * first, with their one-time download, then the macOS voices. Choosing a
 * voice says a line in it. In Settings, and in the panel (the voice button).
 */
export function VoicePicker() {
  const c = useController();
  const { config, downloads } = usePanel();
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const downloadingVoices = downloads.voices;
  useEffect(() => {
    // Again when the natural voices finish downloading.
    if (downloadingVoices === undefined) void c.host.listVoices().then(setVoices);
  }, [c, downloadingVoices]);
  if (!config) return null;
  const draft = config;

  const natural = voices.filter((v) => v.kind === 'natural');
  const system = voices.filter((v) => v.kind === 'system');
  const naturalReady = natural.some((v) => v.installed);
  // What speaks when nothing is chosen: the first natural voice once
  // they're downloaded, else the best macOS voice.
  const fallback = naturalReady ? natural[0] : system[0];
  const chosen = draft.voice?.name || fallback?.id || '';

  const save = async (next: Config) => {
    await c.host.saveConfig(next);
    await c.reloadConfig();
  };
  const setVoice = (name: string) =>
    void save({ ...draft, voice: { ...draft.voice, name } }).then(() => {
      if (name) void c.host.previewVoice(name);
    });

  return (
    <>
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
    </>
  );
}
