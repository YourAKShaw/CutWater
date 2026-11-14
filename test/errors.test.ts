// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CutwaterError,
  classifyGhFailure,
  exitCodeFor,
  remediationFor,
} from "../src/lib/errors.ts";

test("maps canned gh stderr to typed errors", () => {
  const cases: [string, string, boolean][] = [
    ["To get started with GitHub CLI, please run:  gh auth login", "AUTH", false],
    ["HTTP 401: Bad credentials (https://api.github.com/user)", "AUTH", false],
    ["HTTP 403: Resource not accessible by integration", "SCOPE", false],
    ["HTTP 403: API rate limit exceeded for user", "RATE_LIMIT", false],
    ["HTTP 403: You have exceeded a secondary rate limit", "RATE_LIMIT", true],
    ["HTTP 404: Not Found (https://api.github.com/repos/o/r/rulesets)", "NOT_FOUND", false],
    ["GraphQL: Could not resolve to a Repository with the name 'o/r'.", "NOT_FOUND", false],
    ["HTTP 422: Validation Failed (already_exists)", "CONFLICT", false],
    ["HTTP 422: Validation Failed", "VALIDATION", false],
    ["HTTP 502: Bad Gateway", "REMOTE", true],
    ["something odd happened", "REMOTE", false],
  ];
  for (const [stderr, code, transient] of cases) {
    const failure = classifyGhFailure(stderr);
    assert.equal(failure.code, code, stderr);
    assert.equal(failure.transient, transient, stderr);
  }
});

test("exit codes follow the documented contract", () => {
  assert.equal(exitCodeFor("NEEDS_CONFIRMATION"), 2);
  assert.equal(exitCodeFor("AUTH"), 3);
  assert.equal(exitCodeFor("SCOPE"), 3);
  assert.equal(exitCodeFor("CONFLICT"), 4);
  assert.equal(exitCodeFor("REMOTE"), 5);
  assert.equal(exitCodeFor("NOT_FOUND"), 5);
  assert.equal(exitCodeFor("USAGE"), 1);
});

test("errors carry a one-line remediation", () => {
  const error = new CutwaterError("AUTH", "not logged in");
  assert.match(error.remediation, /gh auth login/);
  assert.deepEqual(Object.keys(error.toJSON()), ["error", "message", "remediation"]);
});

test("Projects scope errors from the #6 spike get a tailored fix", async () => {
  const { readFileSync } = await import("node:fs");
  const sample = readFileSync(
    new URL("./fake-gh/samples/projects/err-missing-scope.txt", import.meta.url),
    "utf8",
  );
  const failure = classifyGhFailure(sample);
  assert.equal(failure.code, "SCOPE");
  assert.equal(exitCodeFor(failure.code), 3);
  assert.match(
    remediationFor(sample, failure) ?? "",
    /^Run `gh auth refresh -s project`\. It opens a browser/,
  );
  const org = "GraphQL: Resource not accessible by integration: organization projects";
  const project = ["project", "create", "--owner", "o"];
  assert.match(
    remediationFor(org, classifyGhFailure(org), project) ?? "",
    /organisation may disallow/,
  );
  const pat = "GraphQL: Resource not accessible by personal access token (createProjectV2)";
  assert.match(remediationFor(pat, classifyGhFailure(pat), project) ?? "", /fine-grained token/);
  // Other commands keep the generic permission fix.
  const labelPat = "HTTP 403: Resource not accessible by personal access token";
  assert.equal(remediationFor(labelPat, classifyGhFailure(labelPat), ["label", "create"]), null);
  assert.equal(remediationFor(org, classifyGhFailure(org), ["api", "repos/o/r/rulesets"]), null);
  assert.equal(
    remediationFor("HTTP 502: Bad Gateway", classifyGhFailure("HTTP 502: Bad Gateway")),
    null,
  );
  const missingProject =
    "GraphQL: Could not resolve to a ProjectV2 with the number 999. (user.projectV2)";
  assert.equal(classifyGhFailure(missingProject).code, "NOT_FOUND");
  assert.equal(new CutwaterError("SCOPE", "x", undefined, "custom").remediation, "custom");
});
