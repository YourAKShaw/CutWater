// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { defaultAnswers, templateVars } from "../src/lib/answers.ts";
import { detect } from "../src/lib/detect.ts";
import { renderAsset } from "../src/lib/templates.ts";

const schema = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures/coderabbit/schema.v2.json"), "utf8"),
) as object;

test("the rendered .coderabbit.yaml validates against CodeRabbit's v2 schema", () => {
  // strict: false tolerates vendor keywords in the schema; validation itself stays exact.
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const root = mkdtempSync(join(tmpdir(), "cw-coderabbit-"));
  const { answers } = defaultAnswers({
    detection: detect(root),
    login: "octocat",
    repo: "octocat/demo",
    remoteExists: true,
    isEmpty: false,
    defaultBranch: "main",
    year: "2026",
  });
  for (const stack of ["node-ts", "node", "python", "go", "generic"] as const) {
    for (const coderabbit of ["quiet", "chill", "assertive"] as const) {
      const text = renderAsset(
        "repo/coderabbit.yaml",
        templateVars({ ...answers, stack, coderabbit }, root),
      );
      const config = parse(text) as { reviews: { profile: string } };
      assert.ok(validate(config), `${stack}/${coderabbit}: ${JSON.stringify(validate.errors)}`);
      assert.equal(config.reviews.profile, coderabbit);
    }
  }
  // Guard against a vacuous pass: the schema must reject what CodeRabbit rejects.
  assert.equal(validate({ reviews: { profile: "loud" } }), false);
  assert.equal(validate({ tone_instructions: "x".repeat(251) }), false);
});
