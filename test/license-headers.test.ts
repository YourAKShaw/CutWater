// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addHeader, checkHeaders, commentFor, hasHeader } from "../scripts/license-headers.ts";
import { tempDir, writeFiles } from "./helpers.ts";

const HEADER = "// Copyright 2026 Ayush Kumar Shaw\n// SPDX-License-Identifier: Apache-2.0\n";

test("picks the comment syntax and skips files that are not ours", () => {
  assert.equal(commentFor("src/cli.ts"), "//");
  assert.equal(commentFor("test/fake-gh/fake-github.d.mts"), "//");
  assert.equal(commentFor("test/fake-gh/bin/gh"), "//");
  assert.equal(commentFor(".github/scripts/lint-commit.py"), "#");
  assert.equal(commentFor(".github/workflows/test.yml"), "#");
  assert.equal(commentFor("skills/cutwater/agents/openai.yaml"), "#");
  assert.equal(commentFor(".editorconfig"), "#");
  for (const path of [
    "skills/cutwater/assets/workflows/ci-node.yml",
    "skills/cutwater/assets/repo/gitignore-node",
    "LICENSE",
    "skills/cutwater/NOTICE",
    "package.json",
    "README.md",
    ".nvmrc",
    "docs/assets/banner.svg",
  ]) {
    assert.equal(commentFor(path), null, path);
  }
});

test("matches whole header lines near the top only", () => {
  assert.ok(hasHeader(`${HEADER}\ncode\n`, "//"));
  assert.ok(hasHeader(`#!/usr/bin/env node\n${HEADER}`, "//"));
  assert.ok(
    !hasHeader(
      `// Copyright 2026 Ayush Kumar Shaw and others\n// SPDX-License-Identifier: Apache-2.0\n`,
      "//",
    ),
  );
  assert.ok(
    !hasHeader(`// Copyright 2026 Ayush Kumar Shaw\n// SPDX-License-Identifier: MIT\n`, "//"),
  );
  assert.ok(!hasHeader(`a\nb\nc\nd\n${HEADER}`, "//"));
  assert.ok(!hasHeader(`/* ${HEADER} */`, "//"));
});

test("adds the header below a shebang, once", () => {
  assert.equal(addHeader("code\n", "//", 2026), `${HEADER}\ncode\n`);
  assert.equal(
    addHeader("#!/usr/bin/env python3\nprint(1)\n", "#", 2026),
    "#!/usr/bin/env python3\n# Copyright 2026 Ayush Kumar Shaw\n# SPDX-License-Identifier: Apache-2.0\n\nprint(1)\n",
  );
  const once = addHeader("code\n", "//", 2026);
  assert.equal(addHeader(once, "//", 2026), once);
});

test("checks tracked files, keeps spaced names, and fixes with the creation year", () => {
  const dir = tempDir();
  writeFiles(dir, {
    "src/ok.ts": `${HEADER}\nexport {};\n`,
    "src/with space.ts": "export {};\n",
    "ci.yml": "on: push\n",
    "skills/cutwater/assets/x.yml": "on: push\n",
    "README.md": "# hi\n",
  });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("add", ".");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "-qm",
    "x",
    "--date=2024-05-01T00:00:00",
  );
  const report = checkHeaders(dir);
  assert.equal(report.checked, 3);
  assert.deepEqual(report.missing.sort(), ["ci.yml", "src/with space.ts"]);
  const fixed = checkHeaders(dir, true);
  assert.deepEqual(fixed.fixed.sort(), ["ci.yml", "src/with space.ts"]);
  assert.match(readFileSync(join(dir, "ci.yml"), "utf8"), /^# Copyright 2024 Ayush Kumar Shaw\n/);
  assert.deepEqual(checkHeaders(dir).missing, []);
});

test("fails loudly outside a git repository", () => {
  assert.throws(() => checkHeaders(tempDir()));
});
