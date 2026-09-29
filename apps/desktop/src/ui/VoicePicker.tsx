import { useEffect, useState } from 'react';
import { voiceMode, type Config, type VoiceChoice, type VoiceMode } from '../host.ts';
import { useController, usePanel } from './store.ts';

/**
 * How Frank works with you, and how he sounds: voice first or chat, and
 * which of his voices. Choosing a voice says a line in it. In Settings, and
 * in the panel (the voice button).
 */
export function VoicePicker() {
  const c = useController();
  const { config, downloads, packs } = usePanel();
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const downloading = downloads.voices;
  useEffect(() => {
    // Again when the voices finish downloading.
    if (downloading === undefined) void c.host.listVoices().then(setVoices);
  }, [c, downloading]);
  if (!config) return null;

  const ready = voices.some((v) => v.installed);
  // Anything unknown, like a macOS voice from before, is his own voice.
  const saved = config.voice?.name ?? '';
  const chosen = voices.some((v) => v.id === saved) ? saved : (voices[0]?.id ?? '');
  const mode = voiceMode(config);
  const megabytes = packs?.voices.megabytes || 212;

  const save = async (next: Config) => {
    await c.host.saveConfig(next);
    await c.reloadConfig();
  };
  const setMode = (m: VoiceMode) =>
    void save({ ...config, voice: { ...config.voice, mode: m } });
  const setVoice = (name: string) =>
    void save({ ...config, voice: { ...config.voice, name } }).then(() => {
      void c.host.previewVoice(name);
    });

  return (
    <>
      <fieldset className="mode-picker">
        <legend>Frank</legend>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'voice'}
            onChange={() => setMode('voice')}
          />
          <span>Talks you through plans</span>
          <span className="quiet">voice first</span>
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'chat'}
            onChange={() => setMode('chat')}
          />
          <span>Stays in the panel</span>
          <span className="quiet">chat; he talks only when you do</span>
        </label>
      </fieldset>
      <fieldset className="voice-picker">
        <legend>His voice</legend>
        {voices.map((v) => (
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
        {!ready &&
          (downloading === undefined ? (
            <div className="voice-download">
              <p className="quiet">
                Frank's voices run on this Mac and sound like a person, not a screen
                reader. They're a one-time download.
              </p>
              <button className="button" onClick={() => void c.downloadPack('voices')}>
                Download his voice, {megabytes} MB
              </button>
            </div>
          ) : (
            <p className="voice-download quiet" role="status">
              Downloading his voice, {Math.round(downloading * 100)}%
              <span className="download-bar" style={{ width: `${downloading * 100}%` }} />
            </p>
          ))}
      </fieldset>
    </>
  );
}
