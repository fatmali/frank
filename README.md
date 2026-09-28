# 🦆 Frank

**A duck on your screen you can talk to when you're overwhelmed.**

Meet Frank. He's a duck, and he's frank.

Your agent just gave you three plans and you can't pick one. Or you've been
stuck on the same bug for an hour. Press a hotkey and Frank is there. Talk
it through or type it out. The duck already knows what you're looking at: it
finds the plans your agents just wrote and reads the repo you're in, so you
don't have to paste anything. It listens, asks the question you needed, lays
out the trade-offs, and helps you pick the best option. Then it goes back to
its corner.

Open source. Runs on your machine. Works with the model you already have.

---

## How it works

1. **Summon it.** Press `⌥ Space` (you can change it) or click the duck. Hold
   the key to talk, or just type.
2. **It finds the context.** It picks up the plans your coding agents wrote
   recently, your current repo (branch and changed files) and, if you want,
   your clipboard. It shows what it found and you confirm with one key.
3. **It talks it through with you.** It listens first, then asks one short
   question at a time and puts the options side by side so the differences
   are obvious.
4. **It helps you choose.** Ask *"which would you pick?"* at any point and
   you get a straight answer with reasons. It isn't a yes-duck.
5. **Back to work.** Your choice and the chosen plan are copied, ready to
   hand to your agent. The duck returns to its corner.

## What it looks like

```
You  ⌥ Space  "ugh, I can't decide between these"

🦆  Found 2 plans from the last 10 minutes in rubber-duck/:
    · Claude Code: "Add rate limiting with a token bucket in middleware"
    · Cursor:      "Add Redis-backed rate limiting per route"
    Use these?  [Enter]

🦆  Quick comparison:
                  Claude Code plan       Cursor plan
    Undo later    easy                   harder (new service)
    Effort        about 1 file           Redis + config + ops
    Scales to     one instance           many instances

    One question: are you running more than one instance?

You  "no, just one for now"

🦆  Then the Claude Code plan. It's smaller, easy to undo, and fits
    what you have today. Move to Redis when you add a second instance.
    Copied the plan and a one-line summary. Go ship. 🦆
```

## Where it finds plans

| Agent | Where it looks |
| --- | --- |
| Claude Code | Plan files in `~/.claude/plans/` (or your `plansDirectory`), plus recent session history |
| Cursor | Plan files in `~/.cursor/plans/*.plan.md` and any plans saved to your workspace |
| Codex CLI | Recent sessions in `~/.codex/sessions/` |
| Anything else | Your clipboard, a selected file, or text you drop on the duck |

It only looks when you summon it, and only shows plans from the last little
while, grouped by project. More agents can be added as small adapters.

## Bring your own model

The duck needs a model to think with, and it can use the one you already have:

- An **Anthropic** or **OpenAI** API key (found automatically in your
  environment),
- Any **OpenAI-compatible** endpoint,
- Or a **local model through Ollama**, so nothing leaves your machine.

## Principles

- **It only speaks when you call it.** No pop-ups, and no watching your screen.
- **It listens first,** then keeps things short: one question at a time.
- **It's frank.** It's in the name. It tells you when a plan is worse, even
  the one you like.
- **You decide.** When you ask, it recommends and explains why.

## Privacy

Everything runs locally. The duck reads plans and repo context only when you
summon it, shows you what it found before using it, and sends that only to
the model you chose. With a local model, nothing leaves your machine at all.

## Status

🥚 Design stage. The design (requirements, data model, architecture and
plan) is in [docs/design.md](docs/design.md). Ideas and pushback are welcome.

## License

Open source; license to be chosen before the first release.
