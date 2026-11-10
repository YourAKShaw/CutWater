import assert from "node:assert/strict";
import { test } from "node:test";
import { branchName, slugWords } from "../src/lib/branch.ts";
import { CutwaterError } from "../src/lib/errors.ts";

test("builds <login>/<type>/<issue>-<kebab>", () => {
  assert.equal(
    branchName({ login: "octocat", type: "feat", issue: 42, title: "Add token refresh" }),
    "octocat/feat/42-add-token-refresh",
  );
  assert.equal(
    branchName({ login: "octocat", type: "chore", issue: 0, title: "Repo setup" }),
    "octocat/chore/0-repo-setup",
  );
});

test("keeps at most five meaningful words and drops the title prefix", () => {
  assert.deepEqual(slugWords("✨ feat: Add the empty state to the list view for new users"), [
    "add",
    "empty",
    "state",
    "list",
    "view",
  ]);
});

test("transliterates unicode and strips punctuation", () => {
  assert.equal(
    branchName({ login: "ana", type: "fix", issue: 7, title: "Crème brûlée: naïve café — 100%!" }),
    "ana/fix/7-creme-brulee-naive-cafe-100",
  );
  assert.equal(
    branchName({ login: "ana", type: "fix", issue: 8, title: "修复 login 错误" }),
    "ana/fix/8-login",
  );
});

test("never exceeds 60 characters", () => {
  const name = branchName({
    login: "a-very-long-github-login-name",
    type: "refactor",
    issue: 123456,
    title: "Extraordinarily lengthy description words keep going",
  });
  assert.ok(name.length <= 60, name);
  assert.match(name, /^[\x21-\x7e]+$/);
  assert.ok(!name.endsWith("-"));
});

test("rejects bad types, logins and titles", () => {
  assert.throws(
    () => branchName({ login: "a", type: "feature", issue: 1, title: "x" }),
    CutwaterError,
  );
  assert.throws(
    () => branchName({ login: "bad login", type: "feat", issue: 1, title: "x" }),
    CutwaterError,
  );
  assert.throws(
    () => branchName({ login: "a", type: "feat", issue: 1, title: "!!!" }),
    CutwaterError,
  );
  assert.throws(
    () => branchName({ login: "a", type: "feat", issue: -1, title: "x" }),
    CutwaterError,
  );
});
