import { PR_JSON_FIELDS, countUnattended, parsePullRequests } from "./pr";

const USAGE = `usage: gh pr list --state all --json ${PR_JSON_FIELDS} | bun src/cli.ts <command>

commands:
  count                      number of pull requests read
  unattended --owner <login> merged pull requests with no review from <login>`;

const [command] = process.argv.slice(2);

switch (command) {
  case "count": {
    const prs = parsePullRequests(await Bun.stdin.text());
    console.log(prs.length);
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
    console.log(countUnattended(prs, owner));
    break;
  }
  default:
    console.error(USAGE);
    process.exit(command === undefined || command === "help" ? 0 : 1);
}
