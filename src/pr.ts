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

export function countByState(prs: PullRequest[]): string[] {
  const counts = { OPEN: 0, MERGED: 0, CLOSED: 0 };
  for (const pr of prs) counts[pr.state]++;
  return [`open ${counts.OPEN}`, `merged ${counts.MERGED}`, `closed ${counts.CLOSED}`];
}
