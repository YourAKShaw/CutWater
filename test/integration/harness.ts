// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newRepo, newState, type FakeState } from "../fake-gh/fake-github.mjs";
import { tempDir, writeFiles } from "../helpers.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const BUNDLE = join(repoRoot, "skills/cutwater/scripts/cutwater.mjs");
const FAKE_BIN = join(repoRoot, "test/fake-gh/bin");

export interface Fixture {
  description: string;
  remote: string | null;
  github: { repo?: Record<string, unknown>; orgDotGithub?: Record<string, string[]> };
  files: Record<string, string>;
  generate?: boolean;
  expected: {
    classification: string;
    items: Record<string, string>;
    orgDefaultsPending?: string[];
    planConflicts?: string[];
    secondRunNoChanges?: boolean;
  };
}

export function loadFixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(join(repoRoot, "sandbox/fixtures", `${name}.json`), "utf8"),
  ) as Fixture;
}

export interface World {
  root: string;
  statePath: string;
  logPath: string;
  ghLogPath: string;
  state(): FakeState;
  setState(mutate: (state: FakeState) => void): void;
  cli(
    args: string[],
    input?: string,
  ): { code: number; stdout: string; stderr: string; json: () => unknown };
  ghCalls(): string[][];
}

export function world(
  opts: { remote?: string | null; files?: Record<string, string>; github?: Fixture["github"] } = {},
): World {
  const root = tempDir("cutwater-it-");
  const meta = tempDir("cutwater-it-meta-");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  if (opts.files) writeFiles(root, opts.files);
  const state = newState();
  const remote = opts.remote === undefined ? "octocat/demo" : opts.remote;
  if (remote !== null) {
    execFileSync("git", ["remote", "add", "origin", `https://github.com/${remote}.git`], {
      cwd: root,
    });
    state.repos[remote] = newRepo(opts.github?.repo ?? {});
  }
  state.orgDotGithub = opts.github?.orgDotGithub ?? {};
  const statePath = join(meta, "state.json");
  const logPath = join(meta, "cutwater.log");
  const ghLogPath = join(meta, "gh.log");
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(logPath, "");
  writeFileSync(ghLogPath, "");
  const read = () => JSON.parse(readFileSync(statePath, "utf8")) as FakeState;
  return {
    root,
    statePath,
    logPath,
    ghLogPath,
    state: read,
    setState(mutate) {
      const next = read();
      mutate(next);
      writeFileSync(statePath, JSON.stringify(next));
    },
    cli(args, input) {
      const result = spawnSync(process.execPath, [BUNDLE, ...args], {
        cwd: root,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${FAKE_BIN}${delimiter}${process.env.PATH ?? ""}`,
          FAKE_GH_STATE: statePath,
          FAKE_GH_LOG: ghLogPath,
          CUTWATER_LOG: logPath,
          CUTWATER_RETRY_BASE_MS: "0",
          CUTWATER_NOW: "2026-11-10T12:00:00Z",
        },
      });
      return {
        code: result.status ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
        json: () => JSON.parse(result.stdout) as unknown,
      };
    },
    ghCalls() {
      return readFileSync(ghLogPath, "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as string[]);
    },
  };
}

/** Defaults → answers.json → plan.json in the world's metadata directory. */
export function prepare(
  w: World,
  edit: (answers: Record<string, unknown>) => void = () => {},
): { answers: string; plan: string } {
  const answers = join(w.statePath, "..", "answers.json");
  const plan = join(w.statePath, "..", "plan.json");
  const defaults = w.cli(["defaults", "--out", answers, "--json"]);
  if (defaults.code !== 0) throw new Error(`defaults failed: ${defaults.stdout}${defaults.stderr}`);
  const parsed = JSON.parse(readFileSync(answers, "utf8")) as Record<string, unknown>;
  parsed.description = "A demo project";
  edit(parsed);
  writeFileSync(answers, JSON.stringify(parsed));
  const planned = w.cli(["plan", "--answers", answers, "--out", plan, "--json"]);
  if (planned.code !== 0) throw new Error(`plan failed: ${planned.stdout}${planned.stderr}`);
  return { answers, plan };
}

export const MUTATING = (args: string[]) =>
  (args[0] === "label" && args[1] === "create") ||
  (args[0] === "repo" && args[1] === "create") ||
  (args[0] === "api" &&
    args.some((arg, i) => (arg === "--method" || arg === "-X") && args[i + 1] !== "GET"));
