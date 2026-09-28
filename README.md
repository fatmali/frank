# 🦆 Frank

**A duck you can talk to when you're overwhelmed.**

Meet Frank. He's a duck, and he's frank.

Your agent just gave you three plans and you can't pick one. Or you've been
stuck on the same bug for an hour. Press a hotkey and Frank pops up. Talk it
through or type it out. Frank already knows what you're looking at: he finds
the plans your agents just wrote and reads the repo you're in, so you don't
have to paste anything. He listens, asks the question you needed, lays out the
trade-offs, and helps you pick the best option. Then he gets out of your way.

Open source. Runs on your machine. Works with the AI subscription you already
have.

---

## How it works

1. **Summon him.** Press `⌥ Space` (you can change it) or click Frank in your
   menu bar. Hold the key to talk, or just type.
2. **He finds the context.** Frank picks up the plans your coding agents wrote
   recently, your current repo (branch and changed files) and, if you want,
   your clipboard. He shows what he found and you confirm with one key.
3. **He talks it through with you.** He listens first, then asks one short
   question at a time and puts the options side by side so the differences
   are obvious.
4. **He helps you choose.** Ask *"which would you pick?"* at any point and
   you get a straight answer with reasons.
5. **Back to work.** Your choice and the chosen plan are copied, ready to
   hand to your agent. Frank tucks himself away.

### Sticky mode

By default Frank lives in your menu bar and only appears when you call him.
If you'd like him on screen all the time, turn on **sticky mode**. He'll sit
in a corner, always on top, and you can drag him wherever you like.

## What it looks like

```
You  ⌥ Space  "ugh, I can't decide between these"

🦆  Found 2 plans from the last 10 minutes in my-app/:
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

## Use the subscription you already have

Frank needs a model to think with. Most developers already pay for one, so
Frank can use it:

| You have | How Frank uses it |
| --- | --- |
| **Claude Code** (Pro, Max or API) | Runs your installed Claude Code in the background. You stay signed in through Claude Code itself, and Frank never sees your credentials. |
| **GitHub Copilot** (any plan, including Free) | Uses GitHub's official Copilot SDK. You sign in with GitHub, and it counts toward your Copilot allowance. |
| **Cursor** | Runs the Cursor CLI in the background, on your Cursor subscription. |
| **An API key** | Anthropic, OpenAI or any OpenAI-compatible endpoint. |
| **Nothing to spare** | A local model through Ollama. Free, and nothing leaves your machine. |

On first run, Frank detects which of these you have and asks which one to
use. Whatever you pick, Frank only reads: he never edits your code or runs
commands through your agent.

## Where it finds plans

| Agent | Where Frank looks |
| --- | --- |
| Claude Code | Plan files in `~/.claude/plans/` (or your `plansDirectory`), plus recent session history |
| Cursor | Plan files in `~/.cursor/plans/*.plan.md` and any plans saved to your workspace |
| Codex CLI | Recent sessions in `~/.codex/sessions/` |
| Anything else | Your clipboard, a selected file, or text you drop on Frank |

Frank only looks when you summon him, and only shows plans from the last
little while, grouped by project. More agents can be added as small adapters.

## Principles

- **He only speaks when you call him.** No pop-ups and no watching your
  screen.
- **He listens first,** then keeps things short: one question at a time.
- **He's frank.** It's in the name. He tells you when a plan is worse, even
  the one you like.
- **You decide.** When you ask, he recommends and explains why.

## Privacy

Everything runs locally. Frank reads plans and repo context only when you
summon him, shows you what he found before using it, and sends it only to
the model you chose. With a local model, nothing leaves your machine at all.

## Status

🥚 Design stage. The design (requirements, data model, architecture and
plan) is in [docs/design.md](docs/design.md). Ideas and pushback are welcome.

## License

Open source; license to be chosen before the first release.
