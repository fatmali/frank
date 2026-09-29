/**
 * The panel's behaviour, separate from how it looks: which plan, what Frank
 * is doing, the session, voice, and every action a key, a click or a spoken
 * command can take. docs/ux.md §5–7 describes the flows implemented here.
 */
import {
  Session,
  copiedMessage,
  fitToBudget,
  parseCommand,
  runBreakdown,
  splitSuggestion,
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
  type Host,
  type VoiceEvent,
} from './host.ts';
import { SAMPLE_FILES, SAMPLE_ORIGIN, samplePlan } from './sample.ts';

export type View =
  | { name: 'starting' }
  | { name: 'onboarding' }
  | { name: 'no-plan' }
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
  | { state: 'needs-model'; megabytes: number }
  | { state: 'downloading'; fraction: number };

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
    pickerOpen: false,
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

  /** Starts over on `plan`: reads what it mentions, then gives the read. */
  async load(plan: Plan): Promise<void> {
    this.cancel();
    this.session = undefined;
    this.set({
      plan,
      newerPlan: undefined,
      pickerOpen: false,
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
    this.set({ view: { name: 'preparing', step: 'Finding the calls' } });
    this.setMood('thinking');

    const work = this.begin();
    this.startSlowTimers();
    // The read appears as soon as its first part arrives, and fills in.
    const result = await runBreakdown(this.brain, context, work.signal, (partial) => {
      if (work.signal.aborted) return;
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

  togglePicker(open = !this.state.pickerOpen): void {
    this.set({ pickerOpen: open });
    if (open) void this.host.recentPlans().then((plans) => this.set({ plans }));
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
    s.select(id);
    this.sync({ view: { name: 'call' }, changing: false, turnError: undefined });
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
    if (!this.session) return;
    this.cancel();
    this.sync({ view: { name: 'calls' }, changing: false });
    this.setMood(this.restingMood());
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
    this.after(next);
  }

  /** Answers what the call comes down to; lights up the option it leads to. */
  answer(index: number): void {
    const s = this.session;
    const call = this.current;
    if (!s || !call?.hinge?.answers[index] || this.state.view.name !== 'call') return;
    s.answer(call.id, index);
    // A fresh answer outranks an older suggestion from Frank.
    if (s.suggestion?.callId === call.id) s.suggestion = undefined;
    this.sync();
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
    this.spoken = spoken;
    if (!this.session) {
      if (this.state.view.name === 'no-plan') await this.pastePlan(t);
      return;
    }
    if (this.state.changing) return this.changeTo(t);
    const command = parseCommand(
      t,
      this.state.view.name === 'call' ? this.current : undefined,
    );
    if (command && (await this.run(command))) return;

    // From the read or your calls, a question is about the whole plan.
    if (this.state.view.name !== 'call') this.session.selected = undefined;
    const s = this.session;
    await this.stream((signal) => s.ask(t, signal, { spoken }), s.selected);
  }

  /** Runs a command. Returns false when it doesn't apply here. */
  private async run(command: Command): Promise<boolean> {
    const view = this.state.view.name;
    switch (command.type) {
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
  async whatWouldYouDo(spoken = false): Promise<void> {
    const s = this.session;
    if (!s || this.state.streaming || this.state.view.name !== 'call') return;
    this.spoken = spoken;
    await this.stream((signal) => s.whatWouldYouDo(signal, { spoken }), s.selected);
  }

  /** The last turn sent, so Retry can send it again after a failure. */
  private lastTurn: (() => Promise<void>) | undefined;

  private async stream(
    make: (signal: AbortSignal) => AsyncIterable<string>,
    callId: string | undefined,
  ): Promise<void> {
    this.lastTurn = () => this.stream(make, callId);
    this.cancel();
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
        void this.host.speak(ready[said]!);
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
  }

  private shouldTalkBack(spoken: boolean): boolean {
    const mode = this.state.config?.voice?.talk_back ?? 'when-spoken';
    return mode === 'always' || (mode === 'when-spoken' && spoken);
  }

  // ------------------------------------------------------------ voice

  /** Holding Space in the panel. */
  async startTalking(): Promise<void> {
    if (this.state.voice.state === 'speaking') void this.host.stopSpeaking();
    await this.host.voiceStart();
  }

  async stopTalking(): Promise<void> {
    if (this.state.voice.state === 'listening') await this.host.voiceStop();
  }

  async downloadVoiceModel(): Promise<void> {
    this.set({ voice: { state: 'downloading', fraction: 0 }, voiceError: undefined });
    await this.host.downloadVoiceModel();
  }

  declineVoiceModel(): void {
    this.set({ voice: { state: 'off' } });
  }

  stopSpeaking(): void {
    if (this.state.voice.state !== 'speaking') return;
    void this.host.stopSpeaking();
    this.set({ voice: { state: 'off' } });
  }

  private onVoice(e: VoiceEvent): void {
    switch (e.type) {
      case 'listening':
        this.set({ voice: { state: 'listening', level: 0 }, voiceError: undefined });
        this.setMood('listening');
        return;
      case 'level':
        if (this.state.voice.state === 'listening')
          this.set({ voice: { state: 'listening', level: e.level } });
        return;
      case 'transcribing':
        this.set({ voice: { state: 'transcribing' } });
        this.setMood('thinking');
        return;
      case 'heard':
        this.set({ voice: { state: 'off' } });
        this.setMood(this.restingMood());
        if (e.text.trim()) void this.send(e.text, true);
        else this.set({ voiceError: "Didn't catch that. Hold, talk, then let go." });
        return;
      case 'failed':
        this.set({ voice: { state: 'off' }, voiceError: e.message });
        this.setMood(this.restingMood());
        return;
      case 'needs-model':
        this.set({ voice: { state: 'needs-model', megabytes: e.megabytes } });
        this.setMood(this.restingMood());
        return;
      case 'downloading':
        this.set({ voice: { state: 'downloading', fraction: e.fraction } });
        return;
      case 'model-ready':
        this.set({ voice: { state: 'off' } });
        this.flash('Voice is ready. Hold to talk.');
        return;
      case 'spoken':
        if (this.state.voice.state === 'speaking') this.set({ voice: { state: 'off' } });
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
    if (this.state.voice.state === 'speaking') return this.stopSpeaking();
    if (this.state.voice.state === 'needs-model') return this.declineVoiceModel();
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
