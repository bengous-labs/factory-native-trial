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
