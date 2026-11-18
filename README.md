# factory-native-trial

A small CLI that measures how pull requests land in a repository: how many review rounds each took, and how many merged without the owner.

```bash
gh pr list --state all --json number,title,state,author,mergedAt,reviews | bun src/cli.ts count
```

Commands:

```
count                      number of pull requests read
states                     pull requests that are open, merged and closed without merge
rounds --reviewer <login>  reviews <login> submitted per PR, then the median
unattended --owner <login> merged pull requests with no review from <login>
merged --since <date> [--until <date>]
                           pull requests merged on or after --since and before --until
prefixes                   pull requests per title prefix (text before the first ":"), most first
```

Run the tests with `bun test`. No dependencies.
