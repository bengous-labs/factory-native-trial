---
allowed-tools: Bash(gh issue view:*), Bash(gh pr diff:*), Bash(gh pr view:*), Read, Grep, Glob, mcp__github_inline_comment__create_inline_comment
description: Code review a pull request
disable-model-invocation: false
---

Review the given pull request yourself, in this session. You are the only judge between this change and `main`: its author is an agent, and no human reads the code before it merges.

## 1. Read

- The pull request: `gh pr view` for its title, its body and the issue it closes; `gh pr diff` for the change.
- The issue it closes: `gh issue view`, for its "Done when" list.
- `CLAUDE.md` at the root, and each changed file in full, not only the diff hunks.

Review every pull request, however small. Do not run the code.

With `--deep`, the change touches a path the owner listed as sensitive. Also read every caller of each changed function and every test of each changed file, and look for each kind of finding in them too.

## 2. Find

Report a finding only for one of these, and only when you can show it:

- **Wrong behaviour**: the code gives a wrong result or crashes. Name a concrete input, the output it gives and the output it should give. An input the command accepts counts, even an unusual one.
- **Unmet issue**: a line of the issue's "Done when" list the change does not satisfy, or behaviour the issue did not ask for.
- **Unproven change**: new behaviour with no test that would fail without it.
- **Drift**: usage text, `README.md` or `CLAUDE.md` the change makes false; logic the change writes again when the file already has it.
- **CLAUDE.md**: a rule of `CLAUDE.md` the change breaks. Quote the rule.
- **Security**: the change lets an input reach a shell, a file path, a network call or a secret without a check, or widens what a workflow or a token can do. Name the input and what it reaches.

Do not report a naming or formatting preference, a defect that was already on `main` and that the change does not touch, or anything you could not confirm by reading the code.

Before you keep a finding, reread the code it rests on and try to prove yourself wrong. Drop it if it does not hold.

## 3. Report

Without `--comment`: list the findings, or say there are none, and stop.

With `--comment`:

- No finding: post nothing. The green `review` check is the verdict, and a comment would wake the author's session for nothing.
- Findings: post one inline comment per finding with `mcp__github_inline_comment__create_inline_comment` and `confirmed: true`. State the defect, the input that shows it and the fix. Add a committable suggestion block only when it fixes the finding entirely. One comment per finding.

Your final structured output is `findings`: the number of findings you reported.
