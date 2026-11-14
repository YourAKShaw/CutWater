// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { defaultAnswers } from "../src/lib/answers.ts";
import { detect } from "../src/lib/detect.ts";
import {
  buildManifest,
  migrateProjectChoice,
  readManifest,
  serializeManifest,
  validateManifest,
  type Manifest,
  type ManifestProject,
} from "../src/lib/manifest.ts";
import { MANIFEST_PATH } from "../src/version.ts";
import { tempDir, writeFiles } from "./helpers.ts";

const answers = defaultAnswers({
  detection: detect(tempDir()),
  login: "octocat",
  repo: "octocat/demo",
  remoteExists: true,
  isEmpty: false,
  defaultBranch: "main",
  year: "2026",
}).answers;

const hash = "a".repeat(64);

test("builds a valid manifest and keeps timestamps when nothing changed", () => {
  const first = buildManifest({
    previous: null,
    answers,
    skillVersion: "0.1.0",
    files: { "SECURITY.md": { template: "community/SECURITY.md", sha256: hash } },
    labels: ["type: feat"],
    now: "2026-11-10T00:00:00Z",
  });
  assert.equal(first.changed, true);
  assert.deepEqual(validateManifest(first.manifest), []);

  const again = buildManifest({
    previous: first.manifest,
    answers,
    skillVersion: "0.1.0",
    files: { "SECURITY.md": { template: "community/SECURITY.md", sha256: hash } },
    labels: ["type: feat"],
    now: "2026-12-01T00:00:00Z",
  });
  assert.equal(again.changed, false);
  assert.equal(again.manifest.updatedAt, "2026-11-10T00:00:00Z");

  const changed = buildManifest({
    ...{ previous: first.manifest, answers, skillVersion: "0.1.0", files: {}, labels: [] },
    now: "2026-12-01T00:00:00Z",
  });
  assert.equal(changed.changed, true);
  assert.equal(changed.manifest.createdAt, "2026-11-10T00:00:00Z");
  assert.equal(changed.manifest.updatedAt, "2026-12-01T00:00:00Z");
});

test("reports schema problems and invalid JSON", () => {
  assert.ok(validateManifest({ schemaVersion: 2 }).length > 5);
  const root = tempDir();
  writeFiles(root, { [MANIFEST_PATH]: "{not json" });
  const read = readManifest(root);
  assert.equal(read.exists, true);
  assert.equal(read.manifest, null);
  assert.match(read.errors[0] ?? "", /not valid JSON/);
});

test("round-trips through disk", () => {
  const root = tempDir();
  const { manifest } = buildManifest({
    previous: null,
    answers,
    skillVersion: "0.1.0",
    files: {},
    labels: [],
    now: "2026-11-10T00:00:00Z",
  });
  writeFiles(root, { [MANIFEST_PATH]: serializeManifest(manifest) });
  assert.deepEqual(readManifest(root).manifest, manifest);
});

const verifiedProject: ManifestProject = {
  owner: "octocat",
  ownerType: "user",
  number: 3,
  id: "PVT_kwHOAAAAAc4A",
  title: "Demo Development",
  url: "https://github.com/users/octocat/projects/3",
  linked: true,
  adopted: false,
  fields: {
    status: {
      id: "PVTSSF_status",
      options: { todo: "a1", inProgress: "a2", inReview: "a3", blocked: "a4", done: "a5" },
    },
    priority: { id: "PVTSSF_priority", options: { p0: "b0", p1: "b1", p2: "b2", p3: "b3" } },
  },
};

test("a run with no Project keeps a v1 manifest byte-identical", () => {
  const v1 = readFileSync(join(import.meta.dirname, "fixtures/manifest/v1.json"), "utf8");
  const previous = JSON.parse(v1) as Manifest;
  const again = buildManifest({
    previous,
    answers: {
      ...answers,
      ...previous.choices,
      projectsBoard: previous.choices.projectsBoard ?? null,
    } as typeof answers,
    skillVersion: previous.skillVersion,
    files: previous.applied.files,
    labels: previous.applied.labels,
    now: "2027-01-01T00:00:00Z",
  });
  assert.equal(again.changed, false);
  assert.equal(serializeManifest(again.manifest), v1);
});

test("a verified Project upgrades the manifest to v2 and stays there", () => {
  const base = { answers, skillVersion: "0.2.0", files: {}, labels: [] };
  const v1 = buildManifest({ ...base, previous: null, now: "2026-11-10T00:00:00Z" }).manifest;
  assert.equal(v1.schemaVersion, 1);
  const v2 = buildManifest({
    ...base,
    previous: v1,
    project: verifiedProject,
    now: "2026-11-11T00:00:00Z",
  });
  assert.equal(v2.changed, true);
  assert.equal(v2.manifest.schemaVersion, 2);
  assert.equal("projectsBoard" in v2.manifest.choices, false);
  assert.deepEqual(validateManifest(v2.manifest), []);
  // Later runs keep the recorded Project and v2 without passing it again.
  const later = buildManifest({ ...base, previous: v2.manifest, now: "2026-12-01T00:00:00Z" });
  assert.equal(later.changed, false);
  assert.deepEqual(later.manifest.project, verifiedProject);
});

test("migrates the deprecated projectsBoard choice", () => {
  const choices = {
    ...buildManifest({
      previous: null,
      answers,
      skillVersion: "0.1.0",
      files: {},
      labels: [],
      now: "2026-11-10T00:00:00Z",
    }).manifest.choices,
  };
  assert.equal(migrateProjectChoice({ ...choices, projectsBoard: null }), null);
  assert.equal(migrateProjectChoice({ ...choices, projectsBoard: "" }), null);
  assert.deepEqual(migrateProjectChoice({ ...choices, projectsBoard: "Board" }), {
    enabled: true,
    mode: "create",
    title: "Board",
    fields: ["status", "priority"],
    seed: false,
  });
  const project = { enabled: true, mode: "adopt" as const, title: "X", fields: [], seed: true };
  assert.deepEqual(migrateProjectChoice({ ...choices, projectsBoard: "Board", project }), project);
});

test("rejects v2 data in a v1 manifest and malformed Project ids", () => {
  const v1 = JSON.parse(
    readFileSync(join(import.meta.dirname, "fixtures/manifest/v1.json"), "utf8"),
  );
  assert.match(
    validateManifest({ ...v1, project: verifiedProject }).join("\n"),
    /project needs schemaVersion 2/,
  );
  const v2 = JSON.parse(
    readFileSync(join(import.meta.dirname, "fixtures/manifest/v2.json"), "utf8"),
  );
  assert.deepEqual(validateManifest(v2), []);
  const bad = structuredClone(v2);
  delete bad.project.fields.status.options.done;
  assert.match(validateManifest(bad).join("\n"), /status\.options\.done/);
  assert.match(
    validateManifest({ ...v2, schemaVersion: 3 }).join("\n"),
    /schemaVersion must be one of 1, 2/,
  );
});

test("both manifest versions agree with the JSON Schema", () => {
  const schema = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../skills/cutwater/assets/manifest.schema.json"),
      "utf8",
    ),
  );
  const validate = // ajv-formats is not a dependency; validateManifest checks the dates itself.
    new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);
  const load = (name: string) =>
    JSON.parse(readFileSync(join(import.meta.dirname, `fixtures/manifest/${name}`), "utf8"));
  const v1 = load("v1.json");
  const v2 = load("v2.json");
  for (const good of [v1, v2]) assert.ok(validate(good), JSON.stringify(validate.errors));
  const bads = [
    { ...v1, project: v2.project },
    { ...v1, choices: { ...v1.choices, project: v2.choices.project } },
    { ...v2, schemaVersion: 3 },
    { ...v2, project: { ...v2.project, extra: 1 } },
  ];
  for (const bad of bads) {
    assert.equal(validate(bad), false);
    assert.notDeepEqual(validateManifest(bad), []);
  }
});
