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
} from './host.ts';
import type { Mood } from './duck.ts';

export const DEMO_BREAKDOWN = {
  calls: [
    {
      title: 'Store counts in Redis',
      kind: 'silent-choice',
      planQuote: 'Use Redis to share counters across instances',
      planChoice: 'Keeps rate-limit counters in Redis, shared by all instances',
      alternatives: ['In-memory counters in the API process'],
      undoCost: 'hard',
      contradicted: true,
      evidence: [
        {
          file: 'docker-compose.yml',
          line: 1,
          note: 'Services are api and postgres. No Redis.',
        },
      ],
    },
    {
      title: 'Apply to every route',
      kind: 'silent-choice',
      planQuote: 'Apply the limiter to every route',
      planChoice: 'Limits every route, including /health',
      alternatives: ['Limit /api/public only'],
      undoCost: 'medium',
      contradicted: false,
      evidence: [
        {
          file: 'src/server.ts',
          line: 8,
          note: 'The load balancer polls /health every 2 seconds.',
        },
      ],
    },
    {
      title: 'Add express-rate-limit',
      kind: 'silent-choice',
      planQuote: 'Add `express-rate-limit` and `rate-limit-redis` as dependencies',
      planChoice: 'Adds two dependencies',
      alternatives: ['Only express-rate-limit, with its memory store'],
      undoCost: 'easy',
      contradicted: false,
      evidence: [],
    },
  ],
};

const OPENINGS: Record<string, string> = {
  'Store counts in Redis':
    "The plan adds Redis to share counters across instances. There's no Redis in docker-compose.yml, and it runs one `api` service. Are you running more than one instance in production?",
  'Apply to every route':
    'The plan limits every route, and that includes `/health`. The load balancer polls it every 2 seconds, so a tight limit could mark the API as down. Limit `/api/public` only?',
  'Add express-rate-limit':
    'The plan adds `express-rate-limit` and `rate-limit-redis`. The first is the standard choice and fine. The second only matters if you keep Redis.',
};

const RECOMMENDATION =
  'Use in-memory counters. You run one instance, and Redis is a new service to deploy and watch.\n\n' +
  '| | In memory | Redis |\n| --- | --- | --- |\n| New infra | none | a Redis service |\n| Survives restarts | no | yes |\n| Works with 2+ instances | no | yes |\n\n' +
  'If you scale out past one instance, switch to Redis then.';

/** What the scripted brain says to a request. */
export function demoReply(request: BrainRequest): string {
  const last = request.messages[request.messages.length - 1]?.content ?? '';
  if (request.system.includes('Find the calls')) return JSON.stringify(DEMO_BREAKDOWN);
  if (/^Say ready/m.test(last)) return 'Ready.';
  if (/What would you do/.test(last)) return RECOMMENDATION;
  const open = /Open call \d+: "([^"]+)"/.exec(last);
  if (open) return OPENINGS[open[1]!] ?? "The plan's choice here is fine.";
  if (/one instance|single instance|just one/i.test(last))
    return 'Then Redis buys you nothing yet. Change it to in-memory counters?';
  return 'Fair. That settles it for me. Keep, change or drop?';
}

export interface DemoOptions {
  /** Milliseconds between streamed chunks. 0 for tests. */
  delay?: number;
  /** Fail brain requests with this, to show error states. */
  failure?: BrainFailure;
  firstRun?: boolean;
  plans?: Plan[];
}

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
  };
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
  };
  return host;
}
