# M1 work plan: Frank you can talk to

**Goal:** a Claude Code or Copilot user finishes a plan, presses a hotkey,
and Frank shows the plan's key calls, checked against their code. The user
makes each call and copies a note for their agent in under three minutes,
with no new API key. macOS first.

Specs: [design.md](design.md) for what Frank does, [ux.md](ux.md) for how it
looks and behaves.

---

## Scope

**In M1:**
- Menu bar app with a global hotkey and the panel.
- Sticky mode (off by default).
- First-run setup.
- Plans come from three places:
  - the latest Claude Code plan, found automatically;
  - pasted text;
  - a dropped file.
- The session: calls, talking each one through, and the note for the agent.
- Reading the files the plan mentions, as evidence.
- Brains:
  - Claude Code, running the user's installed `claude` in headless mode;
  - GitHub Copilot, through the official Copilot SDK;
  - API keys: Anthropic, OpenAI, or any OpenAI-compatible endpoint;
  - Ollama.

**Not in M1:**
- Cursor and Codex plan finders, and the Cursor brain (M2).
- Voice (M3).
- Session history and handing the note straight back to the agent (M4).
- Windows and Linux builds (M4).
- Code signing and notarization (before the public release).

## Repository layout

```
frank/
├── packages/engine/        TypeScript: session engine, prompts, parsing (no UI, no OS)
├── crates/frank-core/      Rust: config, secrets, plan finder, file reader, brains
├── apps/desktop/           Tauri 2 app
│   ├── src/                React UI (panel, onboarding, sticky Frank)
│   └── src-tauri/          Rust app shell: tray, hotkey, windows, IPC → frank-core
├── docs/                   design.md, ux.md, m1-plan.md
└── .github/workflows/      CI
```

Why split it this way:
- **The engine is pure TypeScript,** so it can be tested anywhere against a
  scripted fake brain.
- **`frank-core` is a plain Rust library,** so it builds and tests without a
  desktop.
- **Only `apps/desktop` needs a real desktop.** CI builds it on macOS.

## Workstreams

Work runs in this order: A first, then B and C in parallel, then D, then E.
Every task ends with something that runs or is tested.

### A. Foundations

| # | Task | Done when |
| --- | --- | --- |
| A1 | MIT license, contribution notes | `LICENSE` in the repo root |
| A2 | Monorepo: pnpm workspace + Cargo workspace | `pnpm install` and `cargo build` succeed from the root |
| A3 | Tooling: TypeScript strict, Vitest, Prettier; rustfmt, clippy | One command each runs lint and tests |
| A4 | CI: engine and core tests on Linux; desktop build on macOS; the app bundle uploaded as an artifact | A green run on `main`, with a downloadable `.app` |

### B. Engine (`packages/engine`)

| # | Task | Done when |
| --- | --- | --- |
| B1 | Types: `Plan`, `Call`, `Session`, `Brain` interface, events | Types compile and match design.md §5.3 |
| B2 | Frank's system prompt, following the voice rules in ux.md §3 | Prompt file reviewed against the do/don't table |
| B3 | Breakdown: prompt, JSON schema, validation, one repair attempt, plain-list fallback | Tests cover valid, malformed, repaired and fallback output |
| B4 | Talk-through loop: one call at a time; keep, change, drop and "what would you do"; streaming turns | Tests drive a full session with a scripted fake brain |
| B5 | Note for the agent, built from the outcomes, phrased for the source agent | Snapshot tests for Claude Code and Copilot wording |
| B6 | Context budget: plan first, then evidence, then repo summary; trim the largest files first | Tests keep the prompt under the budget for large plans |
| B7 | Fixture plans: 10–20 real plans with their key calls labelled | Stored under `packages/engine/fixtures/` |
| B8 | Quality check: runs the fixtures against a real brain and reports recall of labelled calls and noise | `pnpm eval --brain claude-code` prints a table |

### C. Core (`crates/frank-core`)

| # | Task | Done when |
| --- | --- | --- |
| C1 | Config at `~/.frank/config.toml` with defaults (design.md §5.2) | Read/write round-trip tests |
| C2 | Secrets in the OS keychain (`keyring`); keys are never logged | Stored and retrieved on macOS; redacted in `Debug` output |
| C3 | Claude Code plan finder: newest plan in `~/.claude/plans/` or `plansDirectory` | Tests against a fixture directory |
| C4 | Touched files: extract repo paths from the plan, read them within the budget, never read `.env` or secret files, strip secret patterns | Tests for extraction, exclusion and redaction |
| C5 | Repo summary: branch, changed files, `AGENTS.md` / `CLAUDE.md` | Tests on a temp git repo |
| C6 | `Brain` trait with streaming, cancellation and detection (`ready`, `signed-out`, `missing`) | Trait plus a fake used in tests |
| C7 | Claude Code brain: `claude -p` with streaming JSON output, all tools disallowed, no session persistence, prompt on stdin; parses streamed text | Stream-parser tests from recorded output; a manual smoke test with a signed-in `claude` |
| C8 | Copilot brain: `github-copilot-sdk` with streaming, Frank's system prompt, every tool permission denied; needs `copilot` on `PATH` | Detection tests; a manual smoke test with a signed-in `copilot` |
| C9 | API brains: Anthropic, OpenAI, OpenAI-compatible (streaming over HTTPS) | Tests against a local mock server |
| C10 | Ollama brain: local HTTP streaming, with the model and context size set explicitly | Tests against a mock; a manual smoke test with Ollama |
| C11 | First-run detection: installed CLIs, env keys, a running Ollama | Returns the status list shown in ux.md §5.1 |

### D. Desktop app (`apps/desktop`)

| # | Task | Done when |
| --- | --- | --- |
| D1 | Tauri 2 shell: menu bar icon with state images; no Dock icon | The app runs from the menu bar |
| D2 | Global hotkey with recorder; default `⌥⇧Space`; clear message if it can't be registered | The hotkey toggles the panel from any app |
| D3 | Panel window under the menu bar icon: takes focus on open, returns it on close | Matches ux.md §4.1 |
| D4 | IPC: engine ↔ core (commands for context and brains, events for streamed tokens) | A session streams end to end |
| D5 | Panel UI: plan header, context check, calls list, plan quotes with marks, conversation, evidence, compare, call actions, composer, note footer | Every component in ux.md §7 with its states |
| D6 | Keyboard map from ux.md §4.3 | All keys work, and the letter keys never steal typing |
| D7 | Paste and drop a plan | Both start a session |
| D8 | Onboarding: brain choice with live status, hotkey, sample plan | New install to first useful answer in under 60 s |
| D9 | Sticky mode (off by default): always-on-top duck, drag, remembered position | Toggled from the menu and settings |
| D10 | Design tokens as CSS variables (ux.md §6), bundled Monaspace Neon and Radon | No hard-coded colours or radii in components |
| D11 | Motion: the marking moment, the note nod; reduced-motion variants | Matches ux.md §6.6 |
| D12 | Settings: brain, hotkey, sticky mode, plan window, per-project context trust | Changes persist to `config.toml` |

### E. Finish

| # | Task | Done when |
| --- | --- | --- |
| E1 | Accessibility pass: VoiceOver labels, focus order, contrast | Checklist in ux.md §6.7 passes |
| E2 | Dogfood on real plans for a week and fix what stings | Issues filed and the top ones fixed |
| E3 | README "Try it" section with install steps for the unsigned build | A fresh Mac can install and run it |

## M1 is done when

- [ ] On a Mac, a Claude Code user presses the hotkey after a plan and sees
      its calls without pasting anything.
- [ ] The same works with the Copilot brain.
- [ ] On the fixture plans, Frank finds most labelled calls and flags little
      noise (B8 reports both).
- [ ] At least one fixture plan has an assumption the code contradicts, and
      Frank flags it with the file as evidence.
- [ ] From the hotkey to a copied note takes under three minutes.
- [ ] No new API key is needed, and nothing leaves the machine except
      requests to the chosen brain.

## What can be verified where

- **Here (Linux, CI):** everything in A, B and C, with the unit tests plus
  recorded brain output.
- **macOS CI:** the desktop build and bundle (D compiles and packages).
- **On a Mac, by hand:** the hotkey, the panel, focus, the menu bar icon,
  sticky mode, and live brains signed in to real subscriptions. A short
  smoke-test checklist ships with each D task.
