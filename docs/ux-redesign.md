# UX redesign: plan

Status: proposed. Once built, this folds into ux.md §5, §6 and §8, and this
file goes.

## 1. The brief

Confirm or correct these three lines; everything below follows from them.

- **Subject.** A duck on your desk who talks you through the decisions in a
  plan your coding agent just wrote, before any code gets written.
- **Audience.** A developer mid-flow, tired, looking at their editor more
  than at Frank, who has just been handed a 200-line plan by Claude Code.
  They listen more than they read.
- **Primary job.** Make each decision's trade-off obvious at a glance, and
  keep the conversation legible without reading: who's talking, which call
  we're on, what's decided.

## 2. What's wrong now

Looked at every view, light and dark, with the sample plan.

1. **It's a document, not a conversation.** Frank is voice first, but his
   presence is a 20 px icon and a status line at the bottom. Nothing on
   screen says, at a glance, whose turn it is or what he just said.
2. **The trade-off isn't visible as a trade-off.** Options are stacked
   rows with + and − lines; you compare by reading down. "It comes down to"
   sits below, as buttons that say "leads to Redis", so the fact that
   decides the call is visually separate from the options it decides.
3. **The receipt is hidden.** "The code disagrees" is the most important
   thing about call 1, and the proof (docker-compose.yml has no Redis) is
   collapsed at the bottom.
4. **Everything has the same weight.** Header, gist, count, list, quotes,
   fine, composer, footer: eight bands, each with a rule. Every call repeats
   the plan's words in underlined mono. Margin notes ("code disagrees", "the
   plan") are italic mono.
5. **Numbers collide.** "Call 1 of 3" holds options numbered 1 and 2.
6. **Keyboard chips everywhere** (Ctrl+P, Ctrl+↵, ↵ Start with 1), in a
   product you now mostly talk to.
7. **The longest moment is the emptiest.** A real plan's read takes 15 to
   30 seconds. The screen says "Frank is still reading" and nothing else.

## 3. The design plan

### 3.1 Colour

From the subject: a rubber duck in water. Each colour has one job.

| Name | Hex (light) | Hex (dark) | Job |
| --- | --- | --- | --- |
| Pond | `#E9F0EE` | `#123330` | The panel's ground |
| Paper | `#FBFCFB` | `#1A3F3B` | Where content sits |
| Ink | `#16302B` | `#E4EEEB` | Text |
| Duck | `#F2C230` | `#F2C230` | Frank's voice: what he's saying now, and what he'd pick |
| Bill | `#B83D0A` | `#FF7A45` | Frank disagrees: the code contradicts the plan |
| Reed | `#276B4E` | `#6CC49A` | Decided |

Dark mode is a deep pond, not a tinted black. Duck yellow never carries
text: it's a bar, a fill, a mark. Text on it is Ink.

### 3.2 Type

One family, **Recursive** (OFL), whose casual axis is the point: *who is
speaking is set in the type*.

| Voice | Setting | Used for |
| --- | --- | --- |
| Frank | Recursive Sans Casual (CASL 1), 500 | What he says: captions, the question on a call, his take |
| The plan and the facts | Recursive Sans Linear (CASL 0), 400/600 | Gist, options, gains and costs, your calls |
| Code | Recursive Mono Linear | File paths, lines, identifiers, and nothing else |
| You | Recursive Sans Linear, 400 italic | What you said, as heard |

Scale (1.25, from 14 px): 12, 14, 17.5, 22, 27. Line length under 60
characters in the panel. Replaces the system sans and both Monaspace faces;
one variable font file, bundled.

### 3.3 Layout

The panel grows from 480 to 520 px, for two options side by side.
Everything is left aligned, except the two sides of a call, which mirror
around the middle.

**The caption line.** Under the header, one line that is always Frank's
current sentence (Casual, on a duck-yellow bar) or your turn ("Your turn.
Say which one, or go."). It replaces the voice bar at the bottom: the
conversation is read at the top, where the eye lands, and it doubles as
captions for noisy rooms and for anyone who can't listen.

**The read.** Each call is one line: the decision, then its two options as
a fork. The plan's own words move behind the call (they're on the call
view). What's fine is one quiet line.

```
┌──────────────────────────────────────────────────┐
│ [duck]  Add rate limiting to the public API       │
│         Claude Code plan, 3 min ago               │
│ ████ Here's what needs you. First, where the      │  caption: Frank, now
│      counters live.                               │
├──────────────────────────────────────────────────┤
│ Adds a per-key limit of 100 requests a minute,    │  gist
│ so one noisy key can't slow the API for everyone. │
│                                                   │
│ 1  Where the counters live      Redis  ⟋⟍  memory │  the call Frank is on:
│    the code disagrees                             │  duck bar at its edge
│ 2  Health check limited?   every route ⟋⟍ API only│
│ 3  Two new packages?              both ⟋⟍ one     │
│                                                   │
│ Checked and fine: the 429 response, the tests.    │
└──────────────────────────────────────────────────┘
```

Calls are numbered because they are a sequence (hardest to undo first, and
"the second one" is something you say).

**A call: the balance.** The memorable thing, and the only bold one. The
plan's choice on the left, the alternative on the right, on a beam. What it
comes down to sits under the fulcrum, and each answer sits under the side
it leads to, so the question and its consequence are one picture.

```
┌──────────────────────────────────────────────────┐
│ ████ It comes down to: will you run more than     │  caption
│      one instance soon?                           │
├──────────────────────────────────────────────────┤
│ ● ○ ○   Where should the counters live?           │  Frank's question, Casual 22
│                                                   │
│   The plan                    Instead              │
│   Redis                       In memory            │
│   + counts shared across      + nothing new        │
│     instances                   to run             │
│   − a new service to run      − resets on deploy   │
│   ▼ docker-compose.yml has                         │  the receipt hangs from
│     no Redis service                               │  the side it's against
│  ━━━━━━━━━━━━━━━━━━━━━━━▲━━━━━━━━━━━━━━━━━━━━━━━  │  the beam
│          will you run more than one instance?     │
│   Yes, soon                   No, just one         │  answers under their side
└──────────────────────────────────────────────────┘
```

- **Answering tips the beam** toward the side it leads to (4°, 180 ms, the
  one orchestrated motion in the app). The raised side gets the duck-yellow
  edge: "Then in memory. Go with that?" Saying yes turns it reed green, and
  the next call slides in.
- **Frank's take** puts the duck mark on his side and his two sentences in
  the caption.
- **The receipt** is a weight: evidence against an option hangs under it in
  bill orange, with the file and line in mono. Evidence for it is ink.
- **A third option** sits under the beam as one line: "Also possible:
  express-rate-limit only, one dependency, memory store only."
- **A call with no alternative** (a silent choice) has one side and no beam:
  keep it, drop it, or say what to do instead.
- Options aren't numbered on screen; `1` and `2` still pick left and right.

**Your calls: the note is the hero.** It's what you leave with, so it's the
biggest thing on screen: the text that gets pasted, in Linear, on paper,
with each change in reed. The decisions are a compact list above it.

```
┌──────────────────────────────────────────────────┐
│ ████ That's all three. Want me to copy the note?  │
├──────────────────────────────────────────────────┤
│ Counters        in memory       changed            │
│ Health check    public API only changed            │
│ Packages        both            kept               │
│ ┌──────────────────────────────────────────────┐ │
│ │ Revise the plan before building:             │ │  the note, as pasted
│ │ - Counter storage: keep counters in memory…  │ │
│ │ - Limited routes: apply the limiter to…      │ │
│ │ Everything else stays as planned.            │ │
│ └──────────────────────────────────────────────┘ │
│                                   Copy note  ⌘↵   │
└──────────────────────────────────────────────────┘
```

**Frank himself** stays small, and tells you the state without words:
listening, his head tilts toward you; talking, his bill opens with his
voice's level; thinking, his eye closes. The same three frames go to the
menu bar icon.

**Keys** stop being chips on every screen. Each view shows one hint in the
footer, the one that matters there ("↵ start", "1 or 2 to choose", "⌘↵ copy
the note"), and `?` shows them all.

### 3.4 Waiting for a real plan

The read is the longest moment, so it gets the most care:

- Frank says "Reading it now" when it starts, and "It's a long one" if
  nothing has come back after 6 seconds.
- The screen shows the plan's own outline (its headings, from the Markdown,
  on-device) with the files he sent, and each call's line appears in place
  as it arrives, so the read fills in rather than appearing all at once.
- The caption shows elapsed time after 4 seconds, as the thinking timer
  does now.

### 3.5 Principles

1. **Who's speaking is in the type.** Frank is Casual, the plan and the
   facts are Linear, code is Mono, you are italic.
2. **The trade-off is a picture.** Two sides, one beam, and the deciding
   fact under the fulcrum. Nothing else in the app is that bold.
3. **Colour is meaning.** Duck is Frank's voice, bill is disagreement, reed
   is decided. No other colour, no decoration.
4. **The conversation is read at the top.** The caption line is always the
   latest thing said.
5. **Receipts sit next to the claim.** Evidence hangs from the option it's
   about.
6. **Quiet chrome.** Space groups things; rules only where they mean
   something (the beam is the only strong line).

## 4. Review against the defaults

I ran the brief as if it were "a panel for an AI code-review assistant" to
see where I'd land by default, and changed what matched.

- **Colour.** The first pass kept the current amber and orange-red on a
  cool white. That's close to the cream-and-clay default, and the orange
  was doing decoration (margin notes). Changed to colours from the subject
  (pond, duck, bill, reed), each with one job, and a deep pond for dark
  mode instead of a tinted black.
- **Mono labels.** The current margin notes ("code disagrees", "the plan")
  are italic mono, the small-data-label tell. Changed: Frank's words are
  Casual; mono is only for real code.
- **Hairline rules.** The current panel rules off every band and row, the
  broadsheet default. Changed: grouping by space, and the beam as the one
  meaningful line.
- **Cards.** My first sketch of the call put each option in a rounded card
  with a shadow: the SaaS kit. Changed to two sides of a beam, no boxes,
  because a trade-off is a balance, not two products.
- **Labels above content.** "Checked and fine" as a heading, "It comes down
  to" as a bold label. Changed: the first is one sentence; the second is
  the question itself, placed under the fulcrum.
- **Numbering.** Kept for calls (a real sequence you refer to by number),
  removed from options (left and right say it).
- **The duck.** Tempting to make Frank a big animated mascot. Kept him
  small: the balance is the one bold thing, and Frank's states are three
  quiet frames.

## 5. Quality floor

- Keyboard: every action reachable, focus visible (a duck-yellow ring on
  pond), `1`/`2` for left/right, `A`/`B` for the answers.
- Screen readers: the caption line is a polite live region; the balance
  reads as "The plan: Redis, gains…, costs…. Instead: …".
- Reduced motion: the beam doesn't tip; the chosen side just changes
  colour.
- Contrast (checked): Ink on Paper and Pond 12.2:1 or better in light,
  9.7:1 in dark; Bill and Reed text 4.9:1 or better on Paper and Pond in
  both themes; Ink on Duck 8.4:1, and Duck never carries text otherwise.

## 6. Tasks

| # | Task | Done when |
| --- | --- | --- |
| R1 | Tokens: the six colours, both themes; Recursive bundled; type scale | No hard-coded colours; contrast checked |
| R2 | Caption line: Frank's sentence or your turn, at the top; the voice bar goes | Controller tests for what it shows; live region |
| R3 | The read: one line per call with its fork; fine as a sentence; the plan's outline while reading | Screenshots with the sample and with a real 5-call plan |
| R4 | The balance: two sides, beam, answers under their side, tip on answer, receipts as weights, third option, one-sided calls | Screenshots of each case; keyboard and reduced motion |
| R5 | Your calls: the note as the hero | Screenshot |
| R6 | Frank's three frames (listening, talking, thinking) in the panel and the menu bar | Frames reviewed at 16, 22 and 32 px |
| R7 | Keys: one hint per view, `?` for all | Controller test for the hint per view |
| R8 | Waiting: "Reading it now", "It's a long one", the outline | Controller test with a slow brain |
| R9 | Try it on real plans (5 calls, long titles, 3 options, no alternative) and fix what breaks | Notes and fixes |
| R10 | Fold into ux.md, delete this file | Docs match the app |
