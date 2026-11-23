import { GH_COMMAND, InputError, authorCounts, closedShare, countBack, countByAuthor, countByPrefix, countByState, countMerged, countReviewed, countUnattended, landedShare, median, mergedSince, parseDuration, parseInstant, parsePullRequests, prefixCounts, reviewRounds, stateCounts, summary, wholePercent, type Duration, type PullRequest } from "./pr";

const USAGE = `usage: ${GH_COMMAND} | bun src/cli.ts <command>

commands:
  count [--merged]           number of pull requests read; --merged counts only the merged ones
  states [--json]            pull requests that are open, merged and closed without merge, each with its share, then the total;
                             --json prints {"open":n,"merged":n,"closed":n,"total":n}
  rounds --reviewer <login>  reviews <login> submitted per PR, then the median
  unattended --owner <login> merged pull requests with no review from <login>
  merged --since <date> [--until <date>] [--now <date>]
                             pull requests merged on or after --since and before --until;
                             <date> is ISO 8601: 2026, 2026-11, 2026-11-16 or 2026-11-16T10:30:00+01:00, UTC without offset;
                             --since and --until also take an ISO 8601 duration counted back from --now, or from the
                             current time without it: P7D, PT36H, P2W, P1M, P1Y2M3DT4H5M6S, months and years calendar ones;
                             merged --since P7D --until P1D counts the week up to a day ago
  closed [--json]            pull requests closed without merge, then their share of all pull requests;
                             --json prints {"count":n,"percent":n}
  prefixes [--json]          pull requests per title prefix (text before the first ":"), most first;
                             --json prints [{"name":s,"count":n}, ...] in the same order
  authors [--json]           pull requests opened per author login, most first;
                             --json prints [{"name":s,"count":n}, ...] in the same order
  landed [--json]            share of all pull requests that are merged;
                             --json prints {"percent":n}
  summary --owner <login> --reviewer <login>
                             every metric in one JSON object: count, states, landed, closed, unattended,
                             rounds (median and max), authors and prefixes (name and count, most first)
  reviewed [--json]          pull requests with at least one review, from anyone, then their share of all pull requests;
                             --json prints {"count":n,"percent":n}
  open                       number of pull requests that are open`;

type Flags = Record<string, string | number | true>;

type Command = {
  /**
   * Each flag the command accepts: "switch" takes no argument, "value" takes the next one, "date" takes an ISO 8601 date
   * read as an instant or an ISO 8601 duration counted back from --now, "now" takes the ISO 8601 date durations count back from.
   */
  flags: Record<string, "switch" | "value" | "date" | "now">;
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
  const durations: [string, string, Duration][] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const kind = Object.hasOwn(command.flags, arg) ? command.flags[arg] : undefined;
    if (kind === undefined) fail(`${name}: unknown ${arg.startsWith("-") ? "flag" : "argument"} ${arg}`, true);
    if (Object.hasOwn(flags, arg) || durations.some(([flag]) => flag === arg)) fail(`${name}: ${arg} given twice`, true);
    if (kind === "switch") {
      flags[arg] = true;
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith("--")) fail(`${name}: ${arg} needs a value`, true);
    if (kind === "value") flags[arg] = value;
    else if (kind === "now" || !value.startsWith("P")) flags[arg] = readDate(arg, value, kind === "date");
    else durations.push([arg, value, readDuration(arg, value)]);
  }
  if (flags["--now"] !== undefined && durations.length === 0) fail(`${name}: --now needs a duration to count back from`, true);
  const now = (flags["--now"] as number | undefined) ?? Date.now();
  for (const [flag, text, duration] of durations) {
    flags[flag] = countBack(now, duration) ?? fail(`${flag} ${text} counts back past the earliest date`, false);
  }
  for (const [flag, placeholder] of Object.entries(command.required ?? {})) {
    if (flags[flag] === undefined) fail(`${name} needs ${flag} <${placeholder}>`, true);
  }
  return flags;
}

function readDate(flag: string, text: string, orDuration: boolean): number {
  const instant = parseInstant(text);
  if (instant === undefined) {
    const kinds = orDuration ? "date, date-time or duration, such as 2026-11-16, 2026-11-16T10:30:00Z or P7D" : "date or date-time, such as 2026-11-16 or 2026-11-16T10:30:00Z";
    fail(`${flag} ${text} is not an ISO 8601 ${kinds}`, false);
  }
  return instant;
}

function readDuration(flag: string, text: string): Duration {
  const duration = parseDuration(text);
  if (duration === undefined) {
    fail(`${flag} ${text} is not an ISO 8601 duration of whole units in order, such as P7D, PT36H, P2W or P1Y2M3DT4H5M6S`, false);
  }
  return duration;
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
      return [String(unattended), `${wholePercent(unattended, countMerged(prs))}%`];
    },
  },
  merged: {
    flags: { "--since": "date", "--until": "date", "--now": "now" },
    required: { "--since": "date" },
    run: (prs, flags) => [String(mergedSince(prs, flags["--since"] as number, flags["--until"] as number | undefined))],
  },
  closed: {
    flags: { "--json": "switch" },
    run: (prs, flags) => {
      const { closed, percent } = closedShare(prs);
      return flags["--json"] ? [JSON.stringify({ count: closed, percent })] : [String(closed), `${percent}%`];
    },
  },
  prefixes: {
    flags: { "--json": "switch" },
    run: (prs, flags) => (flags["--json"] ? [JSON.stringify(prefixCounts(prs))] : countByPrefix(prs).map(({ prefix, count }) => `${prefix} ${count}`)),
  },
  authors: {
    flags: { "--json": "switch" },
    run: (prs, flags) => (flags["--json"] ? [JSON.stringify(authorCounts(prs))] : countByAuthor(prs).map(({ login, count }) => `${login} ${count}`)),
  },
  landed: {
    flags: { "--json": "switch" },
    run: (prs, flags) => {
      const percent = landedShare(prs);
      return flags["--json"] ? [JSON.stringify({ percent })] : [`${percent}%`];
    },
  },
  summary: {
    flags: { "--owner": "value", "--reviewer": "value" },
    required: { "--owner": "login", "--reviewer": "login" },
    run: (prs, flags) => [JSON.stringify(summary(prs, flags["--owner"] as string, flags["--reviewer"] as string))],
  },
  reviewed: {
    flags: { "--json": "switch" },
    run: (prs, flags) => {
      const reviewed = countReviewed(prs);
      const percent = wholePercent(reviewed, prs.length);
      return flags["--json"] ? [JSON.stringify({ count: reviewed, percent })] : [String(reviewed), `${percent}%`];
    },
  },
  open: {
    flags: {},
    run: (prs) => [String(stateCounts(prs).open)],
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
