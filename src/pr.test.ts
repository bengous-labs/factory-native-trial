import { expect, test } from "bun:test";
import { parsePullRequests } from "./pr";

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

const pr = (number: number, logins: string[]) => ({
  number, title: "t", state: "MERGED", author: { login: "x" }, mergedAt: null,
  reviews: logins.map((login) => ({ author: { login }, state: "APPROVED", submittedAt: "2026-11-16T10:00:00Z" })),
});

async function rounds(prs: unknown[], reviewer = "bob") {
  const p = Bun.spawn(["bun", "src/cli.ts", "rounds", "--reviewer", reviewer], { stdin: new Blob([JSON.stringify(prs)]), stdout: "pipe" });
  return (await new Response(p.stdout).text()).trim();
}

test("rounds prints one line per PR sorted by number, then the median", async () => {
  expect(await rounds([pr(5, ["bob", "bob", "bob"]), pr(2, ["bob"]), pr(3, ["bob", "bob"])])).toBe("#2 1\n#3 2\n#5 3\nmedian 2");
});

test("rounds shows 0 for a PR with no review from the reviewer", async () => {
  expect(await rounds([pr(1, ["amy"]), pr(2, [])])).toBe("#1 0\n#2 0\nmedian 0");
});

test("rounds on empty input prints median 0", async () => {
  expect(await rounds([])).toBe("median 0");
});
