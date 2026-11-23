# factory-native-trial

A small CLI that measures how pull requests land in a repository: how many review rounds each took, and how many merged without the owner.

```bash
gh pr list --state all --limit 1000 --json number,title,state,author,mergedAt,reviews | bun src/cli.ts count
```

Commands:

```
count [--merged]           number of pull requests read; --merged counts only the merged ones
states [--json]            pull requests that are open, merged and closed without merge, each with its share; --json prints one JSON object
rounds --reviewer <login>  reviews <login> submitted per PR, then the median
unattended --owner <login> merged pull requests with no review from <login>
merged --since <date> [--until <date>]
                           pull requests merged on or after --since and before --until;
                           <date> is ISO 8601: 2026, 2026-11, 2026-11-16 or 2026-11-16T10:30:00+01:00, UTC without offset
closed [--json]            pull requests closed without merge, then their share of all pull requests; --json prints {"count","percent"}
prefixes [--json]          pull requests per title prefix (text before the first ":"), most first; --json prints an array of {"name","count"}
authors [--json]           pull requests opened per author login, most first; --json prints an array of {"name","count"}
landed [--json]            share of all pull requests that are merged; --json prints {"percent"}
summary --owner <login> --reviewer <login> [--out <file>]
                           every metric in one JSON object: count, states, landed, closed, unattended,
                           rounds (median, max), authors and prefixes (name, count, most first);
                           --out writes it to <file>, replacing its content, and prints nothing
reviewed [--json]          pull requests with at least one review, from anyone, then their share of all pull requests; --json prints {"count","percent"}
open                       number of pull requests that are open
```

Bad input or a bad date prints one line on stderr and exits 1. An unknown command, a missing flag, a missing flag value, an unknown flag or a flag given twice prints one line that names it, then the usage, and exits 1.

Run the tests with `bun test`. No dependencies.
