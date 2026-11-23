---
name: verify
description: Verify a change to the factory-native-trial CLI by running src/cli.ts on fixture pull request JSON and reading stdout, stderr and the exit code.
---

# Verify factory-native-trial

The surface is the CLI: `bun src/cli.ts <command>` reads `gh pr list --json` output on stdin. Do not run `bun test`; drive the CLI. Bun is on PATH; no install step, no dependencies.

## Fixture

Write a small JSON array to a scratch file outside the repository (no `gh` or network needed). Each entry needs `number`, `title`, `state` (`OPEN`/`MERGED`/`CLOSED`), `author.login`, `mergedAt` (ISO string for `MERGED`, `null` otherwise) and `reviews` (`[{author:{login}, state, submittedAt}]`). Mix of states, authors, title prefixes and reviewed/unreviewed PRs covers every command.

## Drive

```bash
bun src/cli.ts <command> [flags] < prs.json; echo "exit $?"
```

- Happy path: the command under change on the fixture; compare the numbers with a hand count.
- Rounding: a 2-of-3 case must print `67%`; `echo '[]' | bun src/cli.ts <command>` must print `0%`, not NaN.
- Errors: an unknown flag prints one line naming it, then the usage, exit 1; `echo nope | bun src/cli.ts <command>` prints `stdin is not JSON: "nope"`, exit 1.
- Regression check for a fix: `git worktree add <scratch>/prev <commit>~1` and run the same command there; a removed-identifier bug shows as a `ReferenceError` stack trace. Remove the worktree after (`git worktree remove --force`).
- Commands sharing `wholePercent` (`unattended`, `summary`, `reviewed`, `closed`, `landed`) are worth running together after a rename of a shared helper in `src/pr.ts`.

A change to `.github/`, `.claude/`, `CLAUDE.md` or `README.md` alone has nothing to drive: say `none` and why.

## Report

State the command you ran and what it printed, with its exit code: the pull request body repeats it under **Checks**.

## Gotchas

- A command that references a missing identifier only fails when that command runs: TypeScript is not checked at run time, so every command touched by a rename must be executed, not just imported.
- Flag parsing is strict: `reviewed --json` is rejected because `reviewed` declares no flags.
