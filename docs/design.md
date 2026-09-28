# Frank — Design

Frank is a small desktop duck you summon with a hotkey when you're
overwhelmed. He finds the context you're working in, including the plans your
coding agents just wrote, talks the problem through with you, and helps you
choose the best option. He runs on the AI subscription you already have.

- **Product overview:** [../README.md](../README.md)
- **This doc:** requirements, data model, architecture and work plan.

Priority tags: **[M1]**–**[M4]** refer to the milestones in §7.

---

## 1. Overview

### 1.1 The problem

Coding agents now produce plans faster than developers can evaluate them. A
developer often ends up with several plausible approaches from one or more
agents and no quick way to pick one. Asking yet another chat window means
copy-pasting plans, re-explaining the repo, and getting a long answer back.

### 1.2 The product

A duck that lives in your menu bar or, in sticky mode, on your screen. Press a
hotkey, then talk or type. He already has the context: recent agent plans,
your repo, and your clipboard if you add it. He asks a question or two,
compares the options, and gives you a recommendation when you ask. His brain
is whichever AI you already pay for: Claude Code, GitHub Copilot, Cursor, an
API key, or a local model. A session takes a minute or two, then Frank gets
out of the way.

### 1.3 Goals

- Summoning Frank is instant: one hotkey, from anywhere.
- No copy-pasting: Frank finds recent agent plans himself.
- No new bill: he runs on the subscription the developer already has.
- The user reaches a clear choice quickly, with trade-offs made explicit.
- Honest help: Frank disagrees when a plan is worse.

### 1.4 Non-goals

- Writing or editing code. Frank helps you choose; your agent does the work.
- Watching your screen or speaking up unprompted.
- Accounts, cloud sync or telemetry.
- Replacing your coding agent's chat.

---

## 2. User flow

```
 ⌥ Space ──▶ panel opens ──▶ context found ──▶ talk it through ──▶ choice
   (hold to talk,       (plans from the last ~30 min,  (question, comparison,  (copied, ready
    or type)             repo, clipboard; confirm)       recommendation)         for your agent)
```

1. **Summon.** A hotkey or a click on Frank opens a small panel: under the
   menu bar icon by default, or next to Frank in sticky mode. Holding the
   hotkey records voice, and releasing sends. Typing works too.
2. **Context.** Frank lists what he found, such as "2 plans from Claude Code
   and Cursor in `my-app/`". The user confirms, deselects items, or adds more
   (a file, the clipboard).
3. **Talk.** Frank replies briefly. Usually he asks one clarifying question,
   then shows a side-by-side comparison.
4. **Choose.** The user asks "which would you pick?" or picks one. Frank gives
   a short recommendation with reasons and says what would change his answer.
5. **Done.** The chosen plan and a one-line summary are copied to the
   clipboard. The panel closes.

Frank also works without plans. "I've been stuck on this bug for an hour" is
a valid session, with the repo and whatever the user adds as context.

---

## 3. Functional requirements

### 3.1 Frank on screen

- **FR-1 [M1]** By default Frank lives in the menu bar (macOS) or the system
  tray (Windows, Linux). He is out of sight until summoned.
- **FR-2 [M1]** A global hotkey (default `⌥ Space`, configurable) opens and
  closes the panel from any app.
- **FR-3 [M1]** **Sticky mode, off by default.** When on, Frank sits on
  screen, always on top. He is draggable, remembers his position, and can be
  toggled from the menu bar icon or settings.
- **FR-4 [M1]** Frank shows his state at a glance, on the menu bar icon or
  the sticky duck: idle, listening, thinking, done.

### 3.2 Input

- **FR-5 [M1]** Type into the panel.
- **FR-6 [M3]** Push-to-talk. Holding the hotkey records, and releasing it
  transcribes on-device and sends.
- **FR-7 [M1]** Drop files or text onto the panel, or onto sticky Frank, to
  add them as context.

### 3.3 Context

- **FR-8 [M2]** **Plan finder.** On summon, Frank gathers plans written by
  supported coding agents in a recent window (default 30 minutes), grouped by
  project.
- **FR-9 [M2]** Supported sources at launch:
  - Claude Code plan files in `~/.claude/plans/` (or the `plansDirectory`
    setting) and recent sessions.
  - Cursor plan files in `~/.cursor/plans/` and plans saved in the
    workspace.
  - Codex CLI sessions in `~/.codex/sessions/`.
- **FR-10 [M2]** Repo context: Frank detects the current project (§5.4) and
  includes the branch, the changed files, and relevant rules files
  (`AGENTS.md`, `CLAUDE.md`).
- **FR-11 [M1]** The clipboard is used as context only when the user
  includes it.
- **FR-12 [M1]** Before any context is used, Frank shows what he found and
  lets the user deselect items.
- **FR-13 [M2]** Near-duplicate plans are merged, and each plan is labelled
  with its source agent and age.

### 3.4 Conversation

- **FR-14 [M1]** Frank listens first and keeps replies short, asking at most
  one question per turn.
- **FR-15 [M1]** With two or more options, Frank can show a side-by-side
  comparison on the few dimensions that matter, such as undo cost, effort,
  risk and fit with the current setup.
- **FR-16 [M1]** When asked ("which would you pick?"), Frank gives a clear
  recommendation, the reasons for it, and what would change his answer.
- **FR-17 [M1]** Frank is honest. He doesn't flatter, and he says when a plan
  is weaker, including the one the user prefers.
- **FR-18 [M1]** Replies stream, so the first words appear quickly.

### 3.5 Finishing

- **FR-19 [M1]** "Done" copies the chosen plan and a one-line summary of the
  choice to the clipboard.
- **FR-20 [M4]** Optionally, Frank hands the choice straight back to the
  agent, for example by writing the chosen plan where the agent will pick it
  up.
- **FR-21 [M4]** Optional history lists past sessions with their choices, and
  any session can be reopened.

### 3.6 Frank's brain

- **FR-22** Frank thinks with whichever AI the user already has:

  | Brain | How | Milestone |
  | --- | --- | --- |
  | Claude Code (Pro, Max or API) | Runs the user's installed `claude` in headless mode | M1 |
  | API key: Anthropic, OpenAI, OpenAI-compatible | Direct API calls | M1 |
  | Local model | Ollama | M1 |
  | GitHub Copilot (any plan, including Free) | Official Copilot SDK | M2 |
  | Cursor | Cursor CLI in headless mode | M2 |

- **FR-23 [M1]** On first run, Frank detects installed agent CLIs,
  `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in the environment, and a running
  Ollama. He then asks the user to pick one; this can be changed later in
  settings.
- **FR-24 [M1]** Agent-backed brains are used read-only. Frank asks for
  answers only: no file edits, no shell commands and no other tools.
- **FR-25 [M1]** If the brain is unreachable, signed out, or out of quota,
  Frank says so plainly (for example, "Claude Code isn't signed in; open it
  and log in") and keeps the user's input so they can retry.

---

## 4. Non-functional requirements

- **NFR-1 Fast.**
  - The panel appears within 150 ms of the hotkey.
  - First streamed words appear within about 1.5 s on API brains and within
    about 4 s on agent-backed brains.
  - Agent CLIs are warmed or kept alive when possible (§6.3).
- **NFR-2 Light.** Idle memory stays small (target under 100 MB) with
  near-zero CPU. Frank must never be something people quit to save battery.
- **NFR-3 Private.** No telemetry, and no network calls except to the chosen
  brain. Context is read only on summon.
- **NFR-4 Credentials.**
  - Frank never reads, stores or passes on credentials that belong to an
    agent. Users sign in through each agent's own flow.
  - API keys Frank does manage are stored in the OS keychain, never in plain
    config files or logs.
  - Common secret patterns are stripped from context before it is sent.
- **NFR-5 Cross-platform.** macOS first, then Windows and Linux.
- **NFR-6 Accessible.** Frank is fully keyboard-driven, and his state is never
  shown by colour alone.
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
| `hotkey` | `Alt+Space` | Global shortcut |
| `sticky.enabled` | `false` | Sticky mode: Frank always on screen |
| `sticky.position` | bottom-right | Last dragged position (sticky mode) |
| `plans.window_minutes` | `30` | How far back the plan finder looks |
| `plans.sources` | all | Enabled plan-finder adapters |

### 5.3 In-memory types

```ts
type Plan = {
  source: 'claude-code' | 'cursor' | 'codex' | 'file' | 'clipboard';
  title: string;          // first heading or first line
  body: string;           // plan text (Markdown)
  project?: string;       // absolute path of the repo it belongs to, if known
  modifiedAt: Date;
  origin: string;         // file path it was read from
};

type Session = {
  startedAt: Date;
  brain: string;          // e.g. 'claude-code'
  context: { plans: Plan[]; repo?: RepoInfo; extras: string[] };
  messages: { role: 'user' | 'frank'; text: string }[];
  choice?: { plan?: Plan; summary: string };
};
```

### 5.4 Project detection

Plans are grouped by the project they belong to:

- Codex sessions record their working directory.
- Claude Code sessions are stored per project.
- Plan files are matched by the file paths they mention.

The "current project" is the one with the most recent activity, and the user
can switch it in one click. Detecting the frontmost app (the active terminal
or editor) is a later refinement.

---

## 6. High-level design

### 6.1 Components

```
┌────────────────────────────── Tauri app ──────────────────────────────┐
│  UI (TypeScript/React, webview)                                        │
│   menu bar panel · sticky duck · comparison view · settings            │
│   conversation engine · prompt builder                                 │
│        │                                        ▲ events               │
├────────┼────────────────────────────────────────┼──────────────────────┤
│  Core (Rust)                                                           │
│   global hotkey · tray/menu bar · sticky window (always-on-top)        │
│   plan finder adapters · repo reader (git) · clipboard · keychain      │
│   brain adapters · local STT (whisper.cpp)                             │
└────────────────────────────────────────────────────────────────────────┘
      │                                   │
 ~/.claude/plans, ~/.cursor/plans,    brains: claude (headless) · Copilot SDK ·
 ~/.codex/sessions, current repo      Cursor CLI · APIs · Ollama
```

- **Tauri 2** keeps the app small and native. It supplies the tray/menu bar
  icon, an optional always-on-top transparent window for sticky mode, and a
  global-shortcut plugin.
- The **Rust core** handles OS-level work: the hotkey, windows, reading agent
  files, git, the keychain, on-device speech-to-text, and running brains.
- The **TypeScript UI** owns the conversation: it builds prompts, renders
  streamed replies, and shows comparisons.

### 6.2 Plan finder

Each agent has a small adapter:

```ts
interface PlanSource {
  id: string;                               // 'claude-code', 'cursor', 'codex'
  available(): Promise<boolean>;            // is the agent installed / dir present?
  recent(since: Date): Promise<Plan[]>;     // plans modified after `since`
}
```

- **Claude Code:** read `*.md` in the plans directory. That is `~/.claude/plans/`
  by default, or `plansDirectory` from user or project settings. Also scan
  recent session transcripts for a plan that hasn't been saved.
- **Cursor:** read `~/.cursor/plans/*.plan.md` and any `*.plan.md` in the
  current workspace.
- **Codex:** read recent `rollout-*.jsonl` under `~/.codex/sessions/YYYY/MM/DD/`.
  From each, extract the latest proposed plan (the plan-tool output or the
  last long assistant message) and the session's working directory.

The finder runs only when Frank is summoned. It asks each adapter for items
newer than the window, groups them by project, merges near-duplicates, and
sorts by recency. Adapters are read-only and fail independently.

### 6.3 Brains

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
  headless (print) mode, with streaming output. The prompt and context go in
  on stdin, and all tools are disabled so the run is answer-only. The user
  signs in inside Claude Code; Frank never reads or passes on that login.
- **GitHub Copilot.** Frank uses the official Copilot SDK. The user signs in
  with GitHub, and each prompt counts toward their Copilot allowance. Copilot
  Free works too.
- **Cursor.** Frank runs the Cursor CLI in headless (print) mode, which uses
  the user's Cursor subscription. Answers only; changes are never applied.

**Rules for agent-backed brains.** These follow the vendors' published terms
and hold for every agent:

- Run the official binary or SDK unmodified.
- Never collect, store or pass on the user's credentials; sign-in always
  happens through the vendor's own flow.
- Run in the user's own session, billed to the user's own plan. Frank never
  resells or pools usage.
- Answers only: no file edits, no shell commands, no other tools.

**Latency.** Spawning a CLI adds startup time, so Frank starts the chosen
agent's process when the panel opens, while the user is still typing. Where
the CLI supports keeping a process alive, Frank reuses it within a session.

### 6.4 Conversation engine

- **Prompt.** A short system prompt defines Frank's behaviour:
  - Listen first and keep replies to a few sentences.
  - Ask at most one question per turn.
  - Compare options on the dimensions that matter.
  - Be honest and never flatter.
  - When asked, give a clear recommendation, with reasons and what would
    change it.

  The confirmed context (plans, repo summary, extras) goes in as labelled
  blocks.
- **Context budget.** Plans are trimmed to fit the brain's context window,
  keeping headings and steps before details. Repo context is a compact
  summary (branch, changed file list, rules files), not file contents, unless
  the user adds a file.
- **Comparison view.** With two or more plans, the engine asks the brain for
  a small table (options × 3–4 dimensions). The panel renders it, with plain
  text as the fallback.
- **Streaming everywhere.** Sessions are held in memory, and history is saved
  from M4.

### 6.5 Voice

Push-to-talk only: hold the hotkey to record, release to transcribe. Speech
is transcribed on-device with whisper.cpp, or Apple's speech framework on
macOS, then sent as a normal message. There is no always-on microphone and
Frank doesn't speak his replies in the first versions.

### 6.6 Privacy and security

- Frank reads only on summon, and only from the known agent directories, the
  current repo, and anything the user adds.
- The user sees and confirms the context before it's sent.
- Context goes only to the chosen brain. With Ollama, nothing leaves the
  machine.
- Common secret patterns are stripped before sending. This is best-effort and
  documented as such.
- Agent credentials stay with the agents. Frank's own API keys live in the
  keychain. There is no telemetry.

---

## 7. Work plan

### M1 — The duck you can talk to

- Tauri app with the menu bar icon, global hotkey and panel.
- Sticky mode, off by default.
- Typed conversation.
- Brains: Claude Code (headless), API keys and Ollama, with auto-detection.
- Context from the clipboard and dropped files.
- The comparison view, recommendations on request, and copy on done.
- macOS first.

**Exit:** a Claude Code user summons Frank, pastes two plans, and gets a clear
comparison and recommendation in under a minute, with no new API key.

### M2 — He finds the plans, on more subscriptions

- Plan-finder adapters for Claude Code, Cursor and Codex.
- Project grouping and repo context.
- A "found N plans, use these?" confirmation.
- Copilot SDK and Cursor CLI brains.

**Exit:** right after an agent writes a plan, summoning Frank shows that plan
with no copy-pasting, using any of the supported brains.

### M3 — Talk to him

Push-to-talk with on-device transcription.

**Exit:** hold the hotkey and say "help me pick between these." The session
starts with the found plans.

### M4 — Close the loop

- Optional session history.
- Hand the chosen plan back to the agent.
- Windows and Linux builds.
- More adapters, such as Copilot CLI, Gemini CLI and Cline, contributed as
  small modules.

**Exit:** a public release that installs in one step on all three operating
systems.

---

## 8. Risks and open questions

- **Vendor terms can change.** Anthropic prohibits third-party apps from using
  Claude.ai subscription logins directly. Frank's Claude path relies on
  running the user's own unmodified Claude Code, which the published terms
  describe as permitted. Before release, confirm this with Anthropic, and
  review the Copilot and Cursor terms too. Brain adapters are isolated, so
  any one path can be dropped without affecting the rest.
- **Agent file formats change.** Plan locations and transcript formats aren't
  public APIs. Mitigation: isolated adapters, fixture tests per agent
  version, and graceful skipping.
- **Claude Code deletes old data.** Its cleanup (30 days by default) removes
  old plan files. Recent plans are fine, but Frank can't rely on agent
  directories for history.
- **Agent brains are slower.** CLI startup adds latency. Mitigation: warm the
  process on summon, and show a thinking state immediately.
- **Usage limits.** Frank's sessions count toward the user's plan limits.
  Sessions are short by design. Frank shows which brain he's using, so usage
  is never a surprise.
- **Picking the right project.** Recency is a good guess but won't always be
  right; the one-click project switcher is the fallback.
- **Model quality varies.** Small local models may compare plans poorly. The
  docs recommend models, and settings flag weaker ones.
- **Sticky etiquette.** Sticky Frank must never cover what the user is working
  on, so he needs easy hiding and a position that stays put. That's also why
  sticky mode is off by default.
- **Name.** A few small agent-tooling projects already use "frank". Check the
  trademark and package-name availability before release.

## 9. How we'll know it works

- **Time to choice:** median time from summon to "done" (target: under 2
  minutes).
- **No-paste rate:** share of sessions where the plans came from the plan
  finder rather than pasting.
- **No-new-bill rate:** share of users running Frank on a subscription they
  already had.
- **Coming back:** people still summoning Frank after 4 weeks.
- **Honesty check:** a small set of scripted sessions run per brain, checking
  that Frank stays brief, asks at most one question per turn, and doesn't just
  agree with the user's preferred option.
