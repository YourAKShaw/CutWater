import assert from "node:assert/strict";
import { test } from "node:test";
import { applyLabels, desiredLabels, diffLabels, labelName } from "../src/lib/labels.ts";
import { fakeRunner, testContext } from "./helpers.ts";

test("names carry the emoji only when opted in", () => {
  assert.equal(labelName("type: feat", false), "type: feat");
  assert.equal(labelName("type: feat", true), "✨ type: feat");
  assert.ok(desiredLabels(false).every((label) => /^[a-z]/.test(label.name)));
});

test("diffs by case-insensitive name, color and description", () => {
  const desired = desiredLabels(false).slice(0, 3);
  const [first, second] = desired;
  assert.ok(first && second);
  const diff = diffLabels(desired, [
    { ...first, name: first.name.toUpperCase() },
    { ...second, color: "000000" },
  ]);
  assert.equal(diff.ok.length, 1);
  assert.equal(diff.update.length, 1);
  assert.equal(diff.create.length, 1);
});

test("applies labels with --force upserts pinned to the repo", async () => {
  const { runner, calls } = fakeRunner(() => ({}));
  const ctx = testContext({ runner, repo: "o/r" });
  await applyLabels(ctx, "o/r", desiredLabels(false).slice(0, 2));
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 2), ["label", "create"]);
    assert.ok(call.args.includes("--force"));
    assert.equal(call.args[call.args.indexOf("--repo") + 1], "o/r");
  }
});
