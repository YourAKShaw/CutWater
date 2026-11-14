// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { CutwaterError } from "../src/lib/errors.ts";
import { assertAllowed, gh, isMutating, parseApiArgs } from "../src/lib/exec.ts";
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
