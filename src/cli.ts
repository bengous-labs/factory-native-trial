import { PR_JSON_FIELDS, closedShare, countByAuthor, countByPrefix, countByState, countUnattended, median, mergedSince, parsePullRequests, reviewRounds } from "./pr";

const USAGE = `usage: gh pr list --state all --json ${PR_JSON_FIELDS} | bun src/cli.ts <command>

commands:
  count                      number of pull requests read
  states                     pull requests that are open, merged and closed without merge, then the total
  rounds --reviewer <login>  reviews <login> submitted per PR, then the median
  unattended --owner <login> merged pull requests with no review from <login>
  merged --since <date> [--until <date>]
                             pull requests merged on or after --since and before --until
  closed                     pull requests closed without merge, then their share of all pull requests
  prefixes                   pull requests per title prefix (text before the first ":"), most first
  authors                    pull requests opened per author login, most first`;

const [command] = process.argv.slice(2);

switch (command) {
  case "count": {
    const prs = parsePullRequests(await Bun.stdin.text());
    const onlyMerged = process.argv.includes("--merged");
    console.log(onlyMerged ? prs.filter((pr) => pr.state === "MERGED").length : prs.length);
    break;
  }
  case "states": {
    const prs = parsePullRequests(await Bun.stdin.text());
    console.log(countByState(prs).join("\n"));
    break;
  }
  case "rounds": {
    const i = process.argv.indexOf("--reviewer");
    const reviewer = i === -1 ? undefined : process.argv[i + 1];
    if (!reviewer) {
      console.error("rounds needs --reviewer <login>");
      process.exit(1);
    }
    const rows = reviewRounds(parsePullRequests(await Bun.stdin.text()), reviewer);
    for (const r of rows) console.log(`#${r.number} ${r.rounds}`);
    console.log(`median ${median(rows.map((r) => r.rounds))}`);
    break;
  }
  case "unattended": {
    const args = process.argv.slice(3);
    const i = args.indexOf("--owner");
    const owner = i === -1 ? undefined : args[i + 1];
    if (!owner) {
      console.error(USAGE);
      process.exit(1);
    }
    const prs = parsePullRequests(await Bun.stdin.text());
    const unattended = countUnattended(prs, owner);
    const merged = prs.filter((pr) => pr.state === "MERGED").length;
    console.log(unattended);
    console.log(`${merged === 0 ? 0 : Math.round((unattended / merged) * 100)}%`);
    break;
  }
  case "merged": {
    const i = process.argv.indexOf("--since");
    const since = i === -1 ? undefined : process.argv[i + 1];
    const j = process.argv.indexOf("--until");
    const until = j === -1 ? undefined : process.argv[j + 1];
    if (!since || (j !== -1 && !until)) {
      console.error(USAGE);
      process.exit(1);
    }
    console.log(mergedSince(parsePullRequests(await Bun.stdin.text()), since, until));
    break;
  }
  case "closed": {
    const { closed, percent } = closedShare(parsePullRequests(await Bun.stdin.text()));
    console.log(closed);
    console.log(`${percent}%`);
    break;
  }
  case "prefixes": {
    for (const { prefix, count } of countByPrefix(parsePullRequests(await Bun.stdin.text()))) console.log(`${prefix} ${count}`);
    break;
  }
  case undefined:
  case "help":
    console.log(USAGE);
    break;
  case "authors": {
    const input = await Bun.stdin.text();
    const prs = input.trim() === "" ? [] : parsePullRequests(input);
    for (const a of countByAuthor(prs)) console.log(`${a.login} ${a.count}`);
    break;
  }
  default:
    console.error(USAGE);
    process.exit(1);
}
