# factory-native-trial

A Bun CLI in `src/` that reads `gh pr list --json` output and prints metrics about how pull requests land. No dependencies: do not add any.

## Work

- One issue, one branch from `main`, one pull request.
- `bun test` passes before every push.
- Decide small choices yourself and record them in the PR body. Ask the owner only for a choice that is hard to undo or changes what the tool measures.

## Pull request body

The owner reads it after the agents. Keep it short.

1. `Closes #N.`
2. At most two lines: the problem, then what the change does.
3. One view of the change: a `diff` block of the logic, a file tree, a table, or the CLI output before and after.
4. **Checks**: the command you ran and its result, with numbers.

No question to the reviewer, no summary, no history.

## Review comments

Fix a comment that names a real bug. Decline a style preference in one line in its thread. Resolve the thread once it is handled.

## Owner paths

`CODEOWNERS` lists the files that need the owner's approval. A PR that touches them waits for the owner.
