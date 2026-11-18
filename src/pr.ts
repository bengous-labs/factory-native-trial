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
  if (json.trim() === "") throw new InputError(`no input on stdin: pipe in gh pr list --json ${PR_JSON_FIELDS}`);
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

const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

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
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return undefined;
  if (h > 23 || mi > 59 || s > 59) return undefined;
  let offset = 0;
  const zone = m[8];
  if (zone && zone !== "Z") {
    const [oh, om] = zone.slice(1).split(":").map(Number);
    if (oh! > 23 || om! > 59) return undefined;
    offset = (zone[0] === "-" ? -1 : 1) * (oh! * 60 + om!) * 60_000;
  }
  return day.getTime() + ((h * 60 + mi) * 60 + s) * 1000 + ms - offset;
}

/** n as a whole percentage of total, 0 when total is 0. */
export function percent(n: number, total: number): number {
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
  const share = (n: number) => `${n} (${percent(n, total)}%)`;
  return [`open ${share(open)}`, `merged ${share(merged)}`, `closed ${share(closed)}`, `total ${total}`];
}

export function countUnattended(prs: PullRequest[], owner: string): number {
  return prs.filter(
    (pr) => pr.state === "MERGED" && !pr.reviews.some((r) => r.author.login === owner),
  ).length;
}

export function closedShare(prs: PullRequest[]): { closed: number; percent: number } {
  const closed = prs.filter((pr) => pr.state === "CLOSED").length;
  return { closed, percent: percent(closed, prs.length) };
}

export function landedShare(prs: PullRequest[]): number {
  return percent(countMerged(prs), prs.length);
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

/** Pull requests merged at or after since and before until, both instants in milliseconds. */
export function mergedSince(prs: PullRequest[], since: number, until?: number): number {
  return prs.filter((pr) => {
    if (pr.mergedAt === null) return false;
    const at = parseInstant(pr.mergedAt);
    return at !== undefined && at >= since && (until === undefined || at < until);
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
