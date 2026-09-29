# Fixture plans

Each folder is one test case: an agent's plan, the repo files it mentions, and
the calls a careful reviewer would raise (`expected.json`). The unit tests use
them as context. The quality check (`pnpm eval`, task B8) runs them against a
real brain and measures how many expected calls Frank finds and how much noise
he adds.

These first three are synthetic. Real plans from `~/.claude/plans/` make the
best fixtures: drop them in with the files they touch and label the calls.
