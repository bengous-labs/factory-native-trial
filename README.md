# factory-native-trial

A small CLI that measures how pull requests land in a repository: how many review rounds each took, and how many merged without the owner.

```bash
gh pr list --state all --json number,title,state,author,mergedAt,reviews | bun src/cli.ts count
```

Run the tests with `bun test`. No dependencies.
