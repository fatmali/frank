# Frank — UX and design system

How Frank looks, sounds and behaves. Read this before building any screen.
Product scope lives in [design.md](design.md). The build plan lives in
[m1-plan.md](m1-plan.md).

---

## 1. Who reaches for Frank, and when

Frank is never the first thing a developer opens. Frank gets summoned in a
specific moment:

> An agent has just finished planning. The terminal shows a wall of Markdown
> and a prompt: *proceed?* The developer has read the first few lines. They
> half-trust it. They're tired of approving things. They have maybe two
> minutes of patience before they hit Enter anyway.

What they feel:
- **Overloaded.** The plan is long, and the important calls are buried in
  step 7 and step 31.
- **Half-trusting.** The plan is probably fine, and "probably" is the
  problem.
- **Protective of their flow.** Anything that feels like a detour gets
  skipped.

What they want, in their own words:

1. "Tell me which parts of this I actually need to think about."
2. "Check it against my code, not in the abstract."
3. "Help me decide, fast. Tell me what you'd do if I ask."
4. "Give me the words to send back to the agent."

What they don't want:
- a chat window,
- an essay,
- a second agent that starts doing things,
- praise,
- anything that makes them feel slow.

Two other moments matter, and the same design serves both:
- **Stuck.** "I've been on this bug for an hour." Frustrated, with tunnel
  vision. They need one good question more than an answer.
- **Unsure about an idea.** "Should I split this service?" They want a
  sparring partner before they ask the agent.

## 2. UX principles

These are specific to Frank. Where they conflict, the one listed first wins.

1. **One keystroke to something useful.** The panel opens instantly with the
   plan already loaded. The first useful thing, the list of calls, appears
   as soon as it exists. Progress is shown as the real steps ("Reading 6
   files"), never as a generic spinner.
2. **The plan is the main character.** Every call Frank raises is anchored to
   the plan's own words, quoted. The developer always knows which plan, which
   agent, and which step Frank means.
3. **Receipts, not vibes.** Any claim about the code cites the file and line.
   "No Redis in this repo" comes with where Frank looked.
4. **Short turns.** Frank says at most three sentences, an optional compact
   comparison, and at most one question.
5. **Always one keystroke from the exit.** The note for the agent can be
   copied at any moment. Calls not yet discussed are left as the plan had
   them.
6. **Esc is safe.** Dismissing the panel never loses anything. Summoning
   Frank again resumes the same session until a newer plan appears.
7. **Keyboard first, mouse welcome.** Every action has a key, and every key
   is visible on screen.
8. **Never interrupt.** No notifications, no badges, no sounds. The menu bar
   icon changes state, and that's it.

## 3. Frank's voice

Frank is blunt about plans and decent to people. He's the senior colleague
who reads your PR properly, says the uncomfortable thing plainly, and doesn't
make you feel stupid for missing it.

**Rules:**
- Short sentences, plain verbs, sentence case.
- Say the conclusion first, then the reason.
- Talk about the plan and the code, not the person. Write "The plan adds
  Redis," never "You forgot Redis."
- No praise, no filler, no apologies, no emoji in Frank's text.
- At most one joke per session. Never joke in errors or when something is
  risky.
- Quote the plan's own words when pointing at something.
- When the plan is fine, say so and step aside: "Nothing here worth a second
  look. Ship it."

| Instead of | Frank says |
| --- | --- |
| "Great question! Let's dive in." | "Three calls worth a look. Start with 1?" |
| "It might be worth considering whether Redis is necessary." | "The plan adds Redis. You run one instance. You don't need it yet." |
| "I'm sorry, something went wrong." | "Claude Code isn't signed in. Open it, log in, then press Retry." |
| "You're absolutely right!" | "Fair. Then keep the plan's choice." (only when it's true) |
| "Here are some things to think about: …" | "Is anything else calling this endpoint?" |

**Vocabulary.** Use these words everywhere: labels, buttons, messages, docs.
- **Plan:** what the agent wrote.
- **Call:** a decision inside the plan. Frank finds calls, and you make them.
- **Keep, Change, Drop:** the three things you can do with a call.
- **Note for your agent:** what Frank hands back. The button says "Copy
  note," and the confirmation says "Note copied."

## 4. The panel

### 4.1 Where it appears

- **Menu bar mode (default).** The panel drops down under Frank's menu bar
  icon, like a native menu bar extra. It opens at the same place every time,
  so your eyes know where to look.
- **Sticky mode.** The panel opens beside sticky Frank, on whichever side
  has room.
- The panel is 480 pt wide. Its height grows with content, up to 70% of the
  screen, and then the conversation scrolls. The panel itself never scrolls
  sideways.
- It takes keyboard focus when it opens and hands focus back to the previous
  app when it closes.

### 4.2 Anatomy

```
┌──────────────────────────────────────────────────────────┐
│ (o )>  Add rate limiting to the API                   ⌘P │  plan header
│        Claude Code plan, 3 min ago, in my-app            │
├──────────────────────────────────────────────────────────┤
│  1  Store counts in Redis                  hard to undo  │  calls list
│     "use Redis to share counters across instances"       │  (plan's words)
│  2  Apply to every route                   easy to undo  │
│  3  Add express-rate-limit                 new dependency │
├──────────────────────────────────────────────────────────┤
│ Frank                                                    │  conversation
│ The plan adds Redis. There's no Redis in your repo       │
│ or docker-compose.                                       │
│  ┌ docker-compose.yml ────────────────────────────────┐  │  evidence
│  │ services: api, postgres                            │  │
│  └────────────────────────────────────────────────────┘  │
│ Are you running more than one instance?                  │
│                                                          │
│ [K] Keep Redis   [C] Change   [D] Drop step               │  call actions
├──────────────────────────────────────────────────────────┤
│ Ask Frank, or press 1–3                                   │  composer
├──────────────────────────────────────────────────────────┤
│ 1 of 3 calls made                     ⌘↵  Copy note      │  footer
└──────────────────────────────────────────────────────────┘
```

Each region has one job:

- **Plan header.** Shows which plan this is (its own title), which agent
  wrote it, and how old it is. Click it or press `⌘P` to switch to another
  recent plan or paste one.
- **Calls list.** Up to five calls, ranked hardest to undo first. Numbered,
  because the list is a ranking. Each call shows the plan's own words under
  its title. A call you've made shows its outcome ("kept", "changed" or
  "dropped") in place of the undo label.
- **Conversation.** Frank's turns and yours, for the selected call only.
  Evidence blocks show at most 6 lines of code, with the file and line in
  the block's title. Click the title to copy the path.
- **Call actions.** Keep, Change and Drop for the selected call. Change
  focuses the composer, so you can say what to do instead.
- **Composer.** One line that grows as you type. Holding the hotkey records
  voice (M3).
- **Footer.** Shows progress in words ("1 of 3 calls made") and the one
  primary action, Copy note, which is always available.

### 4.3 Keyboard

| Key | Action |
| --- | --- |
| hotkey (default `⌥⇧Space`) | Open / close Frank. Hold to talk (M3). |
| `1`–`5` | Select a call |
| `K` / `C` / `D` | Keep / Change / Drop the selected call |
| `↑` / `↓` | Move between calls |
| `Enter` | Send what's in the composer |
| `⌘Enter` | Copy note (and close) |
| `⌘P` | Switch plan / paste a plan |
| `?` | "What would you do?" for the selected call |
| `Esc` | Close. The session is kept. |

The single-letter keys work only when the composer is empty, so typing is
never hijacked.

**Why not `⌥Space`:** Raycast and the ChatGPT desktop app both default to
`⌥Space`, and many developers run one of them. Frank suggests `⌥⇧Space`,
lets you record any hotkey on first run, and says so plainly if the hotkey
can't be registered.

## 5. Flows and states

### 5.1 First run (target: under 60 seconds to the first useful answer)

1. **"Hi, I'm Frank."** One sentence about what he does, then straight to
   setup.
2. **Pick a brain.** Frank lists what he detected, each with its status:

   ```
   Claude Code        signed in             [Use this]
   GitHub Copilot     copilot not installed  How to install
   ANTHROPIC_API_KEY  found in environment  [Use this]
   Ollama             not running
   ```

   Choosing one runs a tiny test request and shows "Ready" or the exact fix.
3. **Pick a hotkey.** A recorder shows the suggested `⌥⇧Space`. Press it to
   keep it, or press another combination.
4. **Try it.** "Try me on a sample plan" opens a real-looking plan, so the
   magic moment doesn't wait for your next agent run.

### 5.2 A normal session

1. **Open.** The panel opens with the plan header filled in and a line of
   live progress: "Reading the plan", "Reading 6 files", "Finding the calls".
2. **Context check.** On first use in a project, Frank shows the files he's
   about to read and waits for `Enter`. "Don't ask again for this project"
   skips this next time. The privacy promise holds without adding friction
   every time.
3. **Calls appear.** Frank marks them on the plan (see §6.6), then selects
   call 1 and says his opening line about it.
4. **Talk it through.** Make each call with `K`, `C` or `D`. Frank moves to
   the next one. "All fine" (or `⌘Enter`) wraps up.
5. **Wrap up.** The note preview appears in the footer area:

   ```
   Note for your agent
   Revise the plan before building:
   - Use in-memory counters instead of Redis (single instance).
   - Rate-limit /api/public only, not /health.
   - Keep express-rate-limit.
   ```

   `⌘Enter` copies it. The panel closes with the duck's one-frame nod, and
   the menu bar icon shows done for three seconds.

### 5.3 States

| State | What the developer sees |
| --- | --- |
| No plan found | "No recent plan. Paste one with ⌘V, or drop a file here." The composer is focused and paste works immediately. |
| Plan found, nothing worth a look | "Nothing here worth a second look. Ship it." The Copy note button changes to "Close". Frank approving is a real outcome, not an error. |
| Brain not ready | The exact reason and fix: "Claude Code isn't signed in. Open it, log in, then press Retry." One button: Retry. |
| Brain slow | After 4 s: "Claude Code is warming up." After 20 s: "Still waiting on Claude Code. Cancel?" |
| Quota or limit hit | "Your Copilot allowance is used up for now. Switch brain?" and a button to switch. |
| Mid-session Esc | Nothing is lost. Summoning Frank again returns to the same call. |
| Newer plan appears | On the next summon: "A newer plan from Claude Code. Switch?" (`Enter` = yes). |
| Note copied | "Note copied. Paste it into Claude Code." The agent is named, because Frank knows where the plan came from. |

Errors never apologize and are never vague: what happened, then how to fix
it.

## 6. Visual design system

### 6.1 Direction

Frank is a menu bar utility, so the frame should feel native and quiet: it
lives in the OS, not on a website. The personality lives in exactly one
place: **Frank's marks.** When Frank finds a call, he marks the plan the way
a sharp reviewer marks a printed diff, with a handwritten number in the
margin and an amber underline on the exact words. That's the memorable thing.
Everything around it stays disciplined.

These choices come from Frank's own world. Rubber-duck yellow is the one
brand colour. Pond-water greys make the neutrals. Plan and code text is
monospace, because that's how developers read plans in the terminal where
they came from. Frank's marks use a handwritten face, because they are
margin notes.

**What we deliberately avoid:**
- A web-app look inside a native panel.
- Cream paper with a terracotta accent.
- Near-black with an acid accent.
- Stacks of identical rounded cards with soft shadows.
- All-caps eyebrow labels, and meta strings joined with middle dots.
- Arrows appended to buttons, gradients, glassmorphism, and emoji in the UI.

### 6.2 Colour tokens

Neutrals are tinted slightly toward pond water: green-grey, not blue-black.
Amber is Frank. Bill orange is reserved for one meaning: *the code
contradicts the plan*.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `surface` | `#FBFCFB` | `#1B2421` | Panel background |
| `surface-sunk` | `#F1F4F2` | `#151D1A` | Evidence blocks, composer |
| `ink` | `#1C2421` | `#E6ECE9` | Primary text |
| `ink-muted` | `#5B6863` | `#98A6A0` | Secondary text, plan metadata |
| `rule` | `#DCE2DF` | `#2C3833` | Dividers between regions |
| `duck` | `#E8A317` | `#F2B53A` | Frank's marks, focus ring, selected call |
| `duck-ink` | `#8A5D00` | `#F2B53A` | Amber text (AA contrast on `surface`) |
| `bill` | `#C2410C` | `#F0763B` | "Code contradicts the plan" only |

Rules:
- Amber never appears as a large filled area. It's ink: marks, underlines,
  the focus ring, and the selected call's margin.
- No green or red for keep and drop. Outcomes are words ("kept", "changed",
  "dropped"), and no meaning is carried by colour alone.
- Frank follows the system light or dark appearance, with no in-app theme
  switch.

### 6.3 Typography

| Role | Face | Why |
| --- | --- | --- |
| Interface and Frank's words | System UI (SF Pro, Segoe UI Variable, Cantarell) | Native, instant, and it matches the menu bar it lives in |
| Plans and code | Monaspace Neon | A developer's monospace, made by GitHub Next and OFL-licensed. Plan text reads as it did in the terminal. |
| Frank's marks | Monaspace Radon | The handwritten member of the same family: margin notes in the same hand as the code, so it feels like one voice |

Scale (pt): **11** for metadata, **13** for body (the macOS default),
**15** for the plan title, and **18** for first-run headings only. Line
height is 1.45 for body text and 1.35 for monospace. Lines stay under 64
characters inside the panel. Weights are regular and semibold only.

Radon is used for the call numbers in the margin and for margin notes of
three words or fewer ("new dependency", "no Redis here"). Anything longer is
Frank talking, and uses the system face.

### 6.4 Space, shape, depth

- **Grid.** 4 pt base; panel padding 16; gaps between regions 12; the calls
  list uses 36 pt rows.
- **Radius.** The panel uses the OS popover radius (10–12). Evidence blocks
  and the composer use 6. Everything else is square. Hierarchy comes from
  rules and indentation, not from boxing things in cards.
- **Depth.** Only the panel casts a shadow (the native one). Nothing inside
  it floats.

### 6.5 Iconography

- **Menu bar icon.** An 18 pt monochrome template image of a duck-head
  silhouette, facing right, so the OS tints it correctly. States are shown
  by small, unmistakable changes to the same silhouette:
  - idle: plain duck;
  - listening: small sound arcs in front of the bill;
  - thinking: three dots above the head;
  - judging: an exclamation mark above the head;
  - done: a small check beside the bill, for 3 seconds.
- **Sticky Frank.** A 64 pt illustrated duck in the same silhouette, in duck
  amber with an ink outline, with the same states as larger marks.
- **UI icons.** Only where a word wouldn't fit. Otherwise, use words.

### 6.6 Motion

One orchestrated moment: **Frank marks the plan.** When the calls arrive,
the handwritten numbers appear in the margin one after another. Each
underline draws left to right under the plan's words, 120 ms per mark and
under 500 ms for all five. This is the only motion that doesn't come from a
key press.

Everything else responds to the developer:
- the panel opens in 90 ms with no bounce;
- the selected call moves instantly;
- the note preview expands in 150 ms;
- the duck nods once, in one frame, when the note is copied.

Under *Reduce motion*, marks appear all at once and nothing slides.

### 6.7 Accessibility

- Every interactive element is reachable by keyboard. The focus ring is a
  2 pt amber outline with a 2 pt offset, never removed.
- Screen reader labels come from the vocabulary in §3, for example:
  "Call 2 of 3, Apply to every route, easy to undo, not made yet."
- Colour contrast meets WCAG AA for all text. `duck-ink` exists because
  `duck` isn't readable as text on light surfaces.
- Frank respects the system text size where the OS provides it, and the
  panel re-lays out rather than truncating.

## 7. Component inventory (M1)

| Component | States | Keys |
| --- | --- | --- |
| `PlanHeader` | loading, loaded, stale ("newer plan available"), pasted | `⌘P` |
| `ContextCheck` | files listed, confirmed, "don't ask again" | `Enter` |
| `CallsList` / `CallRow` | pending, selected, kept, changed, dropped; flagged (bill) | `1–5`, `↑↓` |
| `PlanQuote` | plain, marked (underline + margin number) | none |
| `FrankTurn` | streaming, complete | none |
| `Evidence` | file + lines; copy path | click |
| `Compare` | 2–3 options × 3–4 dimensions | none |
| `CallActions` | keep / change / drop; disabled while streaming | `K C D ?` |
| `Composer` | empty, typing, recording (M3), disabled | `Enter` |
| `NoteFooter` | progress, preview, copied | `⌘Enter` |
| `BrainStatus` | ready, signed out, missing, slow, quota | Retry |
| `Onboarding` | welcome, brain, hotkey, sample plan | `Enter` |
| `StickyFrank` | idle, listening, thinking, judging, done | click, drag |

Each component takes its colours from §6.2 only. No component defines its own
colours or radii.
