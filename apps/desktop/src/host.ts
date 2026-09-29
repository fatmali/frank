/**
 * Everything the panel needs from outside the webview. The app uses the Tauri
 * host; `pnpm demo` and the tests use the demo host (see demo.ts).
 */
import type { Brain, BrainRequest, FileContext, Plan, RepoSummary } from '@frank/engine';
import type { Mood } from './duck.ts';

export type Detection =
  | { status: 'ready' }
  | { status: 'signed-out'; fix: string }
  | { status: 'missing'; fix: string }
  | { status: 'not-running'; fix: string };

export type BrainKind =
  'claude-code' | 'copilot' | 'anthropic' | 'openai' | 'openai-compatible' | 'ollama';

export type BrainOption = Detection & {
  kind: BrainKind;
  label: string;
  /** "keychain" or the environment variable the key came from. */
  keyFrom?: string;
};

/** Mirrors `frank_core::config::Config` (snake_case, as in config.toml). */
export interface Config {
  brain: { kind: BrainKind | ''; model?: string; base_url?: string };
  hotkey: string;
  sticky: { enabled: boolean; position?: [number, number] };
  plans: { window_minutes: number };
  context: { max_file_kb: number; trusted_projects: string[] };
  /**
   * `mode`: voice (Frank talks you through plans, the default) or chat.
   * Empty in older configs: see `voiceMode`. `name`: `natural:<id>`; empty
   * is Frank's own voice. `pace_percent` is relative to that voice's tuned
   * baseline; 100 is the default.
   */
  voice: {
    mode?: VoiceMode | '';
    talk_back?: TalkBack;
    name?: string;
    pace_percent?: number;
  };
}

/** A voice Frank can speak with. They run on this Mac once the voice pack is downloaded. */
export interface VoiceChoice {
  /** What goes in `config.voice.name`: `natural:am_michael`. */
  id: string;
  name: string;
  description: string;
  installed: boolean;
}

/** Voice first (Frank talks you through the plan), or chat (the panel, typed). */
export type VoiceMode = 'voice' | 'chat';

/** The mode a config means, old or new (ux.md §6). */
export function voiceMode(config: Config | undefined): VoiceMode {
  const v = config?.voice;
  if (v?.mode === 'voice' || v?.mode === 'chat') return v.mode;
  return v?.talk_back === 'never' ? 'chat' : 'voice';
}

export type PackStatus = Record<Pack, { installed: boolean; megabytes: number }>;

/** How long a quiet ends the developer's turn, by what Frank asked. */
export type Patience = 'short' | 'normal' | 'long' | 'hold';

/** The models behind voice, each downloaded once, with consent. */
export type Pack = 'listening' | 'voices';

/** Hands-free: waiting for you, hearing you, checking you've finished, or paused while Frank answers. */
export type HandsFree = 'waiting' | 'hearing' | 'checking' | 'paused';

/** Before voice modes: when Frank spoke his replies. `never` means chat. */
export type TalkBack = 'when-spoken' | 'always' | 'never';

/** What the microphone side of the app reports (ux.md §6.3). */
export type VoiceEvent =
  | { type: 'listening' }
  /** Input level, 0 to 1, about 20 times a second while listening. */
  | { type: 'level'; level: number }
  | { type: 'transcribing' }
  | { type: 'heard'; text: string }
  | { type: 'failed'; message: string }
  /** A pack has to be downloaded first; nothing was recorded. */
  | { type: 'needs-pack'; pack: Pack; megabytes: number }
  | { type: 'downloading'; pack: Pack; fraction: number }
  | { type: 'pack-ready'; pack: Pack }
  /** A sentence started playing; `id` is what it's about ("call:2"). */
  | { type: 'speaking'; id: string }
  /** Frank finished (or stopped) speaking. */
  | { type: 'spoken' }
  | { type: 'hands-free'; state: HandsFree | 'off' };

export interface Gathered {
  files: FileContext[];
  skipped: { path: string; reason: string }[];
  repo?: RepoSummary;
  root?: string;
  trusted: boolean;
}

export type FailureKind = 'not-ready' | 'failed' | 'cancelled';

/** A brain error with its kind, so the panel can offer the right fix. */
export class BrainFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
  }
}

export interface Host {
  getConfig(): Promise<Config>;
  saveConfig(config: Config): Promise<Config>;
  detectBrains(): Promise<BrainOption[]>;
  brainStatus(): Promise<Detection>;
  saveApiKey(kind: BrainKind, key: string): Promise<void>;
  stream(request: BrainRequest, signal?: AbortSignal): AsyncIterable<string>;
  recentPlans(): Promise<Plan[]>;
  /** Every plan from the last two weeks, for the plans home. */
  planHistory(): Promise<Plan[]>;
  readPlanFile(path: string): Promise<Plan>;
  gatherContext(plan: Plan): Promise<Gathered>;
  trustProject(root: string): Promise<void>;
  hotkeyStatus(): Promise<string | null>;
  setHotkey(hotkey: string): Promise<void>;
  setSticky(enabled: boolean): Promise<void>;
  setMood(mood: Mood): Promise<void>;
  setPinned(pinned: boolean): Promise<void>;
  hidePanel(): Promise<void>;
  copy(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  /** Grows or shrinks the panel window to fit its content. */
  fitHeight(height: number): Promise<void>;
  onShown(handler: () => void): void;
  onOpenSettings(handler: () => void): void;
  onFileDrop(handler: (paths: string[]) => void): void;
  /** Starts listening (holding Space in the panel). The hotkey does this itself. */
  voiceStart(): Promise<void>;
  /** Stops listening and transcribes; the words arrive as a "heard" event. */
  voiceStop(): Promise<void>;
  /**
   * Hands-free: Frank listens, and hears for himself when you've finished.
   * `patience`: how long a quiet ends your turn (a walk-through gets longer).
   */
  handsFreeStart(patience?: Patience): Promise<void>;
  /** Frank has answered; listen again. */
  handsFreeResume(patience?: Patience): Promise<void>;
  handsFreeStop(): Promise<void>;
  downloadPack(pack: Pack): Promise<void>;
  packStatus(): Promise<PackStatus>;
  /** Adds a sentence to what Frank is saying; `id` comes back in a "speaking" event. */
  speak(text: string, id?: string): Promise<void>;
  stopSpeaking(): Promise<void>;
  listVoices(): Promise<VoiceChoice[]>;
  previewVoice(id: string): Promise<void>;
  onVoice(handler: (event: VoiceEvent) => void): void;
}

/** The engine's view of whichever brain the host is set up with. */
export class HostBrain implements Brain {
  readonly id = 'host';
  /** The last failure, with its kind; `runBreakdown` only reports the message. */
  lastFailure: BrainFailure | undefined;

  constructor(private readonly host: Host) {}

  async *stream(request: BrainRequest, signal?: AbortSignal): AsyncIterable<string> {
    this.lastFailure = undefined;
    try {
      yield* this.host.stream(request, signal);
    } catch (err) {
      this.lastFailure =
        err instanceof BrainFailure ? err : new BrainFailure('failed', String(err));
      throw this.lastFailure;
    }
  }
}

/**
 * Turns push-style callbacks into an async iterable: `push` chunks, then
 * `end` or `fail`.
 */
export function channel<T>(): {
  push(value: T): void;
  end(): void;
  fail(err: unknown): void;
  iterable: AsyncIterable<T>;
} {
  const queue: T[] = [];
  let done = false;
  let error: unknown;
  let wake: (() => void) | undefined;
  const notify = () => {
    wake?.();
    wake = undefined;
  };
  return {
    push(value) {
      queue.push(value);
      notify();
    },
    end() {
      done = true;
      notify();
    },
    fail(err) {
      error = err ?? new Error('stream failed');
      done = true;
      notify();
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          if (queue.length) {
            yield queue.shift()!;
            continue;
          }
          if (error) throw error;
          if (done) return;
          await new Promise<void>((resolve) => (wake = resolve));
        }
      },
    },
  };
}
