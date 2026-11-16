import { PR_JSON_FIELDS, countByState, countUnattended, median, mergedSince, parsePullRequests, reviewRounds } from "./pr";

const USAGE = `usage: gh pr list --state all --json ${PR_JSON_FIELDS} | bun src/cli.ts <command>

commands:
  count                      number of pull requests read
  states                     pull requests that are open, merged and closed without merge
  rounds --reviewer <login>  reviews <login> submitted per PR, then the median
  unattended --owner <login> merged pull requests with no review from <login>
  merged --since <date>      pull requests merged on or after <date>`;

const [command] = process.argv.slice(2);

switch (command) {
  case "count": {
    const prs = parsePullRequests(await Bun.stdin.text());
    const onlyMerged = process.argv.includes("--merged");
    console.log(onlyMerged ? prs.filter((pr) => pr.state !== "OPEN").length : prs.length);
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
    if (!since) {
      console.error(USAGE);
      process.exit(1);
    }
    console.log(mergedSince(parsePullRequests(await Bun.stdin.text()), since));
    break;
  }
  default:
    console.error(USAGE);
    process.exit(command === undefined || command === "help" ? 0 : 1);
}
