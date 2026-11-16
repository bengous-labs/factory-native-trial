import { expect, test } from "bun:test";
import { countUnattended, parsePullRequests } from "./pr";

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
