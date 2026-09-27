# MVP Spec — The Protocol & The Retro Loop

> Goal of the MVP: **prove the magic works before building the duck.**
> No desktop app, no voice, no floating pet. Just the conversation engine and
> the follow-up loop, in the cheapest harness that can possibly test them: a
> CLI.

If talking to the duck reliably forces a decision you *own* and stop reopening —
and if the follow-up two weeks later actually lands — then the product is real
and worth wrapping in pixels. If it doesn't, no amount of UI saves it. So we
test that first, and only that.

---

## The hypothesis we're testing

> A structured, opinionated conversation — one that refuses to add options,
> probes your avoidance, forces you to choose in your own words, and then tells
> you to stop reopening it — produces **conviction and ownership** in a way that
> "here's another opinion" does not.

**We are proving this, not assuming it.** See [Success criteria](#success-criteria).

## In scope

- The interaction protocol (the conductor + states).
- Committing a decision to a local, human-readable record.
- The retro loop: a time-based follow-up that reopens the record and asks
  whether the call held up.
- One model adapter (whatever the contributor has a key for), behind an
  interface so others can be added.
- A CLI: `duck`, `duck retro`, `duck log`.

## Out of scope (deliberately)

- Any GUI, floating duck, tray icon, or animation.
- Voice / speech-to-text.
- Automatic screen/context ingestion.
- Cross-tool awareness (reading your Claude/Copilot session).
- **The taste model.** "Learns that you always regret the clever abstraction"
  requires a *corpus* of committed decisions + retro outcomes to exist first.
  The MVP *creates that corpus*; the inference over it is Phase 2. Being honest:
  the MVP proves the loop, not yet the memory.

---

## Data model: the decision record

Local-first means the record is a plain file on your disk. It must be
**human-readable, greppable, diffable, and survive without the app** — so:
Markdown with YAML frontmatter, one file per decision, living in a `.duck/`
directory the user can commit to their repo or keep private.

```
.duck/
  decisions/
    2026-09-27-rate-limiter.md
    2026-09-28-refactor-vs-ship.md
  config.toml          # model provider, api key ref, default dial ceiling
```

### File format

```markdown
---
id: 2026-09-27-rate-limiter
created: 2026-09-27T14:32:00Z
status: committed          # open | committed | reopened | closed
decision: Token-bucket rate limiter in middleware
options_considered:
  - token-bucket in middleware
  - leaky-bucket at the gateway
  - per-route counters in Redis
reconsider_if:
  - we need limits shared across more than one instance
  - the p99 latency budget drops below 5ms
review_on: 2026-10-11      # when the retro fires
review_trigger: time       # time | manual (file-change is Phase 2)
dial_used: challenging
model_used: <provider>/<model>
tags: [architecture, api]
---

## Why (your words, captured at commit)
> Boring option. It's reversible, it's one file, and we're single-instance for
> the next two quarters. The Redis one is premature.

## Retro log
<!-- appended by `duck retro` when review fires -->
```

**Design notes**
- `reconsider_if` is the antidote to reopening a decision out of discomfort. It
  is captured *from the user's own mouth* at commit time, never invented by the
  duck.
- `status` transitions: `open → committed → (reopened → committed)* → closed`.
- The `Why` is a verbatim quote of what the user said, not a model paraphrase.
  Ownership requires it be *their* words.

---

## The interaction protocol

The protocol is the moat, so it's specified as an explicit state machine driven
by a **conductor**, not left to a free-form chat prompt.

### States

| State | The duck's job | Exit when |
| --- | --- | --- |
| **Articulate** | Pin down the *actual* decision. "What are you trying to decide?" | The decision and its options are named. |
| **Surface** | Pull options, constraints, assumptions, and **fears** out of the user's head. | The real inputs are on the table. |
| **Probe** | Ask the one question that exposes a hidden constraint or assumption. | Nothing new is surfacing. |
| **Challenge** | Attack the leading option; name contradictions and sunk cost. | The user defends a choice on its merits, not their fear. |
| **Converge** | Notice circling; call it. "You're avoiding the choice. What is it?" | The user names a choice. |
| **Commit** | Capture the choice + the *why* + the `reconsider_if`, in their words. | Record written. |
| **Closed** | Done. The panel/session ends. | — |

### The conductor

One decision per turn: *what move does this conversation need next?* In the MVP,
the conductor is an LLM call with a strict system prompt that returns
**structured output** alongside the message, so the harness — not the model's
whims — controls flow and termination.

```jsonc
// conductor output contract
{
  "state": "challenge",           // current state (from the table above)
  "message": "You keep saying 'cleaner.' Cleaner at the cost of what?",
  "signals": {
    "options_seen": ["token-bucket", "redis-counters"],
    "contradiction": "wants simple, leaning toward the most complex option",
    "avoidance_detected": true,   // fear-talk, not merits-talk
    "circling": false,            // repeating the same ground
    "ready_to_commit": false
  }
}
```

The harness applies **hard rules the model cannot override**:

1. **Never add an option.** The system prompt forbids proposing solutions. If
   the model emits one, the harness strips it and re-prompts. This is the single
   most important rule — it's what stops the duck becoming an expander.
2. **One question at a time.** No walls of text. Messages are capped short.
3. **Force termination.** If `circling` is true for 2 turns, or the turn count
   passes a ceiling, the conductor is forced into `Converge` and then `Commit`.
   The loop *must* be able to end — that's the anti-engagement guarantee.
4. **Dial ceiling.** The configured intensity caps which states are reachable
   (see below). The model never pushes past the ceiling.
5. **Commit needs their words.** The `Why` and `reconsider_if` are extracted
   from user turns, and the user confirms the record before it's written.

### The dial (and its BYOM ceiling)

| Dial | Highest reachable state |
| --- | --- |
| Sounding board | Surface |
| Socratic *(default)* | Probe |
| Devil's advocate | Challenge |
| Verdict | Converge → the duck may state a recommendation at Commit |

The ceiling is additionally clamped by **model capability**: sharp moves
(Challenge, "calling bullshit") require a model that can justify them. A small
local model is capped lower automatically, so it can't confidently mis-accuse
the user. Weak brain ⇒ gentle duck.

---

## The retro loop

This is the part nothing else does, so the MVP must include it end to end.

- On `duck retro` (and opportunistically at the start of any `duck` session),
  the harness scans `.duck/decisions/` for records where
  `status == committed` and `review_on <= today`.
- For each, it reopens the record and runs a **short, single-purpose
  conversation**:
  > "On 2026-09-27 you chose the token-bucket limiter because it was reversible
  > and you were single-instance. Did that hold up? Did any of your
  > `reconsider_if` conditions actually happen?"
- Outcomes are appended to the `## Retro log` and the record moves to `closed`
  (held up), back to `open` (a `reconsider_if` genuinely fired), or gets its
  review pushed out (too soon to tell).

This log is the seed corpus for the Phase 2 taste model — but it's independently
valuable on day one, because **developers otherwise never get feedback on
whether their calls were right.**

---

## Golden-path walkthrough

The demo we're trying to make feel real. (Dial: Devil's advocate.)

```
$ duck

🦆  What are you trying to decide?

>  whether to refactor this auth module now or just ship the fix

🦆  What are the actual options — not "refactor or not," the real ones?

>  1) ship the one-line fix, 2) refactor the whole module now while I'm in here,
>  3) fix now and open a ticket to refactor later

🦆  What makes this hard? Say the real thing.

>  if I don't do it now I know the ticket will rot in the backlog forever

🦆  So the pull toward refactoring now isn't the code — it's that you don't
    trust the ticket to ever happen. Is that a reason to refactor, or a reason
    you don't trust your backlog?

>  ...ok that's fair. it's the backlog thing.

🦆  Is this a one-way door? If you ship the fix now and refactor next week,
    what have you actually lost?

>  nothing really. it's reversible. I just don't want to forget.

🦆  You've given me one reason to refactor now (fear of forgetting) and three
    reasons not to (it's reversible, you're mid-incident, the fix is one line).
    What are you choosing?

>  ship the fix now. option 1.

🦆  Why — in your words?

>  it's a one-way-door-safe reversible change, we're mid-incident, and "I might
>  forget" is a process problem, not a code problem.

🦆  When should you let yourself reopen this?

>  if the refactor ticket is still untouched in two weeks.

🦆  Decision: ship the one-line fix now.
    Reconsider if: the refactor ticket is untouched in 2 weeks.
    Written to .duck/decisions/2026-09-28-refactor-vs-ship.md
    Go ship. 🦆

    (the duck goes quiet)
```

Two weeks later:

```
$ duck retro

🦆  On Sep 28 you shipped the auth fix and said you'd reconsider the refactor
    if the ticket sat untouched for two weeks. Did it?

>  yeah it's still sitting there lol

🦆  So your `reconsider_if` fired — that's not discomfort, that's the real
    trigger you set. Want to make the refactor the decision now?

>  yes

🦆  Reopened. Logged that "the ticket will rot" prediction came true — worth
    remembering next time you weigh now-vs-later.
```

That last line is the taste model being born.

---

## Architecture (minimal)

```
duck (CLI)
  ├── conductor        # runs the state machine, applies the hard rules
  ├── store            # read/write .duck/ records (markdown + frontmatter)
  ├── retro            # scans for due reviews, runs the follow-up
  └── model/
        ├── adapter.ts       # interface: complete(messages) -> structured
        ├── anthropic.ts
        ├── openai.ts
        └── ollama.ts
```

The model adapter is deliberately boring — one method, structured output in,
structured output out. All the interesting code is in `conductor` and `retro`.

**Suggested first cut:** TypeScript/Node so the CLI and the eventual Tauri
desktop app share the conductor + store as a library. But the language is a
contributor's call; the contract (records, conductor output, adapter interface)
is what matters and is language-agnostic.

---

## Success criteria

The MVP succeeds if, across ~10 real decisions from ~3 people:

1. **Reaches commitment.** The session ends in a written record, not an
   abandoned chat. (Target: most sessions commit.)
2. **The user owns it.** Post-session one-liner: *"whose decision was that?"* —
   the answer is "mine," not "the duck's." This is the whole ballgame.
3. **It stops the reopening.** When the user feels the itch to relitigate before
   a `reconsider_if` fires, the record talks them down.
4. **The retro lands.** At least one follow-up produces a genuine "huh, I was
   right/wrong about that" moment.
5. **It doesn't feel like ChatGPT.** Users describe it as being *interrogated /
   helped to think*, not *answered*.

If #2 and #5 are weak, the protocol needs work — that's the signal to iterate on
the conductor, not to ship a prettier version.

## Open questions (need a human call)

1. **Retro trigger for the MVP:** time-based only (simple, deterministic), or
   also file-change-based (fires when you next touch the files involved — more
   magical, needs git integration)? Leaning **time-only for MVP.**
2. **`.duck/` in the repo or in `$HOME`?** In-repo makes decisions shareable and
   diffable with the team (great for the "why does this weird `if` exist" case);
   `$HOME` is more private. Could support both; **default in-repo, gitignore-able.**
3. **Confirm-before-write, or write-then-edit?** Does the user approve the record
   at commit, or does the duck write it and let them edit the file? Leaning
   **confirm-before-write** — the confirmation *is* part of taking ownership.
4. **Structured output transport:** JSON mode / tool-calling (clean but uneven
   across BYOM providers) vs. a parseable text convention (works everywhere,
   uglier). Affects the adapter contract.
