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

## 2. What an overwhelmed developer needs

Overwhelm isn't a lack of information. It's too many things asking for a
decision at once, with no sense of which ones matter or how big the job is.
So Frank works in this order:

1. **Relief first.** Before any detail, say how big the problem is: "Two
   calls need you. The rest is routine." Knowing the size of the job is what
   lets someone start it. Say what Frank checked and found fine, so the
   developer can stop worrying about it.
2. **One decision at a time.** Only one call is on screen. The others wait
   in a progress rail. Nothing competes for attention.
3. **A call is a question, not a verdict.** "Where should the counters
   live?" is something you can answer. "Store counts in Redis (hard to
   undo)" is something you have to decode.
4. **Show the trade, not just the options.** Every option says what you
   gain and what you pay, in a few words each. Tradeoffs are the point;
   they shouldn't need a follow-up question to appear.
5. **Find the hinge.** Most calls come down to one fact about the
   developer's situation: "Will you run more than one instance?" Frank names
   that fact, and says which option each answer leads to. Answering one
   question about your own project is far easier than weighing
   architectures when you're tired.
6. **Receipts, briefly.** Evidence from the code shows as one line ("no
   Redis in docker-compose.yml") that opens to the code. The claim is
   visible; the proof is one step away.
7. **Frank's opinion on request.** Frank leans only when asked (`?`, or
   "what would you do?"). The developer decides; Frank makes deciding easy.
8. **Skipping is fine.** Any call left alone stays as the plan wrote it.
   The note can be copied at any moment.
9. **Talk, or don't.** Everything works by keyboard, and everything works
   by voice. Talking it through is what a rubber duck is for.

## 3. UX principles

Where they conflict, the one listed first wins.

1. **One keystroke to something useful.** The panel opens instantly with
   the plan loaded. The read appears as soon as it exists, and fills in as
   Frank works. Progress shows the real steps, never a generic spinner.
2. **The plan is the main character.** Every call is anchored to the plan's
   own words, quoted and marked.
3. **Receipts, not vibes.** Any claim about the code cites the file.
4. **Short turns.** Frank says at most three sentences, plus an optional
   small comparison, and at most one question. Spoken, he says two.
5. **Always one keystroke from the exit.** `⌘↵` copies the note from any
   view. Calls not made stay as planned.
6. **Esc is safe.** Dismissing never loses anything. Summoning again
   resumes where the developer left off.
7. **Keyboard first, voice first-class, mouse welcome.** Every action has a
   key, every key is shown, and every action can be said.
8. **Never interrupt.** No notifications, no badges, no sounds. Frank only
   speaks when spoken to.

## 4. Frank's voice

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
- Spoken replies are the first two sentences of the written one. Frank never
  reads out code, paths or tables.

| Instead of | Frank says |
| --- | --- |
| "Great question! Let's dive in." | "Two calls need you. Start with 1?" |
| "It might be worth considering whether Redis is necessary." | "The plan adds Redis. You run one instance. You don't need it yet." |
| "I'm sorry, something went wrong." | "Claude Code isn't signed in. Open it, log in, then press Retry." |
| "You're absolutely right!" | "Fair. Then keep the plan's choice." (only when it's true) |
| "Here are some things to think about: …" | "It comes down to one thing: will you run more than one instance?" |

**Vocabulary.** Use these words everywhere: labels, buttons, messages, docs.
- **Plan:** what the agent wrote.
- **The read:** Frank's first take on a plan: what it does, what needs you,
  what's fine.
- **Call:** a decision inside the plan. Frank finds calls, and you make them.
- **Option:** one way to make a call. The plan's own choice is always
  option 1.
- **Gain / cost:** what an option buys and what it costs.
- **It comes down to:** the one fact that decides a call (internally, the
  hinge).
- **Keep, change, drop:** what happened to a call. Choosing option 1 keeps
  it, choosing another changes it, and dropping removes the step.
- **Note for your agent:** what Frank hands back. The button says "Copy
  note," and the confirmation says "Note copied."

## 5. The panel

### 5.1 Where it appears

- **Menu bar mode (default).** The panel drops down under Frank's menu bar
  icon, like a native menu bar extra. It opens at the same place every time.
- **Sticky mode.** The panel opens beside sticky Frank, on whichever side
  has room.
- The panel is 480 pt wide. Its height grows with content, up to 70% of the
  screen, and then the body scrolls. It never scrolls sideways.
- It takes keyboard focus when it opens and hands focus back to the previous
  app when it closes.

### 5.2 Three views

The panel has three views, always in this order. The plan header and the
footer frame all three.

**The read.** What the plan does, what needs you, and what's fine.

```
┌──────────────────────────────────────────────────────────┐
│ (o )>  Add rate limiting to the public API            ⌘P │  plan header
│        Claude Code plan, 3 min ago, in my-app            │
├──────────────────────────────────────────────────────────┤
│  Adds a per-key limit of 100 requests a minute to the    │  gist
│  public API, with counters in Redis.                     │
│                                                          │
│  Two calls need you. The rest is routine.                │  the size of it
│                                                          │
│  1  Where should the counters live?       hard to undo   │  calls, as
│     code disagrees                                       │  questions
│  2  Should /health be rate limited?       some work      │
│                                                          │
│  Checked and fine                                        │  reassurance
│  429 with Retry-After. Tests in rateLimit.test.ts.       │
├──────────────────────────────────────────────────────────┤
│ ↵ Start with 1       hold ⌥⇧Space to talk      Copy note │  footer
└──────────────────────────────────────────────────────────┘
```

The read streams in: the gist first, then each call as Frank finds it. The
developer can start on call 1 before the rest has arrived.

**A call.** One decision, everything needed to make it, nothing else.

```
┌──────────────────────────────────────────────────────────┐
│ (o )>  Add rate limiting to the public API            ⌘P │
├──────────────────────────────────────────────────────────┤
│  ━━ ── ──   Call 1 of 2                   hard to undo   │  progress rail
│                                                          │
│  Where should the counters live?                         │  the question
│  "Use Redis to share counters across instances"          │  plan's words, marked
│                                                          │
│  Redis is a new service to deploy, secure and watch.     │  why it matters
│                                                          │
│  1  Redis                                     the plan   │  options
│     + survives restarts, works across instances          │
│     − a new service to run                               │
│  2  In memory                                            │
│     + nothing new to run                                 │
│     − resets on deploy, one instance only                │
│                                                          │
│  It comes down to: will you run more than one instance   │  the hinge
│  soon?        [A  Yes, leads to 1]  [B  No, leads to 2]  │
│                                                          │
│  ▸ docker-compose.yml   api and postgres only, no Redis  │  evidence
│                                                          │
│  (Frank and you, when you ask or talk)                   │  conversation
├──────────────────────────────────────────────────────────┤
│ Ask, or hold ⌥⇧Space to talk                         ◉   │  composer + mic
├──────────────────────────────────────────────────────────┤
│ 1–2 choose  ? Frank's take  D drop  → later   Copy note  │  footer
└──────────────────────────────────────────────────────────┘
```

- **Options.** The plan's choice is always option 1, labelled "the plan".
  One or two alternatives follow, never more. Each has one gain and one
  cost, a few words each, marked `+` and `−` in the margin. No colour
  carries the meaning.
- **The hinge.** One question about the developer's situation, with two or
  three short answers, each naming the option it leads to. Answering
  highlights that option and Frank says one line about it; `↵` takes it.
- **Choosing.** A number key chooses that option and moves to the next
  call, with a short "Chose In memory" in the footer. `←` goes back; any
  call can be changed until the note is copied.
- **Something else.** `S` asks what the agent should do instead; typing or
  saying it records a change in the developer's words.
- **Evidence.** One line per receipt; it opens to up to six lines of code.
  When the code contradicts the plan, the line is in bill orange.
- **Conversation.** Hidden until the developer asks something. Then Frank's
  turns appear under the decision, at most three sentences each. If a reply
  points at an option, the footer offers it: "Frank suggests 2. ↵ Take it."
  Frank never chooses for the developer.

**Your calls.** Where the developer ends up after the last call, or by
moving past it with `→`. (`⌘↵` copies the note from anywhere, without
stopping here.)

```
┌──────────────────────────────────────────────────────────┐
│ (o )>  Add rate limiting to the public API            ⌘P │
├──────────────────────────────────────────────────────────┤
│  Your calls                                              │
│  1  Counters                         in memory, changed  │
│  2  /health                          not limited, changed│
│                                                          │
│  Note for your agent                                     │
│  Revise the plan before building:                        │
│  - Counters: keep them in memory in the API process      │
│    instead of Redis.                                     │
│  - Rate limit /api/public only; leave /health alone.     │
│  Everything else stays as planned.                       │
├──────────────────────────────────────────────────────────┤
│ 2 of 2 decided                           ⌘↵  Copy note   │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Keyboard

| Key | Action |
| --- | --- |
| hotkey (default `⌥⇧Space`) | Tap: open or close Frank. Hold: talk. |
| `↵` | The read: start with call 1. A call: take the highlighted option. Your calls: copy the note. |
| `1`–`3` | Choose an option |
| `A` / `B` / `C` | Answer "it comes down to" |
| `?` | Frank's take on this call |
| `D` | Drop this step |
| `S` | Something else: say what the agent should do instead |
| `→` / `←` | Next call (this one stays as planned) / previous call |
| `Space` (hold) | Talk, when the composer is empty |
| `⌘↵` | Copy the note (from any view) |
| `⌘P` | Switch plan, or paste one |
| `Esc` | Back out of what's open, else close. Nothing is lost. |

The single-letter and number keys work only when the composer is empty, so
typing is never hijacked.

**Why not `⌥Space`:** Raycast and the ChatGPT desktop app both default to
`⌥Space`, and many developers run one of them. Frank suggests `⌥⇧Space`,
lets you record any hotkey on first run, and says so plainly if the hotkey
can't be registered.

## 6. Talking to Frank

A rubber duck is something you talk to. Saying "I'm not sure we even need
Redis" out loud is faster, and more honest, than typing it. Voice is part of
M1.

### 6.1 How it works

- **Push to talk.** Hold the hotkey (from any app) or hold `Space` in the
  panel, talk, let go. A tap of the hotkey still just opens Frank. The
  microphone starts only after the key has been held for a quarter of a
  second, so a tap never turns it on by accident.
- **Or talk freely.** Tap `Space` in the panel, or click the microphone, and
  Frank listens hands-free: no key to hold. He hears when you start talking
  and when you stop (Silero VAD, on-device). A pause isn't always the end:
  after 0.7 s of quiet he looks at what you said so far, and if it trails off
  ("we could use Redis because…", "and the…") he keeps listening; if it
  sounds finished ("keep it", "why not Redis?") he answers at once. After
  1.6 s of quiet the turn is over either way. While he thinks and talks he
  isn't listening, so he never hears himself; then it's your turn again.
  Tap `Space` while he talks to cut in. `Esc`, a tap on `Space`, hiding the
  panel, or 45 seconds of nobody talking turns it off. The panel stays open
  while it's on, and the menu bar icon shows he's listening.
- **On this Mac, only.** Speech is transcribed on-device (Whisper). Audio
  never leaves the machine and is never saved. Only the words go to the
  brain, like typing them would.
- **He talks back when talked to.** When the developer spoke, Frank speaks
  his reply, at most two sentences, starting with the first sentence as soon
  as it's written rather than after the whole reply. Spoken questions ask
  the brain for a one- or two-sentence answer, which is also faster. Typing
  gets text only. A setting chooses: when I talk to him (default), always,
  never. Any key, or talking again, stops him mid-sentence.
- **A voice worth hearing.** Natural voices (Kokoro-82M, on this Mac) sound
  like a person, not a screen reader. Settings, Voice lists them first,
  each with a Listen button: Michael, Heart, George, Emma, Fenrir, Bella.
  They're a one-time 212 MB download, offered right there, with progress.
  Once installed, Michael is the default. Until then, and for anyone who
  prefers one, the macOS voices are listed after (best installed first).
- **Fast to hear you.** Transcription runs on the GPU where there is one,
  sizes Whisper's audio window to the clip instead of padding to 30
  seconds, and loads the model while the developer is still talking.

### 6.2 What you can say

Anything. Common commands work instantly, on-device, without asking the
brain:

| Say | Frank does |
| --- | --- |
| "keep it", "go with the plan" | chooses option 1 |
| "option two", "the second one", "go with in memory" | chooses that option (by number or by name) |
| "yes", "no", or an answer's own words | answers "it comes down to" |
| "drop it", "drop that step" | drops the step |
| "next", "later", "skip" | moves on; the call stays as planned |
| "back", "previous" | goes back |
| "what would you do?", "your take?" | Frank's take |
| "copy the note", "that's it", "done" | copies the note |

Anything else is a question or a thought, and goes to Frank.

### 6.3 What it looks like

- **Listening.** The composer becomes a live level meter in duck amber,
  with "Listening. Let go to send." The menu bar icon and sticky Frank show
  listening.
- **Transcribing.** "Got it." for the moment it takes.
- **Thinking.** "Thinking it over", and after two seconds, for how long, so
  a slow brain never looks stuck.
- **Heard.** What Frank heard appears as the developer's turn, exactly as
  transcribed, so a mishearing is obvious. A command shows as a line in the
  footer ("Chose In memory") instead of a turn.
- **Speaking.** A small "Frank is talking. Any key stops him." line.
- **Talking freely.** The composer shows the level meter, dimmed while
  waiting: "Listening. Just talk.", then "Hearing you" while you talk, with
  a Stop button. While Frank answers: "Your turn when Frank finishes."
  with a breathing amber dot.

### 6.4 First use

The first time the developer talks to Frank:

1. "Voice runs on this Mac. It needs 150 MB of speech models, downloaded
   once." (`↵` download, `Esc` not now). A progress line follows; talking
   freely starts by itself when it's done.
2. macOS asks for the microphone. If it's refused: "Frank can't hear you.
   Allow the microphone in System Settings, Privacy, Microphone."

## 7. Flows and states

### 7.1 First run (target: under 60 seconds to the first useful answer)

1. **"Hi, I'm Frank."** One sentence about what he does, then straight to
   setup.
2. **Pick a brain.** Frank lists what he detected, each with its status.
   Choosing one runs a tiny test request and shows "Ready" or the exact fix.
3. **Pick a hotkey.** A recorder shows the suggested `⌥⇧Space`: tap to open
   him, hold to talk.
4. **Try it.** "Try me on a sample plan" opens a real-looking plan with its
   files, so the magic moment doesn't wait for the next agent run.

### 7.2 A normal session

1. **Open.** The panel opens with the plan header filled in and live
   progress: "Reading the plan", "Reading 6 files", "Finding the calls".
2. **Context check.** On first use in a project, Frank shows the files he's
   about to read and waits for `↵`. "Don't ask again for this project" skips
   this next time.
3. **The read.** The gist, the size of it, the calls as questions, and
   what's fine, marked on the plan's words as they arrive (§8.6).
4. **The calls.** `↵` starts. One call at a time: answer what it comes down
   to, choose an option, or skip. Talk or type whenever something needs
   thinking through.
5. **Your calls.** The decisions and the note. `⌘↵` copies it; the panel
   closes with the duck's nod, and the menu bar icon shows done for three
   seconds.

### 7.3 States

| State | What the developer sees |
| --- | --- |
| No plan found | "No recent plan. Paste one with ⌘V, or drop a file here." The composer is focused and paste works immediately. |
| Plan found, nothing worth a look | "Nothing here worth a second look. Ship it." with the gist and what's fine. The button says "Close". |
| Brain not ready | The exact reason and fix: "Claude Code isn't signed in. Open it, log in, then press Retry." One button: Retry. |
| Brain slow | After 4 s: "Claude Code is warming up." After 20 s: "Still waiting on Claude Code. Cancel?" |
| Quota or limit hit | "Your Copilot allowance is used up for now. Switch brain?" and a button to switch. |
| Mid-session Esc | Nothing is lost. Summoning again returns to the same call. |
| Newer plan appears | On the next summon: "A newer plan from Claude Code. Switch?" (`↵` = yes). |
| Note copied | "Note copied. Paste it into Claude Code." The agent is named, because Frank knows where the plan came from. |
| Microphone refused | "Frank can't hear you. Allow the microphone in System Settings, Privacy, Microphone." |
| Heard nothing | "Didn't catch that. Hold, talk, then let go." |

Errors never apologize and are never vague: what happened, then how to fix
it.

## 8. Visual design system

### 8.1 Direction

Frank is a menu bar utility, so the frame should feel native and quiet: it
lives in the OS, not on a website. The personality lives in exactly one
place: **Frank's marks.** When Frank finds a call, he marks the plan the way
a sharp reviewer marks a printed diff, with a handwritten number in the
margin and an amber underline on the exact words. That's the memorable thing.
Everything around it stays disciplined.

Calm comes from structure, not decoration: one decision per view, a fixed
order within it (question, the plan's words, why it matters, options, what
it comes down to, receipts), and generous space between those parts.

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
- Green and red for good and bad options.

### 8.2 Colour tokens

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
| `duck` | `#E8A317` | `#F2B53A` | Frank's marks, focus ring, selected call, listening meter |
| `duck-ink` | `#8A5D00` | `#F2B53A` | Amber text (AA contrast on `surface`) |
| `bill` | `#C2410C` | `#F0763B` | "Code contradicts the plan" only |

Rules:
- Amber never appears as a large filled area. It's ink: marks, underlines,
  the focus ring, the highlighted option's margin, and the level meter.
- No green or red for options, gains, costs or outcomes. Outcomes are words
  ("kept", "changed", "dropped"), and no meaning is carried by colour alone.
- Frank follows the system light or dark appearance, with no in-app theme
  switch.

### 8.3 Typography

| Role | Face | Why |
| --- | --- | --- |
| Interface and Frank's words | System UI (SF Pro, Segoe UI Variable, Cantarell) | Native, instant, and it matches the menu bar it lives in |
| Plans and code | Monaspace Neon | A developer's monospace, made by GitHub Next and OFL-licensed. Plan text reads as it did in the terminal. |
| Frank's marks | Monaspace Radon | The handwritten member of the same family: margin notes in the same hand as the code, so it feels like one voice |

Scale (pt): **11** for metadata, **13** for body (the macOS default),
**15** for the plan title and a call's question, and **18** for first-run
headings only. Line height is 1.45 for body text and 1.35 for monospace.
Lines stay under 64 characters inside the panel. Weights are regular and
semibold only.

Radon is used for call numbers, option numbers, the `+` and `−` gain and
cost marks, and margin notes of three words or fewer ("the plan", "code
disagrees"). Anything longer is Frank talking, and uses the system face.

### 8.4 Space, shape, depth

- **Grid.** 4 pt base; panel padding 16; gaps between regions 12; list rows
  36 pt. Within a call, 16 pt between its parts, so each reads as its own
  step.
- **Radius.** The panel uses the OS popover radius (10–12). Evidence blocks
  and the composer use 6. Everything else is square. Hierarchy comes from
  rules, indentation and space, not from boxing things in cards.
- **Depth.** Only the panel casts a shadow (the native one). Nothing inside
  it floats.

### 8.5 Iconography

- **Menu bar icon.** An 18 pt monochrome template image of a duck-head
  silhouette, facing right, so the OS tints it correctly. States are shown
  by small, unmistakable changes to the same silhouette:
  - idle: plain duck;
  - listening: three level bars above the head;
  - thinking: three dots above the head;
  - judging: an exclamation mark above the head;
  - done: a check above the bill, for 3 seconds.
- **Sticky Frank.** A 64 pt illustrated duck in the same silhouette, in duck
  amber with an ink outline, with the same states as larger marks.
- **UI icons.** Only where a word wouldn't fit: the microphone in the
  composer. Otherwise, use words.

### 8.6 Motion

One orchestrated moment: **Frank marks the plan.** As each call arrives in
the read, its handwritten number appears in the margin and its underline
draws left to right under the plan's words, 120 ms per mark. This is the
only motion that doesn't come from a key press or the voice.

Everything else responds to the developer:
- the panel opens in 90 ms with no bounce;
- moving between calls cross-fades the call in 120 ms, with no slide;
- the level meter follows the voice, and nothing else moves while listening;
- the note preview expands in 150 ms;
- the duck nods once, in one frame, when the note is copied.

Under *Reduce motion*, marks appear all at once, calls swap instantly, and
the level meter becomes a steady "Listening" label.

### 8.7 Accessibility

- Every interactive element is reachable by keyboard. The focus ring is a
  2 pt amber outline with a 2 pt offset, never removed (the composer, which
  is almost always focused, shows focus with its border instead).
- Screen reader labels come from the vocabulary in §4, for example:
  "Option 2 of 2, In memory. Gain: nothing new to run. Cost: resets on
  deploy."
- Voice is never the only way: every spoken command has a key.
- Colour contrast meets WCAG AA for all text. `duck-ink` exists because
  `duck` isn't readable as text on light surfaces.
- Frank respects the system text size where the OS provides it, and the
  panel re-lays out rather than truncating.

## 9. Component inventory (M1)

| Component | States | Keys |
| --- | --- | --- |
| `PlanHeader` | loading, loaded, stale ("newer plan available"), pasted | `⌘P` |
| `ContextCheck` | files listed, confirmed, "don't ask again" | `↵` |
| `TheRead` | streaming, complete, nothing worth a look | `↵` |
| `CallQuestion` | question, plan quote (marked), why it matters | none |
| `Options` | none highlighted, highlighted (from the hinge or Frank), chosen | `1–3` |
| `Hinge` | unanswered, answered | `A–C` |
| `Evidence` | collapsed line, open with code; flagged (bill) | click |
| `ProgressRail` | per call: open, current, kept, changed, dropped | `← →` |
| `FrankTurn` | streaming, complete, spoken | none |
| `Composer` | empty, typing, listening, transcribing, disabled | `↵`, hold `Space` |
| `YourCalls` | decisions, note preview, copied | `⌘↵` |
| `Footer` | hints, a pending suggestion, a confirmation line | `⌘↵` |
| `BrainStatus` | ready, signed out, missing, slow, quota | Retry |
| `Onboarding` | welcome, brain, hotkey, sample plan | `↵` |
| `StickyFrank` | idle, listening, thinking, judging, done | click, drag |

Each component takes its colours from §8.2 only. No component defines its own
colours or radii.
