import { useEffect, useRef, useState } from 'react';
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
  const savedPace = Math.min(120, Math.max(85, config?.voice.pace_percent ?? 100));
  const [pace, setPace] = useState(savedPace);
  const committedPace = useRef(savedPace);
  const downloading = downloads.voices;
  useEffect(() => {
    // Again when the voices finish downloading.
    if (downloading === undefined) void c.host.listVoices().then(setVoices);
  }, [c, downloading]);
  useEffect(() => {
    setPace(savedPace);
    committedPace.current = savedPace;
  }, [savedPace]);
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
  const commitPace = (next: number) => {
    setPace(next);
    if (committedPace.current === next) return;
    committedPace.current = next;
    void save({
      ...config,
      voice: { ...config.voice, pace_percent: next },
    }).then(() => {
      if (ready && chosen) void c.host.previewVoice(chosen);
    });
  };

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
        <div className="voice-speed">
          <label htmlFor="voice-speed">
            <span>Speaking speed</span>
            <output htmlFor="voice-speed">{pace}%</output>
          </label>
          <input
            id="voice-speed"
            type="range"
            min="85"
            max="120"
            step="5"
            value={pace}
            aria-valuetext={`${pace}% of the tuned pace`}
            onChange={(event) => setPace(Number(event.currentTarget.value))}
            onPointerUp={(event) => commitPace(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitPace(Number(event.currentTarget.value))}
            onBlur={(event) => commitPace(Number(event.currentTarget.value))}
          />
          <div className="voice-speed-labels quiet" aria-hidden="true">
            <span>Slower</span>
            <span>Faster</span>
          </div>
        </div>
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
