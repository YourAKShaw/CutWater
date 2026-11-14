// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { defaultAnswers, templateVars } from "../src/lib/answers.ts";
import { detect } from "../src/lib/detect.ts";
import { CutwaterError } from "../src/lib/errors.ts";
import { assetsDir, render, renderAsset } from "../src/lib/templates.ts";
import { tempDir } from "./helpers.ts";

test("substitutes variables and keeps GitHub expressions intact", () => {
  assert.equal(
    render("on {{branch}}: ${{ github.ref }}", { branch: "main" }),
    "on main: ${{ github.ref }}",
  );
});

test("keeps or drops whole-line blocks", () => {
  const template = "a\n{{#if on}}\nb\n{{/if}}\n{{#unless on}}\nc\n{{/unless}}\nd";
  assert.equal(render(template, { on: true }), "a\nb\nd");
  assert.equal(render(template, { on: "" }), "a\nc\nd");
});

test("rejects unknown variables and unbalanced blocks", () => {
  assert.throws(() => render("{{missing}}", {}), CutwaterError);
  assert.throws(() => render("{{#if x}}\n", { x: true }), CutwaterError);
  assert.throws(() => render("{{/if}}\n", {}), CutwaterError);
});

test("every asset template renders with the standard variables", () => {
  const root = tempDir();
  const { answers } = defaultAnswers({
    detection: detect(root),
    login: "octocat",
    repo: "octocat/demo",
    remoteExists: true,
    isEmpty: false,
    defaultBranch: "main",
    year: "2026",
  });
  for (const emojiLabels of [false, true]) {
    for (const ci of [[], ["lint", "test", "build"]] as const) {
      const vars = templateVars(
        { ...answers, emojiLabels, ci: [...ci], securityContact: "sec@example.com" },
        root,
      );
      for (const dir of ["community", "issue-forms", "workflows", "repo"]) {
        for (const file of readdirSync(join(assetsDir(), dir))) {
          const out = renderAsset(`${dir}/${file}`, vars);
          assert.doesNotMatch(out, /\{\{[A-Za-z#/]/, `${dir}/${file} left a tag behind`);
        }
      }
      renderAsset("dependabot.yml", vars);
    }
  }
});

test("the CodeRabbit template stays inside CodeRabbit's documented limits", () => {
  const root = tempDir();
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
      const out = renderAsset(
        "repo/coderabbit.yaml",
        templateVars({ ...answers, stack, coderabbit }, root),
      );
      assert.match(out, new RegExp(`^ {2}profile: ${coderabbit}$`, "m"));
      // schema.v2.json caps tone_instructions at 250 characters.
      const tone = /^tone_instructions: (.*)$/m.exec(out)?.[1] ?? "";
      assert.ok(tone.length > 0 && tone.length <= 250, `tone is ${tone.length} chars`);
      assert.doesNotMatch(out, /\t/, "YAML must not contain tabs");
    }
  }
});
