/**
 * The panel's behaviour, separate from how it looks: which plan, what Frank
 * is doing, the session, and every action a key or button can take.
 * docs/ux.md §5 describes the flows and states implemented here.
 */
import {
  Session,
  copiedMessage,
  fitToBudget,
  runBreakdown,
  type Call,
  type Context,
  type Outcome,
  type Plan,
  type Turn,
} from '@frank/engine';
import type { Mood } from './duck.ts';
import {
  BrainFailure,
  HostBrain,
  type Config,
  type FailureKind,
  type Gathered,
  type Host,
} from './host.ts';
import { SAMPLE_FILES, SAMPLE_ORIGIN, samplePlan } from './sample.ts';

export type View =
  | { name: 'starting' }
  | { name: 'onboarding' }
  | { name: 'no-plan' }
  | { name: 'preparing'; step: string }
  | { name: 'context-check'; gathered: Gathered }
  | { name: 'error'; kind: FailureKind; message: string }
  | { name: 'session' };

export interface PanelState {
  view: View;
  config: Config | undefined;
  settingsOpen: boolean;
  pickerOpen: boolean;
  plan: Plan | undefined;
  plans: Plan[];
  /** A plan newer than the one in the session, offered on the next summon. */
  newerPlan: Plan | undefined;
  gathered: Gathered | undefined;
  calls: Call[];
  selected: string | undefined;
  /** The selected call's conversation. */
  turns: Turn[];
  streaming: { callId: string | undefined; text: string } | undefined;
  /** Set when the brain is slow to start answering (ux.md §5.3). */
  slow: 'warming' | 'waiting' | undefined;
  /** A failed turn, shown in the conversation with its fix. */
  turnError: { kind: FailureKind; message: string } | undefined;
  /** The composer is asking what to do instead, after Change. */
  changing: boolean;
  notice: string | undefined;
  noteCopied: boolean;
  /** True for the moment Frank marks the plan. */
  marking: boolean;
  note: string;
  progress: { made: number; total: number };
}

const BRAIN_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  copilot: 'Copilot',
  anthropic: 'Claude',
  openai: 'OpenAI',
  'openai-compatible': 'Your model',
  ollama: 'Ollama',
};

/** Characters of context per request. Local models get less room. */
const BUDGET: Record<string, number> = { ollama: 40_000 };
const DEFAULT_BUDGET = 120_000;
const WARMING_AFTER = 4_000;
const WAITING_AFTER = 20_000;
/** The marks land within 500 ms (ux.md §6.6); every quote stays up a moment longer, then the list folds to an index. */
const MARKING_MS = 1_400;

export class PanelController {
  private state: PanelState = {
    view: { name: 'starting' },
    config: undefined,
    settingsOpen: false,
    pickerOpen: false,
    plan: undefined,
    plans: [],
    newerPlan: undefined,
    gathered: undefined,
    calls: [],
    selected: undefined,
    turns: [],
    streaming: undefined,
    slow: undefined,
    turnError: undefined,
    changing: false,
    notice: undefined,
    noteCopied: false,
    marking: false,
    note: '',
    progress: { made: 0, total: 0 },
  };
  private listeners = new Set<() => void>();
  private readonly brain: HostBrain;
  private session: Session | undefined;
  private context: Context | undefined;
  /** Cancels whatever the brain is doing now. */
  private work: AbortController | undefined;
  private slowTimers: ReturnType<typeof setTimeout>[] = [];
  private mood: Mood | undefined;

  constructor(readonly host: Host) {
    this.brain = new HostBrain(host);
  }

  // ------------------------------------------------------------ store

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PanelState => this.state;

  private set(patch: Partial<PanelState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** Copies the session's state into the snapshot. */
  private sync(extra: Partial<PanelState> = {}): void {
    const s = this.session;
    const selected = s?.selected;
    this.set({
      calls: s ? s.calls.map((c) => ({ ...c })) : [],
      selected,
      turns: s ? s.turns.filter((t) => t.callId === selected) : [],
      note: s ? s.note() : '',
      progress: s ? s.progress : { made: 0, total: 0 },
      ...extra,
    });
  }

  get brainName(): string {
    return BRAIN_NAMES[this.state.config?.brain.kind ?? ''] ?? 'The brain';
  }

  private setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    void this.host.setMood(mood);
  }

  // ------------------------------------------------------------ opening

  /** Runs when the panel opens: loads the newest plan, or resumes. */
  async start(): Promise<void> {
    const config = await this.host.getConfig();
    this.set({ config, noteCopied: false, notice: undefined });
    if (!config.brain.kind) {
      this.set({ view: { name: 'onboarding' } });
      void this.host.setPinned(true);
      return;
    }
    if (this.state.view.name === 'onboarding') this.set({ view: { name: 'starting' } });
    const plans = await this.host.recentPlans();
    this.set({ plans });
    const current = this.state.plan;
    if (current) {
      const newest = plans[0];
      if (newest && !samePlan(newest, current) && isNewer(newest, current)) {
        this.set({ newerPlan: newest });
      }
      return;
    }
    if (plans[0]) await this.load(plans[0]);
    else this.showNoPlan();
  }

  private showNoPlan(): void {
    this.set({ view: { name: 'no-plan' } });
    // Stay open while the developer fetches a plan to drop or paste.
    void this.host.setPinned(true);
    this.setMood('idle');
  }

  /** Starts over on `plan`: reads what it mentions, then finds its calls. */
  async load(plan: Plan): Promise<void> {
    this.cancel();
    this.session = undefined;
    this.context = undefined;
    this.set({
      plan,
      newerPlan: undefined,
      pickerOpen: false,
      gathered: undefined,
      turnError: undefined,
      changing: false,
      notice: undefined,
      noteCopied: false,
      view: { name: 'preparing', step: 'Reading the plan' },
    });
    this.sync();
    void this.host.setPinned(false);
    this.setMood('thinking');

    const gathered: Gathered =
      plan.origin === SAMPLE_ORIGIN
        ? { files: SAMPLE_FILES, skipped: [], trusted: true }
        : await this.host.gatherContext(plan);
    if (this.state.plan !== plan) return;
    this.set({ gathered });
    if (!gathered.trusted) {
      this.set({ view: { name: 'context-check', gathered } });
      this.setMood('idle');
      return;
    }
    await this.find(gathered);
  }

  /** The developer confirmed the files in the context check. */
  async confirmContext(trust: boolean): Promise<void> {
    const gathered = this.state.gathered;
    if (!gathered) return;
    if (trust && gathered.root) await this.host.trustProject(gathered.root);
    await this.find(gathered);
  }

  private async find(gathered: Gathered): Promise<void> {
    const plan = this.state.plan;
    if (!plan) return;
    const n = gathered.files.length;
    this.set({
      view: {
        name: 'preparing',
        step: n ? `Reading ${n} ${n === 1 ? 'file' : 'files'}` : 'Reading the plan',
      },
    });
    const kind = this.state.config?.brain.kind ?? '';
    const context = fitToBudget(
      {
        plan,
        files: gathered.files,
        ...(gathered.repo ? { repo: gathered.repo } : {}),
        extras: [],
      },
      BUDGET[kind] ?? DEFAULT_BUDGET,
    );
    this.context = context;
    this.set({ view: { name: 'preparing', step: 'Finding the calls' } });
    this.setMood('thinking');

    const work = this.begin();
    this.startSlowTimers();
    const result = await runBreakdown(this.brain, context, work.signal);
    this.stopSlowTimers();
    if (work.signal.aborted || this.state.plan !== plan) return;
    this.work = undefined;

    if (result.status === 'failed') {
      const failure = this.brain.lastFailure;
      this.set({
        view: {
          name: 'error',
          kind: failure?.kind ?? 'failed',
          message: failure?.message ?? result.error,
        },
      });
      this.setMood('idle');
      return;
    }
    const calls = result.status === 'calls' ? result.calls : [];
    this.session = new Session(this.brain, context, calls);
    this.sync({ view: { name: 'session' }, marking: calls.length > 0 });
    if (calls.length) {
      this.setMood('judging');
      setTimeout(() => this.set({ marking: false }), MARKING_MS);
      await this.open(calls[0]!.id);
    } else {
      this.setMood('idle');
    }
  }

  /** Try again after a brain error. */
  async retry(): Promise<void> {
    const gathered = this.state.gathered;
    this.set({ turnError: undefined });
    if (this.state.view.name === 'error' && gathered && this.state.plan) {
      await this.find(gathered);
    } else if (this.state.plan) {
      await this.load(this.state.plan);
    } else {
      await this.start();
    }
  }

  // ------------------------------------------------------------ plans

  async pastePlan(text: string): Promise<void> {
    const body = text.trim();
    if (!body) return;
    await this.load({
      source: 'pasted',
      title: titleOf(body),
      body,
      modifiedAt: new Date().toISOString(),
      origin: 'clipboard',
    });
  }

  async dropFiles(paths: string[]): Promise<void> {
    const path = paths[0];
    if (!path) return;
    try {
      await this.load(await this.host.readPlanFile(path));
    } catch (err) {
      this.set({ notice: String(err instanceof Error ? err.message : err) });
    }
  }

  async trySample(): Promise<void> {
    await this.load(samplePlan());
  }

  async switchToNewer(): Promise<void> {
    if (this.state.newerPlan) await this.load(this.state.newerPlan);
  }

  togglePicker(open = !this.state.pickerOpen): void {
    this.set({ pickerOpen: open });
    if (open) void this.host.recentPlans().then((plans) => this.set({ plans }));
  }

  // ------------------------------------------------------------ the session

  /** Selects a call and, the first time, has Frank open it. */
  async select(id: string): Promise<void> {
    const s = this.session;
    if (!s || !s.calls.some((c) => c.id === id)) return;
    if (id === s.selected && (this.state.streaming || this.state.turns.length)) return;
    this.cancel();
    s.select(id);
    this.sync({ changing: false, turnError: undefined });
    if (!s.turns.some((t) => t.callId === id)) await this.open(id);
  }

  /** Moves the selection up or down the list. */
  async move(delta: 1 | -1): Promise<void> {
    const { calls, selected } = this.state;
    const i = calls.findIndex((c) => c.id === selected);
    const next = calls[Math.min(calls.length - 1, Math.max(0, i + delta))];
    if (next) await this.select(next.id);
  }

  private async open(id: string): Promise<void> {
    const s = this.session;
    if (!s) return;
    await this.stream((signal) => s.openCall(id, signal), id);
  }

  /** Sends what the developer typed. After Change, it's what to do instead. */
  async send(text: string): Promise<void> {
    const t = text.trim();
    if (!t) return;
    if (!this.session) {
      if (this.state.view.name === 'no-plan') await this.pastePlan(t);
      return;
    }
    if (this.state.changing && this.state.selected) {
      await this.decide({ verdict: 'change', detail: t });
      return;
    }
    const s = this.session;
    await this.stream((signal) => s.ask(t, signal), s.selected);
  }

  async whatWouldYouDo(): Promise<void> {
    const s = this.session;
    if (!s || this.state.streaming) return;
    await this.stream((signal) => s.whatWouldYouDo(signal), s.selected);
  }

  /** Keep or drop the selected call. Change asks what to do instead first. */
  async act(verdict: 'keep' | 'change' | 'drop'): Promise<void> {
    if (!this.session || !this.state.selected || this.state.streaming) return;
    if (verdict === 'change') {
      this.set({ changing: true });
      return;
    }
    await this.decide({ verdict });
  }

  cancelChange(): void {
    this.set({ changing: false });
  }

  private async decide(outcome: Outcome): Promise<void> {
    const s = this.session;
    const id = this.state.selected;
    if (!s || !id) return;
    const next = s.decide(id, outcome);
    this.sync({ changing: false });
    if (next) await this.select(next);
    else this.setMood('idle');
  }

  private async stream(
    make: (signal: AbortSignal) => AsyncIterable<string>,
    callId: string | undefined,
  ): Promise<void> {
    this.cancel();
    const work = this.begin();
    this.set({ streaming: { callId, text: '' }, turnError: undefined });
    this.setMood('thinking');
    this.startSlowTimers();
    let text = '';
    try {
      for await (const chunk of make(work.signal)) {
        if (!text) this.stopSlowTimers();
        text += chunk;
        this.set({ streaming: { callId, text }, slow: undefined });
      }
    } catch (err) {
      if (!work.signal.aborted) {
        const f =
          err instanceof BrainFailure ? err : new BrainFailure('failed', String(err));
        if (f.kind !== 'cancelled')
          this.set({ turnError: { kind: f.kind, message: f.message } });
      }
    } finally {
      this.stopSlowTimers();
      if (this.work === work) this.work = undefined;
      this.sync({ streaming: undefined });
      this.setMood(this.session?.calls.some((c) => !c.outcome) ? 'judging' : 'idle');
    }
  }

  // ------------------------------------------------------------ wrapping up

  /** Copies the note for the agent and closes, with the duck's nod. */
  async copyNote(): Promise<void> {
    const plan = this.state.plan;
    if (!this.session || !plan) {
      await this.close();
      return;
    }
    await this.host.copy(this.session.note());
    this.set({ noteCopied: true, notice: copiedMessage(plan.source) });
    this.setMood('done');
    setTimeout(() => void this.host.hidePanel(), 900);
    setTimeout(() => {
      this.set({ noteCopied: false });
      this.setMood('idle');
    }, 3_000);
  }

  /** Esc: backs out of whatever is open, else closes the panel. Nothing is lost. */
  async close(): Promise<void> {
    if (this.state.changing) return this.cancelChange();
    if (this.state.pickerOpen) return this.togglePicker(false);
    if (this.state.settingsOpen) return this.closeSettings();
    await this.host.hidePanel();
  }

  openSettings(): void {
    this.set({ settingsOpen: true, pickerOpen: false });
    void this.host.setPinned(true);
  }

  closeSettings(): void {
    this.set({ settingsOpen: false });
    void this.host.setPinned(this.state.view.name === 'no-plan');
    void this.reloadConfig();
  }

  async reloadConfig(): Promise<void> {
    this.set({ config: await this.host.getConfig() });
  }

  /** First-run setup is done. */
  async finishOnboarding(trySample: boolean): Promise<void> {
    await this.reloadConfig();
    void this.host.setPinned(false);
    if (trySample) await this.trySample();
    else await this.start();
  }

  /** A tiny request, to check a brain really answers. */
  async testBrain(): Promise<{ ok: true } | { ok: false; message: string }> {
    const timeout = AbortSignal.timeout(90_000);
    try {
      let reply = '';
      for await (const chunk of this.host.stream(
        {
          system: 'Reply with one word.',
          messages: [{ role: 'user', content: 'Say ready.' }],
        },
        timeout,
      ))
        reply += chunk;
      return reply.trim()
        ? { ok: true }
        : { ok: false, message: 'The brain sent an empty answer.' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ------------------------------------------------------------ plumbing

  /** Stops the current brain request. Its partial answer is kept. */
  cancel(): void {
    this.work?.abort();
    this.work = undefined;
    this.stopSlowTimers();
  }

  private begin(): AbortController {
    this.work?.abort();
    this.work = new AbortController();
    return this.work;
  }

  private startSlowTimers(): void {
    this.stopSlowTimers();
    this.slowTimers = [
      setTimeout(() => this.set({ slow: 'warming' }), WARMING_AFTER),
      setTimeout(() => this.set({ slow: 'waiting' }), WAITING_AFTER),
    ];
  }

  private stopSlowTimers(): void {
    for (const t of this.slowTimers) clearTimeout(t);
    this.slowTimers = [];
    if (this.state.slow) this.set({ slow: undefined });
  }
}

function samePlan(a: Plan, b: Plan): boolean {
  return a.origin === b.origin && a.modifiedAt === b.modifiedAt;
}

function isNewer(a: Plan, b: Plan): boolean {
  return Date.parse(a.modifiedAt) > Date.parse(b.modifiedAt);
}

/** The first Markdown heading, else the first line: same rule as frank-core. */
export function titleOf(body: string): string {
  const heading = /^\s*#+\s*(.+?)\s*$/m.exec(body)?.[1];
  const first = body
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return (heading || first || 'Untitled plan').slice(0, 120);
}
