# UX redesign: rubber ducking the agent's plan

Status: in progress. Built: the plans home, the shorter briefing, "walk me
through it" with answers heard in your explanation, the new commands,
patience per turn, and the screen (§6): the plan as the surface with marks
and margin notes, a call's excerpt and its two sides, the duck in the
margin, the last words said, and the colours and type (now in ux.md §8).
Still to come: following along with live transcripts (D6, D7), decision
dependencies and reasons in the note (D2 to D4). Once done, this folds into
ux.md §5 to §7, and this file goes.

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

**What it means for Frank.** What gets rubber-ducked is the agent's plan:
the developer explains it to the duck the way you'd explain someone else's
code, line by line, and the problems in it show up while they explain.
Frank has read the plan and the code, so he's a duck that can nod, follow
along, and point when what you just said doesn't match the plan or the
code.

The flow stays as built: Frank briefs you, then asks which call to talk
through. What changes is inside a call. Today Frank does the explaining (he
lists each option's gains and costs) and you answer "yes". That's the duck
talking. Instead, he puts the plan's words for that call in front of you
and asks you to walk him through it; you explain what the agent is doing
there and whether it fits; he listens, and speaks to point at the gap.

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

1. **You explain the plan; Frank listens.** Inside a call, the long turns
   are yours. His are one or two short sentences.
2. **He points at gaps, not at everything.** He speaks when what you said
   about the plan doesn't match the plan or the code, when your explanation
   skips the part that matters, or when you ask.
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

**Summon.** Frank grabs the newest plan you haven't talked through, and
the read starts; the panel shows the plan itself. If there's nothing new, he
opens the plans home instead and asks "Which plan?".

**The briefing,** as built, but shorter: the plan and its goal, then the
calls by name, then one question.

> Claude Code's plan adds a per-key limit of 100 requests a minute to the
> public API, so one noisy key can't slow it down for everyone. Three
> things in it need you: Redis, the health check, and two new packages.
> Redis is the one that's hard to undo. Start there?

The easy-to-change calls get one offer, whenever you like: "The other two
are easy to change later. Keep them as planned?"

**Walk me through it.** Frank highlights the plan's own words for the call
and hands it to you:

> Walk me through this bit. What's the plan doing with Redis?

**You explain the agent's plan.** This is the rubber ducking. You read its
words and say what they do, with pauses; Frank nods while you talk.

> So it keeps the counters in Redis, so that... every instance sees the
> same count. Which matters if we have more than one instance. We've got
> one. So why does it want Redis?

The problem has announced itself: you found it by explaining. Frank's job
now is to confirm it with facts, and not to repeat what you just said:

> Right, and there's no Redis in your docker-compose file either, so it's
> a new service to run for a second instance you don't have.

**Your explanation often answers the deciding question.** Here, "we've got
one" answered "how many instances do you run?", so Frank doesn't ask it. He
goes straight to what it points to:

> Then in memory, behind the limiter's store option, so Redis is a small
> change if you add an instance. Go with that?

> Yes.

**When you can't explain it,** that's a finding too. "I don't know why it
wants Redis" gets the plan's reason in one sentence ("so every instance
shares one count"), then the deciding question.

**Decisions settle other decisions.**

> Done. That also means you don't need rate-limit-redis, so that's gone
> too. Next, the health check. Walk me through it?

> It applies the limiter to every route... including /health. Hm, the load
> balancer hits that, right?

> Every two seconds, in src/server.ts. A limit could take the API out of
> rotation. Leave it unlimited?

> Yeah, leave it.

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

### 4.1 The plans home

Every plan from the last two weeks, newest first, one line each: the title,
where it came from and when, and how far you got ("2 of 3 decided", "note
copied"). Pick one by clicking it, by its number, or by saying it ("the JWT
one", "the second one"). Going back to a plan you've started picks up where
you left off: same calls, same decisions, same place. ⌘P, "show my plans",
or the plan's title in the header opens it. With no plans, it says how to
add one: paste it, or drop the file.

A plan that no Claude Code session mentions has no project on the home,
rather than a guessed one.

### 4.2 Other ways in

- **"You explain it."** Frank says what the plan does there and what each
  option buys and costs (today's call intro), then asks the deciding
  question. For when you're too tired to walk it through.
- **Silence for 8 seconds after "walk me through it".** "Or I can explain
  it."
- **"I don't know"** to a deciding question. Frank recommends the option
  that's easiest to change, and the note says so: "Why: unknown yet; keep
  it easy to switch."
- **"What would you do?"** His recommendation, the reason, and what would
  change his mind.
- **"Wait, what?", "say that again", "simpler."** He re-pitches the last
  thing in plainer words, with the context you're missing.
- **"Hold on", "let me think."** He waits, as long as it takes, and the
  duck stays still, looking at you.

### 4.3 What he says, and how much

| Moment | Frank's line |
| --- | --- |
| Plans home | "Which plan?", only when summoned with nothing new |
| Briefing | The plan and its goal, the calls by name, then "Where should we start?" with the hardest to undo: about 20 seconds |
| A call | "Walk me through this bit", with the plan's words highlighted |
| While you explain | Nothing; the duck nods |
| After you explain | What you missed or got wrong, with the receipt; or "Right," and the fact that backs you |
| The deciding question | Only if your explanation didn't already answer it |
| After your answer | The option it points to, the easy-to-change version if you're unsure, then "Go with that?" |
| Settled by another call | One sentence saying so |
| End | The decisions in one breath, then "Right?" |

The 35-second briefing and the call intros that list every option go (the
intro stays behind "you explain it"), and so do the "Keeping Redis."
acknowledgements.

## 5. Turn-taking for thinking aloud

Explaining a plan out loud is full of pauses. Today a turn ends after 1.6
seconds of quiet, which cuts off someone thinking.

- **Patience depends on what he asked.** After "walk me through it" the
  turn ends after 3 seconds of quiet, and only when what you said sounds
  finished. After a yes-or-no question, 1.2
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

**Frank follows along.** As you walk through the plan, the duck moves
down the margin to the part you're talking about, and it's highlighted, the
way a listener's eyes follow your finger down the code. When he talks about
a call, he's beside it. That's the one bold thing in
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

- **Walk-through turn**: the developer's explanation of a call goes to the
  brain with the call, the plan's words and the files. Frank replies in one
  or two sentences: what the explanation got wrong or skipped, with the
  receipt, or "Right" and the fact that backs it. When the explanation
  answered the deciding question, the reply ends with `[answer N]`, the way
  a recommendation ends with `[option N]` today, so Frank goes straight to
  the option it points to.
- **The read gains** `dependsOn` per call (which calls it hangs off) and
  `settles` per option (choosing it makes another call moot, and which
  option that call takes). Removing, skipping or weakening tests is always
  a call.
- **The briefing** names the calls instead of describing each, and ends on
  the hardest to undo.
- **The frontier**: open calls whose prerequisites are settled, hardest to
  undo first. Easy calls can be kept in one batch.
- **Outcomes gain a reason**: the answer to the deciding question, or the
  developer's words, or "unknown yet". The note prints it.
- **Commands**: "you explain it", "I don't know", "hold on", "let me
  think", "wait, what", "say that again", "simpler", "keep the easy ones".
- **Following along**: match what the developer says against the plan's
  lines (on-device, the same loose word matching as picking a call), so the
  panel knows which part they're talking about.

### 7.2 Mac

- **Patience per turn**: the panel tells the listener what kind of answer
  it expects (a walk-through or a yes-or-no), which sets the end-of-turn
  silence (3 s or 1.2 s). "Hold on" suspends the end of turn until speech resumes.
- **Live partial transcripts** while you talk (Whisper on the audio so
  far, every second or so), for your words on screen and following along.
- **Your voice level** drives the nod (it already drives the meter).

### 7.3 Panel

- The plan as the main surface, with marks, receipts, margin labels and the
  unfolding call.
- The duck in the margin: position follows the part being discussed; the
  four states.
- The two-line conversation strip: your words, live; his last line.
- The new flow: shorter briefing, walk me through it, the gap, the
  deciding question only if still open, frontier, summary and confirm, note
  with reasons.

## 8. Tasks

| # | Task | Done when |
| --- | --- | --- |
| D1 | Walk-through turn, its prompt and `[answer N]` | Engine tests: explanations that answer the deciding question, that miss the point, that contradict the code |
| D2 | Read: `dependsOn`, `settles`, tests always a call; the shorter briefing | Engine tests; old reads still parse; briefing under 45 words |
| D3 | Frontier, batch-keep for easy calls, decisions that settle others | Session tests |
| D4 | Reasons on outcomes, printed in the note | Note tests |
| D5 | Commands: you explain it, I don't know, hold on, wait what, simpler, keep the easy ones | Table-driven tests |
| D6 | Patience per turn, "hold on", live partial transcripts | Rust tests on real speech with long pauses |
| D7 | Following along: which part of the plan you're talking about | Tests on transcripts of the sample |
| D8 | The flow in the controller | A whole session by voice in controller tests, with more of the developer's words than Frank's inside calls |
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
