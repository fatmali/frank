/** Where a plan came from. */
export type PlanSource =
  'claude-code' | 'copilot' | 'cursor' | 'codex' | 'pasted' | 'file';

export interface Plan {
  source: PlanSource;
  /** The plan's own title: its first heading or first line. */
  title: string;
  /** The plan text, as Markdown. */
  body: string;
  /** Absolute path of the repo the plan belongs to, if known. */
  project?: string;
  /** ISO timestamp of when the plan was written. */
  modifiedAt: string;
  /** File path the plan was read from, or a label such as "clipboard". */
  origin: string;
}

/** A repo file the plan mentions, read so Frank can check claims against it. */
export interface FileContext {
  /** Path relative to the repo root. */
  path: string;
  content: string;
  /** True when the content was trimmed to fit the context budget. */
  truncated: boolean;
}

export interface RepoSummary {
  root: string;
  branch?: string;
  changedFiles: string[];
  /** Rules files such as AGENTS.md or CLAUDE.md. */
  rules: { path: string; content: string }[];
}

export interface Context {
  plan: Plan;
  files: FileContext[];
  repo?: RepoSummary;
  /** Anything else the developer added: pasted text, notes. */
  extras: string[];
}

export type CallKind = 'option' | 'silent-choice' | 'assumption';
export type UndoCost = 'hard' | 'medium' | 'easy';

export interface Evidence {
  /** Must be one of the files Frank was given. */
  file: string;
  line?: number;
  note: string;
}

export type Outcome =
  | { verdict: 'keep' }
  /** `option` is set when the change is one of the call's options (1-based). */
  | { verdict: 'change'; detail: string; option?: number }
  | { verdict: 'drop' };

/** One way to make a call. A call's first option is always the plan's own choice. */
export interface Option {
  /** A few words: "Redis", "In memory". */
  label: string;
  /** What it buys, in a few words. */
  gain: string;
  /** What it costs, in a few words. */
  cost: string;
  /** What the agent should do, as one instruction. */
  instruction: string;
}

/** The one fact about the developer's situation that decides a call. */
export interface Hinge {
  question: string;
  /** Each answer leads to an option (1-based). */
  answers: { answer: string; option: number }[];
}

/** A decision inside the plan that deserves a second look. */
export interface Call {
  /** "1".."5", in ranked order. */
  id: string;
  /** Short title in the developer's language, e.g. "Counter storage". */
  title: string;
  /** The decision as a plain question: "Where should the counters live?" */
  question: string;
  /** Why it matters, in one sentence. Empty when the brain didn't say. */
  stakes: string;
  /**
   * The call in one line, written to be heard: the decision and its options
   * by name ("where the counters live: Redis, like the plan says, or in
   * memory"). Empty from older reads.
   */
  spoken: string;
  kind: CallKind;
  /** The plan's own words for this call. Empty when they couldn't be found in the plan. */
  planQuote: string;
  /** Where planQuote sits in plan.body, for marking it in the UI. */
  quoteSpan?: { start: number; end: number };
  /** What the plan does. */
  planChoice: string;
  /** Realistic alternatives, by label. */
  alternatives: string[];
  /** The plan's choice first, then one or two alternatives. */
  options: Option[];
  hinge?: Hinge;
  undoCost: UndoCost;
  /** True only when the provided code contradicts the plan. */
  contradicted: boolean;
  evidence: Evidence[];
  outcome?: Outcome;
}

/** Frank's first take on a plan: what it does, what needs the developer, what's fine. */
export interface Read {
  /** What the plan does, in one sentence. */
  gist: string;
  /** Why: a clause such as "so one noisy key can't slow the API for everyone". May be empty. */
  goal: string;
  calls: Call[];
  /** Things Frank checked and found fine. */
  fine: string[];
}

export interface Turn {
  role: 'user' | 'frank';
  text: string;
  /** The call this turn is about, when it's about one. */
  callId?: string;
}

/** A request to a brain. Brains are answer-only: no tools, ever. */
export interface BrainRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** When set, the brain should return JSON matching this schema if it can enforce it. */
  jsonSchema?: Record<string, unknown>;
}

/** Anything Frank can think with: Claude Code, Copilot, an API, Ollama, or a fake in tests. */
export interface Brain {
  id: string;
  /** Streams the reply as text chunks. */
  stream(request: BrainRequest, signal?: AbortSignal): AsyncIterable<string>;
}
