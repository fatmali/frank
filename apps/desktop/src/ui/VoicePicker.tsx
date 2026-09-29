import { useEffect, useRef, useState } from 'react';
import { DuckMark } from '../DuckMark.tsx';
import { voiceMode, type Config, type VoiceChoice, type VoiceMode } from '../host.ts';
import { useController, usePanel } from './store.ts';

/**
 * How Frank works with you, and how he sounds: voice first or chat, with a
 * pace control for his one canonical voice.
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

  const voice = voices[0];
  const ready = voice?.installed ?? false;
  const mode = voiceMode(config);
  const megabytes = packs?.voices.megabytes || 212;

  const save = async (next: Config) => {
    await c.host.saveConfig(next);
    await c.reloadConfig();
  };
  const setMode = (m: VoiceMode) =>
    void save({ ...config, voice: { ...config.voice, mode: m } });
  const commitPace = (next: number) => {
    setPace(next);
    if (committedPace.current === next) return;
    committedPace.current = next;
    void save({
      ...config,
      voice: { ...config.voice, pace_percent: next },
    }).then(() => {
      if (ready && voice) void c.host.previewVoice(voice.id);
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
        {voice && (
          <div className="voice-identity">
            <DuckMark size={26} className="duck" />
            <strong>{voice.name}</strong>
            <small>{voice.description}</small>
            <button
              type="button"
              className="text-button"
              disabled={!voice.installed}
              onClick={() => void c.host.previewVoice(voice.id)}
            >
              Hear Frank
            </button>
          </div>
        )}
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
                Frank's voice runs on this Mac and sounds like a person, not a screen
                reader. It's a one-time download.
              </p>
              <button className="button" onClick={() => void c.downloadPack('voices')}>
                Download his voice, {megabytes} MB
              </button>
            </div>
          ) : (
            <p className="voice-download quiet" role="status">
              Downloading his voice, {Math.round(downloading * 100)}%
              <span
                className="download-bar"
                style={{ transform: `scaleX(${downloading})` }}
              />
            </p>
          ))}
      </fieldset>
    </>
  );
}
