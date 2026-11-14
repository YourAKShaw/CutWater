// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { defaultAnswers, type Answers } from "../src/lib/answers.ts";
import { applyPlan } from "../src/lib/apply.ts";
import { audit } from "../src/lib/audit.ts";
import { detect } from "../src/lib/detect.ts";
import { isMutating } from "../src/lib/exec.ts";
import { listLabels } from "../src/lib/labels.ts";
import { readManifest } from "../src/lib/manifest.ts";
import { computePlan } from "../src/lib/plan.ts";
import { preflight } from "../src/lib/preflight.ts";
import { desiredRuleset, ensureRuleset } from "../src/lib/ruleset.ts";
import { MANIFEST_PATH } from "../src/version.ts";
import { sandbox, writeFiles, type Sandbox } from "./helpers.ts";

const NOW = "2026-11-10T12:00:00Z";

async function answersFor(box: Sandbox, overrides: Partial<Answers> = {}): Promise<Answers> {
  const pre = await preflight(box.ctx, null);
  const { answers } = defaultAnswers({
    detection: detect(box.root),
    login: pre.login ?? "octocat",
    repo: pre.repo,
    remoteExists: pre.repoInfo !== null,
    isEmpty: pre.repoInfo?.isEmpty ?? true,
    defaultBranch: pre.repoInfo?.defaultBranch ?? null,
    year: "2026",
  });
  return { ...answers, description: "A demo project", ...overrides };
}

async function runAudit(box: Sandbox, acceptOrgDefaults = false) {
  const pre = await preflight(box.ctx, null);
  return audit(box.ctx, {
    root: box.root,
    repo: pre.repo,
    repoInfo: pre.repoInfo,
    offline: false,
    acceptOrgDefaults,
  });
}

async function plan(box: Sandbox, answers: Answers) {
  const manifest = readManifest(box.root).manifest;
  const labels = box.state.repos[answers.repo] ? await listLabels(box.ctx, answers.repo) : null;
  return computePlan({
    root: box.root,
    answers,
    manifest,
    currentLabels: labels,
    remoteExists: Boolean(box.state.repos[answers.repo]),
  });
}

function mutations(box: Sandbox, from: number): string[][] {
  return box.state.calls.slice(from).filter((args) => isMutating("gh", args));
}

test("preflight discovers login, repo and scopes", async () => {
  const box = sandbox();
  const result = await preflight(box.ctx, null);
  assert.equal(result.ok, true);
  assert.equal(result.login, "octocat");
  assert.equal(result.repo, "octocat/demo");
  assert.deepEqual(result.gh.scopes, ["gist", "read:org", "repo", "workflow"]);
  assert.deepEqual(result.missingScopes, []);
});

test("preflight stops cleanly when gh is logged out", async () => {
  const box = sandbox();
  box.state.authenticated = false;
  const result = await preflight(box.ctx, null);
  assert.equal(result.ok, false);
  assert.equal(result.problems[0]?.code, "AUTH");
  assert.match(result.problems[0]?.remediation ?? "", /gh auth login/);
});

test("an empty repository is not set up", async () => {
  const result = await runAudit(sandbox());
  assert.equal(result.classification, "not-set-up");
});

test("a local-only folder is not set up", async () => {
  const box = sandbox({ remote: null, files: { "README.md": "# x\n" } });
  const result = await runAudit(box);
  assert.equal(result.classification, "not-set-up");
  assert.equal(result.items.find((item) => item.id === "A1")?.status, "fail");
});

test("fresh repo reaches fully set up in one run, and the second run changes nothing", async () => {
  const box = sandbox({
    files: { "package.json": '{"name":"demo","scripts":{"test":"node --test"}}' },
  });
  const answers = await answersFor(box);
  const first = await plan(box, answers);
  assert.equal(first.summary.conflict, 0);
  assert.ok(first.summary.create >= 15);
  const applied = await applyPlan(box.ctx, first, { root: box.root, approved: null, now: NOW });
  assert.equal(applied.status, "applied", JSON.stringify(applied.failures));
  assert.equal(applied.manifest, "written");

  const after = await runAudit(box);
  assert.equal(
    after.classification,
    "fully-set-up",
    JSON.stringify(after.items.filter((i) => i.status !== "pass")),
  );

  const manifestBefore = readFileSync(join(box.root, MANIFEST_PATH), "utf8");
  const mark = box.state.calls.length;
  const second = await plan(box, answers);
  assert.equal(second.summary.noChanges, true, JSON.stringify(second.summary));
  const again = await applyPlan(box.ctx, second, {
    root: box.root,
    approved: null,
    now: "2027-01-01T00:00:00Z",
  });
  assert.equal(again.status, "no-changes");
  assert.equal(again.manifest, "unchanged");
  assert.deepEqual(mutations(box, mark), []);
  assert.equal(readFileSync(join(box.root, MANIFEST_PATH), "utf8"), manifestBefore);
});

test("a conflicting README triggers a diff prompt, never an overwrite", async () => {
  const box = sandbox({ files: { "README.md": "# My own README\n\nHand written.\n" } });
  const answers = await answersFor(box);
  const result = await plan(box, answers);
  const readme = result.entries.find((entry) => entry.id === "file:README.md");
  assert.equal(readme?.action, "conflict");
  assert.ok(readme?.kind === "file" && readme.diff.includes("-# My own README"));

  const blocked = await applyPlan(box.ctx, result, { root: box.root, approved: null, now: NOW });
  assert.equal(blocked.status, "needs-confirmation");
  assert.deepEqual(blocked.pendingConfirmation, ["file:README.md"]);
  assert.equal(
    readFileSync(join(box.root, "README.md"), "utf8"),
    "# My own README\n\nHand written.\n",
  );
  assert.equal(readManifest(box.root).exists, false);

  const declined = await applyPlan(box.ctx, result, {
    root: box.root,
    approved: new Set(),
    now: NOW,
  });
  assert.equal(declined.results.find((r) => r.id === "file:README.md")?.result, "declined");
  assert.equal(
    readFileSync(join(box.root, "README.md"), "utf8"),
    "# My own README\n\nHand written.\n",
  );
  assert.equal(readManifest(box.root).manifest?.applied.files["README.md"], undefined);
});

test("compare-and-set refuses a file edited after planning", async () => {
  const box = sandbox();
  const answers = await answersFor(box);
  const result = await plan(box, answers);
  writeFiles(box.root, { "SECURITY.md": "concurrent edit\n" });
  const applied = await applyPlan(box.ctx, result, {
    root: box.root,
    approved: new Set(),
    now: NOW,
  });
  assert.equal(applied.status, "failed");
  assert.equal(applied.manifest, "not-written");
  assert.equal(readFileSync(join(box.root, "SECURITY.md"), "utf8"), "concurrent edit\n");
});

test("untouched templates are offered as updates, edited ones as conflicts", async () => {
  const box = sandbox();
  const answers = await answersFor(box);
  await applyPlan(box.ctx, await plan(box, answers), { root: box.root, approved: null, now: NOW });
  writeFiles(box.root, { "CONTRIBUTING.md": "user edit\n" });
  const upgraded = await plan(box, { ...answers, maintainer: "hubot" });
  assert.equal(upgraded.entries.find((e) => e.id === "file:.github/CODEOWNERS")?.action, "update");
  assert.equal(upgraded.entries.find((e) => e.id === "file:CONTRIBUTING.md")?.action, "conflict");
});

test("a partial repo is offered only what is missing", async () => {
  const box = sandbox({
    files: {
      "docs/README.md": "# Docs readme\n",
      ".github/ISSUE_TEMPLATE/01-bug.yml": "name: Bug\n",
      ".github/ISSUE_TEMPLATE/config.yml": "blank_issues_enabled: true\n",
      ".github/workflows/test.yml": "name: Test\n",
    },
  });
  const result = await runAudit(box);
  assert.equal(result.classification, "partially-set-up");
  const planned = await plan(box, await answersFor(box));
  const action = (id: string) => planned.entries.find((entry) => entry.id === id)?.action;
  assert.equal(action("file:README.md"), "skip");
  assert.equal(action("file:.github/ISSUE_TEMPLATE/bug.yml"), "skip");
  assert.equal(action("file:.github/workflows/ci.yml"), "skip");
  assert.equal(action("file:SECURITY.md"), "create");
});

test("org-level defaults count only after the user confirms", async () => {
  const box = sandbox();
  box.state.orgDotGithub.octocat = ["SECURITY.md", ".github/CODE_OF_CONDUCT.md"];
  const pending = await runAudit(box);
  assert.deepEqual(pending.orgDefaultsPending, ["A6", "A7"]);
  assert.equal(pending.items.find((item) => item.id === "A7")?.status, "org-default");
  const accepted = await runAudit(box, true);
  assert.deepEqual(accepted.orgDefaultsPending, []);
  assert.ok(accepted.passed > pending.passed);
});

test("repo creation is gated and runs before files and labels", async () => {
  const box = sandbox({ remote: null });
  const answers = await answersFor(box, { repo: "octocat/fresh" });
  assert.equal(answers.createRepo, true);
  const result = await plan(box, answers);
  assert.equal(result.entries[0]?.id, "repo-create");
  const blocked = await applyPlan(box.ctx, result, { root: box.root, approved: null, now: NOW });
  assert.equal(blocked.status, "needs-confirmation");
  assert.equal(box.state.repos["octocat/fresh"], undefined);
  const applied = await applyPlan(box.ctx, result, {
    root: box.root,
    approved: new Set(["repo-create"]),
    now: NOW,
  });
  assert.equal(applied.status, "applied", JSON.stringify(applied.failures));
  const created = box.state.repos["octocat/fresh" as string];
  assert.ok(created);
  assert.ok(created.labels.length >= 18);
});

test("dry-run makes zero mutating calls and writes nothing", async () => {
  const box = sandbox();
  const answers = await answersFor(box);
  const result = await plan(box, answers);
  box.ctx.dryRun = true;
  const mark = box.state.calls.length;
  const applied = await applyPlan(box.ctx, result, {
    root: box.root,
    approved: new Set(),
    now: NOW,
  });
  assert.equal(applied.status, "dry-run");
  assert.deepEqual(mutations(box, mark), []);
  assert.ok(applied.plannedCommands.some((command) => command[1] === "label"));
  assert.equal(readManifest(box.root).exists, false);
});

test("ruleset ensure is gated, idempotent and updates instead of duplicating", async () => {
  const box = sandbox();
  box.ctx.repo = "octocat/demo";
  const pending = await ensureRuleset(box.ctx, "octocat/demo", false);
  assert.equal(pending.action, "needs-confirmation");
  assert.equal(box.state.repos["octocat/demo"]?.rulesets.length, 0);
  const created = await ensureRuleset(box.ctx, "octocat/demo", true);
  assert.equal(created.action, "created");
  const again = await ensureRuleset(box.ctx, "octocat/demo", true);
  assert.equal(again.action, "unchanged");
  const ruleset = box.state.repos["octocat/demo"]?.rulesets[0] as { enforcement: string };
  ruleset.enforcement = "evaluate";
  const updated = await ensureRuleset(box.ctx, "octocat/demo", true);
  assert.equal(updated.action, "updated");
  assert.equal(box.state.repos["octocat/demo"]?.rulesets.length, 1);
});

test("CodeRabbit is off by default: no file is planned and A17 does not apply", async () => {
  const box = sandbox({ files: { "package.json": '{"name":"demo"}' } });
  const answers = await answersFor(box);
  assert.equal(answers.coderabbit, "off");
  const result = await plan(box, answers);
  assert.equal(
    result.entries.some((entry) => entry.id === "file:.coderabbit.yaml"),
    false,
  );
  const a17 = (await runAudit(box)).items.find((item) => item.id === "A17");
  assert.equal(a17?.status, "n/a");
  assert.equal(a17?.required, false);
});

test("choosing CodeRabbit scaffolds a stack-aware .coderabbit.yaml once", async () => {
  const box = sandbox({
    files: { "package.json": '{"name":"demo"}', "tsconfig.json": "{}" },
  });
  const answers = await answersFor(box, { coderabbit: "assertive" });
  const first = await plan(box, answers);
  const entry = first.entries.find((item) => item.id === "file:.coderabbit.yaml");
  assert.ok(entry?.kind === "file");
  assert.equal(entry.action, "create");
  assert.match(entry.content, /^ {2}profile: assertive$/m);
  assert.match(entry.content, /path: "\*\*\/\*\.ts"/);
  assert.match(entry.content, /path: "\.github\/workflows\/\*\*"/);
  assert.doesNotMatch(entry.content, /\*\*\/\*\.py|\*\*\/\*\.go/);
  // GitHub expressions in the instructions survive rendering untouched.
  assert.match(entry.content, /\$\{\{ github\.event\.\* \}\}/);

  const applied = await applyPlan(box.ctx, first, { root: box.root, approved: null, now: NOW });
  assert.equal(applied.status, "applied", JSON.stringify(applied.failures));
  assert.equal(readManifest(box.root).manifest?.choices.coderabbit, "assertive");
  assert.equal((await runAudit(box)).items.find((item) => item.id === "A17")?.status, "pass");
  assert.equal((await plan(box, answers)).summary.noChanges, true);
});

test("an existing .coderabbit.yaml is a conflict, never an overwrite", async () => {
  const box = sandbox({ files: { ".coderabbit.yaml": "reviews:\n  profile: chill\n" } });
  const answers = await answersFor(box, { coderabbit: "assertive" });
  const entry = (await plan(box, answers)).entries.find(
    (item) => item.id === "file:.coderabbit.yaml",
  );
  assert.equal(entry?.action, "conflict");
  assert.equal(entry?.gated, true);
});

test("a .coderabbit.yml already satisfies the requirement", async () => {
  const box = sandbox({ files: { ".coderabbit.yml": "reviews:\n  profile: chill\n" } });
  const answers = await answersFor(box, { coderabbit: "chill" });
  const entry = (await plan(box, answers)).entries.find(
    (item) => item.id === "file:.coderabbit.yaml",
  );
  assert.equal(entry?.action, "skip");
});

test("the default-branch ruleset never requires a CodeRabbit check", () => {
  // CodeRabbit can skip or be rate-limited; requiring it would block merges.
  assert.doesNotMatch(JSON.stringify(desiredRuleset()), /coderabbit/i);
});

test("a .coderabbit.config.ts is respected: no YAML is written to override it", async () => {
  const box = sandbox({
    files: { ".coderabbit.config.ts": "export default {};\n" },
  });
  const answers = await answersFor(box, { coderabbit: "assertive" });
  const entry = (await plan(box, answers)).entries.find(
    (item) => item.id === "file:.coderabbit.yaml",
  );
  assert.equal(entry?.action, "skip");
  assert.match(entry?.reason ?? "", /\.coderabbit\.config\.ts/);
});

test("the plan points to the CodeRabbit checklist only when CodeRabbit is chosen", async () => {
  const box = sandbox({ files: { "package.json": '{"name":"demo"}' } });
  const note = (notes: string[]) => notes.some((n) => n.includes("references/coderabbit.md"));
  assert.equal(note((await plan(box, await answersFor(box))).notes), false);
  const chosen = await plan(box, await answersFor(box, { coderabbit: "assertive" }));
  assert.equal(note(chosen.notes), true);
});

test("apply lists the CodeRabbit next steps only when CodeRabbit is chosen", async () => {
  for (const coderabbit of ["off", "assertive"] as const) {
    const box = sandbox({ files: { "package.json": '{"name":"demo"}' } });
    const answers = await answersFor(box, { coderabbit });
    const applied = await applyPlan(box.ctx, await plan(box, answers), {
      root: box.root,
      approved: null,
      now: NOW,
    });
    assert.equal(applied.status, "applied", JSON.stringify(applied.failures));
    if (coderabbit === "off") {
      assert.deepEqual(applied.nextSteps, []);
    } else {
      assert.ok(applied.nextSteps.length > 0 && applied.nextSteps.length <= 8);
      assert.match(applied.nextSteps[0] ?? "", /references\/coderabbit\.md/);
    }
  }
});
