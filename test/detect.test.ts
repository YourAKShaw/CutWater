// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

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

function projectDefaults(extra: Partial<Parameters<typeof defaultAnswers>[0]> = {}) {
  const root = tempDir();
  writeFiles(root, { "package.json": '{"name":"demo","description":"Demo app"}' });
  return defaultAnswers({
    detection: detect(root),
    login: "octocat",
    repo: "octocat/demo",
    remoteExists: true,
    isEmpty: false,
    defaultBranch: "main",
    year: "2026",
    ...extra,
  });
}

function problemsOf(input: unknown): string[] {
  try {
    validateAnswers(input);
    return [];
  } catch (error) {
    return (error as CutwaterError & { details: { problems: string[] } }).details.problems;
  }
}

test("Projects default off with a create proposal and no new must-ask", () => {
  const { answers, mustAsk } = projectDefaults();
  assert.deepEqual(answers.project, {
    enabled: false,
    mode: "create",
    title: "demo Development",
    owner: "octocat",
    fields: ["status", "priority"],
    seed: false,
  });
  assert.deepEqual(mustAsk, ["description", "ruleset"]);
  assert.deepEqual(validateAnswers(answers), answers);
});

test("a Project already linked to the repository is proposed for adoption", () => {
  const { answers, notes } = projectDefaults({
    linkedProjects: [{ number: 3, title: "Demo board" }],
  });
  assert.equal(answers.project?.mode, "adopt");
  assert.equal(answers.project?.number, 3);
  assert.equal(answers.project?.title, "Demo board");
  assert.ok(notes.some((note) => note.includes("#3")));
  const locked = projectDefaults({ projectScopeMissing: true });
  assert.ok(locked.notes.some((note) => note.includes("🔒 needs `gh auth refresh -s project`")));
});

test("Projects answers report every problem at once", () => {
  const { answers } = projectDefaults();
  const problems = problemsOf({
    ...answers,
    project: {
      enabled: true,
      mode: "adopt",
      title: "x".repeat(101),
      owner: "someone-else",
      fields: ["status", "sprint"],
      seed: false,
      colour: "red",
    },
  });
  for (const expected of [
    /number is required when project\.mode is adopt/,
    /title must be at most 100/,
    /unknown field "sprint"/,
    /differs from the repository owner octocat/,
    /project\.colour is not a known field/,
  ])
    assert.ok(
      problems.some((problem) => expected.test(problem)),
      `${expected}: ${problems.join("; ")}`,
    );
  // The owner check applies only when Projects are on.
  assert.deepEqual(
    problemsOf({ ...answers, project: { ...answers.project, owner: "someone-else" } }),
    [],
  );
});

test("a v0.1 projectsBoard title maps to a create choice", () => {
  const { answers } = projectDefaults();
  const legacy: Record<string, unknown> = { ...answers, projectsBoard: "Old board" };
  delete legacy.project;
  const read = validateAnswers(legacy);
  assert.deepEqual(read.project, {
    enabled: true,
    mode: "create",
    title: "Old board",
    owner: "octocat",
    fields: ["status", "priority"],
    seed: false,
  });
  const none: Record<string, unknown> = { ...answers };
  delete none.project;
  delete none.projectsBoard;
  assert.equal(validateAnswers(none).project, undefined);
});
