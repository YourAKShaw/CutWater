#!/usr/bin/env node
// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

// Recreate the sandbox repositories on a THROWAWAY GitHub account or org
// from the fixtures in sandbox/fixtures/. Maintainer tooling; never run by
// the skill.
//
//   CUTWATER_SANDBOX_OWNER=my-throwaway-org node sandbox/reset.mjs --confirm [fixture ...]
//
// Safety: it only ever deletes repositories named cutwater-sbx-<fixture>
// under the given owner, refuses to run without --confirm, and refuses an
// owner equal to the logged-in user unless CUTWATER_SANDBOX_ALLOW_USER=1.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PREFIX = "cutwater-sbx-";
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const owner = process.env.CUTWATER_SANDBOX_OWNER;

function run(cmd, argv, opts = {}) {
  const result = spawnSync(cmd, argv, { encoding: "utf8", ...opts });
  if (result.status !== 0 && !opts.allowFailure) {
    console.error(`✗ ${cmd} ${argv.join(" ")}\n${result.stderr}`);
    process.exit(1);
  }
  return result;
}

if (!owner) {
  console.error("Set CUTWATER_SANDBOX_OWNER to a throwaway account or organization.");
  process.exit(1);
}
if (!args.includes("--confirm")) {
  console.error(
    `This deletes and recreates ${owner}/${PREFIX}* repositories. Re-run with --confirm.`,
  );
  process.exit(1);
}
const login = run("gh", ["api", "user", "--jq", ".login"]).stdout.trim();
if (
  login.toLowerCase() === owner.toLowerCase() &&
  process.env.CUTWATER_SANDBOX_ALLOW_USER !== "1"
) {
  console.error(
    `Refusing to use your personal account (${login}); use a throwaway org or set CUTWATER_SANDBOX_ALLOW_USER=1.`,
  );
  process.exit(1);
}

const all = readdirSync(join(here, "fixtures"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5));
const selected = args.filter((arg) => !arg.startsWith("--"));
for (const name of selected.length > 0 ? selected : all) {
  if (!all.includes(name)) {
    console.error(`Unknown fixture ${name}`);
    process.exit(1);
  }
  const fixture = JSON.parse(readFileSync(join(here, "fixtures", `${name}.json`), "utf8"));
  const repo = `${owner}/${PREFIX}${name.toLowerCase()}`;
  run("gh", ["repo", "delete", repo, "--yes"], { allowFailure: true });
  if (fixture.remote === null) {
    console.log(`• ${name}: local-only fixture, no remote created`);
    continue;
  }
  run("gh", [
    "repo",
    "create",
    repo,
    "--private",
    "--description",
    `cutwater sandbox: ${fixture.description}`,
  ]);
  const files = Object.entries(fixture.files ?? {});
  if (files.length > 0 && !fixture.generate) {
    const dir = mkdtempSync(join(tmpdir(), `${PREFIX}${name}-`));
    for (const [path, content] of files) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    run("git", ["init", "-q", "-b", "main"], { cwd: dir });
    run("git", ["add", "-A"], { cwd: dir });
    run("git", ["commit", "-q", "-m", `chore(sandbox): load the ${name} fixture`], { cwd: dir });
    run("git", ["push", "-q", `https://github.com/${repo}.git`, "main"], { cwd: dir });
  }
  console.log(`✓ ${repo}`);
}
