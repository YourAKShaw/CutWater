// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { CutwaterError } from "../src/lib/errors.ts";
import { assertAllowed, gh, isMutating, parseApiArgs } from "../src/lib/exec.ts";
import { viewerLogin } from "../src/lib/preflight.ts";
import { fakeRunner, testContext } from "./helpers.ts";

const forbidden = (fn: () => void) =>
  assert.throws(
    fn,
    (error: unknown) => error instanceof CutwaterError && error.code === "FORBIDDEN",
  );

test("never allows merging, in any form", () => {
  forbidden(() => assertAllowed("gh", ["pr", "merge", "1", "--repo", "o/r"], "o/r"));
  forbidden(() =>
    assertAllowed("gh", ["api", "--method", "PUT", "repos/o/r/pulls/1/merge"], "o/r"),
  );
  forbidden(() => assertAllowed("gh", ["api", "repos/o/r/pulls/1/merge"], "o/r"));
});

test("never pushes and never runs other programs", () => {
  forbidden(() => assertAllowed("git", ["push", "--force"], null));
  forbidden(() => assertAllowed("git", ["commit", "-m", "x"], null));
  forbidden(() => assertAllowed("git", ["branch", "-D", "x"], null));
  forbidden(() => assertAllowed("git", ["config", "user.name", "x"], null));
  forbidden(() => assertAllowed("sh", ["-c", "echo"], null));
});

test("requires --repo pinning and refuses other repositories", () => {
  forbidden(() => assertAllowed("gh", ["label", "list"], "o/r"));
  forbidden(() => assertAllowed("gh", ["label", "list", "--repo", "evil/other"], "o/r"));
  assertAllowed("gh", ["label", "list", "--repo", "O/R"], "o/r");
  forbidden(() => assertAllowed("gh", ["api", "repos/evil/other/contents/x"], "o/r"));
  forbidden(() => assertAllowed("gh", ["repo", "view", "evil/other"], "o/r"));
});

// gh uses the last value of a repeated flag, so any repeat must be refused (#46).
test("refuses a repeated --repo in every spelling (security)", () => {
  const issue = ["label", "create", "x"];
  for (const extra of [
    ["--repo", "evil/other"],
    ["--repo=evil/other"],
    ["-R", "evil/other"],
    ["-Revil/other"],
    ["-R=evil/other"],
    ["--repo", "o/r"],
  ]) {
    forbidden(() => assertAllowed("gh", [...issue, "--repo", "o/r", ...extra], "o/r"));
  }
  forbidden(() => assertAllowed("gh", [...issue, "-R", "o/r", "--repo=evil/other"], "o/r"));
  // A flag value of `--` does not end gh's flags (verified on gh 2.100.0).
  forbidden(() =>
    assertAllowed(
      "gh",
      [...issue, "--repo", "o/r", "--description", "--", "--repo", "evil/other"],
      "o/r",
    ),
  );
  // gh reads `R` inside a short-flag cluster (`-vRx` = `-v -R x`, verified).
  forbidden(() => assertAllowed("gh", [...issue, "--repo", "o/r", "-fRevil/other"], "o/r"));
  forbidden(() => assertAllowed("gh", [...issue, "--repo", "o/r", "-fR", "evil/other"], "o/r"));
  forbidden(() => assertAllowed("gh", [...issue, "-fRevil/other"], "o/r"));
  // -d takes a value, so gh reads `Ro/r` as the description, not as -R (#47).
  forbidden(() => assertAllowed("gh", [...issue, "-dRo/r"], "o/r"));
  forbidden(() => assertAllowed("gh", [...issue, "-fRo/r"], "o/r"));
  assertAllowed("gh", [...issue, "-R", "o/r"], "o/r");
  assertAllowed("gh", [...issue, "--repo=o/r"], "o/r");
  assertAllowed("gh", [...issue, "-Ro/r"], "o/r");
});

test("allows only the org .github repository as a cross-repo read", () => {
  assertAllowed("gh", ["api", "repos/o/.github/contents/SECURITY.md"], "o/r");
  forbidden(() =>
    assertAllowed("gh", ["api", "-X", "POST", "repos/o/.github/labels", "-f", "a=b"], "o/r"),
  );
});

test("limits API writes to labels, rulesets, reactions and reporting", () => {
  assertAllowed(
    "gh",
    ["api", "-X", "POST", "repos/o/r/issues/4/reactions", "-f", "content=eyes"],
    "o/r",
  );
  assertAllowed("gh", ["api", "--method", "PUT", "repos/o/r/rulesets/9", "--input", "-"], "o/r");
  forbidden(() => assertAllowed("gh", ["api", "-X", "PATCH", "repos/o/r"], "o/r"));
  forbidden(() =>
    assertAllowed("gh", ["api", "-X", "DELETE", "repos/o/r/git/refs/heads/x"], "o/r"),
  );
});

test("treats field-carrying gh api calls as POST", () => {
  assert.deepEqual(parseApiArgs(["api", "repos/o/r/labels", "-f", "name=x"]), {
    method: "POST",
    path: "repos/o/r/labels",
  });
  assert.equal(isMutating("gh", ["api", "repos/o/r/labels"]), false);
  assert.equal(isMutating("gh", ["label", "create", "x", "--repo", "o/r"]), true);
});

test("dry-run skips mutating calls but still runs reads", async () => {
  const { runner, calls } = fakeRunner(() => ({ stdout: "[]" }));
  const ctx = testContext({ runner, dryRun: true, repo: "o/r" });
  await gh(ctx, ["label", "create", "x", "--repo", "o/r", "--force"]);
  await gh(ctx, ["label", "list", "--repo", "o/r"]);
  assert.equal(calls.length, 1);
  assert.equal(ctx.planned.length, 1);
  assert.deepEqual(ctx.planned[0]?.args.slice(0, 2), ["label", "create"]);
});

test("retries transient failures, then gives up with a typed error", async () => {
  let attempts = 0;
  const { runner } = fakeRunner(() => {
    attempts++;
    return { code: 1, stderr: "HTTP 502: Bad Gateway" };
  });
  const ctx = testContext({ runner, repo: "o/r" });
  await assert.rejects(gh(ctx, ["label", "list", "--repo", "o/r"]), (error: unknown) => {
    return error instanceof CutwaterError && error.code === "REMOTE";
  });
  assert.equal(attempts, 4);
});

test("does not retry permanent failures", async () => {
  let attempts = 0;
  const { runner } = fakeRunner(() => {
    attempts++;
    return { code: 1, stderr: "HTTP 404: Not Found" };
  });
  const ctx = testContext({ runner, repo: "o/r" });
  await assert.rejects(gh(ctx, ["label", "list", "--repo", "o/r"]));
  assert.equal(attempts, 1);
});

// gh project takes --owner, not --repo, so it has its own pin (#8). This is the
// boundary that stops an injected agent from editing someone else's board.
test("pins gh project reads and writes to the repository owner (security)", () => {
  assertAllowed("gh", ["project", "list", "--owner", "O", "--format", "json"], "o/r");
  for (const verb of ["view", "field-list", "item-list"]) {
    assertAllowed("gh", ["project", verb, "1", "--owner", "O", "--format", "json"], "o/r");
  }
  assertAllowed("gh", ["project", "create", "--owner=o", "--title", "Board"], "o/r");
  assertAllowed("gh", ["project", "field-create", "1", "--owner=o", "--name", "P"], "o/r");
  forbidden(() => assertAllowed("gh", ["project", "view", "1"], "o/r"));
  forbidden(() => assertAllowed("gh", ["project", "view", "1", "--owner", "evil"], "o/r"));
  forbidden(() =>
    assertAllowed("gh", ["project", "item-add", "1", "--owner", "o", "--owner", "evil"], "o/r"),
  );
  forbidden(() => assertAllowed("gh", ["project", "list", "--owner", "o"], null));
  forbidden(() => assertAllowed("gh", ["project", "item-create", "1", "--owner", "o"], "o/r"));
  assert.throws(
    () => assertAllowed("gh", ["project", "view", "1", "--owner", "evil"], "o/r"),
    /refusing to touch projects of evil: this run is pinned to o\/r/,
  );
});

test("accepts --owner @me only when the viewer is the pinned owner (security)", () => {
  const me = ["project", "list", "--owner", "@me"];
  assertAllowed("gh", me, "o/r", { viewer: "O" });
  forbidden(() => assertAllowed("gh", me, "o/r", { viewer: "someone-else" }));
  forbidden(() => assertAllowed("gh", me, "o/r"));
});

test("project link must name the pinned repository (security)", () => {
  const link = ["project", "link", "1", "--owner", "o"];
  assertAllowed("gh", [...link, "--repo", "o/r"], "o/r");
  assertAllowed("gh", [...link, "-R", "O/R"], "o/r");
  forbidden(() => assertAllowed("gh", link, "o/r"));
  forbidden(() => assertAllowed("gh", [...link, "--repo", "o/other"], "o/r"));
  forbidden(() => assertAllowed("gh", [...link, "--repo", "o/r", "-R", "o/other"], "o/r"));
});

test("item-add accepts only issues and PRs of the pinned repository (security)", () => {
  const add = ["project", "item-add", "1", "--owner", "o", "--url"];
  assertAllowed("gh", [...add, "https://github.com/o/r/issues/7"], "o/r");
  assertAllowed("gh", [...add, "https://github.com/O/R/pull/8"], "o/r");
  forbidden(() => assertAllowed("gh", [...add, "https://github.com/evil/x/issues/1"], "o/r"));
  forbidden(() => assertAllowed("gh", [...add, "https://github.com/o/r/issues/7/extra"], "o/r"));
  forbidden(() => assertAllowed("gh", [...add, "https://evil.example/o/r/issues/7"], "o/r"));
  forbidden(() => assertAllowed("gh", ["project", "item-add", "1", "--owner", "o"], "o/r"));
  forbidden(() =>
    assertAllowed(
      "gh",
      [...add, "https://github.com/o/r/issues/7", "--url", "https://github.com/evil/x/issues/1"],
      "o/r",
    ),
  );
});

test("item-edit is allowed only for project ids verified as the owner's (security)", () => {
  const edit = ["project", "item-edit", "--id", "PVTI_1", "--field-id", "F", "--project-id"];
  const projectIds = new Set(["PVT_ok"]);
  assertAllowed("gh", [...edit, "PVT_ok"], "o/r", { projectIds });
  forbidden(() => assertAllowed("gh", [...edit, "PVT_other"], "o/r", { projectIds }));
  forbidden(() => assertAllowed("gh", [...edit, "PVT_ok"], "o/r"));
  forbidden(() =>
    assertAllowed("gh", [...edit, "PVT_ok", "--project-id", "PVT_other"], "o/r", { projectIds }),
  );
  forbidden(() =>
    assertAllowed("gh", ["project", "item-edit", "--id", "PVTI_1"], "o/r", { projectIds }),
  );
});

test("never runs destructive gh project verbs, even for the pinned owner", () => {
  for (const verb of [
    "delete",
    "close",
    "unlink",
    "field-delete",
    "item-delete",
    "item-archive",
    "copy",
    "mark-template",
  ]) {
    assert.throws(
      () => assertAllowed("gh", ["project", verb, "1", "--owner", "o"], "o/r"),
      new RegExp(`gh project ${verb} is never run by cutwater`),
    );
  }
});

test("classifies gh project writes as mutating, so dry-run skips them", async () => {
  assert.equal(isMutating("gh", ["project", "item-add", "1", "--owner", "o"]), true);
  assert.equal(isMutating("gh", ["project", "item-edit", "--id", "x"]), true);
  assert.equal(isMutating("gh", ["project", "view", "1", "--owner", "o"]), false);
  const { runner, calls } = fakeRunner(() => ({ stdout: "{}" }));
  const ctx = testContext({ runner, repo: "o/r", dryRun: true });
  await gh(ctx, ["project", "create", "--owner", "o", "--title", "T"]);
  await gh(ctx, ["project", "view", "1", "--owner", "o"]);
  assert.deepEqual(
    calls.map((c) => c.args[1]),
    ["view"],
  );
  assert.equal(ctx.planned.length, 1);
});

test("remembers the viewer login so @me can be checked without another call", async () => {
  const { runner, calls } = fakeRunner(() => ({ stdout: '{"login":"O"}' }));
  const ctx = testContext({ runner, repo: "o/r" });
  assert.equal(await viewerLogin(ctx), "O");
  assert.equal(ctx.viewer, "O");
  assertAllowed("gh", ["project", "list", "--owner", "@me"], ctx.repo, { viewer: ctx.viewer });
  assert.equal(calls.length, 1);
});

test("passes the pinned repository to gh as GH_REPO (security)", async () => {
  const seen: (Record<string, string> | undefined)[] = [];
  const ctx = testContext({
    repo: "o/r",
    runner: async (_cmd, _args, opts) => {
      seen.push(opts.env);
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  await gh(ctx, ["label", "list", "--repo", "o/r"]);
  assert.deepEqual(seen, [{ GH_REPO: "o/r" }]);
});

// gh must read the same arguments as the pin check, or --owner can hide (#48).
test("parses gh project arguments strictly, so --owner cannot hide (security)", () => {
  const pinned = { viewer: "O" };
  // After `--`, gh treats --owner as a positional and falls back to @me.
  forbidden(() => assertAllowed("gh", ["project", "list", "--", "--owner", "o"], "o/r", pinned));
  // gh takes the token after a value flag as its value: title "--owner", owner empty.
  forbidden(() =>
    assertAllowed("gh", ["project", "create", "--title", "--owner", "o"], "o/r", pinned),
  );
  forbidden(() => assertAllowed("gh", ["project", "view", "1", "--owner", "o", "--web"], "o/r"));
  forbidden(() => assertAllowed("gh", ["project", "view", "1", "--owner", "o", "-L30"], "o/r"));
  forbidden(() => assertAllowed("gh", ["project", "view", "1", "2", "--owner", "o"], "o/r"));
  forbidden(() => assertAllowed("gh", ["project", "list", "1", "--owner", "o"], "o/r"));
  forbidden(() => assertAllowed("gh", ["project", "list", "--owner", "o", "--closed=x"], "o/r"));
  assertAllowed("gh", ["project", "list", "--owner", "o", "--closed", "-L", "5"], "o/r");
});

test("item-edit refuses by-name and draft edits, which bypass the project id (security)", () => {
  const base = ["project", "item-edit", "--id", "PVTI_1", "--project-id", "PVT_ok"];
  const projectIds = new Set(["PVT_ok"]);
  assertAllowed("gh", [...base, "--field-id", "F", "--text", "x"], "o/r", { projectIds });
  assertAllowed("gh", [...base, "--field-id", "F", "--clear"], "o/r", { projectIds });
  for (const extra of [
    ["--title", "x"],
    ["--body=x"],
    ["--owner", "o"],
    ["--url", "https://github.com/o/r/issues/1"],
    ["--field", "Status", "--value", "Done"],
    ["1"],
  ]) {
    forbidden(() => assertAllowed("gh", [...base, ...extra], "o/r", { projectIds }));
  }
  forbidden(() =>
    assertAllowed("gh", ["project", "item-edit", "--project-id", "PVT_ok"], "o/r", { projectIds }),
  );
});
