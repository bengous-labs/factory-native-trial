import { GH_COMMAND, InputError, closedShare, countByAuthor, countByPrefix, countByState, countMerged, countUnattended, landedShare, median, mergedSince, parseInstant, parsePullRequests, percent, reviewRounds, stateCounts, summary, type PullRequest } from "./pr";

const USAGE = `usage: ${GH_COMMAND} | bun src/cli.ts <command>

commands:
  count [--merged]           number of pull requests read; --merged counts only the merged ones
  states [--json]            pull requests that are open, merged and closed without merge, each with its share, then the total;
                             --json prints {"open":n,"merged":n,"closed":n,"total":n}
  rounds --reviewer <login>  reviews <login> submitted per PR, then the median
  unattended --owner <login> merged pull requests with no review from <login>
  merged --since <date> [--until <date>]
                             pull requests merged on or after --since and before --until;
                             <date> is ISO 8601: 2026, 2026-11, 2026-11-16 or 2026-11-16T10:30:00+01:00, UTC without offset
  closed                     pull requests closed without merge, then their share of all pull requests
  prefixes                   pull requests per title prefix (text before the first ":"), most first
  authors                    pull requests opened per author login, most first
  landed                     share of all pull requests that are merged
  summary --owner <login> --reviewer <login>
                             every metric in one JSON object: count, states, landed, closed, unattended,
                             rounds (median, max), authors and prefixes (name, count, most first)`;

type Flags = Record<string, string | number | true>;

type Command = {
  /** Each flag the command accepts: "switch" takes no argument, "value" takes the next one, "date" takes an ISO 8601 date read as an instant. */
  flags: Record<string, "switch" | "value" | "date">;
  /** Flags the command cannot run without, with the placeholder of their value. */
  required?: Record<string, string>;
  run: (prs: PullRequest[], flags: Flags) => string[];
};

function fail(message: string, usage: boolean): never {
  console.error(usage ? `${message}\n${USAGE}` : message);
  process.exit(1);
}

function readFlags(name: string, command: Command, args: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const kind = Object.hasOwn(command.flags, arg) ? command.flags[arg] : undefined;
    if (kind === undefined) fail(`${name}: unknown ${arg.startsWith("-") ? "flag" : "argument"} ${arg}`, true);
    if (Object.hasOwn(flags, arg)) fail(`${name}: ${arg} given twice`, true);
    if (kind === "switch") {
      flags[arg] = true;
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith("--")) fail(`${name}: ${arg} needs a value`, true);
    flags[arg] = kind === "date" ? readDate(arg, value) : value;
  }
  for (const [flag, placeholder] of Object.entries(command.required ?? {})) {
    if (flags[flag] === undefined) fail(`${name} needs ${flag} <${placeholder}>`, true);
  }
  return flags;
}

function readDate(flag: string, text: string): number {
  const instant = parseInstant(text);
  if (instant === undefined) fail(`${flag} ${text} is not an ISO 8601 date or date-time, such as 2026-11-16 or 2026-11-16T10:30:00Z`, false);
  return instant;
}

const COMMANDS: Record<string, Command> = {
  count: {
    flags: { "--merged": "switch" },
    run: (prs, flags) => [String(flags["--merged"] ? countMerged(prs) : prs.length)],
  },
  states: {
    flags: { "--json": "switch" },
    run: (prs, flags) => (flags["--json"] ? [JSON.stringify(stateCounts(prs))] : countByState(prs)),
  },
  rounds: {
    flags: { "--reviewer": "value" },
    required: { "--reviewer": "login" },
    run: (prs, flags) => {
      const rows = reviewRounds(prs, flags["--reviewer"] as string);
      return [...rows.map((r) => `#${r.number} ${r.rounds}`), `median ${median(rows.map((r) => r.rounds))}`];
    },
  },
  unattended: {
    flags: { "--owner": "value" },
    required: { "--owner": "login" },
    run: (prs, flags) => {
      const unattended = countUnattended(prs, flags["--owner"] as string);
      return [String(unattended), `${percent(unattended, countMerged(prs))}%`];
    },
  },
  merged: {
    flags: { "--since": "date", "--until": "date" },
    required: { "--since": "date" },
    run: (prs, flags) => [String(mergedSince(prs, flags["--since"] as number, flags["--until"] as number | undefined))],
  },
  closed: {
    flags: {},
    run: (prs) => {
      const { closed, percent } = closedShare(prs);
      return [String(closed), `${percent}%`];
    },
  },
  prefixes: {
    flags: {},
    run: (prs) => countByPrefix(prs).map(({ prefix, count }) => `${prefix} ${count}`),
  },
  authors: {
    flags: {},
    run: (prs) => countByAuthor(prs).map(({ login, count }) => `${login} ${count}`),
  },
  landed: {
    flags: {},
    run: (prs) => [`${landedShare(prs)}%`],
  },
  summary: {
    flags: { "--owner": "value", "--reviewer": "value" },
    required: { "--owner": "login", "--reviewer": "login" },
    run: (prs, flags) => [JSON.stringify(summary(prs, flags["--owner"] as string, flags["--reviewer"] as string))],
  },
};

const [name, ...args] = process.argv.slice(2);

if (name === undefined || name === "help") {
  console.log(USAGE);
  process.exit(0);
}

const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name]! : fail(`unknown command ${name}`, true);
const flags = readFlags(name, command, args);
let prs: PullRequest[];
try {
  prs = parsePullRequests(await Bun.stdin.text());
} catch (error) {
  if (error instanceof InputError) fail(error.message, false);
  throw error;
}
for (const line of command.run(prs, flags)) console.log(line);
