// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { eolFor, findFile, normalizeEol, sha256, withEol } from "../src/lib/fsutil.ts";
import { tempDir, writeFiles } from "./helpers.ts";

test("hashes CRLF and LF text identically", () => {
  assert.equal(sha256("a\r\nb\r\n"), sha256("a\nb\n"));
  assert.notEqual(sha256("a\nb\n"), sha256("a\nb"));
  assert.equal(normalizeEol("a\rb\r\nc"), "a\nb\nc");
});

test("finds files case-insensitively in priority order", () => {
  const root = tempDir();
  writeFiles(root, { "docs/readme.md": "x", ".github/README.md": "y" });
  assert.equal(findFile(root, ["", ".github", "docs"], /^readme(\.md)?$/i), ".github/README.md");
  assert.equal(findFile(root, [""], /^readme(\.md)?$/i), null);
});

test("respects eol=crlf in .gitattributes", () => {
  const root = tempDir();
  writeFiles(root, { ".gitattributes": "* text=auto\n*.md text eol=crlf\n*.sh eol=lf\n" });
  assert.equal(eolFor(root, "README.md"), "\r\n");
  assert.equal(eolFor(root, "docs/x.md"), "\r\n");
  assert.equal(eolFor(root, "run.sh"), "\n");
  assert.equal(eolFor(join(root, "missing"), "README.md"), "\n");
  assert.equal(withEol("a\nb\n", "\r\n"), "a\r\nb\r\n");
});
