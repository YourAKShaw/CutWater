// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { scanSecrets } from "../src/lib/secrets.ts";

// Fixtures are assembled at runtime so no token-shaped string is committed.
const fake = (prefix: string, length: number, char = "a") => prefix + char.repeat(length);

test("finds common credential formats", () => {
  const cases: [string, string][] = [
    [fake("ghp_", 36), "github-token"],
    [fake("github_pat_", 70), "github-fine-grained-token"],
    [fake("AKIA", 16, "A"), "aws-access-key"],
    [["-----BEGIN", "RSA PRIVATE KEY-----"].join(" "), "private-key"],
    [fake("sk-ant-", 30), "anthropic-key"],
    [fake("xoxb-", 20, "1"), "slack-token"],
    ["DATABASE_PASSWORD=" + "hunter2hunter2", "env-assignment"],
    ["export API_KEY='" + "abcdefgh12345678'", "env-assignment"],
    ["postgres://admin:" + "s3cretpass@db.internal/app", "url-credentials"],
  ];
  for (const [text, rule] of cases) {
    const findings = scanSecrets(`Context line\n${text}\n`);
    assert.equal(findings[0]?.rule, rule, text);
    assert.equal(findings[0]?.line, 2);
    assert.ok(!findings[0]?.preview.includes(text.slice(8)), "preview is masked");
  }
});

test("ignores ordinary prose, placeholders and variable references", () => {
  const text = [
    "Set GITHUB_TOKEN in the workflow environment.",
    "API_KEY=<your key here>",
    "TOKEN=${{ secrets.TOKEN }}",
    "PASSWORD=",
    "See https://github.com/o/r/pull/1 for details.",
  ].join("\n");
  assert.deepEqual(scanSecrets(text), []);
});
