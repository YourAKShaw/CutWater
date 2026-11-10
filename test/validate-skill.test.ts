import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, slug, validateSkill } from "../scripts/validate-skill.ts";
import { tempDir, writeFiles } from "./helpers.ts";

const skill = fileURLToPath(new URL("../skills/cutwater", import.meta.url));

function copy(): string {
  const dir = join(tempDir(), "cutwater");
  cpSync(skill, dir, { recursive: true });
  return dir;
}

test("the shipped skill passes", () => {
  const report = validateSkill(skill, null);
  assert.deepEqual(report.errors, []);
  assert.ok(report.stats.skillLines <= 300);
});

test("parses folded descriptions and nested metadata", () => {
  const fm = parseFrontmatter(
    '---\nname: x\ndescription: >-\n  one\n  two\nmetadata:\n  version: "1.0.0"\n---\nbody\n',
  );
  assert.equal(fm.fields.description, "one two");
  assert.equal(fm.metadata.version, "1.0.0");
  assert.equal(slug("Phase 0: audit, interview, scaffold"), "phase-0-audit-interview-scaffold");
});

test("rejects non-spec fields, a mismatched name and broken links", () => {
  const dir = copy();
  writeFiles(dir, {
    "SKILL.md":
      '---\nname: other\ndescription: Does things. Use when needed.\ndisable-model-invocation: true\nmetadata:\n  version: "0.1.0"\n---\n[x](references/missing.md)\n',
  });
  const errors = validateSkill(dir, null).errors.join("\n");
  assert.match(errors, /disable-model-invocation/);
  assert.match(errors, /must match the directory name/);
  assert.match(errors, /missing\.md does not exist/);
  assert.match(errors, /is not linked from SKILL\.md/);
});

test("rejects references that link to other references", () => {
  const dir = copy();
  writeFiles(dir, { "references/wiki.md": "# Wiki\n\nSee [security](security.md).\n" });
  assert.match(validateSkill(dir, null).errors.join("\n"), /one level deep/);
});
