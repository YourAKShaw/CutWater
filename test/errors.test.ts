// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { CutwaterError, classifyGhFailure, exitCodeFor } from "../src/lib/errors.ts";

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
