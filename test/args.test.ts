import assert from "node:assert/strict";
import { test } from "node:test";
import { CutwaterError } from "../src/lib/errors.ts";
import { intFlag, parseArgs, stringFlag } from "../src/lib/args.ts";

test("parses values, booleans, equals form and stdin", () => {
  const args = parseArgs(["audit", "--json", "--repo", "o/r", "--issue=4", "-"], new Set(["json"]));
  assert.deepEqual(args.positionals, ["audit", "-"]);
  assert.equal(args.flags.get("json"), true);
  assert.equal(stringFlag(args, "repo"), "o/r");
  assert.equal(intFlag(args, "issue"), 4);
});

test("rejects a value flag with no value and a non-numeric integer", () => {
  assert.throws(() => parseArgs(["--repo"], new Set()), CutwaterError);
  assert.throws(() => intFlag(parseArgs(["--issue", "x"], new Set()), "issue"), CutwaterError);
});
