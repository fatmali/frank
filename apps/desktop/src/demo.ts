/**
 * A host that runs entirely in the browser: a scripted brain that answers
 * like a good one would about the sample plan. Used by `pnpm demo` (to work
 * on the panel without the app) and by the tests.
 */
import type { BrainRequest, Plan } from '@frank/engine';
import { SAMPLE_FILES, samplePlan } from './sample.ts';
import {
  BrainFailure,
  channel,
  type BrainOption,
  type Config,
  type Gathered,
  type Host,
  type VoiceEvent,
  type VoiceMode,
} from './host.ts';
import type { Mood } from './duck.ts';

export const DEMO_BREAKDOWN = {
  gist: 'Adds a per-key limit of 100 requests a minute to the public API, with counters kept in Redis.',
  goal: "so one noisy key can't slow the API down for everyone",
  fine: ['the 429 response and its Retry-After header', 'the rate limit tests'],
  calls: [
    {
      title: 'Counter storage',
      question: 'Where should the counters live?',
      kind: 'silent-choice',
      planQuote: 'Use Redis to share counters across instances',
      stakes: 'Redis is a new service to deploy, secure and watch from now on.',
      spoken: 'where the counters live: Redis like the plan says, or in memory',
      options: [
        {
          label: 'Redis',
          gain: 'works across instances',
          cost: 'a new service to run',
          instruction: 'Keep counters in Redis, shared across instances.',
        },
        {
          label: 'In memory',
          gain: 'nothing new to run',
          cost: 'resets on deploy, one instance only',
          instruction: 'Keep counters in memory in the API process instead of Redis.',
        },
      ],
      hinge: {
        question: 'Will you run more than one API instance soon?',
        answers: [
          { answer: 'Yes', option: 1 },
          { answer: 'No', option: 2 },
        ],
      },
      undoCost: 'hard',
      contradicted: true,
      evidence: [
        { file: 'docker-compose.yml', line: 1, note: 'api and postgres only, no Redis' },
      ],
    },
    {
      title: 'Limited routes',
      question: 'Should /health be rate limited?',
      kind: 'silent-choice',
      planQuote: 'Apply the limiter to every route',
      stakes: 'The load balancer polls /health every 2 seconds.',
      spoken:
        'whether the health check is limited: every route like the plan, or just the public API',
      options: [
        {
          label: 'Every route',
          gain: 'one rule everywhere',
          cost: 'can throttle health checks',
          instruction: 'Apply the limiter to every route.',
        },
        {
          label: 'Public API only',
          gain: 'health checks untouched',
          cost: 'internal routes unlimited',
          instruction: 'Apply the limiter to /api/public only; leave /health alone.',
        },
      ],
      hinge: {
        question: 'Do internal callers need a limit too?',
        answers: [
          { answer: 'Yes', option: 1 },
          { answer: 'No, trusted', option: 2 },
        ],
      },
      undoCost: 'medium',
      contradicted: false,
      evidence: [
        {
          file: 'src/server.ts',
          line: 8,
          note: 'the load balancer polls /health every 2 s',
        },
      ],
    },
    {
      title: 'New dependencies',
      question: 'Are two new packages worth it?',
      kind: 'silent-choice',
      planQuote: 'Add `express-rate-limit` and `rate-limit-redis` as dependencies',
      stakes: 'Every dependency is code you keep updating.',
      spoken: 'whether two new packages are worth it, or just one',
      options: [
        {
          label: 'Both packages',
          gain: 'standard, well tested',
          cost: 'two dependencies',
          instruction: 'Add express-rate-limit and rate-limit-redis.',
        },
        {
          label: 'express-rate-limit only',
          gain: 'one dependency',
          cost: 'memory store only',
          instruction: 'Add express-rate-limit only, with its memory store.',
        },
      ],
      undoCost: 'easy',
      contradicted: false,
      evidence: [],
    },
  ],
};

const TAKES: Record<string, string> = {
  'Where should the counters live?':
    'In memory. You run one instance, and Redis is a new service to deploy and watch.\n\n' +
    '| | In memory | Redis |\n| --- | --- | --- |\n| New infra | none | a Redis service |\n| Survives restarts | no | yes |\n| Works with 2+ instances | no | yes |\n\n' +
    'If you scale past one instance, switch to Redis then.\n[option 2]',
  'Should /health be rate limited?':
    'Public API only. Limiting /health can make the load balancer think the API is down.\n[option 2]',
};

/** What the scripted brain says to a request. */
export function demoReply(request: BrainRequest): string {
  const last = request.messages[request.messages.length - 1]?.content ?? '';
  if (request.system.includes('Give the developer your read'))
    return JSON.stringify(DEMO_BREAKDOWN);
  if (/^Say ready/m.test(last)) return 'Ready.';
  const take = /What would you do about "([^"]+)"/.exec(last);
  if (take)
    return (
      TAKES[take[1]!] ?? "The plan's choice. Nothing here argues against it.\n[option 1]"
    );
  if (/scale|later|grow/i.test(last))
    return "Then build for today. Swapping the store later is a small change; running Redis you don't need isn't.\n[option 2]";
  if (/why/i.test(last))
    return 'Because every instance counts on its own without a shared store. With one instance, that is exactly right.';
  return 'Fair. That settles it for me. Pick the option that fits.';
}

export interface DemoOptions {
  /** Milliseconds between streamed chunks. 0 for tests. */
  delay?: number;
  /** Fail brain requests with this, to show error states. */
  failure?: BrainFailure;
  firstRun?: boolean;
  plans?: Plan[];
  /** Voice first (the default) or chat. */
  mode?: VoiceMode;
  /** Whether the listening models are already downloaded. */
  voiceModel?: boolean;
  /** Whether Frank's voice is already downloaded. */
  naturalVoices?: boolean;
  /** What the pretend microphone hears, in turn. */
  utterances?: string[];
  /** In a browser: speak with the browser's voice, and copy to the real clipboard. */
  live?: boolean;
  /** Told what the pretend microphone will hear next. */
  onNextUtterance?: (next: string | undefined) => void;
}

/** A run through the sample plan by voice, one line per turn. */
export const DEMO_SCRIPT = [
  'the redis one',
  'no, just one',
  'yes',
  'what would you do?',
  'take it',
  'keep it',
  'yes',
];

export function demoHost(
  opts: DemoOptions = {},
): Host & { calls: string[]; copied: string[] } {
  const delay = opts.delay ?? 18;
  const calls: string[] = [];
  const copied: string[] = [];
  let config: Config = {
    brain: { kind: opts.firstRun ? '' : 'claude-code' },
    hotkey: 'Alt+Shift+Space',
    sticky: { enabled: false },
    plans: { window_minutes: 30 },
    context: { max_file_kb: 200, trusted_projects: [] },
    voice: { mode: opts.mode ?? 'voice' },
  };
  const voiceHandlers: ((e: VoiceEvent) => void)[] = [];
  const voice = (e: VoiceEvent) => voiceHandlers.forEach((h) => h(e));
  let hasModel = opts.voiceModel ?? true;
  let hasNatural = opts.naturalVoices ?? true;
  // Speech is a queue, like the real one: "spoken" when the last line ends.
  let queued = 0;
  let speech = 0;
  // Hands-free: the pretend microphone hears the next line a moment after
  // Frank is ready to listen.
  let handsFree = false;
  let turn: ReturnType<typeof setTimeout> | undefined;
  const listenFreely = () => {
    voice({ type: 'hands-free', state: 'waiting' });
    if (!utterances.length) return;
    turn = setTimeout(() => {
      voice({ type: 'hands-free', state: 'hearing' });
      turn = setTimeout(() => {
        voice({ type: 'hands-free', state: 'checking' });
        voice({ type: 'hands-free', state: 'paused' });
        voice({ type: 'heard', text: utterances.shift() ?? '' });
        announce();
      }, delay * 40);
    }, delay * 30);
  };
  const utterances = [...(opts.utterances ?? DEMO_SCRIPT)];
  const announce = () => opts.onNextUtterance?.(utterances[0]);
  announce();
  let levels: ReturnType<typeof setInterval> | undefined;
  const plans = opts.plans ?? [
    { ...samplePlan(), origin: '~/.claude/plans/jaunty-petting-nebula.md' },
  ];
  const shown: (() => void)[] = [];
  const settings: (() => void)[] = [];
  const log = (what: string) => calls.push(what);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const host: Host & { calls: string[]; copied: string[] } = {
    calls,
    copied,
    async getConfig() {
      return structuredClone(config);
    },
    async saveConfig(next) {
      config = structuredClone(next);
      log(`saveConfig ${next.brain.kind}`);
      return structuredClone(config);
    },
    async detectBrains(): Promise<BrainOption[]> {
      return [
        { kind: 'claude-code', label: 'Claude Code', status: 'ready' },
        {
          kind: 'copilot',
          label: 'GitHub Copilot',
          status: 'missing',
          fix: "The Copilot CLI isn't installed. Install it with `npm install -g @github/copilot`, sign in, then press Retry.",
        },
        {
          kind: 'anthropic',
          label: 'Anthropic API',
          status: 'ready',
          keyFrom: 'ANTHROPIC_API_KEY',
        },
        {
          kind: 'openai',
          label: 'OpenAI API',
          status: 'missing',
          fix: 'No key yet. Add one, or set OPENAI_API_KEY.',
        },
        {
          kind: 'ollama',
          label: 'Ollama',
          status: 'not-running',
          fix: "Ollama isn't running. Start it, then press Retry.",
        },
      ];
    },
    async brainStatus() {
      return opts.failure?.kind === 'not-ready'
        ? { status: 'signed-out', fix: opts.failure.message }
        : { status: 'ready' };
    },
    async saveApiKey(kind) {
      log(`saveApiKey ${kind}`);
    },
    stream(request, signal) {
      log('stream');
      const out = channel<string>();
      void (async () => {
        if (opts.failure) {
          if (delay) await sleep(delay * 10);
          out.fail(opts.failure);
          return;
        }
        const reply = demoReply(request);
        for (let i = 0; i < reply.length; i += 9) {
          if (signal?.aborted) {
            out.fail(new BrainFailure('cancelled', 'Cancelled.'));
            return;
          }
          if (delay) await sleep(delay);
          out.push(reply.slice(i, i + 9));
        }
        out.end();
      })();
      return out.iterable;
    },
    async recentPlans() {
      return plans;
    },
    async readPlanFile(path) {
      return { ...samplePlan(), source: 'file', origin: path };
    },
    async gatherContext(plan): Promise<Gathered> {
      if (!plan.project) return { files: [], skipped: [], trusted: true };
      const root = plan.project;
      return {
        files: SAMPLE_FILES,
        skipped: [{ path: '.env', reason: 'secret file, never read' }],
        repo: { root, branch: 'main', changedFiles: [], rules: [] },
        root,
        trusted: config.context.trusted_projects.includes(root),
      };
    },
    async trustProject(root) {
      config.context.trusted_projects.push(root);
    },
    async hotkeyStatus() {
      return null;
    },
    async setHotkey(hotkey) {
      config.hotkey = hotkey;
      log(`setHotkey ${hotkey}`);
    },
    async setSticky(enabled) {
      config.sticky.enabled = enabled;
    },
    async setMood(mood: Mood) {
      log(`mood ${mood}`);
    },
    async setPinned(pinned) {
      log(`pinned ${pinned}`);
    },
    async hidePanel() {
      log('hide');
    },
    async copy(text) {
      copied.push(text);
      if (opts.live) await navigator.clipboard?.writeText(text).catch(() => {});
    },
    async openUrl(url) {
      log(`open ${url}`);
    },
    async fitHeight() {},
    onShown(handler) {
      shown.push(handler);
    },
    onOpenSettings(handler) {
      settings.push(handler);
    },
    onFileDrop() {},
    async voiceStart() {
      if (!hasModel) {
        voice({ type: 'needs-pack', pack: 'listening', megabytes: 150 });
        return;
      }
      log('voiceStart');
      voice({ type: 'listening' });
      let t = 0;
      levels = setInterval(
        () => voice({ type: 'level', level: 0.35 + 0.3 * Math.sin((t += 0.9)) }),
        60,
      );
    },
    async voiceStop() {
      clearInterval(levels);
      log('voiceStop');
      voice({ type: 'transcribing' });
      if (delay) await sleep(delay * 12);
      voice({ type: 'heard', text: utterances.shift() ?? '' });
      announce();
    },
    async handsFreeStart() {
      if (!hasModel) {
        voice({ type: 'needs-pack', pack: 'listening', megabytes: 150 });
        return;
      }
      if (handsFree) return;
      handsFree = true;
      log('handsFreeStart');
      listenFreely();
    },
    async handsFreeResume() {
      if (!handsFree) return;
      log('handsFreeResume');
      listenFreely();
    },
    async handsFreeStop() {
      if (!handsFree) return;
      handsFree = false;
      clearTimeout(turn);
      log('handsFreeStop');
      voice({ type: 'hands-free', state: 'off' });
    },
    async downloadPack(pack) {
      log(`download ${pack}`);
      for (const fraction of [0.2, 0.55, 0.9]) {
        if (delay) await sleep(delay * 8);
        voice({ type: 'downloading', pack, fraction });
      }
      if (pack === 'listening') hasModel = true;
      else hasNatural = true;
      voice({ type: 'pack-ready', pack });
    },
    async speak(text, id) {
      log(`speak ${text}`);
      const generation = speech;
      const started = () => {
        if (id && generation === speech) voice({ type: 'speaking', id });
      };
      const ended = () => {
        if (generation !== speech) return;
        queued--;
        if (!queued) voice({ type: 'spoken' });
      };
      queued++;
      const synth = opts.live ? globalThis.speechSynthesis : undefined;
      if (synth) {
        const line = new SpeechSynthesisUtterance(text);
        line.onstart = started;
        line.onend = line.onerror = ended;
        synth.speak(line);
        return;
      }
      setTimeout(() => {
        started();
        ended();
      }, delay * 60);
    },
    async stopSpeaking() {
      speech++;
      queued = 0;
      if (opts.live) globalThis.speechSynthesis?.cancel();
    },
    async packStatus() {
      return {
        listening: { installed: hasModel, megabytes: hasModel ? 0 : 150 },
        voices: { installed: hasNatural, megabytes: hasNatural ? 0 : 212 },
      };
    },
    async listVoices() {
      return [
        ['am_michael', 'Michael', 'American, calm'],
        ['af_heart', 'Heart', 'American, warm'],
        ['bm_george', 'George', 'British, dry'],
      ].map(([id, name, description]) => ({
        id: `natural:${id}`,
        name: name!,
        description: description!,
        installed: hasNatural,
      }));
    },
    async previewVoice(name) {
      log(`preview ${name}`);
    },
    onVoice(handler) {
      voiceHandlers.push(handler);
    },
  };
  return host;
}
