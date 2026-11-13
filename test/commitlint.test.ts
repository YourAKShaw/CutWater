// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { lintCommit, stripGitmoji } from "../src/lib/commitlint.ts";

const rules = (message: string, issue?: number) =>
  lintCommit(message, { issue }).errors.map((error) => error.rule);

test("accepts plain, scoped, gitmoji and breaking headers", () => {
  for (const header of [
    "feat(auth): add token refresh (#42)",
    "fix: handle empty lists",
    "feat(ui): :sparkles: add dark mode toggle",
    "feat(ui): ✨ add dark mode toggle",
    "refactor(api)!: drop the v1 endpoints",
    "revert: undo the cache change",
  ]) {
    assert.deepEqual(rules(header), [], header);
  }
});

test("rejects an emoji before the type with a placement hint", () => {
  const result = lintCommit("✨ feat(ui): add toggle");
  assert.equal(result.errors[0]?.rule, "header-format");
  assert.match(result.errors[0]?.message ?? "", /after the colon/);
});

test("rejects unknown types, bad scopes, periods and empty subjects", () => {
  assert.deepEqual(rules("feature: add x"), ["type-enum"]);
  assert.deepEqual(rules("Feat: add x"), ["type-case"]);
  assert.deepEqual(rules("feat(Auth Module): add x"), ["scope-case"]);
  assert.deepEqual(rules("feat: add x."), ["subject-full-stop"]);
  assert.deepEqual(rules("feat: :sparkles: "), ["subject-empty"]);
  assert.deepEqual(rules(""), ["header-empty"]);
  assert.deepEqual(rules("Merge branch 'main'"), ["merge-commit"]);
});

test("enforces the blank line and the upper-case breaking token", () => {
  assert.deepEqual(rules("feat: add x\nbody right away"), ["body-leading-blank"]);
  assert.deepEqual(rules("feat: add x\n\nbreaking change: the flag is gone"), [
    "breaking-change-case",
  ]);
  assert.deepEqual(rules("feat: add x\n\nBreaking-Change: the flag is gone"), [
    "breaking-change-case",
  ]);
  const ok = lintCommit("feat: add x\n\nBREAKING CHANGE: the --old flag is gone");
  assert.equal(ok.valid, true);
  assert.equal(ok.breaking, true);
  assert.equal(lintCommit("feat!: add x").breaking, true);
});

test("requires an issue reference when asked", () => {
  assert.deepEqual(rules("feat(auth): add refresh (#42)", 42), []);
  assert.deepEqual(rules("feat(auth): add refresh\n\nWhy.\n\nRefs: #42", 42), []);
  assert.deepEqual(rules("feat(auth): add refresh (#420)", 42), ["issue-reference"]);
  assert.deepEqual(rules("feat(auth): add refresh", 42), ["issue-reference"]);
});

test("warns about long headers and capitalised subjects", () => {
  const long = lintCommit(`feat: add ${"x".repeat(70)}`);
  assert.equal(long.valid, true);
  assert.equal(long.warnings[0]?.rule, "header-length");
  assert.deepEqual(rules(`feat: ${"x".repeat(100)}`), ["header-max-length"]);
  assert.equal(lintCommit("feat: Add x").warnings[0]?.rule, "subject-case");
});

test("ignores git comment lines", () => {
  assert.equal(lintCommit("fix: handle nulls\n\n# Please enter the commit message").valid, true);
});

test("strips shortcode and unicode gitmoji", () => {
  assert.deepEqual(stripGitmoji(":bug: fix it"), { emoji: ":bug:", text: "fix it" });
  assert.deepEqual(stripGitmoji("♻️ tidy"), { emoji: "♻️", text: "tidy" });
  assert.deepEqual(stripGitmoji("plain"), { emoji: null, text: "plain" });
});

test("accepts a tracker Refs trailer and rejects a ticket before the type", () => {
  assert.deepEqual(
    rules("feat(install): back up hook config (#9)\n\nWhy.\n\nRefs: Req-004\nCloses #9", 9),
    [],
  );
  assert.deepEqual(rules("feat(api): add x\n\nRefs: Req-004, #9", 9), []);
  assert.deepEqual(rules("[Req-004] feat(install): back up hook config"), ["ticket-position"]);
});
