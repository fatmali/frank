# Mallard — Design

Mallard is a small desktop duck you summon with a hotkey when you're
overwhelmed. It finds the context you're working in, including the plans your
coding agents just wrote, talks the problem through with you, and helps you
choose the best option.

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

A duck that sits on your screen. Press a hotkey and you can talk or type to
it. It already has the context: recent agent plans, your repo, optionally your
clipboard. It asks a question or two, compares the options, and gives you a
recommendation when you ask. A session takes a minute or two. Then the duck
gets out of the way.

### 1.3 Goals

- Summoning the duck is instant: one hotkey, from anywhere.
- No copy-pasting: the duck finds recent agent plans by itself.
- The user reaches a clear choice quickly, with the trade-offs made explicit.
- Honest help: the duck disagrees when a plan is worse.
- Works with any model the user has, including a local one.

### 1.4 Non-goals

- Writing or editing code. The duck helps you choose; your agent does the
  work.
- Watching your screen or speaking up unprompted.
- Accounts, cloud sync or telemetry.
- Replacing your coding agent's chat.

---

## 2. User flow

```
 ⌥ Space ──▶ duck panel opens ──▶ context found ──▶ talk it through ──▶ choice
   (hold to talk,       (plans from the last ~30 min,  (question, comparison,  (copied, ready
    or type)             repo, clipboard; confirm)       recommendation)         for your agent)
```

1. **Summon.** A hotkey or a click on the duck opens a small panel next to
   it. Holding the hotkey records voice; releasing it sends. Typing works too.
2. **Context.** The duck lists what it found, such as "2 plans from Claude
   Code and Cursor in `rubber-duck/`", and the user confirms, deselects items,
   or adds more (a file, the clipboard).
3. **Talk.** The duck responds briefly. Usually it asks one clarifying
   question, then shows a side-by-side comparison.
4. **Choose.** The user asks "which would you pick?" or picks one. The duck
   gives a short recommendation with reasons and names what would change it.
5. **Done.** The chosen plan and a one-line summary are copied to the
   clipboard. The panel closes, and the duck returns to idle.

The duck also works without plans. "I've been stuck on this bug for an hour"
is a valid session. Context is then the repo and whatever the user adds.

---

## 3. Functional requirements

### 3.1 The duck

- **FR-1 [M1]** A small duck sits in a corner of the screen. It is always on
  top, draggable, and remembers its position.
- **FR-2 [M1]** A global hotkey (default `⌥ Space`, configurable) opens and
  closes the panel from any app.
- **FR-3 [M1]** The duck shows its state at a glance: idle, listening,
  thinking, done.
- **FR-4 [M1]** The duck can be hidden, and it can live in the menu bar or
  system tray instead of on screen.

### 3.2 Input

- **FR-5 [M1]** Type into the panel.
- **FR-6 [M3]** Push-to-talk. Holding the hotkey records, releasing it
  transcribes on-device and sends.
- **FR-7 [M1]** Drop files or text onto the duck to add them as context.

### 3.3 Context

- **FR-8 [M2]** **Plan finder.** On summon, the duck gathers plans written by
  supported coding agents in a recent window (default 30 minutes), grouped by
  project.
- **FR-9 [M2]** Supported sources at launch:
  - Claude Code plan files in `~/.claude/plans/` (or the `plansDirectory`
    setting) and recent sessions.
  - Cursor plan files in `~/.cursor/plans/` and plans saved in the workspace.
  - Codex CLI sessions in `~/.codex/sessions/`.
- **FR-10 [M2]** Repo context: detects the current project (see §5.4) and
  includes the branch, changed files, and relevant rules files (`AGENTS.md`,
  `CLAUDE.md`).
- **FR-11 [M1]** Clipboard context is used only when the user includes it.
- **FR-12 [M1]** Before using any context, the duck shows what it found and
  lets the user deselect items.
- **FR-13 [M2]** Near-duplicate plans are merged, and each plan is labelled by
  its source agent and age.

### 3.4 Conversation

- **FR-14 [M1]** The duck listens first and keeps replies short. It asks at
  most one question per turn.
- **FR-15 [M1]** When there are two or more options, it can show a
  side-by-side comparison of the few dimensions that matter (such as undo
  cost, effort, risk, and fit with the current setup).
- **FR-16 [M1]** On request ("which would you pick?"), it gives a clear
  recommendation, the reasons, and what would change its answer.
- **FR-17 [M1]** It is honest. It does not flatter, and it says when a plan
  is weaker, including the one the user prefers.
- **FR-18 [M1]** Replies stream, so the first words appear quickly.

### 3.5 Finishing

- **FR-19 [M1]** "Done" copies the chosen plan and a one-line summary of the
  choice to the clipboard.
- **FR-20 [M4]** Optionally hand the choice straight back to the agent, for
  example by writing the chosen plan where the agent will pick it up.
- **FR-21 [M4]** Optional history: past sessions are listed with their
  choices and can be reopened.

### 3.6 Models

- **FR-22 [M1]** Bring your own model: Anthropic, OpenAI, any
  OpenAI-compatible endpoint, or a local model through Ollama.
- **FR-23 [M1]** First run auto-detects `ANTHROPIC_API_KEY` or
  `OPENAI_API_KEY` in the environment and any running Ollama, then asks the
  user to confirm one.
- **FR-24 [M1]** If the model is unreachable, the duck says so plainly and
  keeps the user's input so they can retry.

---

## 4. Non-functional requirements

- **NFR-1 Fast.** The panel appears within 150 ms of the hotkey, and the
  first streamed words appear within about 1.5 s on a hosted model.
- **NFR-2 Light.** Idle memory stays small (target under 100 MB) with near-zero
  CPU. The duck must never be something people quit to save battery.
- **NFR-3 Private.** No telemetry and no network calls except to the chosen
  model provider. Context is read only on summon.
- **NFR-4 Secrets.** API keys are stored in the OS keychain, never in plain
  config files or logs. Common secret patterns are stripped from context
  before it is sent.
- **NFR-5 Cross-platform.** macOS first, then Windows and Linux.
- **NFR-6 Accessible.** Fully keyboard-driven. State is not conveyed by colour
  alone.
- **NFR-7 Resilient to agent changes.** Plan-finder adapters are isolated, so
  a format change in one agent breaks only that adapter, and the duck still
  works with the others.
- **NFR-8 Small and auditable.** Few dependencies and readable code, because
  this is a tool people trust with their context.

---

## 5. Data model

Everything is local. Nothing is written into the user's repos.

### 5.1 Layout

```
~/.mallard/
  config.toml              # model, hotkey, duck position, plan window
  sessions/
    2026-09-28T14-02-11.json   # one file per session (history, M4)
```

API keys live in the OS keychain, referenced by name from `config.toml`.

### 5.2 Config (`config.toml`)

| Key | Default | Notes |
| --- | --- | --- |
| `model.provider` | detected | `anthropic` \| `openai` \| `openai-compatible` \| `ollama` |
| `model.name` | detected | Provider model ID |
| `model.base_url` | none | For OpenAI-compatible or Ollama |
| `hotkey` | `Alt+Space` | Global shortcut |
| `plans.window_minutes` | `30` | How far back the plan finder looks |
| `plans.sources` | all | Enabled adapters |
| `duck.position` | bottom-right | Last dragged position |
| `duck.mode` | `screen` | `screen` or `menubar` |

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
  context: { plans: Plan[]; repo?: RepoInfo; extras: string[] };
  messages: { role: 'user' | 'duck'; text: string }[];
  choice?: { plan?: Plan; summary: string };
};
```

### 5.4 Project detection

Plans are grouped by the project they belong to:

- **Codex sessions** record the working directory.
- **Claude Code sessions** are stored per project.
- **Plan files** are matched by the file paths they mention.

The "current project" is the one with the most recent activity. The user can
switch it in one click. Frontmost-app detection (the active terminal or
editor) is a later refinement.

---

## 6. High-level design

### 6.1 Components

```
┌────────────────────────────── Tauri app ──────────────────────────────┐
│  UI (TypeScript/React, webview)                                        │
│   duck window · panel · comparison view · settings                     │
│   conversation engine · prompt builder · provider layer (AI SDK)       │
│        │  fetch via Tauri HTTP plugin          ▲ events                │
├────────┼────────────────────────────────────────┼──────────────────────┤
│  Core (Rust)                                    │                      │
│   global hotkey · window (always-on-top) · plan finder adapters        │
│   repo reader (git) · clipboard · keychain · local STT (whisper.cpp)   │
└────────────────────────────────────────────────────────────────────────┘
          │                                   │
   ~/.claude/plans, ~/.cursor/plans,     model provider
   ~/.codex/sessions, current repo       (API or local Ollama)
```

- **Tauri 2** keeps the app small and native. It provides always-on-top
  transparent windows, a global-shortcut plugin, and an HTTP plugin that
  lets the UI call model APIs without browser CORS limits.
- **Rust core** handles OS-level work: the hotkey, window behaviour, reading
  agent files, git, keychain, and on-device speech-to-text.
- **TypeScript UI** holds the conversation engine and the provider layer.
  The Vercel AI SDK, given the Tauri fetch, covers Anthropic, OpenAI,
  OpenAI-compatible endpoints and Ollama behind one interface, with
  streaming.

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
  Also scan recent session transcripts for a plan the user hasn't saved.
- **Cursor:** read `~/.cursor/plans/*.plan.md` and any `*.plan.md` in the
  current workspace.
- **Codex:** read recent `rollout-*.jsonl` files under
  `~/.codex/sessions/YYYY/MM/DD/`. Extract the latest proposed plan (the
  plan-tool output, or the last long assistant message) and the session's
  working directory.

The finder runs only when the duck is summoned. Its steps:

1. Ask each adapter for items newer than the window.
2. Group the results by project.
3. Merge near-duplicates.
4. Sort by recency.

Adapters are read-only and fail independently. If one agent changes its
format, the other adapters keep working.

### 6.3 Conversation engine

- **Prompt.** A short system prompt defines the duck's behaviour: listen
  first; keep replies to a few sentences; ask at most one question; compare
  options on the dimensions that matter; be honest and never flatter; give a
  clear recommendation when asked, with reasons and what would change it.
  The confirmed context (plans, repo summary, extras) is included as labelled
  blocks.
- **Context budget.** Plans are trimmed to fit the model's context window.
  Headings and steps are kept before details. Repo context is a compact
  summary (branch, changed file list, rules files), not file contents, unless
  the user adds a file.
- **Comparison view.** When there are two or more plans, the engine asks the
  model for a small comparison table (options × 3–4 dimensions). The panel
  renders it; plain text is the fallback.
- **Streaming** everywhere. Sessions are held in memory, and history is saved
  from M4.

### 6.4 Voice

Push-to-talk only: hold the hotkey to record, release to transcribe. Speech
is transcribed on-device with whisper.cpp, or Apple's speech framework on
macOS, then sent as a normal message. There is no always-on microphone and no
spoken replies in the first versions.

### 6.5 Privacy and security

- Files are read only on summon, and only from the known agent directories,
  the current repo, and anything the user adds.
- The user sees and confirms the context before it's sent.
- Context goes only to the configured provider. Ollama keeps everything
  local.
- Common secret patterns (API keys, tokens, `.env` values) are stripped
  before sending. This is best-effort and is documented as such.
- Keys are stored in the keychain. The duck has no telemetry.

---

## 7. Work plan

### M1 — The duck you can talk to

A Tauri app with the duck window, global hotkey, panel and typed
conversation. It includes model setup with auto-detection, context from the
clipboard and dropped files, the comparison view, recommendation on request,
and copy-on-done. macOS first.

**Exit:** summon the duck anywhere, paste two plans, and get a clear
comparison and recommendation in under a minute.

### M2 — It finds the plans

Plan-finder adapters for Claude Code, Cursor and Codex, plus project
grouping, repo context, and a "found N plans, use these?" confirmation.

**Exit:** after an agent writes a plan, summoning the duck shows that plan
with no copy-pasting.

### M3 — Talk to it

Push-to-talk with on-device transcription.

**Exit:** hold the hotkey, say "help me pick between these," and the session
starts with the found plans.

### M4 — Close the loop

Optional session history. Hand the chosen plan back to the agent. Windows
and Linux builds. More adapters (for example Copilot CLI, Gemini CLI and
Cline) contributed as small adapter modules.

**Exit:** a public release that installs in one step on all three operating
systems.

---

## 8. Risks and open questions

- **Agent file formats change.** Plan locations and transcript formats aren't
  public APIs. Mitigation: isolated adapters, fixture tests per agent
  version, and graceful skipping.
- **Claude Code deletes old data.** Its cleanup (default 30 days) removes old
  plan files. That's fine for recent plans, but it means the duck can't rely
  on agent directories for history.
- **Picking the right project.** Recency is a good guess but won't always be
  right. The one-click project switcher is the fallback.
- **Model quality varies.** Small local models may compare plans poorly. The
  docs will recommend models, and the settings screen will note weaker ones.
- **Always-on-top etiquette.** The duck must never cover what the user is
  working on. It needs easy hiding, a menu-bar mode, and a position that
  stays put.
- **Name.** "Mallard" still needs a trademark and package-name check before
  release.

## 9. How we'll know it works

- **Time to choice:** median time from summon to "done" (target: under 2
  minutes).
- **No-paste rate:** share of sessions where the plans came from the plan
  finder rather than pasting.
- **Coming back:** people still summoning the duck after 4 weeks.
- **Honesty check:** a small set of scripted sessions run per model, checking
  that the duck stays brief, asks at most one question per turn, and doesn't
  just agree with the user's preferred option.
