# Frank — Design

Frank is a small desktop duck you summon with a hotkey when you're
overwhelmed. He loads the plan your coding agent just wrote and picks out the
calls that matter: the options it offers, the choices it made quietly, and
the assumptions it relies on. He checks them against your code, talks each
one through with you, and hands your decisions back to the agent. He runs on
the AI subscription you already have.

- **Product overview:** [../README.md](../README.md)
- **UX and design system:** [ux.md](ux.md)
- **M1 build plan:** [m1-plan.md](m1-plan.md)
- **This doc:** requirements, data model, architecture and work plan.

Priority tags: **[M1]**–**[M4]** refer to the milestones in §7.

---

## 1. Overview

### 1.1 The problem

A coding agent's plan is really a bundle of decisions. Some are explicit:
"we could store counts in Redis or in memory." Many are silent: a new
dependency, a schema change, "apply this to every route," an assumption that
a service exists. Checking each one takes time and context, so developers
often approve the whole plan at once. The calls that were wrong come back
later as rework.

Asking another chat window for help means copy-pasting the plan,
re-explaining the repo, and getting a long essay back.

### 1.2 The product

Frank lives in your menu bar, or on your screen in sticky mode. Press a
hotkey, then talk or type. The flow:

1. He already has the plan, your repo, and the files the plan touches.
2. He lists the few calls worth a second look, hardest to undo first.
3. He walks through them with you one at a time: the options side by side,
   one good question, a check against your code, and a recommendation if you
   ask.
4. He writes a short note with your decisions for you to give back to your
   agent.

His brain is whichever AI you already pay for: Claude Code, GitHub Copilot,
Cursor, an API key, or a local model.

### 1.3 Goals

- Summoning Frank is instant: one hotkey, from anywhere.
- No copy-pasting: Frank finds the plan you're working on.
- The calls that matter in a plan get surfaced, including the silent ones.
- Choices are checked against the real code, not just argued in the
  abstract.
- The result goes straight back to the agent as a short, clear note.
- No new bill: Frank runs on the subscription the developer already has.
- Honest help: Frank disagrees when a choice is wrong, whoever made it.

### 1.4 Non-goals

- Writing or editing code. Frank helps you decide; your agent does the work.
- Rewriting the agent's plan wholesale. Frank focuses on the few calls that
  matter.
- Watching your screen or speaking up unprompted.
- Accounts, cloud sync or telemetry.

---

## 2. User flow

```
 ⌥⇧Space ─▶ plan loaded ─▶ key calls listed ─▶ talk through each ─▶ note for your agent
  (hold to talk,  (latest plan in this       (options, silent choices,  (options, one question,  (copied, ready
   or type)        project + touched files)   assumptions; ranked)       code check, verdict)     to paste)
```

1. **Summon.** A hotkey or a click on Frank opens a small panel: under the
   menu bar icon by default, or next to Frank in sticky mode. Holding the
   hotkey records voice, and releasing sends. Typing works too.
2. **Plan.** Frank loads the most recent plan for the current project, plus
   the repo summary and the files the plan mentions. One click switches to a
   different recent plan or adds context such as a file or the clipboard.
3. **Key calls.** Frank lists up to five calls, hardest to undo
   first. For each one he shows what the plan chose and the alternative. The
   user picks where to start, or says "all fine" for any of them.
4. **Talk it through.** For each call, Frank shows the options side by side,
   notes anything the code says about it (for example, "no Redis in your
   repo"), asks one question, and recommends when asked. The user decides:
   keep the plan's choice, change it, or drop the step.
5. **Done.** Frank composes a short note for the agent listing what to keep
   and what to change. It is copied to the clipboard, and the panel closes.

Other sessions follow the same shape:

- **Two plans:** Frank compares them the same way, decision by decision.
- **An idea, no plan:** "Should I split this service?" Frank talks it
  through with the repo as context.
- **Just stuck:** "I've been on this bug for an hour." A plain conversation
  with the repo as context.

---

## 3. Functional requirements

### 3.1 Frank on screen

- **FR-1 [M1]** By default Frank lives in the menu bar (macOS) or the system
  tray (Windows, Linux) and is out of sight until summoned.
- **FR-2 [M1]** A global hotkey (default `⌥⇧Space`, recorded on first run) opens and
  closes the panel from any app.
- **FR-3 [M1]** **Sticky mode, off by default.** When it's on, Frank sits on
  screen, always on top. He's draggable, remembers his position, and can be
  toggled from the menu bar icon or settings.
- **FR-4 [M1]** Frank shows his state at a glance on the menu bar icon or the
  sticky duck: idle, listening, thinking, judging (he found something worth
  a look), done.

### 3.2 Input

- **FR-5 [M1]** Type into the panel.
- **FR-6 [M1]** Voice first. After the read, Frank briefs the developer out
  loud (the plan and its goal, each call in a line) and asks which call to
  talk through, then listens hands-free and takes turns. Push-to-talk works
  too. Common commands ("the Redis one", "keep it", "yes", "next") act at
  once on-device; anything else goes to Frank, and his answers are spoken.
  Chat mode, a setting, is the panel alone. See ux.md §6.
- **FR-7 [M1]** Drop files or text onto the panel, or onto sticky Frank, to
  add them as context. A pasted plan works the same as a found one.

### 3.3 Finding the plan

- **FR-8 [M1: Claude Code; M2: others]** **Plan finder.** On summon, Frank finds recent plans from
  supported coding agents (by default, the last 30 minutes). He opens the
  most recent plan for the current project, and one click switches to
  another.
- **FR-9 [M1: Claude Code; M2: others]** Supported sources:
  - Claude Code plan files in `~/.claude/plans/` (or the `plansDirectory`
    setting) and recent sessions.
  - Cursor plan files in `~/.cursor/plans/` and plans saved in the workspace.
  - Codex CLI sessions in `~/.codex/sessions/`.
- **FR-10 [M1]** Repo context: Frank detects the current project (§5.4) and
  includes the branch, changed files, and rules files (`AGENTS.md`,
  `CLAUDE.md`).
- **FR-11 [M1]** **Touched files.** Frank reads the files the plan
  mentions, read-only and within a size budget. His checks can then use the
  real code.
- **FR-12 [M1]** The clipboard is used as context only when the user includes
  it.
- **FR-13 [M1]** Before any context is used, Frank shows what he loaded and
  lets the user deselect items.

### 3.4 Breaking down the plan

- **FR-14 [M1]** Frank extracts the plan's **calls** (the decisions inside it):
  - **Options:** alternatives the plan names ("Redis or in memory").
  - **Silent choices:** consequential choices made without asking, such as
    new dependencies, new services, schema or data migrations, public API
    changes, deletions, and scope ("every route").
  - **Assumptions:** things the plan relies on that the code might not
    support ("Redis is available").
- **FR-15 [M1]** Calls are ranked with the hardest to undo first.
  At most five are shown, and trivial ones are left out.
- **FR-16 [M1]** For each call, Frank shows what the plan chose, the
  realistic alternative(s), and any evidence from the code, with the file it
  came from.
- **FR-17 [M1]** Frank flags assumptions the code contradicts or doesn't
  support. Example: "the plan uses Redis; there's no Redis config in this
  repo."

### 3.5 Talking it through

- **FR-18 [M1]** Frank takes the decisions one at a time, starting with the
  one the user picks. He keeps replies short and asks at most one question
  per turn.
- **FR-19 [M1]** For each decision, he shows the options side by side on the
  few dimensions that matter: undo cost, effort, risk, and fit with the
  current code.
- **FR-20 [M1]** Asked "what would you do?", Frank gives a clear
  recommendation, the reasons, and what would change his answer.
- **FR-21 [M1]** Frank is honest. He doesn't flatter, and he says when a
  choice is wrong, whether it's the plan's or the user's.
- **FR-22 [M1]** For each decision the user can keep the plan's choice,
  change it, or drop the step. "All fine" skips the rest.
- **FR-23 [M1]** Replies stream, so the first words appear quickly.

### 3.6 Finishing

- **FR-24 [M1]** **Note for your agent.** When the user is done, Frank writes
  a short message listing what to keep, what to change, and what to drop. It
  is written for the agent to act on and copied to the clipboard.
- **FR-25 [M4]** Optionally, Frank hands the note straight back to the agent
  instead of copying it, for example by writing it where the agent will pick
  it up.
- **FR-26 [M4]** Optional history lists past sessions with their decisions,
  and any of them can be reopened.

### 3.7 Frank's brain

- **FR-27** Frank thinks with whichever AI the user already has:

  | Brain | How | Milestone |
  | --- | --- | --- |
  | Claude Code (Pro, Max or API) | Runs the user's installed `claude` in headless mode | M1 |
  | API key: Anthropic, OpenAI, OpenAI-compatible | Direct API calls | M1 |
  | Local model | Ollama | M1 |
  | GitHub Copilot (any plan, including Free) | Official Copilot SDK | M1 |
  | Cursor | Cursor CLI in headless mode | M2 |

- **FR-28 [M1]** On first run, Frank detects installed agent CLIs,
  `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in the environment, and a running
  Ollama. He asks the user to pick one, and the choice can be changed later
  in settings.
- **FR-29 [M1]** Agent-backed brains are answer-only: no file edits, no shell
  commands, no tools. Frank gathers the code context himself (FR-11), so
  every brain gets the same context.
- **FR-30 [M1]** If the brain is unreachable, signed out, or out of quota,
  Frank says so plainly (for example, "Claude Code isn't signed in; open it
  and log in") and keeps the user's input so they can retry.

---

## 4. Non-functional requirements

- **NFR-1 Fast.**
  - The panel appears within 150 ms of the hotkey.
  - The decision list appears within about 5 s on API brains and about 8 s
    on agent-backed brains.
  - After that, replies start streaming within 1.5 s (API brains) or 4 s
    (agent brains).
- **NFR-2 Light.** Idle memory stays small (target under 100 MB) with
  near-zero CPU. Frank must never be something people quit to save battery.
- **NFR-3 Private.** No telemetry, and no network calls except to the chosen
  brain. Context is read only on summon, and code files are read only when
  the plan mentions them or the user adds them.
- **NFR-4 Credentials.**
  - Frank never reads, stores or passes on credentials that belong to an
    agent. Users sign in through each agent's own flow.
  - API keys that Frank manages are stored in the OS keychain, never in plain
    config files or logs.
  - Common secret patterns are stripped from context before it is sent.
- **NFR-5 Cross-platform.** macOS first, then Windows and Linux.
- **NFR-6 Accessible.** Fully keyboard-driven. State is never shown by colour
  alone.
- **NFR-7 Resilient to agent changes.** Plan-finder adapters and brain
  adapters are isolated. A change in one agent breaks only that adapter, and
  the rest keep working.
- **NFR-8 Small and auditable.** Few dependencies and readable code, because
  this is a tool people trust with their context.

---

## 5. Data model

Everything is local. Nothing is written into the user's repos.

### 5.1 Layout

```
~/.frank/
  config.toml              # brain, hotkey, sticky mode, plan window
  sessions/
    2026-09-28T14-02-11.json   # one file per session (history, M4)
```

API keys managed by Frank live in the OS keychain and are referenced by name
from `config.toml`. Agent credentials stay with the agents.

### 5.2 Config (`config.toml`)

| Key | Default | Notes |
| --- | --- | --- |
| `brain.kind` | chosen on first run | `claude-code` \| `copilot` \| `cursor` \| `anthropic` \| `openai` \| `openai-compatible` \| `ollama` |
| `brain.model` | brain's default | Optional model override where the brain supports it |
| `brain.base_url` | none | For OpenAI-compatible endpoints or Ollama |
| `hotkey` | `Alt+Shift+Space` | Global shortcut, recorded on first run |
| `sticky.enabled` | `false` | Sticky mode: Frank always on screen |
| `sticky.position` | bottom-right | Last dragged position (sticky mode) |
| `plans.window_minutes` | `30` | How far back the plan finder looks |
| `plans.sources` | all | Enabled plan-finder adapters |
| `context.max_file_kb` | `200` | Budget for touched files read per session |

### 5.3 In-memory types

```ts
type Plan = {
  source: 'claude-code' | 'cursor' | 'codex' | 'file' | 'clipboard';
  title: string;          // first heading or first line
  body: string;           // plan text (Markdown)
  project?: string;       // absolute path of the repo it belongs to, if known
  modifiedAt: Date;
  origin: string;         // file path it was read from
  touchedFiles: string[]; // repo paths the plan mentions
};

type Call = {
  title: string;                                // "Where to store counts"
  kind: 'option' | 'silent-choice' | 'assumption';
  planChoice: string;                           // what the plan does
  alternatives: string[];                       // realistic other options
  undoCost: 'high' | 'medium' | 'low';          // used for ranking
  evidence: { file: string; note: string }[];   // what the code says
  outcome?: { verdict: 'keep' | 'change' | 'drop'; detail?: string };
};

type Session = {
  startedAt: Date;
  brain: string;          // e.g. 'claude-code'
  plan?: Plan;
  context: { repo?: RepoInfo; extras: string[] };
  calls: Call[];
  messages: { role: 'user' | 'frank'; text: string }[];
  agentNote?: string;     // the note handed back to the agent
};
```

### 5.4 Project detection

Plans are grouped by the project they belong to:

- Codex sessions record their working directory.
- Claude Code sessions are stored per project.
- Plan files are matched by the file paths they mention.

The current project is the one with the most recent activity, and the user
can switch it in one click. Detecting the frontmost app (the active terminal
or editor) is a later refinement.

---

## 6. High-level design

### 6.1 Components

```
┌────────────────────────────── Tauri app ──────────────────────────────┐
│  UI (TypeScript/React, webview)                                        │
│   menu bar panel · sticky duck · decision list · side-by-side view     │
│   session engine: breakdown → talk-through → agent note                │
│        │                                        ▲ events               │
├────────┼────────────────────────────────────────┼──────────────────────┤
│  Core (Rust)                                                           │
│   global hotkey · tray/menu bar · sticky window (always-on-top)        │
│   plan finder adapters · touched-file reader · repo reader (git)       │
│   clipboard · keychain · brain adapters · local STT (whisper.cpp)      │
└────────────────────────────────────────────────────────────────────────┘
      │                                   │
 ~/.claude/plans, ~/.cursor/plans,    brains: claude (headless) · Copilot SDK ·
 ~/.codex/sessions, current repo      Cursor CLI · APIs · Ollama
```

- **Tauri 2** keeps the app small and native. It provides the tray and menu
  bar icon, an optional always-on-top transparent window for sticky mode,
  and a global-shortcut plugin.
- **The Rust core** does the OS-level work:
  - the hotkey and windows,
  - reading agent files, touched files and git,
  - the keychain,
  - on-device speech-to-text,
  - running brains.
- **The TypeScript UI** owns the session. It runs the breakdown, the
  talk-through and the agent note, and renders the decision list,
  side-by-side views and streamed replies.

### 6.2 Plan finder

Each agent has a small adapter:

```ts
interface PlanSource {
  id: string;                               // 'claude-code', 'cursor', 'codex'
  available(): Promise<boolean>;            // is the agent installed / dir present?
  recent(since: Date): Promise<Plan[]>;     // plans modified after `since`
}
```

- **Claude Code:** read `*.md` in the plans directory (the default
  `~/.claude/plans/`, or `plansDirectory` from user or project settings).
  Also scan recent session transcripts for a plan that hasn't been saved.
- **Cursor:** read `~/.cursor/plans/*.plan.md` and any `*.plan.md` in the
  current workspace.
- **Codex:** read recent `rollout-*.jsonl` under
  `~/.codex/sessions/YYYY/MM/DD/`. Extract the latest proposed plan (the
  plan-tool output or the last long assistant message) and the session's
  working directory.

The finder runs only on summon. It picks the most recent plan for the
current project and keeps the others one click away. The touched-file reader
then extracts repo paths mentioned in the plan and reads those files within
the size budget. The biggest files are trimmed first, keeping their
signatures and outlines.

### 6.3 Session engine

A session has three steps, each a call to the brain:

1. **Breakdown.** Frank sends the plan, the repo summary and the touched
   files, and asks for the calls as a small JSON list following
   the `Call` shape, ranked by undo cost and capped at five.
   - API brains use structured output where the provider supports it.
   - Agent-backed brains are asked for JSON. The output is validated and
     repaired once if it's malformed.
   - If repair fails, Frank falls back to a plain-text numbered list, so the
     session never stalls.
2. **Talk-through.** A conversational loop, one decision at a time. The
   system prompt defines Frank's behaviour:
   - Listen first, and keep replies to a few sentences.
   - Ask at most one question per turn.
   - Show the options side by side.
   - Cite code evidence with its file.
   - Be honest and never flatter.
   - When asked, give a clear recommendation, with reasons and what would
     change it.

   Each decision's outcome (keep, change or drop, plus detail) is recorded
   as the user settles it.
3. **Agent note.** Frank composes a short note from the recorded outcomes,
   written for the agent to act on: what to keep, what to change, what to
   drop. It shows the note for a final look, then copies it.

**Context budget.** The plan comes first, then evidence from touched files,
then the repo summary. When the budget is tight, touched files shrink to
their relevant sections.

### 6.4 Brains

One interface covers every brain:

```ts
interface Brain {
  id: string;                               // 'claude-code', 'copilot', 'ollama', ...
  detect(): Promise<'ready' | 'signed-out' | 'missing'>;
  stream(system: string, messages: Msg[]): AsyncIterable<string>;
}
```

**API brains** (Anthropic, OpenAI, OpenAI-compatible, Ollama) call the
provider directly and stream tokens. Keys come from the keychain or the
environment.

**Agent-backed brains** reuse the user's existing subscription through each
vendor's own supported surface:

- **Claude Code.** Frank runs the user's installed `claude` binary in
  headless (print) mode with streaming output. The prompt and context go in
  on stdin, and all tools are disabled so the run is answer-only. The user
  signs in inside Claude Code, and Frank never reads or passes on that
  login.
- **GitHub Copilot.** Frank uses the official Copilot SDK. The user signs in
  with GitHub, and each prompt counts toward their Copilot allowance. Copilot
  Free works too.
- **Cursor.** Frank runs the Cursor CLI in headless (print) mode, which uses
  the user's Cursor subscription. It returns answers only, and no changes
  are applied.

**Rules for agent-backed brains** (these follow the vendors' published
terms):

- Run the official binary or SDK unmodified.
- Never collect, store or pass on the user's credentials. Sign-in always goes
  through the vendor's own flow.
- Run in the user's own session, billed to the user's own plan. Frank never
  resells or pools usage.
- Answer-only: no file edits, no shell commands, no tools. Frank gathers the
  code context himself.

**Latency.** Spawning a CLI adds startup time, so Frank starts the chosen
agent's process when the panel opens and runs the breakdown while the user
is reading the plan summary. Where a CLI can keep a process alive, Frank
reuses it within the session.

### 6.5 Voice

Voice first (ux.md §6), or chat (`voice.mode` in the config). In voice
mode Frank speaks a briefing built from the read, talks each call through,
and listens hands-free between his turns. Push-to-talk: hold the hotkey (or
`Space` in the panel) to record, release to transcribe; the microphone
starts after a quarter-second hold, so a tap never opens it.

- **The briefing and call intros** are sentences built on-device from the
  read (`packages/engine/src/voice.ts`), not asked of the brain: instant,
  deterministic and tested. The read's schema orders `gist`, `goal`, `fine`,
  then `calls` (each with a `spoken` line), so the briefing starts while
  the read streams. Lines are only ever appended, and calls keep the
  brain's order, so nothing already said changes.
- **Speaking**: each sentence carries what it's about (`call:2`); the audio
  player marks when it starts playing and the panel lights that item.
- **Transcription** runs on-device with whisper.cpp (`base.en`). Audio is
  never saved and never leaves the machine.
- **Turn-taking** (hands-free) uses Silero VAD v5 (ONNX, 2 MB) on 32 ms
  frames. After 0.7 s of quiet Whisper transcribes what's there; if it
  sounds finished (doesn't end on a comma, an ellipsis, or a word like
  "because", "and", "the") it's sent, else Frank waits until 1.6 s. The
  microphone is ignored while Frank thinks and talks (half duplex: no echo
  cancellation needed), then the panel resumes it. It turns itself off
  after 45 s of nobody talking, and when the panel hides.
- **Models** come in two packs, each downloaded once with consent:
  listening (Whisper and Silero, about 150 MB, `~/.frank/models/`) and
  voices (Kokoro and dictionaries, about 212 MB, `~/.frank/voices/`).
- **Commands** ("the Redis one", "go", "keep it", "option two", "yes",
  "next", "what would you do?") are matched on-device against the calls, so
  they act instantly; picking a call by words tolerates transcription slips
  ("reddis"). Everything else goes to the brain as text.
- **Spoken replies**: at most two sentences, each said as soon as it's
  written; always in voice mode, only when spoken to in chat. Any key stops
  him. Voices are Kokoro-82M (fp16 ONNX via onnxruntime, 24 kHz), with
  Frank's own grapheme-to-phoneme step in Rust: the misaki dictionaries,
  a developer lexicon (Redis, Postgres, JSON), numbers, acronyms, camelCase
  and suffixes. About 0.25 s of compute per second of speech on a CPU; a
  long first sentence is made in two so the first sound comes sooner. There
  is no fallback voice: without the voice pack, Frank shows text.

### 6.6 Privacy and security

- Frank reads only on summon, and only from:
  - the known agent directories,
  - the current repo summary,
  - the files the plan mentions,
  - anything the user adds.
- The user sees and confirms the context before it's sent.
- Context goes only to the chosen brain. With Ollama, nothing leaves the
  machine.
- Common secret patterns are stripped before sending. This is best-effort,
  and documented as such. Files like `.env` are never read as touched files.
- Agent credentials stay with the agents. Frank's own API keys live in the
  keychain. There is no telemetry.

---

## 7. Work plan

### M1 — Talk through a plan

The detailed task list is in [m1-plan.md](m1-plan.md).

- The Tauri app: menu bar icon, global hotkey and panel.
- Sticky mode (off by default).
- Plans: the latest Claude Code plan found automatically, or pasted or
  dropped.
- The session: the read, one call at a time with options, tradeoffs and
  what it comes down to, touched-file checks, talk-through and the agent
  note.
- Voice: push-to-talk with on-device transcription, spoken replies.
- Brains, with auto-detection:
  - Claude Code (headless);
  - GitHub Copilot (Copilot SDK);
  - API keys;
  - Ollama.
- macOS first.

**Exit:** a Claude Code or Copilot user presses the hotkey after a plan.
Frank surfaces its key calls, catches at least one assumption the code
contradicts in test plans, and produces an agent note. It all takes under
three minutes, with no new API key.

### M2 — He finds every plan, on more subscriptions

- Plan-finder adapters for Cursor and Codex.
- Project detection and repo context.
- One-click plan switching.
- The Cursor CLI brain.

**Exit:** right after an agent writes a plan, summoning Frank opens it with
its key calls listed, with no copy-pasting, on any supported brain.

### M3 — Talk to him more

Push-to-talk, hands-free turn-taking and natural voices arrived in M1. M3
makes the conversation richer: streaming transcription while you talk,
barge-in by voice (with echo cancellation), and talking through
problems that aren't plans ("I've been stuck on this bug for an hour").

**Exit:** hold the hotkey, describe a bug out loud, and Frank asks the one
question that gets you unstuck.

### M4 — Close the loop

- Hand the agent note straight back to the agent.
- Optional session history.
- Windows and Linux builds.
- More adapters, such as Copilot CLI, Gemini CLI and Cline, contributed as
  small modules.

**Exit:** a public release that installs in one step on all three operating
systems.

---

## 8. Risks and open questions

- **Breakdown quality.** Frank might miss an important silent choice, or flag
  trivial ones.
  - Build a test set of real agent plans with their key calls labelled by
    developers.
  - Measure recall of the important calls and the noise rate per brain.
  - Keep the list capped at five.
- **Vendor terms can change.** Anthropic prohibits third-party apps from
  using Claude.ai subscription logins directly.
  - Frank's Claude path relies on running the user's own unmodified Claude
    Code, which Anthropic's published terms describe as permitted. Confirm
    this with Anthropic before release.
  - Review the Copilot and Cursor terms too.
  - Brain adapters are isolated, so any one path can be dropped.
- **Agent file formats change.** Plan locations and transcript formats aren't
  public APIs. Mitigation: isolated adapters, fixture tests per agent
  version, and graceful skipping.
- **Claude Code deletes old data.** Its cleanup (30 days by default) removes
  old plan files. That's fine for recent plans, but Frank can't rely on
  agent directories for history.
- **Agent brains are slower.** CLI startup adds latency. Mitigation: warm the
  process on summon, run the breakdown while the user reads, and show a
  thinking state straight away.
- **Usage limits.** Frank's sessions count toward the user's plan limits.
  Sessions are short by design, and Frank shows which brain he's using.
- **Model quality varies.** Small local models may produce weak breakdowns.
  The docs recommend models, and settings flag weaker ones.
- **Sticky etiquette.** Sticky Frank must never cover what the user is working
  on. He needs easy hiding and a stable position, which is also why sticky
  mode is off by default.
- **Name.** A few small agent-tooling projects already use "frank". Check the
  trademark and package-name availability before release.

## 9. How we'll know it works

- **Calls changed:** share of sessions where the user changes or drops at
  least one of the plan's choices. This is the core sign that Frank catches
  what matters.
- **Assumption catches:** share of sessions where a flagged assumption turned
  out to be real (the user acted on it).
- **Time to note:** median time from summon to agent note (target: under 3
  minutes).
- **No-paste rate:** share of sessions where the plan came from the plan
  finder rather than pasting.
- **Coming back:** people still summoning Frank after 4 weeks.
- **Quality checks per brain:** a scripted set of real plans, checking
  breakdown recall and noise, brevity, one question per turn, and that Frank
  doesn't simply agree with whichever choice the user leans toward.
