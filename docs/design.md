# Rubber Duck — Design Document

Engineering design for Rubber Duck: a decision-forcing rubber duck for the agent
era. Bring-your-own-model, local-first, open source.

- **Vision & positioning:** [../README.md](../README.md)
- **The riskiest bet, spelled out:** [mvp-spec.md](mvp-spec.md)
- **This doc:** requirements, data model, high-level design, and the work plan.

Priority tags used throughout: **[MVP]** (Phase 0–1, must exist to prove the
idea), **[v1]** (first releasable product), **[Later]** (post-v1).

---

## 1. Overview

Rubber Duck helps a developer **choose** among options they already have, rather
than generating new ones. It runs a structured conversation — the *protocol* —
that surfaces hidden constraints and fears, challenges the leading option, and
forces an explicit, owned commitment, which it records locally and follows up on
later (the *retro loop*).

The model is bring-your-own and swappable; the durable value is the protocol,
the local decision memory, and the retro loop. A **no-brain** mode (pure
heuristics, no model) is a first-class configuration, not a fallback.

### 1.1 Goals

- Move a user from "too many options" to one **owned** decision, and make them
  stop reopening it without cause.
- Keep every decision as durable, local, human-readable memory.
- Close the loop: tell the user whether past calls held up.
- Work with any model — or none.

### 1.2 Non-goals

- Generating solutions, writing code, or acting as a general coding assistant.
- Being a chat companion optimized for engagement. (It optimizes for *ending*.)
- Cloud sync, accounts, or hosted inference. There is no server.
- Team collaboration features beyond sharing a `.duck/` directory via git.

---

## 2. Functional Requirements

### 2.1 Decision session (the protocol)

- **FR-1 [MVP]** The user can start a session and state a decision in natural
  language.
- **FR-2 [MVP]** The system elicits at least two concrete options before
  proceeding to challenge them.
- **FR-3 [MVP]** The system surfaces the user's constraints, assumptions, and
  fears via one question at a time.
- **FR-4 [MVP]** The system **must never propose a new option or a solution.**
  This is a hard rule enforced by the harness regardless of the brain in use.
- **FR-5 [MVP]** The system asks exactly one question per turn (no multi-part
  question dumps).
- **FR-6 [MVP]** The session is guaranteed to terminate: it converges to a
  commitment after a bounded number of turns or upon detecting circling.
- **FR-7 [MVP]** At commitment, the user explicitly names the chosen option, the
  rationale **in their own words**, and a `reconsider_if` condition.
- **FR-8 [MVP]** The user confirms the record before it is written; confirmation
  is part of taking ownership.
- **FR-9 [MVP]** An **intensity dial** (sounding board → Socratic → devil's
  advocate → verdict) controls how hard the system pushes.
- **FR-10 [v1]** In `verdict` mode only, and only when asked, the system may
  state a recommendation at convergence — never earlier, never unprompted.
- **FR-11 [v1]** The system detects contradictions (e.g., stated priority vs.
  leading choice) and reflects them back.
- **FR-12 [v1]** The user can abandon a session without writing a record; an
  abandoned session leaves no partial record by default.

### 2.2 Decision records (memory)

- **FR-13 [MVP]** On commitment, the system writes a decision record to the
  local store.
- **FR-14 [MVP]** Records are human-readable and editable by hand outside the
  app.
- **FR-15 [MVP]** The user can list past decisions and their status.
- **FR-16 [v1]** The user can open, search, and filter records (by tag, status,
  date).
- **FR-17 [v1]** Editing a record by hand never corrupts it; unknown fields are
  preserved on rewrite.

### 2.3 Retro loop

- **FR-18 [MVP]** The system identifies committed decisions that are due for
  review and prompts the user to reflect on each.
- **FR-19 [MVP]** For each reviewed decision the system records the outcome
  (held up / went wrong / too soon), whether a `reconsider_if` condition fired,
  and a one-line takeaway.
- **FR-20 [MVP]** After review, the system updates status: `closed` (held up),
  `open` (went wrong or a condition fired), or leaves it due-later.
- **FR-21 [MVP]** Review is time-based (a `review_on` date).
- **FR-22 [Later]** Review can additionally trigger on a code event (e.g., the
  next time the user touches files associated with the decision).

### 2.4 Model / brain (BYOM)

- **FR-23 [MVP]** The system runs fully in **no-brain** mode (heuristics only,
  no model, no network).
- **FR-24 [v1]** The user can configure a model provider (Anthropic, OpenAI,
  local Ollama) via config; the same protocol runs behind it.
- **FR-25 [v1]** Provider credentials are read from config or environment, never
  hard-coded, never transmitted anywhere except the chosen provider's endpoint.
- **FR-26 [v1]** The dial's reachable intensity is **clamped by the brain's
  capability**: a weak brain cannot perform sharp moves (e.g., accusing the user
  of avoidance).
- **FR-27 [v1]** If a configured provider is unreachable or errors, the system
  degrades to no-brain mode for the rest of the session rather than failing.

### 2.5 Interfaces

- **FR-28 [MVP]** A CLI provides: start session, run retro, list decisions.
- **FR-29 [MVP]** The CLI accepts flags for dial, store location, and review
  horizon.
- **FR-30 [v1]** A desktop presence (always-available, global-hotkey-summoned)
  runs the same protocol/engine as a library.
- **FR-31 [v1]** The desktop presence shows a **glanceable state** (idle /
  listening / probing / challenging / committed).
- **FR-32 [Later]** Opt-in context: the system may offer to read on-screen
  content (a PR, a doc, a terminal) and always asks before consuming it.

---

## 3. Non-Functional Requirements

- **NFR-1 Local-first & private [MVP].** All state lives on the user's disk.
  No account, no telemetry, no network calls except to the user's chosen model
  provider. No-brain mode makes zero network calls.
- **NFR-2 BYOM / provider-agnostic [MVP].** No provider is privileged in the
  core; adding a provider is implementing one interface. The core never depends
  on a specific model.
- **NFR-3 Graceful degradation [MVP].** Capability scales down cleanly: sharp →
  basic → passive. The product is useful at every level, including no model.
- **NFR-4 Responsiveness [v1].** No-brain turns are effectively instant;
  model-backed turns stream and show a thinking state; a turn never blocks the
  UI thread.
- **NFR-5 Durability & forward-compat [MVP].** Records are plain text, survive
  app removal, are diffable in git, and round-trip through hand edits without
  loss (unknown fields preserved).
- **NFR-6 Portability [v1].** Core engine is OS-independent; the CLI runs
  anywhere Node runs; the desktop shell targets macOS/Windows/Linux.
- **NFR-7 Security [v1].** Credentials are never written to records or logs;
  config files holding secrets are created with restrictive permissions;
  secrets can be sourced from env or an OS keychain.
- **NFR-8 Extensibility [MVP].** Brain, provider, store, and presentation are
  separable behind interfaces so contributors can add any one without touching
  the others.
- **NFR-9 Testability [MVP].** The protocol is deterministic in no-brain mode
  and can be driven end-to-end headlessly (piped I/O) for automated tests.
- **NFR-10 Small surface [v1].** Minimal dependencies; the CLI ships with none.
  Favor readable, auditable code — this is an OSS trust product.
- **NFR-11 Accessibility [v1].** Desktop UI is keyboard-first and screen-reader
  friendly; the duck's state is conveyed by more than color.
- **NFR-12 Licensing [v1].** OSI-approved open-source license; contributions
  under a clear CLA/DCO.

---

## 4. Data Model

### 4.1 On-disk layout

```
.duck/
  config.toml               # provider, dial default, review horizon
  decisions/
    2026-09-27-<slug>.md     # one file per decision
```

Location resolution order: `--dir` flag → nearest ancestor containing `.duck/`
→ current directory. In-repo by default (shareable/diffable with the team),
gitignore-able for privacy.

### 4.2 Decision record

Format: Markdown with a YAML frontmatter header. The frontmatter is structured
data; the body holds prose the user owns.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `YYYY-MM-DD-<slug>`, unique within the store, stable. |
| `created` | ISO-8601 datetime | Set once at commit. |
| `status` | enum | `open` → `committed` → (`reopened`→`committed`)\* → `closed`. |
| `decision` | string | The chosen option, in short form. |
| `options_considered` | string[] | The real options weighed (≥1). |
| `reconsider_if` | string[] | User-authored conditions to legitimately reopen. |
| `review_on` | ISO date | When the retro fires. |
| `review_trigger` | enum | `time` \| `manual` \| `file-change` (Later). |
| `dial_used` | enum | Intensity the session ran at. |
| `model_used` | string | Provider/model, or `none (no-brain heuristic)`. |
| `tags` | string[] | Optional, for filtering. |

Body sections:
- `## Why (your words, captured at commit)` — verbatim user rationale.
- `## Retro log` — append-only entries: date, outcome, whether a condition
  fired, one-line takeaway.

**Invariants**
- `decision` is one of `options_considered` when a match exists; otherwise the
  user's free-text choice.
- `why` is verbatim user text, never a model paraphrase (ownership requirement).
- `reconsider_if` originates from the user, never invented by the system.
- Rewrites preserve unknown frontmatter fields and the full body (FR-17/NFR-5).

### 4.3 Status state machine

```
        commit                 retro: went wrong / condition fired
 open ─────────────▶ committed ───────────────────────────────▶ open
   ▲                    │  │                                       │
   │ (new session)      │  │ retro: held up                       │
   │                    │  └──────────────────────────▶ closed    │
   └──────────────── reopened ◀───────────────────────────────────┘
```

### 4.4 Config (`config.toml`)

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `provider` | string | `none` | `none` \| `anthropic` \| `openai` \| `ollama`. |
| `model` | string | — | Provider-specific model id. |
| `api_key_env` | string | — | Name of env var holding the key (never the key). |
| `dial` | enum | `socratic` | Default intensity. |
| `review_days` | int | `14` | Default retro horizon. |
| `store` | string | `./.duck` | Store location override. |

### 4.5 Versioning

A `schema` field (added at v1) allows migrations. Until then, additive changes
only; readers ignore unknown fields.

---

## 5. High-Level Design

### 5.1 Components

```
                    ┌──────────────────────────────┐
                    │        Presentation          │
                    │  CLI  •  Desktop shell (v1)   │
                    └───────────────┬──────────────┘
                                    │ IO (ask/say/state)
                    ┌───────────────▼──────────────┐
                    │          Conductor           │  the moat
                    │  state machine + HARD RULES  │
                    └───┬───────────┬───────────┬──┘
                        │           │           │
          ┌─────────────▼──┐  ┌─────▼─────┐  ┌──▼──────────────┐
          │     Brain      │  │   Store   │  │  Context (Later)│
          │ heuristic|model│  │  .duck/   │  │  opt-in readers │
          └───────┬────────┘  └───────────┘  └─────────────────┘
                  │ (model brain only)
          ┌───────▼────────┐
          │    Provider    │  anthropic | openai | ollama
          └────────────────┘
                              ┌───────────┐
                    Retro ────┤   Store   │  reopen due decisions, log outcomes
                              └───────────┘
```

- **Presentation** renders questions and captures answers; knows nothing about
  protocol logic. CLI today; desktop shell reuses the same engine as a library.
- **Conductor** owns the state machine and enforces the hard rules (FR-4/5/6/8).
  It asks the Brain *what move to make next*, but the Brain cannot override the
  rules — this separation is the core architectural bet.
- **Brain** decides the next move (message + signals). Two implementations share
  one interface: `HeuristicBrain` (no model) and `ModelBrain` (wraps a Provider).
- **Provider** is the thin, boring model call: messages in, structured output
  out. One per vendor.
- **Store** reads/writes decision records; the single source of truth on disk.
- **Retro** scans the Store for due decisions and runs the follow-up.
- **Context (Later)** supplies opt-in on-screen material to the Conductor.

### 5.2 The conductor state machine

`Articulate → Surface → Probe → Challenge → Converge → Commit → Closed`

Each turn the Conductor: (1) collects the user's last answer, (2) asks the Brain
for the next move given the conversation, sensed signals, and the dial ceiling,
(3) applies hard rules, (4) renders one question or transitions state. Transition
triggers: enough options surfaced (Surface→Probe), signals exhausted within the
ceiling (Probe/Challenge→Converge), circling or turn cap (→Converge, forced),
choice named (Converge→Commit), record confirmed (Commit→Closed).

### 5.3 The Brain interface (BYOM seam)

```ts
type Move = {
  state: 'articulate'|'surface'|'probe'|'challenge'|'converge'|'commit';
  question: string;               // exactly one question; never proposes an option
  signals: {
    optionsSeen: string[];
    contradiction?: string;
    avoidanceDetected: boolean;
    circling: boolean;
    readyToCommit: boolean;
  };
};

interface Brain {
  capability(): 'passive'|'basic'|'sharp';  // clamps the dial ceiling (FR-26)
  nextMove(ctx: {
    topic: string; options: string[]; history: Turn[];
    dialCeiling: number; usedMoves: Set<string>;
  }): Promise<Move>;
}

interface Provider {                          // used only by ModelBrain
  complete(messages: Message[], opts): Promise<StructuredResponse>;
}
```

Hard rules live in the Conductor and are applied to every `Move`: strip/re-ask
if the question proposes an option; cap length to one question; force
`converge`/`commit` on circling or the turn cap; refuse states above the
capability-clamped dial ceiling.

### 5.4 Capability clamping

Effective ceiling = `min(dialCeiling, capabilityCeiling)`. `passive` reaches
Surface, `basic` reaches Probe, `sharp` reaches Challenge/Converge-with-verdict.
No-brain = `basic`. This prevents a weak model from performing sharp,
high-confidence moves it can't justify (NFR-3).

### 5.5 Key flows

**Session:** start → Articulate → Surface options → Probe/Challenge (bounded) →
Converge → Commit (capture choice + why + reconsider_if, confirm) → write record
→ Close.

**Retro:** scan store for `status==committed && review_on<=today` → for each,
prompt outcome + condition-fired + takeaway → append to Retro log → update
status.

**Degradation:** ModelBrain provider error → log once → swap to HeuristicBrain
for the remainder of the session; the record notes the effective `model_used`.

---

## 6. Work Plan

### Phase 0 — Prove the machinery ✅ *done*
No-brain CLI: conductor state machine, hard rules, `.duck/` records, retro loop;
headless end-to-end test asserting the guarantees. **Exit (met):** a full session
commits an owned record and the retro reopens/logs/closes it, with no model.

### Phase 1 — Prove felt ownership *(no keys needed)*
Wizard-of-Oz sessions (a human plays the brain) against real decisions.
**Deliverables:** a lightweight session-capture script; 8–10 logged sessions;
findings written back into the conductor's question set and the Phase 2 prompt.
**Exit:** most sessions end with the user reporting the decision as *theirs*, and
describing the experience as being helped to think, not answered (mvp-spec
success criteria #2, #5). If not, iterate the protocol before Phase 2.

### Phase 2 — Add a real brain (BYOM)
`Brain`/`Provider` interfaces; `ModelBrain` + `HeuristicBrain`; adapters for
Anthropic, OpenAI, Ollama; structured-output handling; capability clamping;
degradation path. **Deliverables:** config (`config.toml` + env keys), provider
adapters, contract tests using a mock provider (no live keys in CI).
**Exit:** the same protocol runs behind a real model; model-backed questions are
measurably sharper than heuristic ones in a blind comparison; no live key
required to run tests.

### Phase 3 — Records & retro, hardened
Search/filter/list (FR-16), hand-edit safety (FR-17/NFR-5), tags, richer retro
outcomes, config for review horizon and store location. **Exit:** records
round-trip through hand edits without loss; retro handles a store of many
decisions.

### Phase 4 — The sticky duck (desktop)
Desktop shell reusing the engine as a library; global hotkey; glanceable states;
get-out-of-the-way UX. Tech choice (e.g., Tauri) decided here, not before.
**Exit:** summon-from-anywhere, run a full session, and the duck recedes on
commit.

### Phase 5 — Opt-in context & polish
Opt-in on-screen context readers (always ask first); accessibility; packaging
and distribution; docs and contribution guides. **Exit:** first releasable v1.

### Cross-cutting (from Phase 2 on)
CLA/DCO + license (NFR-12), `CONTRIBUTING.md`, CI (lint + headless protocol
tests + mock-provider contract tests), semantic-ish versioning of the record
schema.

---

## 7. Risks & Open Questions

- **R-1 The protocol doesn't create felt ownership.** Mitigation: Phase 1 gates
  Phase 2; this is the make-or-break and is tested before more is built.
- **R-2 BYOM variance.** Weak models produce weak or wrong sharp moves.
  Mitigation: capability clamping (FR-26), no-brain floor.
- **R-3 Structured output isn't uniform across providers.** Open question:
  JSON/tool-calling vs. a parseable text convention. Affects the Provider
  contract; decide in Phase 2.
- **R-4 "Calling bullshit" feels hostile or is wrong.** Mitigation: it must cite
  the observation; gated behind the `devil`/`verdict` dial and `sharp`
  capability.
- **R-5 Record location trade-off.** In-repo (shareable) vs `$HOME` (private).
  Decision: default in-repo, gitignore-able, `store` override.
- **R-6 Scope creep toward general life decisions.** Decision: dev-first wedge;
  the engine generalizes later but positioning stays focused.

## 8. Success Metrics

- **Primary:** share of sessions the user reports as *their* decision; share
  described as "helped me think" vs "gave me an answer."
- **Loop:** share of committed decisions that reach a retro; retros producing a
  genuine "I was right/wrong about that" takeaway.
- **Health:** sessions that reach commitment; median turns to commit; reopen
  rate *before* a `reconsider_if` fires (want low — the record is doing its job).
