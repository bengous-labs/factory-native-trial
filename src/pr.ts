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

export function parsePullRequests(json: string): PullRequest[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) {
    throw new Error(`expected a JSON array from gh pr list, got ${typeof data}`);
  }
  return data as PullRequest[];
}

export function stateCounts(prs: PullRequest[]): { open: number; merged: number; closed: number; total: number } {
  const counts = { OPEN: 0, MERGED: 0, CLOSED: 0 };
  for (const pr of prs) counts[pr.state]++;
  return { open: counts.OPEN, merged: counts.MERGED, closed: counts.CLOSED, total: prs.length };
}

export function countByState(prs: PullRequest[]): string[] {
  const { open, merged, closed, total } = stateCounts(prs);
  const share = (n: number) => `${n} (${total === 0 ? 0 : Math.round((n / total) * 100)}%)`;
  return [`open ${share(open)}`, `merged ${share(merged)}`, `closed ${share(closed)}`, `total ${total}`];
}

export function countUnattended(prs: PullRequest[], owner: string): number {
  return prs.filter(
    (pr) => pr.state === "MERGED" && !pr.reviews.some((r) => r.author.login === owner),
  ).length;
}

export function closedShare(prs: PullRequest[]): { closed: number; percent: number } {
  const closed = prs.filter((pr) => pr.state === "CLOSED").length;
  return { closed, percent: prs.length === 0 ? 0 : Math.round((closed / prs.length) * 100) };
}

export function landedShare(prs: PullRequest[]): number {
  const { merged, closed } = stateCounts(prs);
  return merged + closed === 0 ? 0 : Math.round((merged / (merged + closed)) * 100);
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

export function mergedSince(prs: PullRequest[], since: string, until?: string): number {
  return prs.filter(
    (pr) => pr.mergedAt !== null && pr.mergedAt >= since && (until === undefined || pr.mergedAt < until),
  ).length;
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
