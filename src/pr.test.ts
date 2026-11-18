import { expect, test } from "bun:test";
import { closedShare, countByAuthor, countByState, countUnattended, median, mergedSince, parsePullRequests } from "./pr";

test("median of an even count is the mean of the middle pair", () => {
  expect(median([4, 1, 3, 2])).toBe(2.5);
});

test("merged since ignores open PRs and empty input", () => {
  expect(mergedSince([], "2026-11-16")).toBe(0);
  expect(
    mergedSince([{ number: 1, title: "t", state: "OPEN", author: { login: "x" }, mergedAt: null, reviews: [] }], "2026-11-16"),
  ).toBe(0);
});

test("merged since counts PRs merged on or after the date", () => {
  const merged = (number: number, mergedAt: string) => ({ number, title: "t", state: "MERGED", author: { login: "x" }, mergedAt, reviews: [] });
  const prs = [merged(1, "2026-11-15T23:59:59Z"), merged(2, "2026-11-16T00:00:00Z"), merged(3, "2026-11-17T10:00:00Z")];
  expect(mergedSince(prs, "2026-11-16")).toBe(2);
});

test("parses the array gh pr list prints", () => {
  const prs = parsePullRequests(
    JSON.stringify([
      { number: 1, title: "a", state: "MERGED", author: { login: "x" }, mergedAt: "2026-11-16T10:00:00Z", reviews: [] },
    ]),
  );
  expect(prs).toHaveLength(1);
  expect(prs[0]?.number).toBe(1);
});

test("rejects anything but an array", () => {
  expect(() => parsePullRequests("{}")).toThrow("expected a JSON array");
});

const prOf = (number: number, state: "OPEN" | "CLOSED" | "MERGED") => ({
  number,
  title: "t",
  state,
  author: { login: "x" },
  mergedAt: null,
  reviews: [],
});

test("counts each state", () => {
  const prs = [prOf(1, "OPEN"), prOf(2, "MERGED"), prOf(3, "MERGED"), prOf(4, "CLOSED"), prOf(5, "MERGED")];
  expect(countByState(prs)).toEqual(["open 1", "merged 3", "closed 1", "total 5"]);
});

test("an empty input shows 0 for every state", () => {
  expect(countByState([])).toEqual(["open 0", "merged 0", "closed 0", "total 0"]);
});

const pr = (number: number, state: "OPEN" | "CLOSED" | "MERGED", reviewers: string[]) => ({
  number,
  title: `pr ${number}`,
  state,
  author: { login: "bot" },
  mergedAt: state === "MERGED" ? "2026-11-16T10:00:00Z" : null,
  reviews: reviewers.map((login) => ({ author: { login }, state: "APPROVED", submittedAt: "2026-11-16T09:00:00Z" })),
});

test("unattended counts merged PRs with no review from the owner", () => {
  const prs = [pr(1, "MERGED", []), pr(2, "MERGED", ["bengous"]), pr(3, "MERGED", ["other"])];
  expect(countUnattended(prs, "bengous")).toBe(2);
});

test("unattended ignores open and closed-unmerged PRs", () => {
  const prs = [pr(1, "OPEN", []), pr(2, "CLOSED", []), pr(3, "MERGED", [])];
  expect(countUnattended(prs, "bengous")).toBe(1);
});

const run = async (args: string[], input: string) => {
  const proc = Bun.spawn(["bun", "src/cli.ts", ...args], { stdin: new Blob([input]), stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = [await new Response(proc.stdout).text(), await new Response(proc.stderr).text(), await proc.exited];
  return { out, err, code };
};

test("cli unattended prints the count, then the share of merged PRs", async () => {
  const input = JSON.stringify([pr(1, "MERGED", []), pr(2, "MERGED", ["bengous"]), pr(3, "OPEN", [])]);
  const r = await run(["unattended", "--owner", "bengous"], input);
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("1\n50%");
});

test("cli unattended prints 0% when no PR is merged", async () => {
  const r = await run(["unattended", "--owner", "bengous"], JSON.stringify([pr(1, "OPEN", [])]));
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("0\n0%");
});

test("cli count --merged ignores open and closed-unmerged PRs", async () => {
  const r = await run(["count", "--merged"], JSON.stringify([pr(1, "MERGED", []), pr(2, "CLOSED", []), pr(3, "OPEN", [])]));
  expect(r.out.trim()).toBe("1");
});

test("cli unattended without --owner exits 1 with usage", async () => {
  const r = await run(["unattended"], "[]");
  expect(r.code).toBe(1);
  expect(r.err).toContain("usage:");
});

const rpr = (number: number, logins: string[]) => ({
  number, title: "t", state: "MERGED", author: { login: "x" }, mergedAt: null,
  reviews: logins.map((login) => ({ author: { login }, state: "CHANGES_REQUESTED", submittedAt: "2026-11-16T10:00:00Z" })),
});

async function rounds(prs: unknown[], reviewer = "bob") {
  const p = Bun.spawn(["bun", "src/cli.ts", "rounds", "--reviewer", reviewer], { stdin: new Blob([JSON.stringify(prs)]), stdout: "pipe" });
  return (await new Response(p.stdout).text()).trim();
}

test("rounds prints one line per PR sorted by number, then the median", async () => {
  expect(await rounds([rpr(5, ["bob", "bob", "bob"]), rpr(2, ["bob"]), rpr(3, ["bob", "bob"])])).toBe("#2 1\n#3 2\n#5 3\nmedian 2");
});

test("rounds shows 0 for a PR with no review from the reviewer", async () => {
  expect(await rounds([rpr(1, ["amy"]), rpr(2, [])])).toBe("#1 0\n#2 0\nmedian 0");
});

test("rounds on empty input prints median 0", async () => {
  expect(await rounds([])).toBe("median 0");
});

test("rounds does not count a clean (APPROVED) review", async () => {
  const review = (state: string) => ({ author: { login: "bob" }, state, submittedAt: "2026-11-16T10:00:00Z" });
  const p = { ...rpr(1, []), reviews: [review("CHANGES_REQUESTED"), review("COMMENTED"), review("APPROVED")] };
  expect(await rounds([p])).toBe("#1 2\nmedian 2");
});

test("closed share is 0 on empty input and when nothing is closed", () => {
  expect(closedShare([])).toEqual({ closed: 0, percent: 0 });
  expect(closedShare([pr(1, "MERGED", []), pr(2, "OPEN", [])])).toEqual({ closed: 0, percent: 0 });
});

test("cli closed prints the count, then the share of all PRs", async () => {
  const r = await run(["closed"], JSON.stringify([pr(1, "CLOSED", []), pr(2, "CLOSED", [])]));
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("2\n100%");
});

test("closed share rounds the percentage, not the ratio", () => {
  const one = [pr(1, "CLOSED", []), pr(2, "MERGED", []), pr(3, "OPEN", [])];
  const two = [pr(1, "CLOSED", []), pr(2, "CLOSED", []), pr(3, "OPEN", [])];
  expect(closedShare(one)).toEqual({ closed: 1, percent: 33 });
  expect(closedShare(two)).toEqual({ closed: 2, percent: 67 });
});

test("cli help and no command print the usage to stdout, exit 0", async () => {
  for (const args of [["help"], []]) {
    const r = await run(args, "");
    expect(r.code).toBe(0);
    expect(r.out).toStartWith("usage:");
    expect(r.err).toBe("");
  }
});

test("cli unknown command prints the usage to stderr, exit 1", async () => {
  const r = await run(["nope"], "");
  expect(r.code).toBe(1);
  expect(r.out).toBe("");
  expect(r.err).toStartWith("usage:");
});

const byAuthor = (number: number, login: string) => ({ ...prOf(number, "MERGED"), author: { login } });

test("authors sorts by count descending, then by login", () => {
  const prs = [byAuthor(1, "zed"), byAuthor(2, "amy"), byAuthor(3, "bob"), byAuthor(4, "bob"), byAuthor(5, "zed"), byAuthor(6, "cat")];
  expect(countByAuthor(prs)).toEqual([
    { login: "bob", count: 2 },
    { login: "zed", count: 2 },
    { login: "amy", count: 1 },
    { login: "cat", count: 1 },
  ]);
});

test("cli authors prints one <login> <count> line per author", async () => {
  const r = await run(["authors"], JSON.stringify([byAuthor(1, "amy"), byAuthor(2, "bob"), byAuthor(3, "bob")]));
  expect(r.code).toBe(0);
  expect(r.out).toBe("bob 2\namy 1\n");
});

test("cli authors on empty input prints nothing, exit 0", async () => {
  for (const input of ["[]", ""]) {
    const r = await run(["authors"], input);
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
    expect(r.err).toBe("");
  }
});

test("merged until counts PRs merged on or after since and strictly before until", () => {
  const merged = (number: number, mergedAt: string) => ({ number, title: "t", state: "MERGED" as const, author: { login: "x" }, mergedAt, reviews: [] });
  const prs = [
    merged(1, "2026-11-08T23:59:59Z"),
    merged(2, "2026-11-09T00:00:00Z"),
    merged(3, "2026-11-15T23:59:59Z"),
    merged(4, "2026-11-16T00:00:00Z"),
  ];
  expect(mergedSince(prs, "2026-11-09", "2026-11-16")).toBe(2);
  expect(mergedSince(prs, "2026-11-09")).toBe(3);
});

test("cli merged --since --until counts the bounded period", async () => {
  const merged = (number: number, mergedAt: string) => ({ number, title: "t", state: "MERGED", author: { login: "x" }, mergedAt, reviews: [] });
  const input = JSON.stringify([merged(1, "2026-11-08T12:00:00Z"), merged(2, "2026-11-10T12:00:00Z"), merged(3, "2026-11-16T00:00:00Z")]);
  const r = await run(["merged", "--since", "2026-11-09", "--until", "2026-11-16"], input);
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("1");
  const since = await run(["merged", "--since", "2026-11-09"], input);
  expect(since.out.trim()).toBe("2");
});

test("cli merged --until without --since exits 1 with usage", async () => {
  const r = await run(["merged", "--until", "2026-11-16"], "[]");
  expect(r.code).toBe(1);
  expect(r.err).toContain("usage:");
});
