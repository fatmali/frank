# UX redesign: the duck listens

Status: proposed. Replaces the earlier redesign plan. Once built, this folds
into ux.md §5 to §8, and this file goes.

## 1. What rubber ducking is, and what that means for Frank

**The technique.** In *The Pragmatic Programmer*, Hunt and Thomas describe
it as explaining the problem to someone else, who "should look over your
shoulder at the screen, and nod his or her head constantly like a rubber
duck bobbing up and down in a bathtub." The listener "does not need to say
a word; the simple act of explaining, step by step, what the code is
supposed to do often causes the problem to leap off the screen and announce
itself."

**Why it works.** Michelene Chi's research on the self-explanation effect:
people who explain something in their own words understand it better than
people who just read it. Speaking out loud slows you down and exposes the
jump from step A to step D, and it works better with a listener, even a
silent one, than thinking aloud alone.

**What it means for Frank.** The one who explains is the one who learns. The
Frank we built mostly talks: a 35-second briefing, then an intro for each
call, while the developer answers "yes" and "the Redis one". That is the
opposite of rubber ducking. The developer is a listener to a summary of a
plan they didn't write, which is exactly how you end up accepting a plan you
don't understand.

So the redesign turns it round: **the developer talks, Frank listens, and
Frank speaks only to point at the gap** between what they said and what the
plan does.

## 2. What else the research adds

- **The listener looks at the screen.** The duck in the anecdote looks
  over your shoulder at the code. Frank should be looking at the plan with
  you, following the part you're talking about.
- **Don't assume it, prove it** (*Pragmatic Programmer*). Frank checks
  claims against the code and brings receipts. He never asks the developer
  for a fact he can look up.
- **There are no final decisions; good design is easier to change**
  (*Pragmatic Programmer*, reversibility and ETC). Most calls in a plan are
  two-way doors. Spend the time on the one-way doors, and when the deciding
  fact is unknown, choose the option that keeps it easy to change.
- **Grill one question at a time, facts are mine, decisions are yours**
  (Matt Pocock's "grill me" skill, from his *Pragmatic Engineer*
  interview). Walk the decisions in dependency order, with a recommended
  answer ready; when one decision settles another, say so instead of asking.
  Finish with a summary and don't act until the developer confirms it's
  right. And when something doesn't land, re-pitch it more simply ("wait,
  what?").
- **The knowledge paradox** (*The Pragmatic Engineer*, Addy Osmani on
  AI-assisted coding). Experienced engineers use their judgement to
  constrain AI output; less experienced ones accept it. Frank's job is to
  make sure the developer understands and owns the decisions, not to make
  them for them.
- **Share the trade-offs and the reasons** (*The Pragmatic Engineer* on
  RFCs and design docs). The note to the agent should carry each decision
  and why, like a small decision record, so the agent and future you know
  what would change it.
- **The genie deletes tests** (Kent Beck on *The Pragmatic Engineer*).
  Plans that remove, skip or weaken tests are a call, always.

## 3. Principles

1. **You talk more than Frank.** His turns are one or two short sentences.
   The long turns are yours.
2. **He points at gaps, not at everything.** He speaks when what you said
   and what the plan does differ, when the code disagrees, or when you ask.
3. **Facts are his job, decisions are yours.** He never asks what the files
   can answer, and he never decides for you. He'll recommend when asked.
4. **One-way doors get the time.** Easy-to-change calls are kept in one
   breath unless you want to talk about them.
5. **One question at a time**, in the order that settles the most.
6. **Nothing is done until you've heard it back.** He summarizes the
   decisions, you confirm, then he writes the note.
7. **Thinking pauses are part of talking.** Frank waits through them.

## 4. The conversation

The same sample plan, start to finish.

**Summon.** You press the hotkey. The read starts at once, silently, and the
panel shows the plan itself. Frank asks one thing:

> What did you ask Claude for?

**You explain.** This is the rubber ducking. You talk, with pauses; Frank
nods while you do.

> Um, rate limiting on the public API. Somebody's hammering it... so a
> per-key limit, like a hundred a minute.

While you talk, the read finishes: your explanation fills the 15 to 30
seconds a real plan takes to read, instead of a spinner.

**The gap.** Frank compares what you said with what the plan does, and says
only the difference:

> The plan does that. It also adds Redis and limits the health check, and
> you didn't mention either.

The two parts you didn't mention light up in the plan. If you'd said
something the plan contradicts ("just the public API"), he'd say that
instead: "You said the public API. The plan limits every route, health
check included."

**Triage by how hard it is to undo.**

> Redis is the one that's hard to undo. Start there?

If there are calls that are easy to change later, he offers to keep them in
one go: "The other two are easy to change later. Keep them as planned?"

**One question at a time, facts first.** He brings the receipt, then asks
the one thing only you know:

> There's no Redis in your docker-compose file, so it's a new service to
> run. How many instances do you run?

> Just the one. Maybe two next year?

**Recommendation, with the easy-to-change option when the future is
unsure.**

> Then in memory, behind the limiter's store option, so Redis is a small
> change when you get there. Go with that?

> Yes.

**Decisions settle other decisions.**

> Done. That also means you don't need rate-limit-redis, so that's gone
> too.

> The health check: the load balancer hits it every two seconds, and a
> limit could take the API out of rotation. Leave it unlimited?

> Oh. Yeah, leave it.

**Hear it back, then the note.**

> So: counters in memory until you run two instances, the health check
> unlimited, and one package instead of two. Right?

> Right.

> Copied. Paste it into Claude Code.

The note carries the reasons:

```
Revise the plan before building:
- Counter storage: keep counters in memory, behind the limiter's store
  option. Why: we run one instance; switch to Redis at two.
- Limited routes: apply the limiter to /api/public only. Why: the load
  balancer polls /health every 2 seconds.
- Dependencies: add express-rate-limit only. Why: counters are in memory.
Everything else stays as planned.
```

### 4.1 Other ways in

- **"You tell me" or "I haven't read it."** Frank gives the plan in one
  sentence and how many calls need you, then goes to triage. This is the
  old briefing, cut to two sentences.
- **Silence for 8 seconds after his question.** "Or I can tell you what it
  does."
- **"I don't know"** to a deciding question. Frank recommends the option
  that's easiest to change, and the note says so: "Why: unknown yet; keep
  it easy to switch."
- **"What would you do?"** His recommendation, the reason, and what would
  change his mind.
- **"Wait, what?", "say that again", "simpler."** He re-pitches the last
  thing in plainer words, with the context you're missing.
- **"Hold on", "let me think."** He waits, as long as it takes, and the
  duck stays still, looking at you.

### 4.2 What he says, and how much

| Moment | Frank's line |
| --- | --- |
| Opening | One question: "What did you ask Claude for?" |
| The gap | What the plan does beyond or against what you said, in one or two sentences |
| Triage | The one-way doors by name; one offer to keep the easy ones |
| A call | The receipt, then the deciding question |
| After your answer | The option it points to, the easy-to-change version if you're unsure, then "Go with that?" |
| Settled by another call | One sentence saying so |
| End | The decisions in one breath, then "Right?" |

Nothing else unprompted. The 35-second briefing, call intros listing every
option, and "Keeping Redis." acknowledgements go.

## 5. Turn-taking for thinking aloud

Explaining a plan out loud is full of pauses. Today a turn ends after 1.6
seconds of quiet, which cuts off someone thinking.

- **Patience depends on what he asked.** After an open question ("What did
  you ask Claude for?") the turn ends after 3 seconds of quiet, and only
  when what you said sounds finished. After a yes-or-no question, 1.2
  seconds.
- **"Hold on" stops the clock** until you speak again.
- **The nod.** While you talk, the duck bobs with your voice. It's the
  anecdote's duck, and it shows he's still listening through a pause without
  saying "mm-hm" over you.
- **Cutting in** is by any key for now; by voice once echo cancellation
  lands (ux.md §6.7).
- **Your words appear as you say them**, so a mishearing is caught while
  you're still talking.

## 6. The screen

### 6.1 What's on it

The thing being explained: **the plan**, in the agent's own words, the way
the duck in the anecdote looks at the code. Frank's marks sit on it: the
calls underlined in the plan's text, receipts beside them.

**Frank follows along.** When you talk about part of the plan ("the Redis
bit"), the duck moves down the margin to that part and it's highlighted.
When he talks about a call, he's beside it. That's the one bold thing in
the design: a duck in the margin of your plan, looking at what you're
talking about, nodding while you talk.

```
┌──────────────────────────────────────────────────┐
│ Add rate limiting to the public API               │
│ Claude Code plan, 3 min ago                       │
├──────────────────────────────────────────────────┤
│  ## Plan                                          │
│  1. Add express-rate-limit and rate-limit-redis   │
│  2. Use Redis to share counters across            │ ◀ [duck]
│     instances                                     │   hard to undo
│     ╰ no Redis in docker-compose.yml:1            │   the receipt
│  3. Apply the limiter to every route in           │
│     src/server.ts                                 │
│  4. Return 429 with a Retry-After header          │   fine
├──────────────────────────────────────────────────┤
│ You  "just the one, maybe two next year"          │  your words, live
│ Frank  Then in memory, behind the store option.   │  his last line
│        Go with that?                              │
└──────────────────────────────────────────────────┘
```

**A call, when it's open,** unfolds under its line in the plan: the plan's
choice and the alternative side by side, what each buys and costs, and the
deciding question with each answer under the option it leads to. Quiet: no
cards, no animation beyond the unfold.

```
│  2. Use Redis to share counters across instances  │ ◀ [duck]
│     ┌─────────────────────┬─────────────────────┐ │
│     │ The plan: Redis     │ Instead: in memory   │ │
│     │ + one count across  │ + nothing new to run │ │
│     │   instances         │ − resets on deploy   │ │
│     │ − a new service     │                      │ │
│     ├─────────────────────┴─────────────────────┤ │
│     │ How many instances do you run?            │ │
│     │ Two or more                  Just the one │ │
│     └───────────────────────────────────────────┘ │
```

**Triage** shows as a margin label on each call, "hard to undo" or "easy to
change", so the one-way doors stand out in the plan without a separate list.

**Your calls, at the end,** is the note, with the reasons, as it will be
pasted. Decisions made are marked in the plan's margin too, so you can see
the plan and what you changed in one place.

### 6.2 The duck

About 40 px, in the margin, with four states and no others:

| State | The duck |
| --- | --- |
| Listening | Facing you, bobbing with your voice |
| Waiting ("hold on") | Facing you, still |
| Talking | Facing the plan, bill moving with his voice |
| Thinking | Eyes on the plan, one slow blink |

The same states, smaller, in the menu bar.

### 6.3 Look and feel

Kept from the first redesign plan, because they still fit:

- **Colour** from a rubber duck in water, each with one job: Pond
  `#E9F0EE` (dark `#123330`) the ground, Paper `#FBFCFB` (`#1A3F3B`) the
  plan, Ink `#16302B` (`#E4EEEB`) text, Duck `#F2C230` Frank and the part
  he's looking at, Bill `#B83D0A` (`#FF7A45`) the code disagrees, Reed
  `#276B4E` (`#6CC49A`) decided. All text pairs checked at 4.9:1 or better.
- **Type**: Recursive, one family, where the style says who's speaking:
  Frank in Casual, the plan and facts in Linear, code in Mono, you in
  italic.

Changed from that plan:

- **The bold element is the duck in the margin, not a balance beam.** A
  tipping beam made the trade-off the show; rubber ducking says the
  developer's explanation is the show, and the duck is the listener. The
  trade-off is still side by side, quietly.
- **The plan's text is the main surface, not a list of calls.** The duck
  looks at the code in the anecdote; Frank looks at the plan.
- **The caption line at the top goes.** The conversation is two lines at
  the bottom (your words, his last line), under the thing you're both
  looking at.

## 7. How it's built

### 7.1 Engine

- **Intent check**: a new turn. Input: the developer's explanation and the
  read. Output, as JSON: Frank's one or two sentences, which calls the
  developer covered, which they didn't mention, and any the developer
  contradicted, with their words and the plan's.
- **The read gains** `dependsOn` per call (which calls it hangs off) and
  `settles` per option (choosing it makes another call moot, and which
  option that call takes). Removing, skipping or weakening tests is always
  a call.
- **The frontier**: open calls whose prerequisites are settled, hardest to
  undo first. Easy calls can be kept in one batch.
- **Outcomes gain a reason**: the answer to the deciding question, or the
  developer's words, or "unknown yet". The note prints it.
- **Commands**: "you tell me", "I don't know", "hold on", "let me think",
  "wait, what", "say that again", "simpler", "keep the easy ones".
- **Following along**: match what the developer says against the plan's
  lines and the calls (on-device, the same loose word matching as picking
  a call), so the panel knows which part they're talking about.

### 7.2 Mac

- **Patience per turn**: the panel tells the listener what kind of answer
  it expects (open or yes-or-no), which sets the end-of-turn silence (3 s
  or 1.2 s). "Hold on" suspends the end of turn until speech resumes.
- **Live partial transcripts** while you talk (Whisper on the audio so
  far, every second or so), for your words on screen and following along.
- **Your voice level** drives the nod (it already drives the meter).

### 7.3 Panel

- The plan as the main surface, with marks, receipts, margin labels and the
  unfolding call.
- The duck in the margin: position follows the part being discussed; the
  four states.
- The two-line conversation strip: your words, live; his last line.
- The new flow: opener, intent check, triage, frontier, summary and
  confirm, note with reasons.

## 8. Tasks

| # | Task | Done when |
| --- | --- | --- |
| D1 | Intent check turn, with its JSON and prompt | Engine tests: covered, unmentioned and contradicted calls on the sample and on two real plans |
| D2 | Read: `dependsOn`, `settles`, tests always a call | Engine tests; old reads still parse |
| D3 | Frontier, batch-keep for easy calls, decisions that settle others | Session tests |
| D4 | Reasons on outcomes, printed in the note | Note tests |
| D5 | Commands: you tell me, I don't know, hold on, wait what, simpler, keep the easy ones | Table-driven tests |
| D6 | Patience per turn, "hold on", live partial transcripts | Rust tests on real speech with long pauses |
| D7 | Following along: what you're talking about, in the plan | Tests on transcripts of the sample |
| D8 | The flow in the controller: opener, gap, triage, one question at a time, summary, confirm | A whole session by voice in controller tests, with fewer Frank words than yours |
| D9 | The plan as the surface; the call unfolding in place; margin labels; the note with reasons | Screenshots, light and dark, sample and a real plan |
| D10 | The duck in the margin: four states, following along, nodding with your voice; menu bar states | Frames reviewed at 16, 22 and 40 px; reduced motion keeps him still |
| D11 | Tokens and type from §6.3 | No hard-coded colours; contrast checked |
| D12 | Try it on real plans and your own voice; fold into ux.md; delete this file | Notes, fixes, docs match the app |

Order: D1 to D5 (engine) alongside D6 (Mac), then D7 and D8, then D9 to
D11, then D12.

## 9. Sources

- [Rubber duck debugging](https://en.wikipedia.org/wiki/Rubber_duck_debugging), and the anecdote as quoted in [The rubber duck method of debugging explained](https://www.techtarget.com/searchsoftwarequality/tip/The-rubber-duck-method-of-debugging-explained) (*The Pragmatic Programmer*, Hunt and Thomas)
- Chi, [Self-explaining](https://mrbartonmaths.com/resourcesnew/8.%20Research/Self%20explanations/Self%20Explaining%20(Chi).pdf), and [Why explaining your problems to a rubber duck actually works](https://www.sciencealert.com/why-explaining-your-problems-to-a-rubber-duck-actually-works)
- [Reversibility: there are no final decisions](https://medium.com/continuousdelivery/reversibility-37bd6acf8a3c) (*The Pragmatic Programmer*)
- [AI Skills with Matt Pocock](https://newsletter.pragmaticengineer.com/p/ai-skills-with-matt-pocock) (*The Pragmatic Engineer*), and his [grill-me skill](https://github.com/mattpocock/skills)
- [How AI-assisted coding will change software engineering: hard truths](https://newsletter.pragmaticengineer.com/p/how-ai-will-change-software-engineering) (*The Pragmatic Engineer*, Addy Osmani)
- [Engineering planning with RFCs, design documents and ADRs](https://newsletter.pragmaticengineer.com/p/rfcs-and-design-docs) (*The Pragmatic Engineer*)
- [TDD, AI agents and coding with Kent Beck](https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent) (*The Pragmatic Engineer*)
- [One-way and two-way door decisions](https://fs.blog/reversible-irreversible-decisions/)
