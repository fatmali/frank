import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { BrainRequest, Plan } from '@frank/engine';
import {
  BrainFailure,
  channel,
  type BrainKind,
  type BrainOption,
  type Config,
  type Detection,
  type FailureKind,
  type Gathered,
  type Host,
  type VoiceEvent,
} from './host.ts';
import type { Mood } from './duck.ts';

let nextStream = 1;

/** The panel's link to the app shell (src-tauri). */
export const tauriHost: Host = {
  getConfig: () => invoke<Config>('get_config'),
  saveConfig: (config) => invoke<Config>('save_config', { config }),
  detectBrains: () => invoke<BrainOption[]>('detect_brains'),
  brainStatus: () => invoke<Detection>('brain_status'),
  saveApiKey: (kind: BrainKind, key: string) => invoke('save_api_key', { kind, key }),

  stream(request: BrainRequest, signal?: AbortSignal) {
    const id = nextStream++;
    const out = channel<string>();
    const onChunk = new Channel<string>();
    onChunk.onmessage = (text) => out.push(text);
    const cancel = () => void invoke('brain_cancel', { id });
    signal?.addEventListener('abort', cancel, { once: true });
    invoke('brain_stream', { id, request, onChunk })
      .then(() => out.end())
      .catch((err: { kind?: FailureKind; message?: string }) =>
        out.fail(
          new BrainFailure(
            err?.kind ?? 'failed',
            err?.message ?? (err?.kind === 'cancelled' ? 'Cancelled.' : String(err)),
          ),
        ),
      )
      .finally(() => signal?.removeEventListener('abort', cancel));
    return out.iterable;
  },

  recentPlans: () => invoke<Plan[]>('recent_plans'),
  readPlanFile: (path) => invoke<Plan>('read_plan_file', { path }),
  gatherContext: (plan) => invoke<Gathered>('gather_context', { plan }),
  trustProject: (root) => invoke('trust_project', { root }),
  hotkeyStatus: () => invoke<string | null>('hotkey_status'),
  setHotkey: (hotkey) => invoke('set_hotkey', { hotkey }),
  setSticky: (enabled) => invoke('set_sticky', { enabled }),
  setMood: (mood: Mood) => invoke('set_mood', { mood }),
  setPinned: (pinned) => invoke('set_panel_pinned', { pinned }),
  hidePanel: () => invoke('hide_panel'),
  copy: (text) => writeText(text),
  openUrl: (url) => openUrl(url),
  fitHeight: (height) =>
    getCurrentWindow().setSize(new LogicalSize(480, Math.ceil(height))),
  onShown(handler) {
    void listen('panel-shown', handler);
  },
  onOpenSettings(handler) {
    void listen('open-settings', handler);
  },
  voiceStart: () => invoke('voice_start'),
  voiceStop: () => invoke('voice_stop'),
  downloadVoiceModel: () => invoke('voice_download_model'),
  speak: (text) => invoke('speak', { text }),
  stopSpeaking: () => invoke('stop_speaking'),
  onVoice(handler) {
    void listen<VoiceEvent>('voice', (e) => handler(e.payload));
  },
  onFileDrop(handler) {
    void getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') handler(event.payload.paths);
    });
  },
};
