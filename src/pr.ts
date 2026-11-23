export type Review = {
  author: { login: string };
  state: string;
  submittedAt: string;
};

export type PullRequest = {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  author: { login: string };
  mergedAt: string | null;
  reviews: Review[];
};

export const PR_JSON_FIELDS = "number,title,state,author,mergedAt,reviews";

/** The command whose output the CLI reads. */
export const GH_COMMAND = `gh pr list --state all --limit 1000 --json ${PR_JSON_FIELDS}`;

const STATES = ["OPEN", "MERGED", "CLOSED"];

/** A problem with what the user gave the CLI: the CLI prints its message on one line and exits 1. */
export class InputError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasLogin = (v: unknown) => isObject(v) && typeof v.login === "string";

function checkPullRequest(item: unknown): string | undefined {
  if (!isObject(item)) return "is not an object";
  if (typeof item.number !== "number") return 'has no number in "number"';
  if (typeof item.title !== "string") return 'has no string in "title"';
  if (typeof item.state !== "string") return 'has no string in "state"';
  if (!STATES.includes(item.state)) return `has unknown state ${JSON.stringify(item.state)}, expected ${STATES.join(", ")}`;
  if (!hasLogin(item.author)) return 'has no login in "author"';
  if (item.mergedAt !== null && (typeof item.mergedAt !== "string" || parseInstant(item.mergedAt) === undefined)) {
    return 'has no ISO 8601 date-time or null in "mergedAt"';
  }
  if (!Array.isArray(item.reviews)) return 'has no array in "reviews"';
  const bad = item.reviews.findIndex((r) => !isObject(r) || !hasLogin(r.author) || typeof r.state !== "string");
  if (bad !== -1) return `has review ${bad} without an author login and a state`;
  return undefined;
}

export function parsePullRequests(json: string): PullRequest[] {
  if (json.trim() === "") throw new InputError(`no input on stdin: pipe in ${GH_COMMAND}`);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new InputError(`stdin is not JSON: ${JSON.stringify(json.trim().split("\n")[0]!.slice(0, 60))}`);
  }
  if (!Array.isArray(data)) {
    throw new InputError(`expected a JSON array from gh pr list, got ${data === null ? "null" : typeof data}`);
  }
  data.forEach((item, i) => {
    const problem = checkPullRequest(item);
    if (problem) throw new InputError(`pull request at index ${i} ${problem}`);
  });
  return data as PullRequest[];
}

const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}(?::\d{2})?)?)?)?)?$/;

/**
 * Milliseconds since the epoch of an ISO 8601 year, month, date or date-time, or undefined.
 * A year or a month starts on its first day; anything without an offset is UTC.
 */
export function parseInstant(text: string): number | undefined {
  const m = DATE.exec(text);
  if (!m) return undefined;
  const [y, mo = 1, d = 1, h = 0, mi = 0, s = 0] = m.slice(1, 7).map((v) => (v === undefined ? undefined : Number(v)));
  const ms = Number((m[7] ?? "").padEnd(3, "0").slice(0, 3));
  // setUTCFullYear, unlike Date.UTC, does not read years 0 to 99 as 1900 to 1999.
  const day = new Date(0);
  day.setUTCFullYear(y!, mo - 1, d);
  // A day or month out of range rolls the date into another month.
  if (day.getUTCMonth() !== mo - 1) return undefined;
  if (h > 23 || mi > 59 || s > 59) return undefined;
  let offset = 0;
  const zone = m[8];
  if (zone !== undefined && zone !== "Z") {
    const [oh, om = 0] = zone.slice(1).split(":").map(Number);
    if (oh! > 23 || om! > 59) return undefined;
    offset = (zone[0] === "-" ? -1 : 1) * (oh! * 60 + om!) * 60_000;
  }
  return day.getTime() + ((h * 60 + mi) * 60 + s) * 1000 + ms - offset;
}

/** An ISO 8601 duration, each unit a whole number. A week is kept as 7 days. */
export type Duration = { years: number; months: number; days: number; hours: number; minutes: number; seconds: number };

const DURATION = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const WEEKS = /^P(\d+)W$/;

/**
 * The duration of an ISO 8601 text such as P7D, PT36H, P2W or P1Y2M3DT4H5M6S, or undefined.
 * Refused: no unit (P, PT), a sign, a fraction, a unit twice or out of order, a week with another unit.
 */
export function parseDuration(text: string): Duration | undefined {
  const weeks = WEEKS.exec(text);
  if (weeks) return { years: 0, months: 0, days: Number(weeks[1]) * 7, hours: 0, minutes: 0, seconds: 0 };
  const m = DURATION.exec(text);
  if (!m || text.endsWith("T") || m.slice(1).every((v) => v === undefined)) return undefined;
  const [years, months, days, hours, minutes, seconds] = m.slice(1, 7).map((v) => Number(v ?? 0)) as number[];
  return { years: years!, months: months!, days: days!, hours: hours!, minutes: minutes!, seconds: seconds! };
}

/**
 * The instant duration before now, both in milliseconds since the epoch, or undefined past the range of a date.
 * Years and months are calendar ones, counted first: P1M before 31 March is the last day of February.
 */
export function countBack(now: number, duration: Duration): number | undefined {
  const at = new Date(now);
  const month = at.getUTCFullYear() * 12 + at.getUTCMonth() - duration.years * 12 - duration.months;
  const year = Math.floor(month / 12);
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, (month % 12 + 12) % 12 + 1, 0);
  at.setUTCFullYear(year, (month % 12 + 12) % 12, Math.min(at.getUTCDate(), lastDay.getUTCDate()));
  const back = ((duration.days * 24 + duration.hours) * 60 + duration.minutes) * 60_000 + duration.seconds * 1000;
  const instant = at.getTime() - back;
  return Number.isFinite(instant) && Math.abs(instant) <= 8.64e15 ? instant : undefined;
}

/** n as a whole percentage of total, 0 when total is 0. */
export function wholePercent(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

export function countMerged(prs: PullRequest[]): number {
  return prs.filter((pr) => pr.state === "MERGED").length;
}

export function stateCounts(prs: PullRequest[]): { open: number; merged: number; closed: number; total: number } {
  const counts = { OPEN: 0, MERGED: 0, CLOSED: 0 };
  for (const pr of prs) counts[pr.state]++;
  return { open: counts.OPEN, merged: counts.MERGED, closed: counts.CLOSED, total: prs.length };
}

export function countByState(prs: PullRequest[]): string[] {
  const { open, merged, closed, total } = stateCounts(prs);
  const share = (n: number) => `${n} (${wholePercent(n, total)}%)`;
  return [`open ${share(open)}`, `merged ${share(merged)}`, `closed ${share(closed)}`, `total ${total}`];
}

export function countUnattended(prs: PullRequest[], owner: string): number {
  return prs.filter(
    (pr) => pr.state === "MERGED" && !pr.reviews.some((r) => r.author.login === owner),
  ).length;
}

export function countReviewed(prs: PullRequest[]): number {
  return prs.filter((pr) => pr.reviews.length > 0).length;
}

export function closedShare(prs: PullRequest[]): { closed: number; percent: number } {
  const closed = prs.filter((pr) => pr.state === "CLOSED").length;
  return { closed, percent: wholePercent(closed, prs.length) };
}

export function landedShare(prs: PullRequest[]): number {
  return wholePercent(countMerged(prs), prs.length);
}

export function reviewRounds(prs: PullRequest[], reviewer: string): { number: number; rounds: number }[] {
  return prs
    .map((pr) => ({ number: pr.number, rounds: pr.reviews.filter((r) => r.author.login === reviewer && r.state !== "APPROVED").length }))
    .sort((a, b) => a.number - b.number);
}

export function countByAuthor(prs: PullRequest[]): { login: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const pr of prs) counts.set(pr.author.login, (counts.get(pr.author.login) ?? 0) + 1);
  return [...counts]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count || (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));
}

/** countByAuthor as the JSON shape of `authors --json` and `summary`. */
export function authorCounts(prs: PullRequest[]): { name: string; count: number }[] {
  return countByAuthor(prs).map(({ login, count }) => ({ name: login, count }));
}

/** Pull requests merged at or after since and before until, both instants in milliseconds. */
export function mergedSince(prs: PullRequest[], since: number, until?: number): number {
  return prs.filter((pr) => {
    if (pr.mergedAt === null) return false;
    // parsePullRequests has checked that mergedAt parses.
    const at = parseInstant(pr.mergedAt)!;
    return at >= since && (until === undefined || at < until);
  }).length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function countByPrefix(prs: PullRequest[]): { prefix: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const pr of prs) {
    const i = pr.title.indexOf(":");
    const prefix = (i === -1 ? "" : pr.title.slice(0, i).trim()) || "other";
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return [...counts]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count || (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0));
}

/** countByPrefix as `{ name, count }`, the shape of `prefixes --json` and of summary's prefixes. */
export function prefixCounts(prs: PullRequest[]): { name: string; count: number }[] {
  return countByPrefix(prs).map(({ prefix, count }) => ({ name: prefix, count }));
}

/** Every metric in one object; each value is what its own command prints for the same input. */
export function summary(prs: PullRequest[], owner: string, reviewer: string) {
  const rounds = reviewRounds(prs, reviewer).map((r) => r.rounds);
  const unattended = countUnattended(prs, owner);
  return {
    count: prs.length,
    states: stateCounts(prs),
    landed: landedShare(prs),
    closed: closedShare(prs).percent,
    unattended: { count: unattended, percent: wholePercent(unattended, countMerged(prs)) },
    rounds: { median: median(rounds), max: rounds.reduce((a, b) => Math.max(a, b), 0) },
    authors: authorCounts(prs),
    prefixes: prefixCounts(prs),
  };
}
