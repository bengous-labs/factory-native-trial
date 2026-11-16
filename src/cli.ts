import { PR_JSON_FIELDS, countByState, parsePullRequests } from "./pr";

const USAGE = `usage: gh pr list --state all --json ${PR_JSON_FIELDS} | bun src/cli.ts <command>

commands:
  count   number of pull requests read
  states  pull requests that are open, merged and closed without merge`;

const [command] = process.argv.slice(2);

switch (command) {
  case "count": {
    const prs = parsePullRequests(await Bun.stdin.text());
    console.log(prs.length);
    break;
  }
  case "states": {
    const prs = parsePullRequests(await Bun.stdin.text());
    console.log(countByState(prs).join("\n"));
    break;
  }
  default:
    console.error(USAGE);
    process.exit(command === undefined || command === "help" ? 0 : 1);
}
