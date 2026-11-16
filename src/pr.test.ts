import { expect, test } from "bun:test";
import { countByState, parsePullRequests } from "./pr";

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

const pr = (number: number, state: "OPEN" | "CLOSED" | "MERGED") => ({
  number,
  title: "t",
  state,
  author: { login: "x" },
  mergedAt: null,
  reviews: [],
});

test("counts each state", () => {
  const prs = [pr(1, "OPEN"), pr(2, "MERGED"), pr(3, "MERGED"), pr(4, "CLOSED"), pr(5, "MERGED")];
  expect(countByState(prs)).toEqual(["open 1", "merged 3", "closed 1"]);
});

test("an empty input shows 0 for every state", () => {
  expect(countByState([])).toEqual(["open 0", "merged 0", "closed 0"]);
});
