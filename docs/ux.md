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

Frank is blunt about plans and decent to people. He's the staff engineer on
your team who has seen this go wrong before: he reads the plan properly, says
the uncomfortable thing plainly, names what every option costs, and guides
you to the right call without making you feel stupid for missing it. He
mentors in passing, a principle in a few words when it helps, and never
lectures. He keeps his position until you give him new information, then
updates. His character sheet is Frank's system prompt, the same on every
brain (`packages/engine/src/prompt.ts`).

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
- Weigh a call by how hard it is to undo, and say which it is when it
  matters.
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
| `Space` | Hold: talk. Tap: talk freely (hands-free), or stop. When the composer is empty. |
| `V` | Frank's voice: pick how he sounds, without leaving the call |
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
Redis" out loud is faster, and more honest, than typing it. So Frank is
voice first: he reads the plan, tells you what it does and what needs you,
asks which call you want to talk through, and listens. The panel stays, as
the thing you glance at while he talks. Chat mode, a setting, is the panel
alone.

### 6.1 The briefing

After the read starts, Frank speaks as soon as the first part has streamed
in, not when all of it has. With the sample plan:

> Claude Code's plan adds a per-key limit of 100 requests a minute to the
> public API, with counters kept in Redis, so one noisy key can't slow the
> API down for everyone. Here's what needs you. First, where the counters
> live: Redis like the plan says, or in memory. Second, whether the health
> check is limited: every route like the plan, or just the public API.
> Third, whether two new packages are worth it, or just one. Which one do
> you want to talk through? Or say go to take them in order.

- The shape is always the same: the plan and its goal in one sentence, each
  call in a line with its options by name, then one question. At most three
  calls are spoken; more become "and two smaller ones, on screen".
- Under 35 seconds (a test holds it to 90 words). What Frank checked and
  found fine stays on screen, not in his mouth.
- The sentences are built from the read, not asked of the brain, so they're
  instant and the same every time. The read carries two fields for it: the
  plan's `goal` and each call's `spoken` line.
- Lines are only ever added as the read streams in, never changed, so what
  he's said stays true. Calls keep the brain's order for the same reason:
  "the second one" never moves.
- The call he's talking about is lit on screen as he says it.

### 6.2 Talking a call through

You say "the Redis one", "the second one", "counters", or "go". Frank opens
the call and says it: the question, what each option buys and costs, and
what it comes down to.

> Where should the counters live? The code disagrees with the plan here.
> The plan goes with Redis: works across instances, but a new service to
> run. Or in memory: nothing new to run, but resets on deploy. It comes
> down to: will you run more than one API instance soon?

Then it's your turn:

| You say | Frank |
| --- | --- |
| "go", "in order", "the Redis one", "the second one", "health checks" | opens that call (from the read, or "let's talk about…" from a call) |
| an answer to "it comes down to" ("no, just one") | "Then in memory. Go with that?" |
| "yes", "go with that" | makes the call: "Going with in memory." Then the next open call. |
| "keep it", "go with the plan" | "Keeping Redis." Then the next call. |
| "option two", "go with in memory" | chooses it |
| "drop it", "next", "back" | drops the step, moves on, goes back |
| "what would you do?" | his take: the option, the reason, what would change his mind |
| a question ("why not Postgres?") | a short spoken answer from the brain |

Everything that isn't a question is handled on the Mac, at once. Only
questions and "what would you do?" go to the brain: a whole plan talked
through by voice can be one request, the read.

When the last call is made: "That's all three. You changed one thing:
counter storage, in memory. Want me to copy the note for Claude Code?"
"Yes" copies it: "Note copied. Paste it into Claude Code." Keyboard actions
(`↵`, `1`, `→`…) do the same things, and he says them too.

### 6.3 Listening

- **Turn-taking.** After Frank asks, the microphone opens by itself
  (voice mode). He hears when you start and stop (Silero VAD, on-device).
  A pause isn't always the end: after 0.7 s of quiet he looks at what you
  said so far, and if it trails off ("we could use Redis because…") he keeps
  listening; if it sounds finished ("keep it", "why not Redis?") he answers
  at once. After 1.6 s of quiet the turn is over either way.
- **Half duplex.** While he thinks and talks he isn't listening, so he
  never hears himself. Any key cuts him off, and it's your turn. Cutting in
  by voice needs echo cancellation (§6.7).
- **Off.** Tap `Space` or the microphone, `Esc`, hiding the panel, or 45
  seconds of nobody talking. In voice mode it stays off until you turn it
  on. The panel stays open while it's on, and the menu bar icon shows he's
  listening.
- **Push to talk** still works: hold the hotkey from any app, or hold
  `Space` in the panel.
- **On this Mac, only.** Speech is transcribed on-device (Whisper). Audio
  never leaves the machine and is never saved. Only the words go to the
  brain, like typing them would.
- **Fast.** Whisper runs on the GPU, with its audio window sized to the clip.
  Frank's voice is loaded when the panel opens; a long first sentence is made
  in two, so the first sound comes sooner; each sentence is made while the
  one before it plays.

### 6.4 His voice

Frank speaks with natural voices (Kokoro-82M, on this Mac): Michael (his
own), Heart, George, Emma, Fenrir, Bella. The voice button next to the
microphone, or `V`, opens them in the panel: voice or chat, then each voice
with Listen; choosing one says a line in it. The same picker is in
Settings. There are no macOS voices: until his voice is downloaded, Frank
shows text, and the voice bar says so with a Download button.

### 6.5 What it looks like

In voice mode the text box becomes a **voice bar**, one line with the state
and three buttons (his voice, type instead, microphone):

| State | Voice bar |
| --- | --- |
| Reading | "Frank is reading the plan" |
| Talking | "Frank is talking. Any key to cut in." with a breathing amber dot |
| Your turn | the level meter, dimmed, "Your turn. Just talk." |
| Hearing you | the level meter, live, "Hearing you" |
| Thinking | "Thinking it over", and the seconds in the conversation |
| Off | "Tap Space to talk" |

What you said shows as your turn, exactly as transcribed, so a mishearing
is obvious. A command shows as a line in the footer ("Chose In memory")
instead. In chat mode the text box stays, and push to talk and talking
freely work as in voice mode, but Frank only talks when talked to.

### 6.6 First use

Onboarding asks once: "I'm best out loud…" **Download and talk** (voice,
the default) or **I'd rather type** (chat). Voice needs about 360 MB of
models, downloaded once, in the background, while you try the sample plan:
listening (Whisper and Silero, 150 MB) and his voice (Kokoro, 212 MB). The
first time he listens, macOS asks for the microphone. If it's refused:
"Frank can't hear you. Allow the microphone in System Settings, Privacy,
Microphone."

### 6.7 Next: cutting in by voice

The microphone hears Frank through the speakers, so for now he doesn't
listen while he talks. macOS's voice-processing audio unit
(`kAudioUnitSubType_VoiceProcessingIO`) cancels echo; moving capture and
playback onto it would let Silero hear you over him, so he stops the moment
you start talking. It starts as a spike: measure how well it cancels on
laptop speakers first.

## 7. Flows and states

### 7.1 First run (target: under 60 seconds to the first useful answer)

1. **"Hi, I'm Frank."** One sentence about what he does, then straight to
   setup.
2. **Pick a brain.** Frank lists what he detected, each with its status.
   Choosing one runs a tiny test request and shows "Ready" or the exact fix.
3. **Pick a hotkey.** A recorder shows the suggested `⌥⇧Space`: tap to open
   him, hold to talk.
4. **Voice or chat.** Voice is the default, and downloads its models in
   the background (§6.6).
5. **Try it.** "Try me on a sample plan" opens a real-looking plan with its
   files, so the magic moment doesn't wait for the next agent run.

### 7.2 A normal session

1. **Open.** The panel opens with the plan header filled in and live
   progress: "Reading the plan", "Reading 6 files", "Finding the calls".
2. **Context check.** On first use in a project, Frank shows the files he's
   about to read and waits for `↵`. "Don't ask again for this project" skips
   this next time.
3. **The read.** The gist, the size of it, the calls as questions, and
   what's fine, marked on the plan's words as they arrive (§8.6). In voice
   mode Frank briefs you while it arrives, then asks which call to talk
   through (§6.1).
4. **The calls.** Say which, or `↵` to start. One call at a time: answer
   what it comes down to, choose an option, or skip. Talk or type whenever
   something needs thinking through.
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
| Voice not downloaded | Frank shows text; the voice bar: "Frank can't talk yet: his voice isn't downloaded." and Download. |

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
