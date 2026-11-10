import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultAnswers, validateAnswers } from "../src/lib/answers.ts";
import { detect } from "../src/lib/detect.ts";
import { CutwaterError } from "../src/lib/errors.ts";
import { tempDir, writeFiles } from "./helpers.ts";

test("detects node-ts, node, python, go and generic stacks", () => {
  const cases: [Record<string, string>, string, string][] = [
    [
      { "package.json": '{"name":"@acme/web","description":"Web app"}', "tsconfig.json": "{}" },
      "node-ts",
      "web",
    ],
    [{ "package.json": '{"name":"tool","devDependencies":{"typescript":"5"}}' }, "node-ts", "tool"],
    [{ "package.json": '{"name":"plain"}' }, "node", "plain"],
    [{ "pyproject.toml": '[project]\nname = "pkg"\ndescription = "A package"\n' }, "python", "pkg"],
    [{ "go.mod": "module github.com/acme/svc\n\ngo 1.23\n" }, "go", "svc"],
    [{ "notes.txt": "x" }, "generic", ""],
  ];
  for (const [files, stack, name] of cases) {
    const root = tempDir();
    writeFiles(root, files);
    const detection = detect(root);
    assert.equal(detection.stack, stack);
    if (name !== "") assert.equal(detection.name, name);
  }
});

test("defaults follow the interview table", () => {
  const root = tempDir();
  writeFiles(root, { "package.json": '{"name":"demo","description":"Demo app"}' });
  const { answers, mustAsk } = defaultAnswers({
    detection: detect(root),
    login: "octocat",
    repo: null,
    remoteExists: false,
    isEmpty: true,
    defaultBranch: null,
    year: "2026",
  });
  assert.equal(answers.repo, "octocat/demo");
  assert.equal(answers.visibility, "private");
  assert.equal(answers.license, "MIT");
  assert.deepEqual(answers.ci, ["lint", "test", "build"]);
  assert.equal(answers.defaultBranch, "main");
  assert.equal(answers.commitMode, "direct");
  assert.equal(answers.createRepo, true);
  assert.equal(answers.description, "Demo app");
  assert.ok(mustAsk.includes("ruleset"));
  assert.deepEqual(validateAnswers(answers), answers);
});

test("validation lists every problem at once", () => {
  assert.throws(
    () => validateAnswers({ name: "", repo: "nope", ci: ["deploy"] }),
    (error: unknown) =>
      error instanceof CutwaterError &&
      Array.isArray((error.details as { problems: string[] }).problems) &&
      (error.details as { problems: string[] }).problems.length > 5,
  );
});
