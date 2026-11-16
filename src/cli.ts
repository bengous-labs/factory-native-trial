import { PR_JSON_FIELDS, median, parsePullRequests, reviewRounds } from "./pr";

const USAGE = `usage: gh pr list --state all --json ${PR_JSON_FIELDS} | bun src/cli.ts <command>

commands:
  count                      number of pull requests read
  rounds --reviewer <login>  reviews <login> submitted per PR, then the median`;

const [command] = process.argv.slice(2);

switch (command) {
  case "count": {
    const prs = parsePullRequests(await Bun.stdin.text());
    console.log(prs.length);
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
  default:
    console.error(USAGE);
    process.exit(command === undefined || command === "help" ? 0 : 1);
}
