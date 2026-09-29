# Voice first: plan

Status: proposed. Once built, this folds into ux.md and design.md.

## 1. What changes

Today Frank is a panel you read, and voice is an extra. Voice first flips
that. Frank reads the plan, **tells you** what it does and what needs you,
asks which call you want to talk through, and then listens. The panel
stays, as the thing you glance at while he talks, not the thing you have
to read.

- **Voice is the default.** A setting switches Frank to chat (today's
  panel: typed, quiet). It's asked once, at first run, with voice
  preselected.
- **Natural voices only.** The macOS voices (`say`) go. Frank speaks with
  Kokoro, on the Mac, or not at all.
- **He leads, then listens.** He opens with a short briefing, asks one
  question, and the microphone opens by itself (hands-free, as built).
  After that it's a conversation: you talk, he answers, and the calls get
  made along the way.

Why: the developer we design for is overwhelmed (ux.md §2). Listening to
thirty seconds of "here's what this plan does, here are the three things
that need you" while looking at the code is less work than reading a panel.
Talking a trade-off through out loud is how a rubber duck works.

## 2. The experience

### 2.1 The briefing

After the read (the context check stays: ↵ to send, as now), Frank speaks.
He starts as soon as the first part of the read has streamed in, not when
all of it has, so the first words come about two seconds after ↵.

With the sample plan:

> Claude's plan adds rate limiting to the public API, so one noisy key
> can't slow it down for everyone else. I checked the 429 response and the
> tests; those look right. Three calls need you. One: where the counters
> live, Redis like the plan says, or in memory. Two: whether /health is
> rate limited. Three: whether two new packages are worth it. Which one do
> you want to talk through? Or say "go", and we'll take them in order.

The shape, always the same:

1. **The plan and its goal**, one sentence: what it does, so that what.
2. **What's fine**, one sentence, only if something was checked.
3. **How many calls**, then **each call in one line**: the question and
   its options by name. At most three calls are spoken in full; any more
   become "and two smaller ones".
4. **The question**: which one to talk through, or "go" for in order.

Target: under 35 seconds. The screen follows him. The call he's
describing is highlighted as he says it, so a glance tells you where he
is.

### 2.2 Talking a call through

You say "the Redis one", "the first one", "counters", or "go". Frank opens
that call on screen and says it:

> Where the counters live. The plan uses Redis, so every instance shares
> one count, but it's a new service to run. In memory needs nothing new,
> but each instance counts on its own. It comes down to: will production
> run more than one instance?

Then it's your turn. Anything you say is one of these:

| You say | Frank |
| --- | --- |
| an answer to "it comes down to" ("no, just one") | "Then in memory. Go with that?" |
| "yes", "do that", "go with in memory" | makes the call: "Done." Then the next open call, in a sentence. |
| "keep it", "the plan's fine" | keeps the plan's option: "Keeping Redis." Then the next call. |
| "drop it", "skip", "later", "back" | as the commands do today |
| "what would you do?" | his take, two sentences, ending with a suggestion to confirm |
| a question ("why not Postgres?") | a short spoken answer from the brain, then "anything else on this one?" |
| "something else: use the gateway's limiter" | records the change: "Got it: the gateway's limiter." |

Everything that isn't a question is handled on the Mac, instantly. Only
questions and "what would you do?" go to the brain.

### 2.3 Wrapping up

When the last call is made:

> That's all three. You changed one thing: counters in memory. Want me to
> copy the note for Claude?

"Yes" copies it and Frank says "Copied. Paste it into Claude Code." Then
the panel closes, and the microphone goes off with it.

### 2.4 Interrupting and quiet

- **Cutting in.** While Frank talks, any key stops him and it's your turn
  (Space also starts listening). Cutting in by voice, just by talking over
  him, needs echo cancellation (§4.4). That's phase 2.
- **Silence.** If you say nothing for 45 seconds, the microphone turns off
  and the panel says "Tap Space to talk". Nothing is lost.
- **Typing still works.** Start typing and the composer takes it. What you
  type gets a spoken answer in voice mode.

### 2.5 Chat mode

This is exactly today's panel. Frank doesn't speak unless spoken to, the
microphone is push-to-talk or tapped on, and replies are text. It's for
open offices, meetings and people who prefer it.

### 2.6 First run

Voice needs about 360 MB of models, downloaded once: listening (Whisper
and Silero, 150 MB) and his voice (Kokoro, 212 MB). Onboarding becomes:

1. Pick the brain (as now).
2. "Frank talks you through plans. He needs 360 MB of voice models, once.
   They run on this Mac; your voice never leaves it." **Download**
   (default) or **I'd rather type** (chat mode).
3. The download runs in the background while you try the sample plan.
   Until it finishes, Frank shows text and says "I'll talk as soon as my
   voice is ready."
4. macOS asks for the microphone the first time he listens.

### 2.7 What the screen shows in voice mode

- The read, as now, with the call he's talking about highlighted.
- In place of the text box, a **voice bar**. It shows the state and one
  action:

  | State | Voice bar |
  | --- | --- |
  | Frank talking | "Frank is talking. Any key to cut in." |
  | Listening | the level meter, "Your turn" |
  | Hearing you | the level meter, live |
  | Thinking | "Thinking it over", with the seconds |

  The voice bar also has the voice button, and a keyboard icon that turns
  it into a text box.
- What you said shows as your turn, as now, so a mishearing is obvious.
  What Frank says is on screen too: the briefing is the read itself, and
  answers appear as his turns.

## 3. Decisions to confirm

These are my recommendations. Say if you want any of them different.

1. **The briefing covers at most three calls in full.** More than three is
   too much to hold in your head by ear.
2. **The microphone opens by itself after he asks** (voice mode only), and
   closes after 45 s of quiet or when the panel hides. The menu bar icon
   shows when he's listening.
3. **Keep the context check** (↵ to send) before the read. It's about what
   leaves the Mac, and it's skipped for trusted projects anyway.
4. **Until voices are downloaded, voice mode shows text.** There's no
   robotic fallback, since the macOS voices are gone.
5. **Cutting in by voice comes in phase 2** (§4.4). Phase 1 uses a key.

## 4. How it's built

### 4.1 Engine (packages/engine)

- **The read gets spoken fields**, written in the same brain call, so
  there's no extra round trip:
  - `goal`: why the plan exists, a clause ("so one noisy key can't slow
    it down for everyone").
  - per call, `spoken`: the call in one line, with its options by name,
    written to be heard ("where the counters live, Redis like the plan
    says, or in memory").
  - The order in the schema is `gist`, `goal`, `fine`, then `calls`. The
    briefing can then start after `goal` and add each call as it streams.
- **`briefing(read)`**: the sentences, from those fields, plus the fixed
  parts ("Three calls need you", "Which one do you want to talk
  through?"). Deterministic, instant and testable.
- **`callIntro(call)`**: the call's spoken intro, from `stakes`, the
  options' gain and cost, and the hinge.
- **Commands** pick a call by voice: ordinals ("the second one"), words
  from its question or options ("the Redis one", "health"), and "go" / "in
  order". Also a confirm step: after a hinge answer, "yes" takes the
  option it leads to.
- **Older reads** without `goal` or `spoken` still work: the briefing
  falls back to `gist` and the call's question.

### 4.2 Panel (apps/desktop/src)

- `config.voice.mode: 'voice' | 'chat'` replaces `talk_back`: `always`
  and `when-spoken` become voice, and `never` becomes chat. Settings and
  onboarding offer it.
- **The conversation loop** in the controller, voice mode:
  - After the read, speak the briefing, then start hands-free.
  - Each heard turn is either a command (acted on and answered with a
    fixed sentence) or a question (brain, spoken answer).
  - After Frank speaks, it's your turn again (the resume logic already
    exists).
- **Speech with ids.** Each spoken sentence carries what it's about
  (`call:1`, `gist`). The panel highlights that item while it plays.
- **The voice bar** replaces the composer in voice mode, and a keyboard
  toggle brings the composer back.
- The demo host speaks with the browser's voice, so the browser demo still
  works.

### 4.3 Mac side (apps/desktop/src-tauri)

- **Remove the macOS voices**: `say`, `SystemVoice`, `rank_voices`,
  `speech_command` and the system branch of `resolve`. `list_voices`
  returns the six natural voices. Without the voice pack, `speak` emits
  `needs-pack` once and stays quiet.
- **`speak(text, id)`** emits `speaking {id}` when that sentence starts
  playing, and `spoken` when the queue is done. The player already knows
  when each sentence's audio begins.
- **Faster first word.**
  - Load Kokoro when the panel opens in voice mode, not on the first
    sentence.
  - Split the first sentence at its first comma if it's long. Kokoro
    takes about 0.25 s per second of speech, so a short first chunk
    starts sooner.
  - Synthesis already runs one sentence ahead of playback.
- **Both packs in onboarding**, with one consent and one progress bar.

### 4.4 Phase 2: cutting in by voice

The microphone hears Frank through the speakers, so today he doesn't
listen while he talks. macOS has built-in echo cancellation in its
voice-processing audio unit (`kAudioUnitSubType_VoiceProcessingIO`, or
`AVAudioEngine` with voice processing on). cpal doesn't expose it.

Moving capture and playback onto that unit (through `objc2-avf-audio` or
`coreaudio-rs`) would let Silero hear you over him. Frank would then stop
the moment you start talking. It's worth doing, but it's a spike first:
measure how well it cancels on laptop speakers before committing.

## 5. Tasks

| # | Task | Done when |
| --- | --- | --- |
| V1 | Read schema: `goal`, per-call `spoken`, field order for streaming; prompt; old reads still parse | Engine tests on full, partial and legacy reads |
| V2 | `briefing()` and `callIntro()`: sentences from the read, at most three calls in full | Snapshot tests on the sample plan and on 1, 3 and 5 calls |
| V3 | Commands: pick a call by ordinal or words, "go", confirm after a hinge answer | Table-driven tests |
| V4 | Rust: remove the macOS voices; natural only; `needs-pack` when missing | Tests updated; clippy clean on macOS |
| V5 | Rust: `speak(text, id)` with a `speaking {id}` event; Kokoro loaded on panel open; short first chunk | Event order tested; first-word latency logged |
| V6 | Controller: `mode`; the voice loop (briefing → your turn → command or question → your turn); wrap-up and copy | Controller tests drive a whole session by voice with the demo host |
| V7 | Voice bar, highlight of the call being spoken, keyboard toggle | Screenshots in light and dark, checked |
| V8 | Settings and onboarding: voice or chat; one download for both packs | Controller tests for both paths |
| V9 | Demo: voice-first with the browser's voice | `pnpm demo` walks the sample by voice |
| V10 | Docs: fold this into ux.md §5–§7 and design.md §6.5; delete this file | Docs match the app |
| V11 | Try it on a Mac: the whole sample plan by voice, with speakers and with headphones | Notes on anything that felt slow or wrong |
| V12 | Phase 2 spike: echo cancellation with VoiceProcessingIO | A yes or no, with a measurement |

Order: V1–V3 and V4–V5 can go in parallel, then V6, then V7–V9. V10 and
V11 close phase 1. V12 comes after.

## 6. Risks

- **Download size.** 360 MB before voice works. Mitigation: it
  downloads in the background during onboarding, and the app is fully
  usable as text meanwhile.
- **Listening mistakes.** Whisper base can mishear names ("Redis" as
  "Reddis"). Picking a call by words matches loosely (edit distance, and
  options' names). Your words always show on screen.
- **Talking too much.** A long briefing is worse than a panel. The
  35-second target is a test (V2), not a hope. `spoken` lines are capped
  in the prompt.
- **Speakers without phase 2.** Half duplex means you can't cut in by
  voice, only by key. That's clear on screen ("Any key to cut in").
