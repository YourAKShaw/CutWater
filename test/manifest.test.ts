// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultAnswers } from "../src/lib/answers.ts";
import { detect } from "../src/lib/detect.ts";
import {
  buildManifest,
  readManifest,
  serializeManifest,
  validateManifest,
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
