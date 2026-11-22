import { expect, test } from "bun:test";
import { closedShare, countByAuthor, countByPrefix, countByState, countMerged, countUnattended, landedShare, median, mergedSince, parseInstant, parsePullRequests, percent, stateCounts, type PullRequest } from "./pr";

/** The one fixture builder: a merged pull request unless told otherwise, with mergedAt set only when merged. */
const pr = (number: number, state: PullRequest["state"] = "MERGED", fields: Partial<PullRequest> = {}): PullRequest => ({
  number,
  title: `pr ${number}`,
  state,
  author: { login: "x" },
  mergedAt: state === "MERGED" ? "2026-11-16T10:00:00Z" : null,
  reviews: [],
  ...fields,
});

const review = (login: string, state = "APPROVED") => ({ author: { login }, state, submittedAt: "2026-11-16T09:00:00Z" });

const run = async (args: string[], input: string | unknown[]) => {
  const stdin = new Blob([typeof input === "string" ? input : JSON.stringify(input)]);
  const proc = Bun.spawn(["bun", "src/cli.ts", ...args], { stdin, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = [await new Response(proc.stdout).text(), await new Response(proc.stderr).text(), await proc.exited];
  return { out, err, code };
};

const USAGE = "usage: gh pr list --state all --limit 1000 --json";

// Shared helpers

test("percent rounds the percentage and is 0 for an empty total", () => {
  expect(percent(1, 3)).toBe(33);
  expect(percent(2, 3)).toBe(67);
  expect(percent(0, 0)).toBe(0);
});

test("countMerged counts only merged pull requests", () => {
  expect(countMerged([pr(1), pr(2, "OPEN"), pr(3, "CLOSED"), pr(4)])).toBe(2);
});

test("median of an even count is the mean of the middle pair", () => {
  expect(median([4, 1, 3, 2])).toBe(2.5);
});

// Input

test("parses the array gh pr list prints", () => {
  const prs = parsePullRequests(JSON.stringify([pr(1)]));
  expect(prs).toHaveLength(1);
  expect(prs[0]?.number).toBe(1);
});

const withField = (field: string, value: unknown) => [{ ...pr(1), [field]: value }];
const without = (field: string) => {
  const { [field as keyof PullRequest]: _, ...rest } = pr(1);
  return [rest];
};

const badInputs: [string, string | unknown[], string][] = [
  ["empty stdin", "", "no input on stdin: pipe in gh pr list --state all --limit 1000 --json number,title,state,author,mergedAt,reviews"],
  ["blank stdin", "  \n", "no input on stdin: pipe in gh pr list --state all --limit 1000 --json"],
  ["a gh error", "HTTP 401: Bad credentials", 'stdin is not JSON: "HTTP 401: Bad credentials"'],
  ["an object", "{}", "expected a JSON array from gh pr list, got object"],
  ["null", "null", "expected a JSON array from gh pr list, got null"],
  ["an item that is not an object", "[1]", "pull request at index 0 is not an object"],
  ["an item that is an array", "[[]]", "pull request at index 0 is not an object"],
  ["an item without number", without("number"), 'pull request at index 0 has no number in "number"'],
  ["an item without title", without("title"), 'pull request at index 0 has no string in "title"'],
  ["an item without state", without("state"), 'pull request at index 0 has no string in "state"'],
  ["an unknown state", withField("state", "DRAFT"), 'pull request at index 0 has unknown state "DRAFT"'],
  ["an item without author", without("author"), 'pull request at index 0 has no login in "author"'],
  ["an item without mergedAt", without("mergedAt"), 'pull request at index 0 has no ISO 8601 date-time or null in "mergedAt"'],
  ["a mergedAt that is no date", withField("mergedAt", "yesterday"), 'pull request at index 0 has no ISO 8601 date-time or null in "mergedAt"'],
  ["a mergedAt that is a number", withField("mergedAt", 2026), 'pull request at index 0 has no ISO 8601 date-time or null in "mergedAt"'],
  ["an item without reviews", without("reviews"), 'pull request at index 0 has no array in "reviews"'],
  ["a review without author", withField("reviews", [{ state: "APPROVED" }]), "pull request at index 0 has review 0 without an author login and a state"],
  ["a review without state", withField("reviews", [{ author: { login: "bob" } }]), "pull request at index 0 has review 0 without an author login and a state"],
  ["a review that is not an object", withField("reviews", [null]), "pull request at index 0 has review 0 without an author login and a state"],
  ["an author without login", withField("author", {}), 'pull request at index 0 has no login in "author"'],
  ["a review author without login", withField("reviews", [{ author: {}, state: "APPROVED" }]), "pull request at index 0 has review 0 without an author login and a state"],
  ["a gh error on several lines", "HTTP 401: Bad credentials\nTry gh auth login", 'stdin is not JSON: "HTTP 401: Bad credentials"'],
  ["a long line that is not JSON", `<html>${"x".repeat(80)}`, `stdin is not JSON: "<html>${"x".repeat(54)}"`],
];

for (const [name, input, message] of badInputs) {
  test(`cli rejects ${name} with one line on stderr, exit 1`, async () => {
    const r = await run(["count"], input);
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toStartWith(message);
    expect(r.err.trimEnd().split("\n")).toHaveLength(1);
  });
}

test("cli names the index of the bad item", async () => {
  const r = await run(["states"], [pr(1), pr(2, "OPEN"), { ...pr(3), state: "DRAFT" }]);
  expect(r.code).toBe(1);
  expect(r.err).toStartWith('pull request at index 2 has unknown state "DRAFT"');
});

// Dates

test("parseInstant reads ISO 8601 dates and date-times, UTC when no offset", () => {
  expect(parseInstant("2026-11-16")).toBe(Date.UTC(2026, 10, 16));
  expect(parseInstant("2026-11-16T10:30")).toBe(Date.UTC(2026, 10, 16, 10, 30));
  expect(parseInstant("2026-11-16T10:30:00Z")).toBe(Date.UTC(2026, 10, 16, 10, 30));
  expect(parseInstant("2026-11-16T10:30:00.250Z")).toBe(Date.UTC(2026, 10, 16, 10, 30, 0, 250));
  expect(parseInstant("2026-11-16T10:30:00+01:00")).toBe(Date.UTC(2026, 10, 16, 9, 30));
  expect(parseInstant("2026-11-16T10:30:00-05:30")).toBe(Date.UTC(2026, 10, 16, 16, 0));
  expect(parseInstant("2026-11")).toBe(Date.UTC(2026, 10, 1));
  expect(parseInstant("2026")).toBe(Date.UTC(2026, 0, 1));
  expect(parseInstant("2026-11-16T10")).toBe(Date.UTC(2026, 10, 16, 10));
  expect(parseInstant("2026-11-16T10+01:00")).toBe(Date.UTC(2026, 10, 16, 9));
  expect(parseInstant("2026-11-16T10:30-02")).toBe(Date.UTC(2026, 10, 16, 12, 30));
  expect(parseInstant("0001-01-01")).toBe(new Date("0001-01-01T00:00:00Z").getTime());
  expect(parseInstant("2026-11-16T10:30:00.5Z")).toBe(Date.UTC(2026, 10, 16, 10, 30, 0, 500));
  expect(parseInstant("2026-11-16T10:30:00.123456Z")).toBe(Date.UTC(2026, 10, 16, 10, 30, 0, 123));
});

test("parseInstant rejects what is not an ISO 8601 date", () => {
  for (const text of ["banana", "16/11/2026", "2026-11-16 10:30", "2026-02-30", "2026-13-01", "2026-11-16T24:00Z", "2026-11-16T10:60Z", "2026-11-16T10:30:60Z", "2026-11-16T10:30+25:00", "2026-11-16T10:30+01:60", "2026-1", "2026-11T10:30", "2026-11-16T1", "2026-11-16T10:30+1", "", "toString"]) {
    expect(parseInstant(text)).toBeUndefined();
  }
});

test("merged since counts PRs merged on or after the instant, strictly before until", () => {
  const at = (number: number, mergedAt: string) => pr(number, "MERGED", { mergedAt });
  const prs = [at(1, "2026-11-08T23:59:59Z"), at(2, "2026-11-09T00:00:00Z"), at(3, "2026-11-15T23:59:59Z"), at(4, "2026-11-16T00:00:00Z"), pr(5, "OPEN")];
  expect(mergedSince(prs, Date.UTC(2026, 10, 9), Date.UTC(2026, 10, 16))).toBe(2);
  expect(mergedSince(prs, Date.UTC(2026, 10, 9))).toBe(3);
  expect(mergedSince([], Date.UTC(2026, 10, 9))).toBe(0);
});

test("cli merged --since --until counts the bounded period", async () => {
  const input = [pr(1, "MERGED", { mergedAt: "2026-11-08T12:00:00Z" }), pr(2, "MERGED", { mergedAt: "2026-11-10T12:00:00Z" }), pr(3, "MERGED", { mergedAt: "2026-11-16T00:00:00Z" })];
  const r = await run(["merged", "--since", "2026-11-09", "--until", "2026-11-16"], input);
  expect(r.code).toBe(0);
  expect(r.out).toBe("1\n");
  expect((await run(["merged", "--since", "2026-11-09"], input)).out).toBe("2\n");
});

test("cli merged reads a month or a year as its first day", async () => {
  const input = [pr(1, "MERGED", { mergedAt: "2026-10-31T23:59:59Z" }), pr(2, "MERGED", { mergedAt: "2026-11-01T00:00:00Z" }), pr(3, "MERGED", { mergedAt: "2027-01-01T00:00:00Z" })];
  expect((await run(["merged", "--since", "2026-11"], input)).out).toBe("2\n");
  expect((await run(["merged", "--since", "2026", "--until", "2027"], input)).out).toBe("2\n");
  expect((await run(["merged", "--since", "0001-01-01"], input)).out).toBe("3\n");
  expect((await run(["merged", "--since", "2026-11-01T00"], input)).out).toBe("2\n");
});

test("cli merged compares dates as instants, not strings", async () => {
  const input = [pr(1, "MERGED", { mergedAt: "2026-11-16T10:00:00Z" })];
  const r = await run(["merged", "--since", "2026-11-16T10:30:00+01:00"], input);
  expect(r.code).toBe(0);
  expect(r.out).toBe("1\n");
});

for (const args of [["--since", "banana"], ["--since", "16/11/2026"], ["--since", "2026-11-09", "--until", "soon"]]) {
  test(`cli merged ${args.join(" ")} prints one line on stderr, exit 1`, async () => {
    const r = await run(["merged", ...args], [pr(1)]);
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe(`${args.at(-2)} ${args.at(-1)} is not an ISO 8601 date or date-time, such as 2026-11-16 or 2026-11-16T10:30:00Z\n`);
  });
}

// Flags

const flagErrors: [string[], string][] = [
  [["rounds"], "rounds needs --reviewer <login>"],
  [["rounds", "--reviewer"], "rounds: --reviewer needs a value"],
  [["unattended"], "unattended needs --owner <login>"],
  [["unattended", "--owner", "--json"], "unattended: --owner needs a value"],
  [["unattended", "--owner", ""], "unattended: --owner needs a value"],
  [["rounds", "--reviewer", ""], "rounds: --reviewer needs a value"],
  [["merged", "--since", ""], "merged: --since needs a value"],
  [["merged", "--until", "2026-11-16"], "merged needs --since <date>"],
  [["merged", "--since", "2026-11-09", "--until"], "merged: --until needs a value"],
  [["count", "--json"], "count: unknown flag --json"],
  [["states", "--merged"], "states: unknown flag --merged"],
  [["landed", "extra"], "landed: unknown argument extra"],
  [["rounds", "--reviewer", "bob", "--owner", "bob"], "rounds: unknown flag --owner"],
  [["nope"], "unknown command nope"],
  [["rounds", "--reviewer", "amy", "--reviewer", "bob"], "rounds: --reviewer given twice"],
  [["merged", "--since", "2026-11-01", "--since", "2026-11-20"], "merged: --since given twice"],
  [["states", "--json", "--json"], "states: --json given twice"],
  [["authors", "--json", "--json"], "authors: --json given twice"],
  [["prefixes", "--json", "--json"], "prefixes: --json given twice"],
  [["closed", "--json", "--json"], "closed: --json given twice"],
  [["landed", "--json", "--json"], "landed: --json given twice"],
  [["count", "constructor", "x"], "count: unknown argument constructor"],
  [["landed", "toString"], "landed: unknown argument toString"],
  [["summary", "--reviewer", "bob"], "summary needs --owner <login>"],
  [["summary", "--owner", "amy"], "summary needs --reviewer <login>"],
  [["summary", "--owner", "amy", "--reviewer"], "summary: --reviewer needs a value"],
  [["summary", "--owner", "amy", "--reviewer", "bob", "--owner", "cat"], "summary: --owner given twice"],
  [["summary", "--owner", "amy", "--reviewer", "bob", "--json"], "summary: unknown flag --json"],
];

for (const [args, message] of flagErrors) {
  test(`cli ${args.join(" ")} names the problem, then prints the usage, exit 1`, async () => {
    const r = await run(args, [pr(1)]);
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toStartWith(`${message}\n${USAGE}`);
  });
}

test("cli help and no command print the usage to stdout, exit 0", async () => {
  for (const args of [["help"], []]) {
    const r = await run(args, "");
    expect(r.code).toBe(0);
    expect(r.out).toStartWith(USAGE);
    expect(r.err).toBe("");
  }
});

test("the usage and README.md list every command and flag", async () => {
  const usage = (await run(["help"], "")).out;
  const readme = await Bun.file("README.md").text();
  for (const word of ["count", "--merged", "states", "--json", "rounds", "--reviewer", "unattended", "--owner", "merged", "--since", "--until", "closed", "prefixes", "authors", "landed", "summary", "--limit 1000"]) {
    expect(usage).toContain(word);
    expect(readme).toContain(word);
  }
});

// Commands

test("cli count prints the number of pull requests read", async () => {
  const r = await run(["count"], [pr(1), pr(2, "OPEN"), pr(3, "CLOSED")]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("3\n");
});

test("cli count --merged ignores open and closed-unmerged PRs", async () => {
  const r = await run(["count", "--merged"], [pr(1), pr(2, "CLOSED"), pr(3, "OPEN")]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("1\n");
});

test("states counts each state with its rounded share", () => {
  expect(countByState([pr(1, "OPEN"), pr(2), pr(3), pr(4, "CLOSED"), pr(5)])).toEqual(["open 1 (20%)", "merged 3 (60%)", "closed 1 (20%)", "total 5"]);
  expect(countByState([pr(1, "OPEN"), pr(2, "OPEN"), pr(3)])).toEqual(["open 2 (67%)", "merged 1 (33%)", "closed 0 (0%)", "total 3"]);
  expect(countByState([])).toEqual(["open 0 (0%)", "merged 0 (0%)", "closed 0 (0%)", "total 0"]);
});

test("cli states prints each state with its share, then the total", async () => {
  const r = await run(["states"], [pr(1, "OPEN"), pr(2), pr(3, "CLOSED"), pr(4)]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("open 1 (25%)\nmerged 2 (50%)\nclosed 1 (25%)\ntotal 4\n");
});

test("cli states --json prints one object with every state and the total", async () => {
  expect(stateCounts([pr(1, "OPEN"), pr(2), pr(3, "CLOSED")])).toEqual({ open: 1, merged: 1, closed: 1, total: 3 });
  const r = await run(["states", "--json"], "[]");
  expect(r.code).toBe(0);
  expect(r.out).toBe('{"open":0,"merged":0,"closed":0,"total":0}\n');
});

const reviewedBy = (number: number, logins: string[], state = "CHANGES_REQUESTED") => pr(number, "MERGED", { reviews: logins.map((l) => review(l, state)) });

test("cli rounds prints one line per PR sorted by number, then the median", async () => {
  const r = await run(["rounds", "--reviewer", "bob"], [reviewedBy(5, ["bob", "bob", "bob"]), reviewedBy(2, ["bob"]), reviewedBy(3, ["bob", "bob"])]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("#2 1\n#3 2\n#5 3\nmedian 2\n");
});

test("cli rounds shows 0 for a PR with no review from the reviewer", async () => {
  expect((await run(["rounds", "--reviewer", "bob"], [reviewedBy(1, ["amy"]), reviewedBy(2, [])])).out).toBe("#1 0\n#2 0\nmedian 0\n");
});

test("cli rounds on empty input prints median 0", async () => {
  expect((await run(["rounds", "--reviewer", "bob"], [])).out).toBe("median 0\n");
});

test("cli rounds does not count a clean (APPROVED) review", async () => {
  const p = pr(1, "MERGED", { reviews: [review("bob", "CHANGES_REQUESTED"), review("bob", "COMMENTED"), review("bob", "APPROVED")] });
  expect((await run(["rounds", "--reviewer", "bob"], [p])).out).toBe("#1 2\nmedian 2\n");
});

test("unattended counts merged PRs with no review from the owner, ignoring open and closed", () => {
  expect(countUnattended([reviewedBy(1, []), reviewedBy(2, ["bengous"]), reviewedBy(3, ["other"])], "bengous")).toBe(2);
  expect(countUnattended([pr(1, "OPEN"), pr(2, "CLOSED"), pr(3)], "bengous")).toBe(1);
});

test("cli unattended prints the count, then the share of merged PRs", async () => {
  const r = await run(["unattended", "--owner", "bengous"], [reviewedBy(1, []), reviewedBy(2, ["bengous"]), pr(3, "OPEN")]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("1\n50%\n");
});

test("cli unattended prints 0% when no PR is merged", async () => {
  const r = await run(["unattended", "--owner", "bengous"], [pr(1, "OPEN")]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("0\n0%\n");
});

test("closed share rounds the percentage, 0 on empty input", () => {
  expect(closedShare([])).toEqual({ closed: 0, percent: 0 });
  expect(closedShare([pr(1), pr(2, "OPEN")])).toEqual({ closed: 0, percent: 0 });
  expect(closedShare([pr(1, "CLOSED"), pr(2), pr(3, "OPEN")])).toEqual({ closed: 1, percent: 33 });
  expect(closedShare([pr(1, "CLOSED"), pr(2, "CLOSED"), pr(3, "OPEN")])).toEqual({ closed: 2, percent: 67 });
});

test("cli closed prints the count, then the share of all PRs", async () => {
  const r = await run(["closed"], [pr(1, "CLOSED"), pr(2, "CLOSED")]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("2\n100%\n");
});

test("cli closed --json prints the text output's values as one object", async () => {
  const input = [pr(1, "CLOSED"), pr(2), pr(3, "OPEN")];
  const [count, share] = (await run(["closed"], input)).out.trimEnd().split("\n");
  const r = await run(["closed", "--json"], input);
  expect(r.code).toBe(0);
  expect(r.out).toBe('{"count":1,"percent":33}\n');
  expect(JSON.parse(r.out)).toEqual({ count: Number(count), percent: parseInt(share!) });
  expect((await run(["closed", "--json"], "[]")).out).toBe('{"count":0,"percent":0}\n');
});

const titled = (number: number, title: string) => pr(number, "MERGED", { title });

test("prefixes counts a title without ':' under other", () => {
  expect(countByPrefix([titled(1, "no colon here"), titled(2, "fix: a"), titled(3, ": empty prefix")])).toEqual([
    { prefix: "other", count: 2 },
    { prefix: "fix", count: 1 },
  ]);
});

test("cli prefixes sorts by count descending, then by prefix", async () => {
  const titles = ["fix: a", "feat: b", "docs: c", "fix: d", "ci: e", "feat: f", "fix: g", "feat(cli): h"];
  const r = await run(["prefixes"], titles.map((t, i) => titled(i + 1, t)));
  expect(r.code).toBe(0);
  expect(r.out).toBe("fix 3\nfeat 2\nci 1\ndocs 1\nfeat(cli) 1\n");
});

test("cli prefixes --json prints the text output's values as one array, most first", async () => {
  const input = ["fix: a", "feat: b", "fix: c", "no colon"].map((t, i) => titled(i + 1, t));
  const text = (await run(["prefixes"], input)).out.trimEnd().split("\n");
  const r = await run(["prefixes", "--json"], input);
  expect(r.code).toBe(0);
  expect(r.out).toBe('[{"name":"fix","count":2},{"name":"feat","count":1},{"name":"other","count":1}]\n');
  expect(JSON.parse(r.out).map(({ name, count }: { name: string; count: number }) => `${name} ${count}`)).toEqual(text);
  expect((await run(["prefixes", "--json"], "[]")).out).toBe("[]\n");
});

test("the usage and README.md give prefixes, authors, closed and landed their --json flag", async () => {
  const usage = (await run(["help"], "")).out;
  const readme = await Bun.file("README.md").text();
  for (const entry of ["prefixes [--json]", "authors [--json]", "closed [--json]", "landed [--json]"]) {
    expect(usage).toContain(entry);
    expect(readme).toContain(entry);
  }
});

test("cli prefixes on empty input prints nothing", async () => {
  const r = await run(["prefixes"], "[]");
  expect(r.code).toBe(0);
  expect(r.out).toBe("");
});

const byAuthor = (number: number, login: string) => pr(number, "MERGED", { author: { login } });

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
  const r = await run(["authors"], [byAuthor(1, "amy"), byAuthor(2, "bob"), byAuthor(3, "bob")]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("bob 2\namy 1\n");
});

test("cli authors --json prints the text output's values as one array of { name, count }", async () => {
  const prs = [byAuthor(1, "amy"), byAuthor(2, "bob"), byAuthor(3, "bob")];
  const r = await run(["authors", "--json"], prs);
  expect(r.code).toBe(0);
  expect(r.out).toBe('[{"name":"bob","count":2},{"name":"amy","count":1}]\n');
  expect((await run(["authors", "--json"], "[]")).out).toBe("[]\n");
});

test("cli authors on an empty array prints nothing, exit 0", async () => {
  const r = await run(["authors"], "[]");
  expect(r.code).toBe(0);
  expect(r.out).toBe("");
  expect(r.err).toBe("");
});

test("landed is the rounded share of merged pull requests, open ones included", () => {
  expect(landedShare([])).toBe(0);
  expect(landedShare([pr(1), pr(2), pr(3, "CLOSED")])).toBe(67);
  expect(landedShare([pr(1, "OPEN"), pr(2)])).toBe(50);
});

test("cli landed prints the share of merged pull requests", async () => {
  const r = await run(["landed"], [pr(1), pr(2, "CLOSED")]);
  expect(r.code).toBe(0);
  expect(r.out).toBe("50%\n");
});

test("cli landed --json prints the text output's value as one object", async () => {
  const input = [pr(1), pr(2), pr(3, "CLOSED")];
  const [share] = (await run(["landed"], input)).out.trimEnd().split("\n");
  const r = await run(["landed", "--json"], input);
  expect(r.code).toBe(0);
  expect(r.out).toBe('{"percent":67}\n');
  expect(JSON.parse(r.out)).toEqual({ percent: parseInt(share!) });
  expect((await run(["landed", "--json"], "[]")).out).toBe('{"percent":0}\n');
});

test("cli summary prints one JSON object whose values equal what each command prints", async () => {
  const input = [
    pr(1, "MERGED", { title: "fix: a", author: { login: "amy" }, reviews: [review("bob", "CHANGES_REQUESTED"), review("bob", "CHANGES_REQUESTED"), review("own")] }),
    pr(2, "MERGED", { title: "feat: b", author: { login: "bob" }, reviews: [review("bob", "COMMENTED")] }),
    pr(3, "MERGED", { title: "fix: c", author: { login: "amy" } }),
    pr(4, "CLOSED", { title: "no prefix", author: { login: "cat" } }),
    pr(5, "OPEN", { title: "fix: d", author: { login: "bob" } }),
    pr(6, "OPEN", { title: "docs: e", author: { login: "amy" }, reviews: [review("bob", "CHANGES_REQUESTED"), review("bob", "COMMENTED"), review("bob", "COMMENTED"), review("bob", "COMMENTED")] }),
  ];
  const r = await run(["summary", "--owner", "own", "--reviewer", "bob"], input);
  expect(r.code).toBe(0);
  expect(r.out.trimEnd().split("\n")).toHaveLength(1);
  const s = JSON.parse(r.out);
  const out = async (...args: string[]) => (await run(args, input)).out.trimEnd().split("\n");
  const pairs = (lines: string[]) => lines.map((l) => ({ name: l.slice(0, l.lastIndexOf(" ")), count: Number(l.slice(l.lastIndexOf(" ") + 1)) }));
  const [unattended, unattendedShare] = await out("unattended", "--owner", "own");
  const rounds = await out("rounds", "--reviewer", "bob");
  expect(s).toEqual({
    count: Number((await out("count"))[0]),
    states: JSON.parse((await out("states", "--json"))[0]!),
    landed: parseInt((await out("landed"))[0]!),
    closed: parseInt((await out("closed"))[1]!),
    unattended: { count: Number(unattended), percent: parseInt(unattendedShare!) },
    rounds: { median: Number(rounds.at(-1)!.split(" ")[1]), max: Math.max(...rounds.slice(0, -1).map((l) => Number(l.split(" ")[1]))) },
    authors: pairs(await out("authors")),
    prefixes: pairs(await out("prefixes")),
  });
  expect(s).toEqual({
    count: 6,
    states: { open: 2, merged: 3, closed: 1, total: 6 },
    landed: 50,
    closed: 17,
    unattended: { count: 2, percent: 67 },
    rounds: { median: 0.5, max: 4 },
    authors: [{ name: "amy", count: 3 }, { name: "bob", count: 2 }, { name: "cat", count: 1 }],
    prefixes: [{ name: "fix", count: 3 }, { name: "docs", count: 1 }, { name: "feat", count: 1 }, { name: "other", count: 1 }],
  });
});

test("cli summary on empty input prints zeros and empty arrays", async () => {
  const r = await run(["summary", "--owner", "own", "--reviewer", "bob"], "[]");
  expect(r.code).toBe(0);
  expect(r.out).toBe('{"count":0,"states":{"open":0,"merged":0,"closed":0,"total":0},"landed":0,"closed":0,"unattended":{"count":0,"percent":0},"rounds":{"median":0,"max":0},"authors":[],"prefixes":[]}\n');
});
