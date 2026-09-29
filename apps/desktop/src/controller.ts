/**
 * The panel's behaviour, separate from how it looks: which plan, what Frank
 * is doing, the session, voice, and every action a key, a click or a spoken
 * command can take. docs/ux.md §5–7 describes the flows implemented here.
 */
import {
  Session,
  briefing,
  callIntro,
  copiedMessage,
  fitToBudget,
  leadsTo,
  madeCall,
  parseCommand,
  pickByWords,
  startWith,
  walkMeThrough,
  runBreakdown,
  splitSuggestion,
  wrapUp,
  type Call,
  type Command,
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
  type HandsFree,
  type Host,
  type Pack,
  type PackStatus,
  type Patience,
  type VoiceEvent,
  voiceMode,
} from './host.ts';
import { SAMPLE_FILES, SAMPLE_ORIGIN, samplePlan } from './sample.ts';

export type View =
  | { name: 'starting' }
  | { name: 'onboarding' }
  /** The plans home: every plan from the last two weeks, or how to add one. */
  | { name: 'plans' }
  | { name: 'preparing'; step: string }
  | { name: 'context-check'; gathered: Gathered }
  | { name: 'error'; kind: FailureKind; message: string }
  /** The read: what the plan does, what needs the developer, what's fine. */
  | { name: 'read' }
  /** One call at a time. */
  | { name: 'call' }
  /** Your calls: the decisions and the note. */
  | { name: 'calls' };

export type VoiceState =
  | { state: 'off' }
  | { state: 'listening'; level: number }
  | { state: 'transcribing' }
  | { state: 'speaking' }
  /** Asking to download a pack; nothing was recorded. */
  | { state: 'needs-pack'; pack: Pack; megabytes: number };

/** How far a plan got, for the plans home. */
export interface Visit {
  made: number;
  total: number;
  copied: boolean;
}

/** A plan's identity: the same file, the same version. */
export function planKey(plan: Plan): string {
  return `${plan.origin}@${plan.modifiedAt}`;
}

interface Kept {
  session: Session;
  gathered: Gathered | undefined;
  gist: string;
  fine: string[];
  view: View;
}

export interface PanelState {
  view: View;
  config: Config | undefined;
  settingsOpen: boolean;
  /** The plans home's list, newest first. */
  history: Plan[];
  /** How far each plan got, by plan key. */
  visits: Record<string, Visit>;
  /** Frank's voice, picked from the panel (the voice button, or V). */
  voiceMenuOpen: boolean;
  plan: Plan | undefined;
  plans: Plan[];
  /** A plan newer than the one in the session, offered on the next summon. */
  newerPlan: Plan | undefined;
  gathered: Gathered | undefined;
  /** What the plan does, in one sentence. */
  gist: string;
  /** What Frank checked and found fine. */
  fine: string[];
  /** True while the read is still streaming in. */
  reading: boolean;
  calls: Call[];
  selected: string | undefined;
  /** The selected call's conversation. */
  turns: Turn[];
  /** Hinge answers so far, by call id (0-based answer index). */
  answers: Record<string, number>;
  /** An option lit up for the selected call: from the hinge, or Frank's suggestion. */
  highlight: { option: number; why: 'answer' | 'frank' } | undefined;
  streaming: { callId: string | undefined; text: string } | undefined;
  /** Set when the brain is slow to start answering (ux.md §7.3). */
  slow: 'warming' | 'waiting' | undefined;
  /** A failed turn, shown in the conversation with its fix. */
  turnError: { kind: FailureKind; message: string } | undefined;
  /** The composer is asking what to do instead ("something else"). */
  changing: boolean;
  /** A short confirmation in the footer: "Chose In memory". */
  flash: string | undefined;
  notice: string | undefined;
  noteCopied: boolean;
  /** True for the moment Frank marks the plan. */
  marking: boolean;
  note: string;
  progress: { made: number; total: number };
  voice: VoiceState;
  /** Hands-free conversation, while it's on (ux.md §6.3). */
  handsFree: { state: HandsFree; level: number } | undefined;
  /** Packs downloading now, with how far along they are. */
  downloads: Partial<Record<Pack, number>>;
  /** Which voice packs are downloaded; undefined until asked. */
  packs: PackStatus | undefined;
  /** What Frank is talking about right now: "plan", "call:2"… */
  speakingAbout: string | undefined;
  /** Voice mode: the developer switched the voice bar to a text box. */
  typing: boolean;
  /** What kind of turn the developer has now, for the voice bar. */
  turnKind: Patience | undefined;
  /** The last thing the developer said out loud, as heard. */
  lastHeard: string | undefined;
  /** The last thing Frank said out loud. */
  lastLine: string | undefined;
  /** What went wrong with voice, in words the developer can act on. */
  voiceError: string | undefined;
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
/** How long each call's marks stay lit in the read (ux.md §8.6). */
const MARKING_MS = 600;
const FLASH_MS = 2_500;

export class PanelController {
  private state: PanelState = {
    view: { name: 'starting' },
    config: undefined,
    settingsOpen: false,
    history: [],
    visits: {},
    voiceMenuOpen: false,
    plan: undefined,
    plans: [],
    newerPlan: undefined,
    gathered: undefined,
    gist: '',
    fine: [],
    reading: false,
    calls: [],
    selected: undefined,
    turns: [],
    answers: {},
    highlight: undefined,
    streaming: undefined,
    slow: undefined,
    turnError: undefined,
    changing: false,
    flash: undefined,
    notice: undefined,
    noteCopied: false,
    marking: false,
    note: '',
    progress: { made: 0, total: 0 },
    voice: { state: 'off' },
    handsFree: undefined,
    downloads: {},
    packs: undefined,
    speakingAbout: undefined,
    typing: false,
    turnKind: undefined,
    lastHeard: undefined,
    lastLine: undefined,
    voiceError: undefined,
  };
  private listeners = new Set<() => void>();
  private readonly brain: HostBrain;
  private session: Session | undefined;
  /** Cancels whatever the brain is doing now. */
  private work: AbortController | undefined;
  private slowTimers: ReturnType<typeof setTimeout>[] = [];
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  private mood: Mood | undefined;
  /** The last thing the developer said came from the microphone. */
  private spoken = false;
  /** Lines of the briefing already said, while it's still being said. */
  private briefed: number | undefined;
  /** What Frank asked and is waiting on. */
  private awaiting:
    | { kind: 'confirm'; callId: string; option: number }
    | { kind: 'copy' }
    | { kind: 'walk'; callId: string }
    | undefined;
  /** "Hold on": wait as long as it takes for the next turn. */
  private holding = false;
  /** The last lines Frank said from a template, to say again on "wait, what?". */
  private lastSaid: { text: string; about?: string }[] | undefined;
  /** Plans talked through this run, to come back to where you left off. */
  private stash = new Map<string, Kept>();
  /** Said before the next call's intro: "Going with in memory." */
  private prefix: string | undefined;
  /** Voice mode listens after Frank speaks, until the developer turns it off. */
  private listen = true;

  constructor(readonly host: Host) {
    this.brain = new HostBrain(host);
    host.onVoice((e) => this.onVoice(e));
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
    if (!s) {
      this.set(extra);
      return;
    }
    const selected = s.selected;
    const suggested =
      s.suggestion && s.suggestion.callId === selected ? s.suggestion.option : undefined;
    const answered = selected !== undefined ? s.answers[selected] : undefined;
    const call = s.calls.find((c) => c.id === selected);
    const fromAnswer =
      answered !== undefined ? call?.hinge?.answers[answered]?.option : undefined;
    this.set({
      calls: s.calls.map((c) => ({ ...c })),
      selected,
      turns: s.turns.filter((t) => t.callId === selected),
      answers: { ...s.answers },
      highlight:
        suggested !== undefined
          ? { option: suggested, why: 'frank' }
          : fromAnswer !== undefined
            ? { option: fromAnswer, why: 'answer' }
            : undefined,
      note: s.note(),
      progress: s.progress,
      ...extra,
    });
    const plan = this.state.plan;
    if (plan) {
      const key = planKey(plan);
      const was = this.state.visits[key];
      this.set({
        visits: {
          ...this.state.visits,
          [key]: { ...s.progress, copied: was?.copied ?? false },
        },
      });
    }
  }

  get brainName(): string {
    return BRAIN_NAMES[this.state.config?.brain.kind ?? ''] ?? 'The brain';
  }

  /** The call on screen in the call view. */
  get current(): Call | undefined {
    return this.state.calls.find((c) => c.id === this.state.selected);
  }

  private setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    void this.host.setMood(mood);
  }

  /** The mood that fits what's on screen, when nothing else is going on. */
  private restingMood(): Mood {
    return this.session?.calls.some((c) => !c.outcome) ? 'judging' : 'idle';
  }

  private flash(text: string): void {
    clearTimeout(this.flashTimer);
    this.set({ flash: text });
    this.flashTimer = setTimeout(() => this.set({ flash: undefined }), FLASH_MS);
  }

  // ------------------------------------------------------------ voice first

  /** Voice first: Frank talks you through the plan (ux.md §6). */
  get voiceFirst(): boolean {
    return voiceMode(this.state.config) === 'voice';
  }

  /** Frank has a voice to speak with. */
  private get canSpeak(): boolean {
    return this.state.packs?.voices.installed ?? false;
  }

  private async refreshPacks(): Promise<void> {
    try {
      this.set({ packs: await this.host.packStatus() });
    } catch {
      // Unknown: Frank stays quiet rather than asking to download.
    }
  }

  /** Says lines out loud, in voice mode, when Frank has a voice. */
  private say(lines: { text: string; about?: string }[]): void {
    if (!this.voiceFirst || !this.canSpeak) return;
    const said = lines.filter((l) => l.text.trim());
    if (!said.length) return;
    this.lastSaid = said;
    this.set({
      voice: { state: 'speaking' },
      lastLine: said.map((l) => l.text).join(' '),
    });
    for (const l of said) void this.host.speak(speakableProse(l.text), l.about);
  }

  /** Stops whatever Frank is saying, to say something else. */
  private hush(): void {
    this.briefed = undefined;
    if (this.state.voice.state === 'speaking') {
      void this.host.stopSpeaking();
      this.set({ voice: { state: 'off' }, speakingAbout: undefined });
    }
  }

  /** The briefing, as far as the read has got. */
  private brief(read: Parameters<typeof briefing>[0], done: boolean): void {
    if (this.briefed === undefined || !this.voiceFirst || !this.canSpeak) return;
    const lines = briefing({ ...read, ...sourceOf(this.state.plan) }, done);
    const fresh = lines.slice(this.briefed);
    this.briefed = done ? undefined : lines.length;
    this.say(fresh);
  }

  /** Frank talks a call through: what was just decided, then the call. */
  private speakCall(id: string): void {
    const call = this.session?.calls.find((c) => c.id === id);
    const prefix = this.prefix;
    this.prefix = undefined;
    if (!call || !this.voiceFirst) return;
    this.hush();
    this.awaiting = { kind: 'walk', callId: id };
    this.say([...(prefix ? [{ text: prefix }] : []), ...walkMeThrough(call)]);
  }

  /** "You explain it": Frank explains the call himself, then asks what decides it. */
  private explainCall(): void {
    const s = this.session;
    if (!s || !s.calls.length) return;
    if (this.state.view.name !== 'call') {
      this.show(startWith(s.calls).id);
      this.hush();
    }
    const call = this.current;
    if (!call) return;
    this.awaiting = undefined;
    this.say(callIntro(call));
  }

  /** In a conversation about a plan: the read, a call, or your calls. */
  private get talking(): boolean {
    const view = this.state.view.name;
    if (view === 'plans') return this.state.history.length > 0;
    return !!this.session && (view === 'read' || view === 'call' || view === 'calls');
  }

  // ------------------------------------------------------------ opening

  /** Runs when the panel opens: loads the newest plan, or resumes. */
  async start(): Promise<void> {
    const [config] = await Promise.all([this.host.getConfig(), this.refreshPacks()]);
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
    // Frank grabs the newest plan you haven't talked through; else, the home.
    const fresh = plans.find((p) => !this.stash.has(planKey(p)));
    if (fresh) await this.load(fresh);
    else await this.showPlans(true);
  }

  /**
   * The plans home. `ask`: in voice mode, Frank asks which one (on summon,
   * or when asked for the plans by voice).
   */
  async showPlans(ask = false): Promise<void> {
    this.cancel();
    this.hush();
    this.keepCurrent();
    this.set({
      view: { name: 'plans' },
      changing: false,
      voiceMenuOpen: false,
      speakingAbout: undefined,
    });
    // Stay open while the developer picks, or fetches a plan to drop or paste.
    void this.host.setPinned(true);
    this.setMood('idle');
    const kept = [...this.stash.values()].map((s) => s.session.context.plan);
    const current = this.state.plan ? [this.state.plan] : [];
    const known = [...current, ...kept, ...this.state.plans];
    // Show the plans Frank already knows while he looks further back.
    this.set({ history: uniquePlans([...known, ...this.state.history]) });
    const found = await this.host.planHistory().catch(() => [] as Plan[]);
    const history = uniquePlans([...known, ...found]);
    this.set({ history });
    // Picked one while Frank looked: nothing to ask.
    if (this.state.view.name !== 'plans') return;
    if (ask && this.voiceFirst && history.length) {
      this.say([
        { text: history.length === 1 ? 'Talk this one through?' : 'Which plan?' },
      ]);
    } else if (this.state.voice.state !== 'speaking') {
      this.yourTurn();
    }
  }

  /** Keeps the plan on screen, to come back to where you left off. */
  private keepCurrent(): void {
    const plan = this.state.plan;
    const s = this.session;
    if (!plan || !s) return;
    const view = this.state.view;
    const inPlan = view.name === 'read' || view.name === 'call' || view.name === 'calls';
    // Kept already, and not in it now (on the home): keep where it was left.
    if (!inPlan && this.stash.has(planKey(plan))) return;
    this.stash.set(planKey(plan), {
      session: s,
      gathered: this.state.gathered,
      gist: this.state.gist,
      fine: this.state.fine,
      view: view.name === 'call' || view.name === 'calls' ? view : { name: 'read' },
    });
  }

  /**
   * Opens `plan`: back where you left off if you've talked it through this
   * run; otherwise reads what it mentions, then gives the read.
   */
  async load(plan: Plan): Promise<void> {
    this.cancel();
    this.hush();
    const same = this.state.plan && planKey(this.state.plan) === planKey(plan);
    if (!same) this.keepCurrent();
    const kept = this.stash.get(planKey(plan));
    if (kept) return this.resume(plan, kept);
    this.session = undefined;
    this.set({
      plan,
      newerPlan: undefined,
      gathered: undefined,
      gist: '',
      fine: [],
      reading: false,
      calls: [],
      selected: undefined,
      turns: [],
      answers: {},
      highlight: undefined,
      turnError: undefined,
      changing: false,
      notice: undefined,
      noteCopied: false,
      note: '',
      progress: { made: 0, total: 0 },
      view: { name: 'preparing', step: 'Reading the plan' },
    });
    void this.host.setPinned(false);
    this.setMood('thinking');
    this.hush();
    this.awaiting = undefined;
    this.prefix = undefined;
    this.listen = true;

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

  private resume(plan: Plan, kept: Kept): void {
    this.session = kept.session;
    this.awaiting = undefined;
    this.prefix = undefined;
    this.listen = true;
    this.sync({
      plan,
      newerPlan: undefined,
      gathered: kept.gathered,
      gist: kept.gist,
      fine: kept.fine,
      reading: false,
      view: kept.view,
      changing: false,
      notice: undefined,
      turnError: undefined,
      streaming: undefined,
    });
    void this.host.setPinned(false);
    this.setMood(this.restingMood());
    const s = this.session;
    const call = this.current;
    if (this.voiceFirst && kept.view.name === 'call' && s.selected && call) {
      this.say([{ text: `Back to ${plan.title}.` }, ...walkMeThrough(call)]);
      this.awaiting = { kind: 'walk', callId: s.selected };
    } else if (this.voiceFirst) {
      this.say([{ text: `Back to ${plan.title}. Where were we?` }]);
    } else {
      this.yourTurn();
    }
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
    this.set({ view: { name: 'preparing', step: 'Finding the calls' } });
    this.setMood('thinking');

    const work = this.begin();
    this.startSlowTimers();
    // Frank starts talking as soon as the first part of the read arrives.
    this.briefed = 0;
    // The read appears as soon as its first part arrives, and fills in.
    const result = await runBreakdown(this.brain, context, work.signal, (partial) => {
      if (work.signal.aborted) return;
      this.brief(partial, false);
      this.stopSlowTimers();
      const fresh = partial.calls.length > this.state.calls.length;
      this.set({
        view: { name: 'read' },
        reading: true,
        gist: partial.gist,
        calls: partial.calls,
        marking: fresh || this.state.marking,
      });
      if (fresh) this.endMarkingSoon();
    });
    this.stopSlowTimers();
    if (work.signal.aborted || this.state.plan !== plan) return;
    this.work = undefined;

    if (result.status === 'failed') {
      const failure = this.brain.lastFailure;
      this.set({
        reading: false,
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
    this.sync({
      view: { name: 'read' },
      reading: false,
      gist: result.gist,
      fine: result.fine,
    });
    this.setMood(calls.length ? 'judging' : 'idle');
    this.brief({ ...result, calls }, true);
    // Without a voice, nothing to wait for: listen now.
    if (this.state.voice.state !== 'speaking') this.yourTurn();
  }

  private markingTimer: ReturnType<typeof setTimeout> | undefined;
  private endMarkingSoon(): void {
    clearTimeout(this.markingTimer);
    this.markingTimer = setTimeout(() => this.set({ marking: false }), MARKING_MS);
  }

  /** Try again after a brain error. */
  async retry(): Promise<void> {
    const gathered = this.state.gathered;
    const failedTurn = this.state.turnError ? this.lastTurn : undefined;
    this.set({ turnError: undefined });
    if (this.state.view.name === 'error' && gathered && this.state.plan) {
      await this.find(gathered);
    } else if (failedTurn) {
      await failedTurn();
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

  /** Voice mode: swap the voice bar for a text box, or back. */
  setTyping(typing: boolean): void {
    this.set({ typing });
    // Typing instead: the microphone goes off until you pick it back up.
    if (typing && this.state.handsFree) void this.stopHandsFree();
  }

  toggleVoiceMenu(open = !this.state.voiceMenuOpen): void {
    this.set({ voiceMenuOpen: open });
  }

  // ------------------------------------------------------------ moving around

  /** From the read: start with the first call not made yet. */
  beginCalls(): void {
    const s = this.session;
    if (!s || !s.calls.length) return;
    const first = s.calls.find((c) => !c.outcome) ?? s.calls[0]!;
    this.show(first.id);
  }

  /** Shows one call. */
  show(id: string): void {
    const s = this.session;
    if (!s || !s.calls.some((c) => c.id === id)) return;
    if (this.state.streaming && this.state.streaming.callId !== id) this.cancel();
    const moved = this.state.view.name !== 'call' || this.state.selected !== id;
    s.select(id);
    this.sync({ view: { name: 'call' }, changing: false, turnError: undefined });
    if (moved || this.prefix) this.speakCall(id);
  }

  /** The next call (this one stays as planned), or your calls after the last. */
  next(): void {
    const s = this.session;
    const id = this.state.selected;
    if (!s) return;
    if (this.state.view.name === 'read') return this.beginCalls();
    if (this.state.view.name !== 'call' || !id) return;
    const next = s.neighbour(id, 1);
    if (next) this.show(next);
    else this.review();
  }

  /** The previous call, or the read from the first one. */
  back(): void {
    const s = this.session;
    const id = this.state.selected;
    if (!s) return;
    if (this.state.view.name === 'calls') {
      const last = s.calls.at(-1);
      if (last) this.show(last.id);
      return;
    }
    if (this.state.view.name !== 'call' || !id) return;
    const prev = s.neighbour(id, -1);
    if (prev) this.show(prev);
    else this.sync({ view: { name: 'read' }, changing: false });
  }

  /** Your calls: every decision and the note. */
  review(): void {
    const s = this.session;
    if (!s) return;
    this.cancel();
    this.sync({ view: { name: 'calls' }, changing: false });
    this.setMood(this.restingMood());
    if (!this.voiceFirst || !s.calls.length) return;
    const prefix = this.prefix;
    this.prefix = undefined;
    this.hush();
    this.awaiting = { kind: 'copy' };
    this.say([
      ...(prefix ? [{ text: prefix }] : []),
      { text: wrapUp(s.calls, this.state.plan?.source) },
    ]);
  }

  // ------------------------------------------------------------ making calls

  /** Chooses an option for the call on screen, then moves on. */
  choose(option: number): void {
    const s = this.session;
    const call = this.current;
    if (!s || !call || this.state.view.name !== 'call') return;
    const chosen = call.options[option - 1];
    if (!chosen) return;
    this.cancel();
    const next = s.choose(call.id, option);
    this.flash(option === 1 ? `Kept the plan: ${chosen.label}` : `Chose ${chosen.label}`);
    this.prefix = madeCall(s.calls.find((c) => c.id === call.id)!);
    this.after(next);
  }

  /** Answers what the call comes down to; lights up the option it leads to. */
  answer(index: number, opts: { after?: boolean } = {}): void {
    const s = this.session;
    const call = this.current;
    if (!s || !call?.hinge?.answers[index] || this.state.view.name !== 'call') return;
    const option = s.answer(call.id, index);
    // A fresh answer outranks an older suggestion from Frank.
    if (s.suggestion?.callId === call.id) s.suggestion = undefined;
    this.sync();
    if (this.voiceFirst) {
      // After Frank's reply it follows on; otherwise it replaces what he's saying.
      if (!opts.after) this.hush();
      this.awaiting = { kind: 'confirm', callId: call.id, option };
      this.say([{ text: leadsTo(call, option), about: `call:${call.id}` }]);
    }
  }

  /** Enter in a call: take the highlighted option. */
  accept(): void {
    const h = this.state.highlight;
    if (h) this.choose(h.option);
  }

  drop(): void {
    const s = this.session;
    const call = this.current;
    if (!s || !call || this.state.view.name !== 'call') return;
    this.cancel();
    const next = s.decide(call.id, { verdict: 'drop' });
    this.flash(`Dropped: ${call.title}`);
    this.prefix = 'Dropped.';
    this.after(next);
  }

  /** "Something else": the composer asks what the agent should do instead. */
  somethingElse(): void {
    if (this.state.view.name === 'call') this.set({ changing: true });
  }

  cancelChange(): void {
    this.set({ changing: false });
  }

  private changeTo(detail: string): void {
    const s = this.session;
    const call = this.current;
    if (!s || !call) return;
    const next = s.decide(call.id, { verdict: 'change', detail });
    this.set({ changing: false });
    this.flash('Changed, in your words');
    this.prefix = 'Got it.';
    this.after(next);
  }

  /** After a decision: the next open call, or your calls when all are made. */
  private after(next: string | undefined): void {
    const s = this.session;
    if (!s) return;
    const allMade = s.calls.every((c) => c.outcome);
    if (next && !allMade) this.show(next);
    else this.review();
    this.setMood(this.restingMood());
  }

  // ------------------------------------------------------------ talking

  /**
   * Something the developer typed or said. Commands act at once; anything
   * else goes to Frank, about the call on screen.
   */
  async send(text: string, spoken = false): Promise<void> {
    const t = text.trim();
    if (!t) return;
    // In voice mode every answer is heard, typed question or not.
    const heard = spoken || this.voiceFirst;
    this.spoken = heard;
    this.holding = false;
    if (this.state.view.name === 'plans') return this.pickPlan(t, spoken);
    if (!this.session) return;
    if (this.state.changing) return this.changeTo(t);
    const awaiting = this.awaiting;
    this.awaiting = undefined;
    const command = parseCommand(
      t,
      this.state.view.name === 'call' ? this.current : undefined,
      {
        calls: this.session.calls,
        ...(yesNo(awaiting) ? { expecting: 'yes-no' as const } : {}),
      },
    );
    if (command && (await this.run(command, awaiting))) return;

    // From the read or your calls, a question is about the whole plan.
    if (this.state.view.name !== 'call') this.session.selected = undefined;
    const s = this.session;
    await this.stream((signal) => s.ask(t, signal, { spoken: heard }), s.selected);
  }

  /** On the plans home: a plan by name or position, or a pasted plan. */
  private async pickPlan(t: string, spoken: boolean): Promise<void> {
    const command = parseCommand(t);
    if (command?.type === 'plans') return;
    const history = this.state.history;
    const key = pickByWords(
      t,
      history.map((p) => ({ id: planKey(p), text: `${p.title} ${p.project ?? ''}` })),
    );
    const plan = history.find((p) => planKey(p) === key);
    if (plan) return this.load(plan);
    if (!spoken || t.includes('\n') || t.length > 120) return this.pastePlan(t);
    this.say([{ text: 'Which one? Say its name, or "the first one".' }]);
  }

  /** Runs a command. Returns false when it doesn't apply here. */
  private async run(
    command: Command,
    awaiting: PanelController['awaiting'] = undefined,
  ): Promise<boolean> {
    const view = this.state.view.name;
    switch (command.type) {
      case 'plans':
        await this.showPlans(true);
        return true;
      case 'explain':
        this.explainCall();
        return true;
      case 'unsure':
        if (view !== 'call') return false;
        await this.whatWouldYouDo(this.spoken, { unsure: true });
        return true;
      case 'hold':
        // A duck waits. Nothing to say.
        this.holding = true;
        this.awaiting = awaiting;
        this.flash('Take your time.');
        return true;
      case 'again': {
        if (this.lastSaid) {
          this.say(this.lastSaid);
          this.awaiting = awaiting;
          return true;
        }
        const s = this.session;
        if (!s) return false;
        await this.stream(
          (signal) =>
            s.ask(
              "Wait, what? Say that again more simply, with the context I'm missing.",
              signal,
              { spoken: this.spoken },
            ),
          s.selected,
        );
        return true;
      }
      case 'open':
        this.show(command.call);
        return true;
      case 'start':
        if (view !== 'read' && view !== 'calls') return false;
        this.beginCalls();
        return true;
      case 'yes':
        if (awaiting?.kind === 'copy') await this.copyNote();
        else if (awaiting?.kind === 'confirm' && awaiting.callId === this.state.selected)
          this.choose(awaiting.option);
        else return false;
        return true;
      case 'no':
        if (!yesNo(awaiting)) return false;
        this.hush();
        this.say([
          {
            text:
              awaiting.kind === 'copy'
                ? "Okay. It's here when you want it."
                : 'Okay. What would you rather do?',
          },
        ]);
        return true;
      case 'copy':
        await this.copyNote();
        return true;
      case 'next':
        this.next();
        return true;
      case 'back':
        this.back();
        return true;
      case 'take':
        if (view !== 'call') return false;
        await this.whatWouldYouDo(this.spoken);
        return true;
      case 'choose':
        if (view !== 'call') return false;
        this.choose(command.option);
        return true;
      case 'answer':
        if (view !== 'call') return false;
        this.answer(command.answer);
        return true;
      case 'accept':
        if (view !== 'call' || !this.state.highlight) return false;
        this.accept();
        return true;
      case 'drop':
        if (view !== 'call') return false;
        this.drop();
        return true;
    }
  }

  /** Frank's take on the call on screen. */
  async whatWouldYouDo(spoken = false, opts: { unsure?: boolean } = {}): Promise<void> {
    const s = this.session;
    if (!s || this.state.streaming || this.state.view.name !== 'call') return;
    const heard = spoken || this.voiceFirst;
    this.spoken = heard;
    await this.stream(
      (signal) => s.whatWouldYouDo(signal, { spoken: heard, unsure: !!opts.unsure }),
      s.selected,
    );
  }

  /** The last turn sent, so Retry can send it again after a failure. */
  private lastTurn: (() => Promise<void>) | undefined;

  private async stream(
    make: (signal: AbortSignal) => AsyncIterable<string>,
    callId: string | undefined,
  ): Promise<void> {
    this.lastTurn = () => this.stream(make, callId);
    this.cancel();
    this.hush();
    this.lastSaid = undefined;
    void this.host.stopSpeaking();
    const work = this.begin();
    const spoken = this.spoken;
    this.set({ streaming: { callId, text: '' }, turnError: undefined });
    this.setMood('thinking');
    this.startSlowTimers();
    let text = '';
    // Spoken to, Frank says each sentence as soon as it's written.
    const talk = this.shouldTalkBack(spoken);
    let said = 0;
    const sayReady = (done: boolean) => {
      if (!talk || work.signal.aborted) return;
      const ready = spokenSentences(splitSuggestion(text).text, done);
      for (; said < ready.length; said++) {
        if (said === 0) this.set({ voice: { state: 'speaking' } });
        void this.host.speak(ready[said]!, callId ? `call:${callId}` : undefined);
      }
    };
    try {
      for await (const chunk of make(work.signal)) {
        if (!text) this.stopSlowTimers();
        text += chunk;
        this.set({ streaming: { callId, text }, slow: undefined });
        sayReady(false);
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
      this.setMood(this.restingMood());
    }
    sayReady(true);
    if (talk && said) this.set({ lastLine: speakable(splitSuggestion(text).text) });
    // The developer's own words answered what the call comes down to.
    const heard = this.session?.heardAnswer;
    if (
      heard &&
      heard.callId === this.state.selected &&
      this.state.view.name === 'call'
    ) {
      this.session!.heardAnswer = undefined;
      this.answer(heard.answer, { after: true });
    }
  }

  /** Voice mode: always. Chat: when spoken to. Either way, only with a voice. */
  private shouldTalkBack(spoken: boolean): boolean {
    return this.canSpeak && (this.voiceFirst || spoken);
  }

  // ------------------------------------------------------------ voice

  /** Holding Space in the panel. */
  async startTalking(): Promise<void> {
    if (this.state.handsFree) return;
    if (this.state.voice.state === 'speaking') void this.host.stopSpeaking();
    await this.host.voiceStart();
  }

  async stopTalking(): Promise<void> {
    if (this.state.voice.state === 'listening') await this.host.voiceStop();
  }

  /** Tapping Space, or the microphone: talk freely, or stop. */
  async toggleHandsFree(): Promise<void> {
    // While Frank is answering, a tap cuts him short: your turn.
    if (this.state.handsFree && this.state.voice.state === 'speaking')
      return this.stopSpeaking();
    if (this.state.handsFree) return this.stopHandsFree();
    this.wantsHandsFree = true;
    this.listen = true;
    this.hush();
    this.set({ voiceError: undefined });
    await this.host.handsFreeStart();
  }

  /** Turns the microphone off; in voice mode it stays off until turned on. */
  async stopHandsFree(): Promise<void> {
    this.wantsHandsFree = false;
    this.listen = false;
    await this.host.handsFreeStop();
  }

  /** Set when hands-free is waiting on the listening pack to download. */
  private wantsHandsFree = false;

  async downloadPack(pack: Pack): Promise<void> {
    this.set({
      downloads: { ...this.state.downloads, [pack]: 0 },
      voiceError: undefined,
      ...(this.state.voice.state === 'needs-pack' ? { voice: { state: 'off' } } : {}),
    });
    await this.host.downloadPack(pack);
  }

  declinePack(): void {
    this.wantsHandsFree = false;
    this.set({ voice: { state: 'off' } });
  }

  /** Any key while Frank talks: he stops, and it's your turn. */
  stopSpeaking(): void {
    if (this.state.voice.state !== 'speaking') return;
    this.hush();
    this.yourTurn();
  }

  /**
   * After Frank has had his say: the developer's turn. Hands-free listens
   * again; in voice mode it starts listening if it isn't already.
   */
  private yourTurn(): void {
    if (this.state.voice.state !== 'off' || this.state.streaming) return;
    const patience: Patience = this.holding
      ? 'hold'
      : this.awaiting?.kind === 'walk'
        ? 'long'
        : this.awaiting
          ? 'short'
          : 'normal';
    this.set({ turnKind: patience });
    if (this.state.handsFree?.state === 'paused') {
      void this.host.handsFreeResume(patience);
      return;
    }
    if (
      !this.state.handsFree &&
      this.voiceFirst &&
      this.listen &&
      this.talking &&
      this.state.packs?.listening.installed
    )
      void this.host.handsFreeStart(patience);
  }

  private onVoice(e: VoiceEvent): void {
    switch (e.type) {
      case 'listening':
        this.set({ voice: { state: 'listening', level: 0 }, voiceError: undefined });
        this.setMood('listening');
        return;
      case 'level':
        if (this.state.handsFree)
          this.set({ handsFree: { ...this.state.handsFree, level: e.level } });
        else if (this.state.voice.state === 'listening')
          this.set({ voice: { state: 'listening', level: e.level } });
        return;
      case 'transcribing':
        this.set({ voice: { state: 'transcribing' } });
        this.setMood('thinking');
        return;
      case 'heard':
        if (e.text.trim()) this.set({ lastHeard: e.text.trim() });
        if (this.state.handsFree) {
          void this.send(e.text, true).finally(() => this.yourTurn());
          return;
        }
        this.set({ voice: { state: 'off' } });
        this.setMood(this.restingMood());
        if (e.text.trim()) void this.send(e.text, true);
        else this.set({ voiceError: "Didn't catch that. Hold, talk, then let go." });
        return;
      case 'failed':
        this.set({ voice: { state: 'off' }, voiceError: e.message });
        this.setMood(this.restingMood());
        return;
      case 'needs-pack':
        this.set({
          voice: { state: 'needs-pack', pack: e.pack, megabytes: e.megabytes },
        });
        this.setMood(this.restingMood());
        return;
      case 'downloading':
        this.set({ downloads: { ...this.state.downloads, [e.pack]: e.fraction } });
        return;
      case 'pack-ready': {
        const downloads = { ...this.state.downloads };
        delete downloads[e.pack];
        this.set({ downloads });
        void this.refreshPacks();
        if (e.pack === 'voices') {
          this.flash("Frank's voice is ready.");
        } else if (this.wantsHandsFree) {
          void this.toggleHandsFree();
        } else {
          this.flash('Voice is ready. Hold Space to talk, or tap it to talk freely.');
        }
        return;
      }
      case 'speaking':
        this.set({ speakingAbout: e.id });
        return;
      case 'spoken':
        if (this.state.voice.state === 'speaking') this.set({ voice: { state: 'off' } });
        this.set({ speakingAbout: undefined });
        this.yourTurn();
        return;
      case 'hands-free':
        if (e.state === 'off') {
          this.wantsHandsFree = false;
          this.set({ handsFree: undefined });
          void this.host.setPinned(this.state.view.name === 'plans');
          this.setMood(this.restingMood());
          return;
        }
        if (!this.state.handsFree) void this.host.setPinned(true);
        this.set({
          handsFree: { state: e.state, level: this.state.handsFree?.level ?? 0 },
          voiceError: undefined,
        });
        if (e.state !== 'paused') this.setMood('listening');
        return;
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
    this.set({
      noteCopied: true,
      notice: copiedMessage(plan.source),
      visits: {
        ...this.state.visits,
        [planKey(plan)]: { ...this.session.progress, copied: true },
      },
    });
    this.hush();
    this.say([{ text: copiedMessage(plan.source) }]);
    this.setMood('done');
    setTimeout(() => void this.host.hidePanel(), 900);
    setTimeout(() => {
      this.set({ noteCopied: false });
      this.setMood('idle');
    }, 3_000);
  }

  /** Esc: backs out of whatever is open, else closes the panel. Nothing is lost. */
  async close(): Promise<void> {
    // What's open on screen first, then Frank talking, then listening.
    if (this.state.voice.state === 'needs-pack') return this.declinePack();
    if (this.state.changing) return this.cancelChange();
    if (this.state.voiceMenuOpen) return this.toggleVoiceMenu(false);
    if (this.state.settingsOpen) return this.closeSettings();
    if (this.state.voice.state === 'speaking') return this.stopSpeaking();
    if (this.state.handsFree) return this.stopHandsFree();
    await this.host.hidePanel();
  }

  openSettings(): void {
    this.set({ settingsOpen: true, voiceMenuOpen: false });
    void this.host.setPinned(true);
  }

  closeSettings(): void {
    this.set({ settingsOpen: false });
    void this.host.setPinned(this.state.view.name === 'plans' || !!this.state.handsFree);
    void this.reloadConfig();
  }

  async reloadConfig(): Promise<void> {
    this.set({ config: await this.host.getConfig() });
  }

  /**
   * Voice first or chat. Voice downloads whatever it still needs, in the
   * background: the panel works as text meanwhile.
   */
  async chooseMode(mode: 'voice' | 'chat'): Promise<void> {
    const config = this.state.config ?? (await this.host.getConfig());
    await this.host.saveConfig({ ...config, voice: { ...config.voice, mode } });
    await this.reloadConfig();
    if (mode !== 'voice') return;
    await this.refreshPacks();
    for (const pack of ['listening', 'voices'] as const) {
      if (!this.state.packs?.[pack].installed) void this.downloadPack(pack);
    }
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

/**
 * What Frank says out loud: the first two sentences of his reply, without
 * tables, code or Markdown (ux.md §4).
 */
/** How many sentences Frank says out loud. */
const SPOKEN_SENTENCES = 2;

/**
 * The sentences of a reply that are ready to say: complete ones (or all of
 * them once the reply is done), without tables, code or Markdown, at most
 * two (ux.md §4).
 */
export function spokenSentences(reply: string, done: boolean): string[] {
  const prose = speakableProse(done ? reply : reply.replace(/```[^`]*$/, ''));
  // A sentence ends at . ! or ? followed by a space or the end, so v1.2 stays whole.
  const complete = prose.match(/(?:[^.!?]|[.!?](?=\S))+[.!?]+(?=\s|$)/g) ?? [];
  const sentences = complete.map((s) => s.trim()).filter(Boolean);
  if (done) {
    const rest = prose.slice(complete.join('').length).trim();
    if (rest) sentences.push(rest);
  }
  return sentences.slice(0, SPOKEN_SENTENCES);
}

/** What Frank says out loud, all at once: the first two sentences. */
export function speakable(reply: string): string {
  return spokenSentences(reply, true).join(' ');
}

function speakableProse(reply: string): string {
  return reply
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*\|/.test(l))
    .join(' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*|\*([^*]+)\*/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The plan's source, for "Claude Code's plan…". */
function sourceOf(plan: Plan | undefined): { source?: Plan['source'] } {
  return plan ? { source: plan.source } : {};
}

/** Plans without repeats, newest first. */
function uniquePlans(plans: Plan[]): Plan[] {
  const seen = new Set<string>();
  return plans
    .filter((p) => {
      const key = planKey(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/** Frank asked a yes-or-no question: go with an option, or copy the note. */
function yesNo(
  awaiting: { kind: string } | undefined,
): awaiting is { kind: 'confirm' | 'copy' } {
  return awaiting?.kind === 'confirm' || awaiting?.kind === 'copy';
}
