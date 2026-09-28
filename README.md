# 🦆 Frank

**A duck you can talk to when you're overwhelmed.**

Meet Frank. He's a duck, and he's frank.

Your agent just handed you a plan. Somewhere in it are the calls that matter:
the options it laid out, and the choices it made without asking, like a new
dependency, a schema change, or "apply it everywhere." You're not sure which
ones are right. Press a hotkey and Frank pops up with the plan already loaded.
He points out the calls worth a second look, checks them against your actual
code, talks each one through with you, and helps you land on the right
answer. Then he hands your decisions back to your agent and gets out of your
way.

Open source. Runs on your machine. Works with the AI subscription you already
have.

---

## How it works

1. **Summon him.** Press `⌥ Space` (you can change it) or click Frank in your
   menu bar. Hold the key to talk, or just type.
2. **He finds the plan.** Frank picks up the plan your coding agent just
   wrote, along with your repo and the files the plan touches. You don't
   paste anything.
3. **He spots the calls that matter.** He lists the few decisions in the plan
   worth a second look, hardest to undo first:
   - options the plan offers,
   - choices it made quietly,
   - assumptions that might not hold in your code.
4. **He talks them through with you.** One at a time: the options side by
   side, one good question, and checks against your code. Ask *"what would
   you do?"* and you get a straight answer with reasons.
5. **Back to work.** Frank writes a short note with your decisions, ready to
   paste to your agent, and tucks himself away.

Also good for: comparing two plans, sanity-checking an idea before you ask
your agent, or just the bug you've been stuck on for an hour.

### Sticky mode

By default Frank lives in your menu bar and only appears when you call him.
If you'd like him on screen all the time, turn on **sticky mode**. He'll sit
in a corner, always on top, and you can drag him wherever you like.

## What it looks like

```
You  ⌥ Space  "not sure about this plan"

🦆  Claude Code's plan from 3 min ago: "Add rate limiting to the API"
    Three calls worth a look:
    1. Store counts in Redis        (plan's choice; alternative: in memory)
    2. Apply to every route         (plan's choice; alternative: /api/public only)
    3. Add express-rate-limit       (new dependency)
    Start with 1?

You  "yeah"

🦆  Redis vs in memory:
                  Redis                   In memory
    Undo later    harder (new service)    easy
    Effort        Redis + config + ops    about 1 file
    Works for     many instances          one instance

    Also: I don't see Redis anywhere in your repo or docker-compose.
    Are you running more than one instance?

You  "no, just one"

🦆  Then in memory. The plan's Redis choice solves a problem you don't
    have yet. Next, every route: your /health check is on that list...

    ...

🦆  Note for your agent (copied):
    "Go ahead with these changes: in-memory counters instead of Redis;
     only /api/public, not /health; keep express-rate-limit."
    Go ship. 🦆
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

Frank only looks when you summon him. He opens the most recent plan for the
project you're in, and you can switch to another in one click. More agents
can be added as small adapters.

## Principles

- **He only speaks when you call him.** No pop-ups, and no watching your
  screen.
- **He listens first,** then keeps things short: a few calls, and one
  question at a time.
- **He's frank.** It's in the name. He tells you when the plan's choice is
  wrong, and when yours is.
- **You decide.** When you ask, he recommends and explains why.

## How is Frank different from Copilot's Rubber Duck?

[GitHub Copilot's Rubber Duck](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/rubber-duck)
reviews your **agent's** work. Frank helps **you** make the calls inside the
plan.

| | Copilot's Rubber Duck | Frank |
| --- | --- | --- |
| **Helps** | The agent: a second model reviews the agent's work | You: a duck you talk to when you're overwhelmed |
| **Runs** | Automatically, at checkpoints in a Copilot session | When you call him, from anywhere |
| **Gives you** | A list of concerns the agent uses to fix its work | The plan's key decisions, talked through one by one, with a straight recommendation and a note for your agent |
| **Scope** | One Copilot session | The plan in front of you, from any agent |
| **Beyond plans** | Reviewing the agent's work | Any stuck moment, like the bug you've been on for an hour |
| **Runs on** | Copilot | Your Claude Code, Copilot or Cursor subscription, an API key, or a local model |

They work well together. Rubber Duck makes the agent's plan better, and
Frank makes sure the calls in it are the ones you'd make.

## Privacy

Everything runs locally. Frank reads plans and repo context only when you
summon him, shows you what he found before using it, and sends it only to
the model you chose. With a local model, nothing leaves your machine at all.

## Status

🥚 Design stage. The design (requirements, data model, architecture and
plan) is in [docs/design.md](docs/design.md). Ideas and pushback are welcome.

## License

Open source; license to be chosen before the first release.
