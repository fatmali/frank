# 🦆 Rubber Duck

> The AI that doesn't give you answers. You've got enough of those.
> It helps you *choose* one — and move on.

Rubber Duck is a sticky little duck that lives on your screen. You talk through
where you're stuck, just like the classic desk toy — except this one listens,
pushes back, and helps you commit.

It is **open source** and **bring-your-own-model**. The duck ships no brain of
its own; you plug in whichever model you already pay for (or run locally). The
model is the commodity. The duck is everything around it.

---

## Why this exists

The rubber duck has always been about one thing: **clarity through
articulation.** You explain your problem out loud, and halfway through the
sentence you realize the answer. The duck never needed to be smart.

But the bottleneck has moved.

**Old world:** *"I'm stuck. I have no solution."*
→ You talk it out until one appears.

**Agent world:** *"I have five solutions. Claude gave me three approaches,
Copilot autocompleted a fourth, I found a fifth on GitHub — and I can't tell
which is good enough to commit to."*
→ The new stuck is **decision paralysis, not blank-page paralysis.**

Every AI tool today is an **expander** — its instinct is to hand you *more*:
more options, more plans, more plausible paths. Nothing helps you *judge*, and
nothing helps you *commit*. That gap gets wider every time the models get
better at generating.

Rubber Duck lives in that gap.

## What it is not

It is **not another opinion.** If you're paralyzed between three plans and a
tool tells you "option 2 is best," you now have three options *plus a fourth
opinion* — and your next thought is "…but what if the judge is wrong too?"
Another verdict, even a correct one, doesn't cure decision fatigue. It adds to
the pile.

Correctness was never the blocker. **Conviction** is. You can be handed the
right answer and still not trust it enough to ship.

## What it optimizes for

> **The human's conviction and ownership of the decision — not the correctness
> of the answer.**

A judge hands down a verdict you receive passively. A duck makes *you* arrive
at the call and be able to defend it. Only the second one actually lets you
stop deliberating and move.

---

## The three things that make it different

A rubber-duck *prompt* inside a chat is stateless, generic, and trapped in the
one window where you're already overwhelmed. It grades a plan on its intrinsic
merits. But "good enough" isn't intrinsic — it's relative to **you**. That's
the ground a fresh, amnesiac model can't stand on:

### 1. Outcome memory 🎯
The duck learns your *taste*, not your codebase. Over time:
- *"The last two times you took the clever path, you ripped it out three weeks
  later."*
- *"You value shipping over elegance — but you've said 'let's do it right'
  three times this week. Which is it today?"*

Conviction comes from your own track record, not a stranger's opinion — even a
smart stranger's. This compounds. It's why the duck is still on your screen in
month three.

### 2. The retro loop 🔁
Devs make architecture decisions constantly and get **zero feedback** on
whether they were right. The chat ends; the decision vanishes into git history.
The duck comes back:

> *"Two weeks ago you chose the event-driven approach because 'it'll scale.'
> Did it? Was the complexity worth it?"*

Each decision becomes a calibration point. Calibration is literally what
conviction is made of — you trust your gut *because* it's been scored before.

### 3. Reducer, not expander ✂️
Every agent adds. The duck subtracts. Its entire bias is to shrink the
decision:
- *"These two options are functionally identical. Flip a coin, move on."*
- *"One-way door or two-way door? Reversible? Then stop deliberating and ship
  the boring one."*
- *"You don't need this decision at all yet. Come back when it hurts."*

In a world flooded with plausible options, the scarce, valuable move is the one
that takes options *away*.

---

## How it feels to use

You bring the competing options — talk them in, or paste them. The duck
**never adds another one.** Instead it:

1. **Surfaces your hidden constraints** — the stuff the agent never knew to ask.
   *"Is this a hot path? Who maintains this in six months? Do you actually need
   it to scale, or is that premature?"* Half the time, answering these collapses
   five options into one.
2. **Plays devil's advocate on your favorite.** *"You're leaning toward the
   clever one. What breaks it? Convince me the boring option is wrong."*
3. **Forces the trade-off out loud.** *"You keep saying 'cleaner.' Cleaner at
   the cost of what?"*
4. **Makes you commit — and captures why.** The moment you say "option 2,
   because X," that sentence *is* the decision record.

### The dial

You control how hard the duck pushes — from silent toy to sharp interrogator:

| Setting | Behavior |
| --- | --- |
| **Sounding board** | Silent. Reflects your words back, asks "and?" — the classic duck. |
| **Socratic** *(default)* | Asks the constraint questions. No opinions. |
| **Devil's advocate** | Actively attacks your leading option. |
| **Verdict** | *"You've talked enough — pick 2, here's why, go."* For when you're spiralling and need permission to commit. |

The duck defaults to questions and only delivers a verdict when you ask for one.

---

## Bring your own model

Rubber Duck is model-agnostic by design:

- **Plug in any provider** — Claude, OpenAI, or a local model via Ollama.
- **Your key, your bill.** No middleman, no hosted inference to pay for.
- **Local-first.** Your decision history, outcomes, and taste profile live on
  *your* disk — not our server. There is no server.
- **No-brain mode.** With no model connected, the duck still works as a pure
  passive sounding board. Talking out loud was always half the magic.

This isn't just a licensing convenience — it's the whole point. If the value
were the model, this couldn't be open source. The value is the layer around it,
and that layer belongs to you.

---

## Status

🥚 Early. This document is the vision, not the software yet. We're figuring out
the smallest version that proves the core loop — **outcome memory + the retro
follow-up** — because that's the part nothing else does.

Ideas, disagreement, and pushback welcome. (The duck would want it that way.)

## License

Intended to be open source. License TBD.
