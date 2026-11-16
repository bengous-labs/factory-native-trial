import { expect, test } from "bun:test";
import { countByState, countUnattended, mergedSince, parsePullRequests } from "./pr";

test("merged since ignores open PRs and empty input", () => {
  expect(mergedSince([], "2026-11-16")).toBe(0);
  expect(
    mergedSince([{ number: 1, title: "t", state: "OPEN", author: { login: "x" }, mergedAt: null, reviews: [] }], "2026-11-16"),
  ).toBe(0);
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
  expect(countByState(prs)).toEqual(["open 1", "merged 3", "closed 1"]);
});

test("an empty input shows 0 for every state", () => {
  expect(countByState([])).toEqual(["open 0", "merged 0", "closed 0"]);
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

test("cli unattended prints one number", async () => {
  const input = JSON.stringify([pr(1, "MERGED", []), pr(2, "MERGED", ["bengous"]), pr(3, "OPEN", [])]);
  const r = await run(["unattended", "--owner", "bengous"], input);
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("1");
});

test("cli unattended without --owner exits 1 with usage", async () => {
  const r = await run(["unattended"], "[]");
  expect(r.code).toBe(1);
  expect(r.err).toContain("usage:");
});

const rpr = (number: number, logins: string[]) => ({
  number, title: "t", state: "MERGED", author: { login: "x" }, mergedAt: null,
  reviews: logins.map((login) => ({ author: { login }, state: "APPROVED", submittedAt: "2026-11-16T10:00:00Z" })),
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
