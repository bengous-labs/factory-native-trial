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

export function reviewRounds(prs: PullRequest[], reviewer: string): { number: number; rounds: number }[] {
  return prs
    .map((pr) => ({ number: pr.number, rounds: pr.reviews.filter((r) => r.author.login === reviewer).length }))
    .sort((a, b) => a.number - b.number);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function countUnattended(prs: PullRequest[], owner: string): number {
  return prs.filter(
    (pr) => pr.state === "MERGED" && !pr.reviews.some((r) => r.author.login === owner),
  ).length;
}
