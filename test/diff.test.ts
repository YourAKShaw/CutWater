import assert from "node:assert/strict";
import { test } from "node:test";
import { unifiedDiff } from "../src/lib/diff.ts";

test("is empty for equal texts, including CRLF differences", () => {
  assert.equal(unifiedDiff("a\nb\n", "a\r\nb\r\n", "x"), "");
});

test("shows a single changed line with context", () => {
  const before = ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n");
  const after = ["1", "2", "3", "4", "FIVE", "6", "7", "8"].join("\n");
  assert.equal(
    unifiedDiff(before, after, "f.txt"),
    [
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -2,7 +2,7 @@",
      " 2",
      " 3",
      " 4",
      "-5",
      "+FIVE",
      " 6",
      " 7",
      " 8",
      "",
    ].join("\n"),
  );
});

test("splits distant changes into separate hunks", () => {
  const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
  const after = before.replace("line 2\n", "changed 2\n").replace("line 27", "changed 27");
  const diff = unifiedDiff(before, after, "f");
  assert.equal(diff.match(/^@@/gm)?.length, 2);
});

test("handles creation from empty and additions at the end", () => {
  assert.match(unifiedDiff("", "new\n", "f"), /@@ -0,0 \+1,1 @@\n\+new/);
  assert.match(unifiedDiff("a\n", "a\nb\n", "f"), /\+b/);
});
