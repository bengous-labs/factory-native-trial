import { expect, test } from "bun:test";

test("main's push run fails, so trunk-red opens its issue", () => {
  expect(process.env["GITHUB_EVENT_NAME"]).not.toBe("push");
});
